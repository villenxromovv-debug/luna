import os
import importlib
import shutil
import subprocess
import tempfile
import threading
import unittest
from unittest.mock import patch

from PIL import Image, ImageChops

from luna.clipper.clipper import crop_clip_local, crop_highlights_local, _run_ffmpeg
from luna.clipper.subtitles import overlay_args, segments_for_clip, split_cue


pipeline = importlib.import_module("luna.clipper.pipeline")


class TestCues(unittest.TestCase):
    def test_times_are_relative_and_clamped_to_the_clip(self):
        segments = [
            {"start": 0.0, "end": 9.0, "text": "before"},
            {"start": 9.0, "end": 12.0, "text": " spans  start "},
            {"start": 15.0, "end": 25.0, "text": "spans end"},
            {"start": 30.0, "end": 31.0, "text": "after"},
        ]
        self.assertEqual(segments_for_clip(segments, 10.0, 20.0), [
            {"start": 0.0, "end": 2.0, "text": "spans start"},
            {"start": 5.0, "end": 10.0, "text": "spans end"},
        ])

    def test_overlapping_auto_captions_never_show_together(self):
        segments = [
            {"start": 0.0, "end": 5.0, "text": "one"},
            {"start": 3.0, "end": 6.0, "text": "two"},
        ]
        cues = segments_for_clip(segments, 0.0, 10.0)
        self.assertEqual(cues[0]["end"], 3.0)
        self.assertEqual(cues[1]["start"], 3.0)

    def test_blank_segments_are_dropped(self):
        self.assertEqual(segments_for_clip([{"start": 0, "end": 1, "text": "  "}], 0.0, 5.0), [])

    def test_long_cue_splits_into_timed_screens(self):
        screens = split_cue({"start": 2.0, "end": 6.0, "text": ""}, ["aaaa", "aaaa", "aaaa", "aaaa"])
        self.assertEqual(screens, [
            (2.0, 4.0, ["aaaa", "aaaa"]),
            (4.0, 6.0, ["aaaa", "aaaa"]),
        ])

    def test_filter_chain_keeps_the_crop_and_optional_audio(self):
        args = overlay_args([(0.0, 1.0, "a.png"), (1.0, 2.0, "b.png")], "crop=10:10:0:0")
        graph = args[args.index("-filter_complex") + 1]
        self.assertTrue(graph.startswith("[0:v]crop=10:10:0:0[v0]"))
        self.assertIn("[v1][2:v]overlay", graph)
        self.assertEqual(args[-4:], ["-map", "[v2]", "-map", "0:a?"])


@unittest.skipUnless(shutil.which("ffmpeg"), "ffmpeg is not installed")
class TestBurnIn(unittest.TestCase):
    def _frame(self, video, second, out):
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-ss", str(second), "-i", video, "-frames:v", "1", out],
            check=True,
        )
        return Image.open(out).convert("RGB")

    def test_text_appears_only_during_its_cue(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = os.path.join(tmp, "source.mp4")
            subprocess.run([
                "ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=blue:s=640x360:r=10:d=4",
                "-pix_fmt", "yuv420p", source,
            ], check=True)
            out = os.path.join(tmp, "clip.mp4")
            crop_clip_local(
                source, 0.0, 3.0, "9:16", out,
                cues=[{"start": 1.0, "end": 2.0, "text": "A subtitle long enough to wrap onto more than one line here"}],
            )
            before = self._frame(out, 0.5, os.path.join(tmp, "a.png"))
            during = self._frame(out, 1.5, os.path.join(tmp, "b.png"))
            after = self._frame(out, 2.5, os.path.join(tmp, "c.png"))

        # Hardware encoders leave a few pixels of quantisation noise between frames,
        # so compare with the same threshold the "during" check uses.
        outside = ImageChops.difference(before, after).point(lambda v: 255 if v > 40 else 0)
        self.assertIsNone(outside.getbbox())
        box = ImageChops.difference(before, during).point(lambda v: 255 if v > 40 else 0).getbbox()
        self.assertIsNotNone(box)
        self.assertGreater(box[3], during.height / 2)


class TestAllClipsFailed(unittest.TestCase):
    def test_pipeline_raises_instead_of_reporting_empty_success(self):
        transcript = {"segments": [{"start": 0.0, "end": 1.0, "text": "hi"}]}
        highlights = {"highlights": [{"score": 1, "start_time": 0, "end_time": 1}]}
        with patch.object(pipeline, "download_youtube_local", return_value="v.mp4"), \
                patch.object(pipeline, "transcribe_local", return_value=transcript), \
                patch.object(pipeline, "get_highlights", return_value=highlights), \
                patch.object(pipeline, "crop_highlights_local", return_value=[{"clip_url": None, "error": "boom"}]):
            with self.assertRaisesRegex(RuntimeError, "boom"):
                pipeline.generate_shorts("https://example.test/v")


class TestClipperResilience(unittest.TestCase):
    def test_hardware_encoder_serializes_workers_and_falls_back_to_libx264(self):
        seen_cmds = []

        def fake_run(cmd, timeout=None, cancel_event=None):
            seen_cmds.append((list(cmd), timeout))
            out_file = cmd[-1]
            if "h264_amf" in cmd:
                with open(out_file, "wb") as f:
                    f.write(b"partial")
                raise RuntimeError("ffmpeg timed out after 180s")
            with open(out_file, "wb") as f:
                f.write(b"ok-mp4")
            return subprocess.CompletedProcess(cmd, 0, "", "")

        clipper_mod = importlib.import_module("luna.clipper.clipper")
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(clipper_mod, "_probe_dims", return_value=(1920, 1080, 60.0)), \
                    patch.object(clipper_mod, "_get_encoder_flags", return_value=["-c:v", "h264_amf", "-quality", "speed"]), \
                    patch.object(clipper_mod, "_run_ffmpeg", side_effect=fake_run), \
                    patch.object(clipper_mod.concurrent.futures, "ThreadPoolExecutor", wraps=clipper_mod.concurrent.futures.ThreadPoolExecutor) as exec_spy:
                results = crop_highlights_local(
                    "src.mp4",
                    [{"title": "A", "start_time": 0.0, "end_time": 10.0}],
                    aspect_ratio="16:9",
                    out_dir=tmp,
                    use_face_detect=True,
                )
        self.assertEqual(exec_spy.call_args.kwargs.get("max_workers"), 1)
        self.assertEqual(len(seen_cmds), 2)
        self.assertIn("h264_amf", seen_cmds[0][0])
        self.assertIn("libx264", seen_cmds[1][0])
        self.assertIsNotNone(results[0].get("clip_url"))

    def test_run_ffmpeg_respects_cancel_event(self):
        cancel = threading.Event()
        cancel.set()
        with self.assertRaisesRegex(RuntimeError, "CANCELLED_BY_USER"):
            _run_ffmpeg(["ffmpeg", "-version"], cancel_event=cancel)


if __name__ == "__main__":
    unittest.main()
