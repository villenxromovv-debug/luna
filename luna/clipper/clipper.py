# SPDX-License-Identifier: MIT
# This file is part of Luna's clip pipeline. See luna/clipper/LICENSE and
# THIRD_PARTY_NOTICES.md for the upstream notice.

"""Local clipping: ultra-fast single-pass ffmpeg subclip + crop in parallel.

Optimizations:
  1. Single-pass FFmpeg: Subclip seek (-ss/-to) and aspect ratio crop (-vf crop)
     are executed in a single FFmpeg encode, eliminating the slow 2-stage
     intermediate file encode.
  2. Multi-threaded encoding: Uses `-preset veryfast -threads 0 -crf 20` for
     maximum speed with crisp HD quality.
  3. Parallel clip processing: Clips are rendered concurrently across CPU cores
     using ThreadPoolExecutor, speeding up 5-clip generation by 5x-10x.
"""
import concurrent.futures
import math
import os
import subprocess
import tempfile
import threading
import time
from typing import Callable, Dict, List, Optional, Tuple

from .config import local_output_dir, normalize_clip_framing
from .subtitles import MAX_INLINE_OVERLAY_SCREENS, cues_from_words, overlay_args, overlay_args_script, render_cues, segments_for_clip

# Sample face position once per second (approx 30 frames) for tracking
FACE_DETECT_SAMPLE_EVERY = 30

# Detection runs on frames downscaled to this height: YuNet stays fast and faces
# on a 1080p wide shot still land well above its minimum size.
FACE_DETECT_HEIGHT = 480

# Two speakers are far apart when their centres are more than half the vertical
# crop width apart: one 9:16 window then starts cutting a head off.
FAR_APART_RATIO = 0.5

# Blur framing renders 1080 wide; height follows the target ratio (1080x1920 for 9:16).
BLUR_OUTPUT_WIDTH = 1080

# Ceiling for long/non-clip ffmpeg calls; individual clip encodes use a tighter duration-based budget.
FFMPEG_TIMEOUT_SECONDS = 3600

_HARDWARE_ENCODERS = ("h264_nvenc", "h264_amf", "h264_qsv", "h264_mf")
_SERIAL_HARDWARE_ENCODERS = ("h264_amf", "h264_mf")
_SOFTWARE_ENCODER_FLAGS = ["-c:v", "libx264", "-preset", "superfast", "-crf", "21", "-threads", "0"]

# Hardware encoder candidates ordered by quality/speed reliability. Every candidate carries
# explicit rate-control / quality flags (never bare `-c:v h264_mf`, which defaults to ~200-350 kbps),
# and `h264_mf` requires `-hw_encoding 1` so CPU-only VMs / Windows PCs do not pick Microsoft's
# slow software MFT and accidentally serialize all clip renders.
_HARDWARE_ENCODER_CANDIDATES: Tuple[Tuple[str, List[str]], ...] = (
    (
        "NVIDIA NVENC Hardware Acceleration (h264_nvenc)",
        ["-c:v", "h264_nvenc", "-preset", "p4", "-rc", "vbr", "-cq", "20", "-b:v", "0"],
    ),
    (
        "AMD AMF Hardware Acceleration (h264_amf)",
        ["-c:v", "h264_amf", "-quality", "balanced", "-rc", "cqp", "-qp_i", "20", "-qp_p", "20"],
    ),
    (
        "Intel QSV Hardware Acceleration (h264_qsv)",
        ["-c:v", "h264_qsv", "-preset", "veryfast", "-global_quality", "20"],
    ),
    (
        "MediaFoundation Hardware Acceleration (h264_mf)",
        ["-c:v", "h264_mf", "-hw_encoding", "1", "-rate_control", "quality", "-quality", "80"],
    ),
    (
        "MediaFoundation Hardware Acceleration (h264_mf VBR)",
        ["-c:v", "h264_mf", "-hw_encoding", "1", "-rate_control", "pc_vbr", "-b:v", "5M", "-maxrate", "8M"],
    ),
)


def _is_hardware_encoder(enc_flags: List[str]) -> bool:
    return any(codec in enc_flags for codec in _HARDWARE_ENCODERS)


def _is_serial_hardware_encoder(enc_flags: List[str]) -> bool:
    return any(codec in enc_flags for codec in _SERIAL_HARDWARE_ENCODERS)


def _run_ffmpeg(
    cmd: List[str],
    timeout: Optional[float] = None,
    cancel_event: Optional[threading.Event] = None,
) -> subprocess.CompletedProcess:
    """Run ffmpeg/ffprobe with timeout + cancel_event polling and return CompletedProcess."""
    if cancel_event is not None and cancel_event.is_set():
        raise RuntimeError("CANCELLED_BY_USER")

    limit = max(10.0, float(timeout or FFMPEG_TIMEOUT_SECONDS))
    deadline = time.monotonic() + limit
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

    while True:
        if cancel_event is not None and cancel_event.is_set():
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
            raise RuntimeError("CANCELLED_BY_USER")
        try:
            out, err = proc.communicate(timeout=1)
            break
        except subprocess.TimeoutExpired:
            if time.monotonic() > deadline:
                proc.kill()
                proc.communicate()
                raise RuntimeError(f"ffmpeg timed out after {int(limit)}s")

    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {(err or '')[-2000:]}")
    return subprocess.CompletedProcess(cmd, proc.returncode, stdout=out, stderr=err)


def _ratio(aspect_ratio: str) -> float:
    """Parse '9:16' → 9/16, '1:1' → 1.0."""
    try:
        w, h = aspect_ratio.split(":")
        return float(w) / float(h)
    except (ValueError, ZeroDivisionError):
        return 9.0 / 16.0


def _probe_dims(path: str) -> Tuple[int, int, float]:
    """Return (width, height, fps) via ffprobe."""
    cmd = [
        "ffprobe", "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height,r_frame_rate",
        "-of", "csv=p=0",
        path,
    ]
    out = _run_ffmpeg(cmd, timeout=60).stdout.strip()
    w_str, h_str, fps_str = out.split(",")
    width, height = int(w_str), int(h_str)
    if "/" in fps_str:
        num, den = fps_str.split("/")
        fps = float(num) / float(den) if float(den) != 0 else 30.0
    else:
        fps = float(fps_str) if fps_str else 30.0
    return width, height, fps


def _crop_box(src_w: int, src_h: int, aspect_ratio: str) -> Tuple[int, int]:
    """Largest crop_w x crop_h that fits inside the source frame at target ratio."""
    target_ratio = _ratio(aspect_ratio)
    if target_ratio < src_w / src_h:
        crop_h = src_h
        crop_w = int(crop_h * target_ratio)
    else:
        crop_w = src_w
        crop_h = int(crop_w / target_ratio)
    crop_w = max(2, crop_w - (crop_w % 2))
    crop_h = max(2, crop_h - (crop_h % 2))
    return crop_w, crop_h


def _escape_filter_path(path: str) -> str:
    """Escape a filesystem path so it can sit inside an ffmpeg filtergraph value.

    ffmpeg's filter parser treats backslash, colon, quote, comma, brackets and
    semicolon as syntax, so a raw Windows path like C:\\temp\\x.txt tears the
    graph apart. Normalise separators to forward slashes, backslash-escape the
    rest, then wrap the whole value in single quotes.
    """
    escaped = str(path).replace("\\", "/")
    for char in ("\\", ":", "'", ",", "[", "]", ";"):
        escaped = escaped.replace(char, "\\" + char)
    return f"'{escaped}'"


def _apply_thread_budget(enc_flags: List[str], threads: int) -> List[str]:
    """Replace the encoder's thread count with one worker's share of the CPU budget."""
    flags = list(enc_flags)
    if "-threads" not in flags:
        # hardware encoders size their own pools, so leave those flags untouched
        return flags
    flags[flags.index("-threads") + 1] = str(max(1, threads))
    return flags


def _face_model_path() -> str:
    """Path to the bundled YuNet model, resolved from this file instead of the cwd."""
    luna_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(luna_dir, "assets", "models", "face_detection_yunet.onnx")


def _open_face_detector() -> Tuple[Optional[str], Optional[Callable], str]:
    """Return (name, detect(frame) -> boxes, error), trying YuNet, then Haar, then none."""
    try:
        import cv2  # type: ignore
    except Exception as e:
        return None, None, f"cv2 unavailable ({e})"

    errors: List[str] = []
    model_path = _face_model_path()
    yunet_factory = getattr(cv2, "FaceDetectorYN", None)
    if yunet_factory is None:
        errors.append("cv2.FaceDetectorYN missing")
    elif not os.path.isfile(model_path):
        errors.append(f"YuNet model missing at {model_path}")
    else:
        try:
            yunet = yunet_factory.create(model_path, "", (320, 320), 0.6, 0.3, 5000)

            def detect_yunet(frame) -> List[Tuple[int, int, int, int, float]]:
                height, width = frame.shape[:2]
                yunet.setInputSize((width, height))
                _, faces = yunet.detect(frame)
                if faces is None:
                    return []
                return [(int(face[0]), int(face[1]), int(face[2]), int(face[3]), float(face[-1])) for face in faces]

            return "yunet", detect_yunet, ""
        except Exception as e:
            errors.append(f"YuNet unavailable ({e})")

    cascade_factory = getattr(cv2, "CascadeClassifier", None)
    if cascade_factory is None:
        errors.append("cv2.CascadeClassifier missing (OpenCV 5 dropped Haar cascades)")
    else:
        try:
            data = getattr(cv2, "data", None)
            cascade_path = os.path.join(data.haarcascades, "haarcascade_frontalface_default.xml") if data else ""
            cascade = cascade_factory(cascade_path) if cascade_path else None
            if cascade is not None and not cascade.empty():
                def detect_haar(frame) -> List[Tuple[int, int, int, int, float]]:
                    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                    faces = cascade.detectMultiScale(gray, scaleFactor=1.15, minNeighbors=4, minSize=(30, 30))
                    return [(int(x), int(y), int(w), int(h), 1.0) for x, y, w, h in faces]

                return "haar", detect_haar, ""
            errors.append("Haar cascade file missing")
        except Exception as e:
            errors.append(f"Haar unavailable ({e})")
    return None, None, "; ".join(errors)


def _face_center(face: Tuple[int, int, int, int, float]) -> Tuple[float, float]:
    return face[0] + face[2] / 2.0, face[1] + face[3] / 2.0


def _sample_faces(
    in_path: str, src_w: int, src_h: int, start_time: float, end_time: float, fps: float
) -> Tuple[List[Tuple[int, List[Tuple[int, int, int, int, float]]]], str, str, int]:
    """Detect every face once per second; boxes are in source-frame pixels."""
    detector_name, detect, error = _open_face_detector()
    if detect is None:
        return [], "none", error, 0

    import cv2  # type: ignore

    cap = cv2.VideoCapture(in_path)
    if not cap.isOpened():
        cap.release()
        return [], detector_name, f"cannot open {in_path}", 0

    step = max(1, int(round(fps))) if fps and fps > 0 else FACE_DETECT_SAMPLE_EVERY
    scale = FACE_DETECT_HEIGHT / float(src_h) if src_h > FACE_DETECT_HEIGHT else 1.0
    detect_w = max(2, int(round(src_w * scale)))
    detect_h = max(2, int(round(src_h * scale)))
    samples: List[Tuple[int, List[Tuple[int, int, int, int, float]]]] = []
    frame_idx = 0
    try:
        cap.set(cv2.CAP_PROP_POS_MSEC, max(0.0, start_time * 1000.0))
        # the seek lands on the nearest keyframe before start_time, so drop frames
        # until the read head reaches the clip start; capped so a backend that
        # never reports POS_MSEC cannot stall the whole encode
        target_ms = max(0.0, start_time * 1000.0)
        for _ in range(300):
            if cap.get(cv2.CAP_PROP_POS_MSEC) >= target_ms:
                break
            if not cap.grab():
                break

        total_frames = int(max(1.0, (end_time - start_time) * (fps or 30.0)))
        while frame_idx < total_frames:
            sampled = frame_idx % step == 0
            if sampled:
                ok, frame = cap.read()
            else:
                ok = cap.grab()
            if not ok:
                break
            if sampled:
                if scale != 1.0:
                    frame = cv2.resize(frame, (detect_w, detect_h), interpolation=cv2.INTER_LINEAR)
                boxes: List[Tuple[int, int, int, int, float]] = []
                for x, y, w, h, score in detect(frame):
                    if scale != 1.0:
                        x, y, w, h = (int(round(value / scale)) for value in (x, y, w, h))
                    boxes.append((x, y, w, h, score))
                samples.append((frame_idx, boxes))
            frame_idx += 1
    finally:
        cap.release()
    return samples, detector_name, "", frame_idx


def _choose_auto_layout(
    samples: List[Tuple[int, List[Tuple[int, int, int, int, float]]]], crop_w: int
) -> Tuple[str, str]:
    """Pick blur for wide two-person shots, face when one head dominates, else centre."""
    face_samples = [faces for _, faces in samples if faces]
    if not face_samples:
        return "center", "no_faces"
    two_face_samples = [faces for faces in face_samples if len(faces) >= 2]
    far_samples = 0
    for faces in two_face_samples:
        centres = sorted(_face_center(face)[0] for face in faces)
        if centres[-1] - centres[0] > crop_w * FAR_APART_RATIO:
            far_samples += 1
    # Most frames showing people must show two of them, and most of those pairs
    # must sit far enough apart that one 9:16 window would cut a head off.
    if two_face_samples and len(two_face_samples) * 2 > len(face_samples) and far_samples * 2 > len(two_face_samples):
        return "blur", "two_people_far_apart"
    return "face", "single_subject"


def _stable_face_track(
    samples: List[Tuple[int, List[Tuple[int, int, int, int, float]]]], src_w: int, src_h: int
) -> Optional[Dict]:
    """Link detections into tracks and return the longest-lived, steadiest one."""
    match_radius = max(60.0, min(src_w, src_h) * 0.15)
    tracks: List[Dict] = []
    for frame_idx, faces in samples:
        matched = set()
        for face in sorted(faces, key=lambda item: item[4], reverse=True):
            cx, cy = _face_center(face)
            best = None
            best_dist = match_radius
            for track_idx, track in enumerate(tracks):
                if track_idx in matched:
                    continue
                last_x, last_y = track["points"][-1][1], track["points"][-1][2]
                dist = math.hypot(cx - last_x, cy - last_y)
                if dist < best_dist:
                    best, best_dist = track_idx, dist
            if best is None:
                tracks.append({"points": [(frame_idx, cx, cy)], "score": face[4]})
            else:
                matched.add(best)
                tracks[best]["points"].append((frame_idx, cx, cy))
                tracks[best]["score"] = max(tracks[best]["score"], face[4])
    if not tracks:
        return None

    def rank(track: Dict) -> Tuple[int, float, float]:
        points = track["points"]
        jitter = sum(abs(b[1] - a[1]) for a, b in zip(points, points[1:])) / max(1, len(points) - 1)
        # Presence wins; a tie goes to the face that stays put horizontally.
        return len(points), -jitter, track["score"]

    return max(tracks, key=rank)


def _face_clip_origins(
    samples: List[Tuple[int, List[Tuple[int, int, int, int, float]]]],
    track: Dict,
    analyzed_frames: int,
    src_w: int,
    src_h: int,
    crop_w: int,
    crop_h: int,
) -> List[Tuple[int, int]]:
    """Interpolate the tracked face across frames and clamp the crop inside the source."""
    sample_frames = [frame_idx for frame_idx, _ in samples]
    if not sample_frames:
        return []
    analyzed_frames = max(1, analyzed_frames)
    points = {frame_idx: (cx, cy) for frame_idx, cx, cy in track["points"]}
    centres: List[Optional[Tuple[float, float]]] = []
    last = None
    for frame_idx in sample_frames:
        point = points.get(frame_idx)
        if point is not None:
            last = point
        centres.append(last)
    first = next((centre for centre in centres if centre is not None), None)
    if first is None:
        return []
    centres = [centre if centre is not None else first for centre in centres]

    origins: List[Tuple[int, int]] = []
    for frame in range(analyzed_frames):
        if frame <= sample_frames[0]:
            cx, cy = centres[0]
        elif frame >= sample_frames[-1]:
            cx, cy = centres[-1]
        else:
            cx, cy = centres[-1]
            for index in range(len(sample_frames) - 1):
                left, right = sample_frames[index], sample_frames[index + 1]
                if left <= frame <= right:
                    t = (frame - left) / (right - left) if right != left else 0.0
                    ax, ay = centres[index]
                    bx, by = centres[index + 1]
                    cx = ax + (bx - ax) * t
                    cy = ay + (by - ay) * t
                    break
        x0 = max(0, min(src_w - crop_w, int(cx) - crop_w // 2))
        y0 = max(0, min(src_h - crop_h, int(cy) - crop_h // 2))
        origins.append((x0, y0))
    return origins


def _blur_output_dims(aspect_ratio: str) -> Tuple[int, int]:
    """1080-wide output whose height follows the requested ratio (1920 for 9:16)."""
    width = BLUR_OUTPUT_WIDTH
    height = max(2, int(round(width / _ratio(aspect_ratio))))
    if height % 2:
        height += 1
    return width, height


def _blur_filter(out_w: int, out_h: int) -> str:
    """Fit the whole frame and fill the bars with a blurred zoomed copy of it."""
    return (
        "split=2[bg][fg];"
        f"[bg]scale={out_w}:{out_h}:force_original_aspect_ratio=increase,"
        f"crop={out_w}:{out_h},"
        "boxblur=luma_radius=24:luma_power=2:chroma_radius=12:chroma_power=2[bgb];"
        f"[fg]scale={out_w}:{out_h}:force_original_aspect_ratio=decrease:force_divisible_by=2[fgc];"
        "[bgb][fgc]overlay=(W-w)/2:(H-h)/2"
    )


def _resolve_framing(framing: Optional[str], use_face_detect: Optional[bool]) -> str:
    """Return the layout mode; an explicit framing value wins over the legacy flag."""
    if framing is None or not str(framing).strip():
        # Old callers only passed the boolean: False kept the static centre, True was auto.
        return "center" if use_face_detect is False else "auto"
    mode = normalize_clip_framing(framing)
    if mode is None:
        print(f"[clip/local] unknown framing={framing!r}, using auto", flush=True)
        return "auto"
    return mode


_DETECTED_ENCODER_FLAGS: Optional[List[str]] = None
_ENCODER_LOCK = threading.Lock()


def _downgrade_to_software_encoder() -> List[str]:
    """Permanently switch cached encoder to libx264 after a hardware hang/failure."""
    global _DETECTED_ENCODER_FLAGS
    with _ENCODER_LOCK:
        _DETECTED_ENCODER_FLAGS = list(_SOFTWARE_ENCODER_FLAGS)
        return _DETECTED_ENCODER_FLAGS


def _get_encoder_flags() -> List[str]:
    global _DETECTED_ENCODER_FLAGS
    with _ENCODER_LOCK:
        if _DETECTED_ENCODER_FLAGS is not None:
            return _DETECTED_ENCODER_FLAGS

    # Probe each candidate with its exact quality/rate-control flags so unsupported driver modes
    # fall through cleanly instead of encoding blurry ~200 kbps defaults or failing mid-clip.
    for label, flags in _HARDWARE_ENCODER_CANDIDATES:
        try:
            res = subprocess.run(
                [
                    "ffmpeg", "-y", "-f", "lavfi",
                    "-i", "testsrc=duration=0.1:size=256x256:rate=30",
                    *flags,
                    "-pix_fmt", "yuv420p",
                    "-f", "null", "-",
                ],
                capture_output=True, text=True, timeout=4,
            )
            if res.returncode == 0:
                print(f"[clip/local] Using {label}", flush=True)
                with _ENCODER_LOCK:
                    _DETECTED_ENCODER_FLAGS = list(flags)
                    return _DETECTED_ENCODER_FLAGS
        except Exception:
            pass

    with _ENCODER_LOCK:
        _DETECTED_ENCODER_FLAGS = list(_SOFTWARE_ENCODER_FLAGS)
        return _DETECTED_ENCODER_FLAGS


def _encode(
    source_path: str,
    start_time: float,
    end_time: float,
    vf: str,
    enc_flags: List[str],
    out_path: str,
    cues: Optional[List[Dict]],
    frame_w: int,
    frame_h: int,
    worker_threads: Optional[int] = None,
    cancel_event: Optional[threading.Event] = None,
    subtitle_style: str = "classic",
) -> None:
    clip_dur = max(0.1, end_time - start_time)
    clip_timeout = max(75.0, clip_dur * 2.0 + 30.0)
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-ss", f"{start_time:.3f}",
        # -t is the clip length, which is unambiguous; -to depends on whether
        # ffmpeg reads it as an input or output timestamp
        "-t", f"{clip_dur:.3f}",
        "-i", source_path,
    ]

    def _encode_with(flags: List[str]) -> None:
        resolved_flags = _apply_thread_budget(flags, worker_threads) if worker_threads else list(flags)
        tail = [
            *resolved_flags, "-c:a", "aac", "-b:a", "128k",
            "-pix_fmt", "yuv420p",  # 10-bit/HDR sources otherwise produce unplayable clips
            "-movflags", "+faststart", out_path,
        ]
        if not cues:
            _run_ffmpeg([*cmd, *(["-vf", vf] if vf else []), *tail], timeout=clip_timeout, cancel_event=cancel_event)
            return
        with tempfile.TemporaryDirectory() as tmp:
            rendered = render_cues(cues, frame_w, frame_h, tmp, style=subtitle_style)
            if len(rendered) > MAX_INLINE_OVERLAY_SCREENS:
                # one -i per cue plus the inline graph overruns the Windows command
                # line; the graph goes in a script file that TemporaryDirectory clears
                script_path = os.path.join(tmp, "filtergraph.txt")
                _run_ffmpeg([*cmd, *overlay_args_script(rendered, vf, script_path), *tail], timeout=clip_timeout, cancel_event=cancel_event)
            else:
                _run_ffmpeg([*cmd, *overlay_args(rendered, vf), *tail], timeout=clip_timeout, cancel_event=cancel_event)

    try:
        _encode_with(enc_flags)
    except Exception as exc:
        if (cancel_event is not None and cancel_event.is_set()) or str(exc) == "CANCELLED_BY_USER":
            raise
        if not _is_hardware_encoder(enc_flags):
            raise
        # Hardware drivers (e.g. h264_amf / h264_mf) can hang or fail mid-stream; discard partial MP4,
        # downgrade the cached encoder so later clips do not repeat the stall, and fall back cleanly.
        print(f"[clip/local] hardware encode failed ({exc}), switching to libx264", flush=True)
        _downgrade_to_software_encoder()
        if os.path.exists(out_path):
            try:
                os.remove(out_path)
            except OSError:
                pass
        _encode_with(_SOFTWARE_ENCODER_FLAGS)


def crop_clip_local(
    source_path: str,
    start_time: float,
    end_time: float,
    aspect_ratio: str,
    out_path: str,
    use_face_detect: Optional[bool] = None,
    src_dims: Optional[Tuple[int, int, float]] = None,
    cues: Optional[List[Dict]] = None,
    worker_threads: Optional[int] = None,
    cancel_event: Optional[threading.Event] = None,
    framing: Optional[str] = None,
    subtitle_style: str = "classic",
) -> str:
    """Cut + reframe one highlight in a single fast ffmpeg pass with hardware acceleration.

    framing selects the vertical layout: auto, face, blur or center. auto picks blur
    when the clip mostly shows two speakers too far apart for one 9:16 window, face
    when a stable head can be followed, and center when no face is found.
    When framing is omitted, the legacy use_face_detect flag decides: False keeps
    the old static centre and True means auto. Any explicit framing, including
    "auto", overrides that flag.
    """
    if src_dims is None:
        src_w, src_h, fps = _probe_dims(source_path)
    else:
        src_w, src_h, fps = src_dims

    padded_end = end_time + 0.25
    crop_w, crop_h = _crop_box(src_w, src_h, aspect_ratio)
    enc_flags = _get_encoder_flags()
    mode = _resolve_framing(framing, use_face_detect)

    if aspect_ratio in ("16:9", "original"):
        # Native aspect ratio: subclip directly (face tracking has no crop slack)
        print(f"[clip/local] layout=native faces=0 samples=0 target={src_w}x{src_h}", flush=True)
        _encode(
            source_path, start_time, padded_end, "", enc_flags, out_path, cues,
            src_w, src_h, worker_threads=worker_threads, cancel_event=cancel_event,
            subtitle_style=subtitle_style,
        )
        return out_path

    samples: List[Tuple[int, List[Tuple[int, int, int, int, float]]]] = []
    analyzed_frames = 0
    detector = "none"
    detector_error = ""
    if mode in ("auto", "face"):
        samples, detector, detector_error, analyzed_frames = _sample_faces(
            source_path, src_w, src_h, start_time, end_time, fps
        )
        if detector_error:
            print(f"[clip/local] face detection unavailable ({detector_error})", flush=True)

    face_samples = sum(1 for _, faces in samples if faces)
    max_faces = max((len(faces) for _, faces in samples), default=0)
    layout = mode
    reason = "requested"
    if mode == "auto":
        layout, reason = _choose_auto_layout(samples, crop_w)
    elif mode == "face" and face_samples == 0:
        layout, reason = "center", "no_faces"

    face_origins: List[Tuple[int, int]] = []
    if layout == "face":
        track = _stable_face_track(samples, src_w, src_h)
        if track is not None:
            face_origins = _face_clip_origins(samples, track, analyzed_frames, src_w, src_h, crop_w, crop_h)
        if not face_origins:
            layout, reason = "center", "no_stable_face"

    sendcmd_path = ""
    if layout == "face":
        sendcmd_path = out_path + ".sendcmd.txt"
        escaped_sendcmd = _escape_filter_path(sendcmd_path)
        if "\n" in escaped_sendcmd or "\r" in escaped_sendcmd:
            # a path we cannot express inside a filtergraph must not kill the clip
            layout, reason = "center", "unsafe_sendcmd_path"

    decision = f"layout={layout} faces={max_faces} samples={len(samples)}"
    if samples:
        decision += f" face_samples={face_samples}"
    if detector != "none":
        decision += f" detector={detector}"
    print(f"[clip/local] {decision} reason={reason}", flush=True)

    if layout == "blur":
        out_w, out_h = _blur_output_dims(aspect_ratio)
        _encode(
            source_path, start_time, padded_end, _blur_filter(out_w, out_h), enc_flags, out_path, cues,
            out_w, out_h, worker_threads=worker_threads, cancel_event=cancel_event,
            subtitle_style=subtitle_style,
        )
        return out_path

    if layout == "face":
        try:
            with open(sendcmd_path, "w") as f:
                for i, (x0, y0) in enumerate(face_origins):
                    t = i / fps if fps else 0.0
                    f.write(f"{t:.5f} crop@c x {x0}, crop@c y {y0};\n")
            crop_filter = f"crop@c={crop_w}:{crop_h}:{face_origins[0][0]}:{face_origins[0][1]}"
            out_w, out_h = _blur_output_dims(aspect_ratio)
            vf = f"{crop_filter},sendcmd=f={_escape_filter_path(sendcmd_path)},scale={out_w}:{out_h}:flags=lanczos"
            _encode(
                source_path, start_time, padded_end, vf, enc_flags, out_path, cues, out_w, out_h,
                worker_threads=worker_threads, cancel_event=cancel_event,
                subtitle_style=subtitle_style,
            )
        finally:
            if os.path.exists(sendcmd_path):
                os.remove(sendcmd_path)
        return out_path

    # Static center crop (9:16, 1:1, 3:4, etc.) in a single fast pass
    x0 = max(0, (src_w - crop_w) // 2)
    y0 = max(0, (src_h - crop_h) // 2)
    out_w, out_h = _blur_output_dims(aspect_ratio)
    center_filter = f"crop={crop_w}:{crop_h}:{x0}:{y0},scale={out_w}:{out_h}:flags=lanczos"
    _encode(
        source_path, start_time, padded_end, center_filter, enc_flags, out_path, cues,
        out_w, out_h, worker_threads=worker_threads, cancel_event=cancel_event,
        subtitle_style=subtitle_style,
    )
    return out_path


def crop_highlights_local(
    source_path: str,
    highlights: List[Dict],
    aspect_ratio: str = "9:16",
    out_dir: Optional[str] = None,
    use_face_detect: Optional[bool] = None,
    on_progress: Optional[Callable[[int, int], None]] = None,
    transcript_segments: Optional[List[Dict]] = None,
    transcript_words: Optional[List[Dict]] = None,
    cancel_event: Optional[threading.Event] = None,
    framing: Optional[str] = None,
    subtitle_style: Optional[str] = None,
) -> List[Dict]:
    out_dir = out_dir or local_output_dir()
    if "=" in str(out_dir) or not str(out_dir).strip():
        out_dir = "output"
    os.makedirs(out_dir, exist_ok=True)

    src_dims = _probe_dims(source_path)
    enc_flags = _get_encoder_flags()
    resolved_framing = _resolve_framing(framing, use_face_detect)
    print(
        f"[clip/local] source={src_dims[0]}x{src_dims[1]} @ {src_dims[2]:.1f}fps, "
        f"target_ratio={aspect_ratio}, framing={resolved_framing}, total_clips={len(highlights)}",
        flush=True,
    )

    results: List[Dict] = [{} for _ in highlights]
    # AMD AMF and Windows MediaFoundation hardware sessions can deadlock under concurrent encodes,
    # whereas NVENC/QSV support 2 concurrent encodes and software libx264 scales up to 3 parallel workers.
    if _is_serial_hardware_encoder(enc_flags):
        max_workers = 1
        worker_threads = 0
    elif _is_hardware_encoder(enc_flags):
        max_workers = 2
        worker_threads = 0
    else:
        max_workers = min(3, max(1, (os.cpu_count() or 4) - 1))
        # a single worker keeps libx264's own -threads 0 detection, otherwise it
        # would oversubscribe the CPU across parallel ffmpeg processes
        worker_threads = max(1, (os.cpu_count() or 4) // max_workers) if max_workers > 1 else 0

    def _process_one(idx: int, h: Dict) -> Dict:
        if cancel_event is not None and cancel_event.is_set():
            raise RuntimeError("CANCELLED_BY_USER")
        out_path = os.path.join(out_dir, f"short_{idx:02d}.mp4")
        print(
            f"[clip/local] starting clip {idx}/{len(highlights)}: {h.get('title', '(untitled)')} "
            f"[{float(h['start_time']):.1f}s - {float(h['end_time']):.1f}s]",
            flush=True,
        )
        try:
            clip_start = float(h["start_time"])
            clip_end = float(h["end_time"]) + 0.25
            # Word timings, when YouTube provides them, keep captions on the speaker's heels.
            cues = (
                cues_from_words(transcript_words or [], clip_start, clip_end)
                if transcript_words
                else segments_for_clip(transcript_segments or [], clip_start, clip_end)
            )
            crop_clip_local(
                source_path,
                float(h["start_time"]),
                float(h["end_time"]),
                aspect_ratio,
                out_path,
                src_dims=src_dims,
                cues=cues,
                worker_threads=worker_threads,
                cancel_event=cancel_event,
                framing=resolved_framing,
                subtitle_style=subtitle_style or "classic",
            )
            print(f"[clip/local] finished clip {idx}/{len(highlights)} -> {out_path}", flush=True)
            return {**h, "clip_url": out_path}
        except Exception as e:
            if (cancel_event is not None and cancel_event.is_set()) or str(e) == "CANCELLED_BY_USER":
                raise RuntimeError("CANCELLED_BY_USER") from e
            print(f"[clip/local] clip {idx} failed: {e}", flush=True)
            return {**h, "clip_url": None, "error": str(e)}

    completed_count = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(_process_one, i, h): i - 1 for i, h in enumerate(highlights, 1)}
        for future in concurrent.futures.as_completed(futures):
            idx = futures[future]
            results[idx] = future.result()
            completed_count += 1
            if on_progress:
                on_progress(completed_count, len(highlights))

    return results