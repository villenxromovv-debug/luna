import json
import unittest
from unittest.mock import patch

from luna.clipper import highlights
from luna.clipper.highlights import get_highlights


def transcript(n, seconds=5.0, text="word " * 10):
    segs = [{"start": i * seconds, "end": i * seconds + seconds - 0.5, "text": f"{i} {text}"} for i in range(n)]
    return {"duration": n * seconds, "segments": segs}


def reply(*clips):
    return lambda _prompt: "```json\n" + json.dumps({"clips": list(clips)}) + "\n```"


class TestHighlights(unittest.TestCase):
    def test_clip_starts_and_ends_on_segment_boundaries(self):
        t = transcript(40)
        out = get_highlights(t, llm_fn=reply({"first": 4, "last": 9, "score": 80, "title": "T", "caption": "C"}))
        h = out["highlights"][0]
        self.assertAlmostEqual(h["start_time"], 20.0 - highlights.LEAD_IN)
        self.assertAlmostEqual(h["end_time"], 49.5 + highlights.TAIL_OUT)
        self.assertEqual((h["score"], h["title"], h["caption"]), (80, "T", "C"))

    def test_padding_never_reaches_into_the_neighbouring_segments(self):
        t = {"duration": 30.0, "segments": [{"start": i * 2.0, "end": i * 2.0 + 2.0, "text": "x"} for i in range(15)]}
        h = get_highlights(t, llm_fn=reply({"first": 2, "last": 10, "score": 1}))["highlights"][0]
        self.assertEqual((h["start_time"], h["end_time"]), (4.0, 22.0))

    def test_length_is_kept_between_the_limits(self):
        t = transcript(60)
        out = get_highlights(t, num_clips=1, llm_fn=reply(
            {"first": 0, "last": 59, "score": 90},
            {"first": 40, "last": 40, "score": 70},
        ))
        for h in out["highlights"]:
            length = h["end_time"] - h["start_time"]
            self.assertGreaterEqual(length, highlights.MIN_CLIP_SECONDS)
            self.assertLessEqual(length, highlights.MAX_CLIP_SECONDS + highlights.TAIL_OUT + highlights.LEAD_IN)

    def test_a_long_pick_is_cut_at_the_last_sentence_end_that_fits(self):
        segs = [{"start": i * 5.0, "end": i * 5.0 + 5.0, "text": "end." if i == 7 else "more"} for i in range(30)]
        h = get_highlights({"duration": 150.0, "segments": segs}, llm_fn=reply({"first": 0, "last": 29, "score": 1}))["highlights"][0]
        self.assertEqual(h["end_time"], 40.0)

    def test_overlapping_clips_keep_the_higher_score_and_sort_best_first(self):
        t = transcript(60)
        out = get_highlights(t, llm_fn=reply(
            {"first": 0, "last": 5, "score": 40},
            {"first": 1, "last": 6, "score": 90},
            {"first": 30, "last": 36, "score": 60},
        ))
        self.assertEqual([h["score"] for h in out["highlights"]], [90, 60])

    def test_bad_entries_and_out_of_range_numbers_are_dropped(self):
        t = transcript(10)
        out = get_highlights(t, llm_fn=reply({"first": "x", "last": 2}, {"last": 3}, {"first": 50, "last": 60}))
        self.assertEqual(out["highlights"], [])

    def test_caption_is_cleaned_and_falls_back_to_title(self):
        t = transcript(20)
        out = get_highlights(t, llm_fn=reply({"first": 0, "last": 5, "score": 1, "title": "Big — win 🚀", "caption": "#fyp"}))
        h = out["highlights"][0]
        self.assertEqual((h["title"], h["caption"]), ("Big, win", "Big, win"))

    def test_long_transcripts_go_in_overlapping_windows_and_one_failure_is_tolerated(self):
        t = transcript(400, text="word " * 40)
        prompts = []

        def llm(prompt):
            prompts.append(prompt)
            if len(prompts) <= highlights.ATTEMPTS:
                raise ValueError("first window fails")
            first = int(prompt.split("Transcript:\n", 1)[1].split(" ", 1)[0])
            return json.dumps({"clips": [{"first": first, "last": first + 5, "score": 50}]})

        with patch("luna.clipper.highlights.time.sleep"):
            out = get_highlights(t, llm_fn=llm)
        windows = highlights._windows([{"text": s["text"]} for s in t["segments"]])
        self.assertGreater(len(windows), 1)
        self.assertEqual(windows[1].start, windows[0].stop - highlights.WINDOW_OVERLAP_SEGMENTS)
        self.assertEqual(len(out["highlights"]), len(windows) - 1)

    def test_every_window_failing_raises_the_error(self):
        with patch("luna.clipper.highlights.time.sleep"):
            with self.assertRaisesRegex(RuntimeError, "not json"):
                get_highlights(transcript(20), llm_fn=lambda _p: "not json")

    def test_empty_transcript_gives_no_clips_without_calling_the_model(self):
        def llm(_p):
            raise AssertionError("should not be called")
        self.assertEqual(get_highlights({"segments": [{"start": 0, "end": 1, "text": " "}]}, llm_fn=llm), {"highlights": []})

    def test_tops_up_when_first_pass_returns_fewer_clips_than_requested(self):
        t = transcript(120)  # 600s -> easily holds 5+ non-overlapping clips
        calls = []

        def llm(prompt):
            calls.append(prompt)
            if len(calls) == 1:
                return json.dumps({"clips": [
                    {"first": 10, "last": 15, "score": 90, "title": "First"},
                    {"first": 30, "last": 35, "score": 88, "title": "Second"},
                    {"first": 50, "last": 55, "score": 86, "title": "Third"},
                ]})
            self.assertIn("Already selected time ranges", prompt)
            return json.dumps({"clips": [
                {"first": 70, "last": 75, "score": 84, "title": "Fourth"},
                {"first": 90, "last": 95, "score": 82, "title": "Fifth"},
            ]})

        out = get_highlights(t, num_clips=5, llm_fn=llm)
        self.assertEqual(len(calls), 2)
        self.assertEqual(len(out["highlights"]), 5)

    def test_short_video_skips_top_up_beyond_physical_capacity(self):
        t = transcript(6, seconds=5.5)  # 33s -> fits at most 2x 16s clips
        calls = []

        def llm(prompt):
            calls.append(prompt)
            return json.dumps({"clips": [
                {"first": 0, "last": 2, "score": 90},
                {"first": 3, "last": 5, "score": 85},
            ]})

        out = get_highlights(t, num_clips=5, llm_fn=llm)
        self.assertEqual(len(calls), 1)
        self.assertEqual(len(out["highlights"]), 2)

    def test_overlapping_autocaptions_do_not_truncate_or_invert_bounds(self):
        segs = [
            {"start": 0.4, "end": 6.0, "text": "line 0"},
            {"start": 2.6, "end": 7.3, "text": "line 1"},
            {"start": 6.0, "end": 18.0, "text": "line 2"},
            {"start": 16.0, "end": 22.0, "text": "line 3"},
        ]
        out = get_highlights({"duration": 25.0, "segments": segs}, num_clips=1, llm_fn=reply({"first": 1, "last": 2, "score": 80}))
        h = out["highlights"][0]
        self.assertLess(h["start_time"], h["end_time"])
        self.assertLessEqual(h["start_time"], 2.6)
        self.assertGreaterEqual(h["end_time"], 18.0)

    def test_clip_language_controls_prompt_instruction(self):
        seen_ru = []
        seen_en = []

        def cap(bucket):
            def _fn(prompt):
                bucket.append(prompt)
                return json.dumps({"clips": [{"first": 0, "last": 5, "score": 88, "title": "Ok", "caption": "Cap"}]})
            return _fn

        t = transcript(40)
        get_highlights(t, num_clips=1, llm_fn=cap(seen_ru), clip_language="ru")
        get_highlights(t, num_clips=1, llm_fn=cap(seen_en), clip_language="en")
        self.assertIn("natural, engaging Russian", seen_ru[0])
        self.assertNotIn("strictly in natural English", seen_ru[0])
        self.assertIn("strictly in natural English", seen_en[0])
        self.assertNotIn("Russian", seen_en[0])


if __name__ == "__main__":
    unittest.main()
