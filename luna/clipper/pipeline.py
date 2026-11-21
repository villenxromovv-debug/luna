# SPDX-License-Identifier: MIT
# This file is part of Luna's clip pipeline. See luna/clipper/LICENSE and
# THIRD_PARTY_NOTICES.md for the upstream notice.

"""End-to-end orchestrator: yt-dlp, transcription, LLM ranking, then ffmpeg/opencv rendering."""
import threading
from typing import Callable, Dict, List, Optional

from .clipper import crop_highlights_local
from .downloader import download_youtube_local, get_last_download_info, reset_last_download_info
from .highlights import get_highlights
from .llm import call_llm
from .transcriber import transcribe_local


def generate_shorts(
    youtube_url: str,
    num_clips: int = 3,
    aspect_ratio: str = "9:16",
    download_format: str = "1080",
    language: Optional[str] = None,
    clip_language: Optional[str] = None,
    use_face_detect: bool = True,
    framing: str = "auto",
    subtitle_style: Optional[str] = None,
    on_status: Optional[Callable[[str], None]] = None,
    out_dir: Optional[str] = None,
    progress_hook: Optional[Callable] = None,
    cancel_event: Optional[threading.Event] = None,
) -> Dict:
    """Run the full pipeline and return a structured result."""
    if cancel_event is not None and cancel_event.is_set():
        raise RuntimeError("CANCELLED_BY_USER")
    # downloader keeps the metadata as a process global: clear it before the
    # download so a reused local file or cached download cannot inherit the
    # previous job's title
    reset_last_download_info()
    source_path = download_youtube_local(
        youtube_url, fmt=download_format, out_dir=out_dir, progress_hook=progress_hook
    )

    if cancel_event is not None and cancel_event.is_set():
        raise RuntimeError("CANCELLED_BY_USER")
    # The title and channel tell the highlight model what the video is about, which is
    # the difference between picking a random aside and picking the answer people came for.
    download_info = get_last_download_info()
    video_context = {
        "title": download_info.get("title", ""),
        "channel": download_info.get("channel") or download_info.get("uploader", ""),
        "description": download_info.get("description", ""),
    }
    transcript = transcribe_local(source_path, video_url=youtube_url, language=language, on_status=on_status)
    if not transcript["segments"]:
        raise RuntimeError(
            "Whisper produced no segments. The video may have no detectable speech."
        )

    if cancel_event is not None and cancel_event.is_set():
        raise RuntimeError("CANCELLED_BY_USER")
    if on_status:
        on_status("ranking_highlights")
    highlights_result = get_highlights(
        transcript,
        num_clips=num_clips,
        llm_fn=call_llm,
        clip_language=clip_language,
        cancel_event=cancel_event,
        context=video_context,
        snap_sentences=True,
    )
    all_highlights: List[Dict] = highlights_result.get("highlights", [])
    if not all_highlights:
        raise RuntimeError("Highlight generator returned zero clips.")

    top = sorted(all_highlights, key=lambda h: int(h.get("score", 0)), reverse=True)[:num_clips]
    print(f"[pipeline] cropping {len(top)} of {len(all_highlights)} candidates", flush=True)

    if cancel_event is not None and cancel_event.is_set():
        raise RuntimeError("CANCELLED_BY_USER")
    if on_status:
        on_status("rendering")

    def _on_clip_progress(done: int, total: int):
        if on_status:
            on_status(f"rendering_{done}_{total}")

    shorts = crop_highlights_local(
        source_path, top, aspect_ratio=aspect_ratio, out_dir=out_dir, use_face_detect=use_face_detect, on_progress=_on_clip_progress,
        # Subtitles are burned into the clip by the renderer. Upstream stopped
        # passing cues because overlays were breaking some renders; pass the real
        # transcript again so finished clips carry subtitles.
        transcript_segments=transcript.get("segments") or [],
        cancel_event=cancel_event,
        framing=framing,
        subtitle_style=subtitle_style,
    )

    # A job with no clips must fail visibly instead of reporting success with an empty result.
    if not any(s.get("clip_url") for s in shorts):
        errors = [s["error"] for s in shorts if s.get("error")]
        raise RuntimeError(f"All clips failed to render: {errors[0] if errors else 'unknown error'}")

    return {
        "source_video_url": source_path,
        "transcript": transcript,
        "highlights": all_highlights,
        "shorts": shorts,
        "title": download_info.get("title", ""),
        "channel": download_info.get("channel") or download_info.get("uploader", ""),
        "transcribe_provider": transcript.get("provider", "Groq Cloud Whisper"),
    }
