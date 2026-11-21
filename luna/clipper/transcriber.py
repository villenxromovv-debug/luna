# SPDX-License-Identifier: MIT
# This file is part of Luna's clip pipeline. See luna/clipper/LICENSE and
# THIRD_PARTY_NOTICES.md for the upstream notice.

"""Local transcription via faster-whisper.

Reads a local media file and returns the same shape the highlight generator
expects: {duration, segments[start, end, text]}.
"""
import json
import os
import re
import tempfile
from pathlib import Path
from typing import Callable, Dict, List, Optional, Tuple

from .clipper import _run_ffmpeg
from .config import (
    ROOT_DIR,
    gemini_model,
    local_output_dir,
    local_whisper_device,
    local_whisper_model,
    local_whisper_vad_filter,
    local_whisper_vad_parameters,
    require_gemini_key,
    transcribe_provider,
)

# Ignore short shared prefixes ("I", "the") when trimming repeated auto-caption lines.
ROLLING_CAPTION_MIN_OVERLAP = 8


def _transcript_cache_path(media_path: str, provider: str = "", language: Optional[str] = None) -> Path:
    """Return the .srt cache path for a media file, namespaced by provider and language."""
    cache_dir = Path(local_output_dir())
    cache_dir.mkdir(parents=True, exist_ok=True)
    provider_key = (provider or "unknown").strip() or "unknown"
    lang_key = (language or "auto").strip() or "auto"
    return cache_dir / f"{Path(media_path).stem}.{provider_key}.{lang_key}.srt"


def _format_srt_timestamp(seconds: float) -> str:
    total_ms = max(0, int(round(seconds * 1000)))
    ms = total_ms % 1000
    total_s = total_ms // 1000
    s = total_s % 60
    total_m = total_s // 60
    m = total_m % 60
    h = total_m // 60
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def _parse_srt_timestamp(value: str) -> float:
    """Parse SRT/VTT times: HH:MM:SS,mmm or MM:SS.mmm, with . or , as separator."""
    match = re.fullmatch(r"(?:(\d{1,2}):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})", value.strip())
    if not match:
        raise ValueError(f"Invalid SRT timestamp: {value!r}")
    hours = int(match.group(1) or 0)
    minutes, seconds = int(match.group(2)), int(match.group(3))
    fraction = match.group(4).ljust(3, "0")
    return hours * 3600 + minutes * 60 + seconds + int(fraction) / 1000.0


def _clean_caption_text(text: str) -> str:
    """Strip subtitle markup (HTML tags, ASS override blocks) and fold lines."""
    text = re.sub(r"\{\\[^}]*\}", "", text)
    text = re.sub(r"<[^>]+>", "", text)
    return " ".join(text.replace("\r", " ").replace("\n", " ").split())


def _dedupe_rolling_captions(segments: List[Dict]) -> List[Dict]:
    """YouTube rolling captions repeat the previous line; keep only the new tail."""
    deduped: List[Dict] = []
    for segment in segments:
        text = str(segment.get("text", "")).strip()
        if not text:
            continue
        if deduped:
            previous = deduped[-1]
            previous_text = previous["text"]
            if text == previous_text:
                # the line did not change, only its timing did
                previous["end"] = max(previous["end"], segment["end"])
                continue
            if len(previous_text) >= ROLLING_CAPTION_MIN_OVERLAP and text.startswith(previous_text):
                text = text[len(previous_text):].strip()
            elif len(text) >= ROLLING_CAPTION_MIN_OVERLAP and previous_text.startswith(text):
                # this cue only repeats what is already on screen
                previous["end"] = max(previous["end"], segment["end"])
                continue
        if text:
            deduped.append({"start": segment["start"], "end": segment["end"], "text": text})
    return deduped


def _write_srt_cache(
    media_path: str, transcript: Dict, provider: str = "", language: Optional[str] = None
) -> Path:
    cache_path = _transcript_cache_path(media_path, provider, language)
    lines = []
    for idx, segment in enumerate(transcript.get("segments", []), start=1):
        start = _format_srt_timestamp(float(segment["start"]))
        end = _format_srt_timestamp(float(segment["end"]))
        text = str(segment.get("text", "")).strip().replace("\r", "").replace("\n", " ")
        lines.append(str(idx))
        lines.append(f"{start} --> {end}")
        lines.append(text)
        lines.append("")

    # a half-written cache would otherwise be loaded as a real transcript next run
    fd, tmp_name = tempfile.mkstemp(prefix=f"{cache_path.name}.", suffix=".tmp", dir=str(cache_path.parent))
    tmp_path = Path(tmp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))
        os.replace(tmp_path, cache_path)
    finally:
        if tmp_path.exists():
            tmp_path.unlink()
    return cache_path


def _load_srt_cache(cache_path: Path) -> Dict:
    content = cache_path.read_text(encoding="utf-8-sig").strip()
    if not content:
        return {"duration": 0.0, "segments": []}

    segments = []
    for block in re.split(r"\n\s*\n", content):
        lines = [line.strip("\ufeff") for line in block.splitlines() if line.strip()]
        if not lines:
            continue
        if "-->" not in lines[0] and len(lines) > 1 and "-->" in lines[1]:
            lines = lines[1:]
        if not lines or "-->" not in lines[0]:
            continue
        start_raw, end_raw = [part.strip() for part in lines[0].split("-->", 1)]
        # auto-captions arrive with <i>/<font> tags, ASS overrides and stray arrows
        text = _clean_caption_text("\n".join(line for line in lines[1:] if "-->" not in line))
        if not text:
            continue
        segments.append(
            {
                "start": _parse_srt_timestamp(start_raw),
                "end": _parse_srt_timestamp(end_raw),
                "text": text,
            }
        )

    segments = _dedupe_rolling_captions(segments)
    duration = segments[-1]["end"] if segments else 0.0
    return {"duration": duration, "segments": segments}


def _resolve_device() -> str:
    configured = local_whisper_device()
    if configured != "auto":
        return configured
    try:
        import torch  # type: ignore
        if torch.cuda.is_available():
            # Test that CUDA actually works (catches missing cuBLAS/cuDNN libs)
            torch.zeros(1, device="cuda")
            return "cuda"
    except (ImportError, OSError, RuntimeError):
        pass
    return "cpu"


def _parse_vtt_content(content: str) -> Dict:
    """Parse WebVTT subtitle text into standard duration + segments format."""
    segments = []
    pattern = re.compile(
        r"((?:\d{2}:)?\d{2}:\d{2}[\.,]\d{3})\s*-->\s*((?:\d{2}:)?\d{2}:\d{2}[\.,]\d{3})[^\n]*\n([\s\S]*?)(?=\n\s*(?:(?:\d{2}:)?\d{2}:\d{2}[\.,]\d{3}|$))"
    )

    def to_sec(ts: str) -> float:
        ts = ts.replace(",", ".")
        parts = ts.split(":")
        if len(parts) == 3:
            return float(parts[0]) * 3600 + float(parts[1]) * 60 + float(parts[2])
        return float(parts[0]) * 60 + float(parts[1])

    for match in pattern.finditer(content):
        s_str, e_str, text_raw = match.groups()
        clean_text = _clean_caption_text(text_raw)
        if clean_text:
            segments.append({
                "start": to_sec(s_str),
                "end": to_sec(e_str),
                "text": clean_text
            })
    segments = _dedupe_rolling_captions(segments)
    duration = segments[-1]["end"] if segments else 0.0
    return {"duration": duration, "segments": segments}


def _try_fetch_native_youtube_subtitles(
    video_url: Optional[str],
    media_path: str,
    language: Optional[str] = None
) -> Optional[Dict]:
    """Check and extract native auto-caption or official subtitles in < 0.5s."""
    # 1. Check if yt-dlp downloaded any subtitle file (.vtt or .srt) alongside media_path
    if media_path:
        stem = Path(media_path).stem
        parent_dir = Path(media_path).parent
        langs_pref = [language] if language else ["ru", "ru-orig", "en", "en-orig"]
        def _sort_by_lang(path_obj: Path) -> int:
            fn = path_obj.name.lower()
            for idx, l in enumerate(langs_pref):
                if f".{l}." in fn or f"-{l}." in fn:
                    return idx
            return 999

        vtt_candidates = sorted(parent_dir.glob(f"{stem}*.vtt"), key=_sort_by_lang)
        for sub_file in vtt_candidates:
            try:
                with open(sub_file, "r", encoding="utf-8", errors="ignore") as f:
                    parsed = _parse_vtt_content(f.read())
                if parsed and parsed.get("segments"):
                    print(f"[transcribe/subtitles] Reused yt-dlp extracted VTT subtitle: {sub_file.name}", flush=True)
                    return parsed
            except Exception as e:
                print(f"[transcribe/subtitles] VTT parse notice: {e}", flush=True)

        srt_candidates = sorted(parent_dir.glob(f"{stem}*.srt"), key=_sort_by_lang)
        for sub_file in srt_candidates:
            try:
                parsed = _load_srt_cache(sub_file)
                if parsed and parsed.get("segments"):
                    print(f"[transcribe/subtitles] Reused yt-dlp extracted SRT subtitle: {sub_file.name}", flush=True)
                    return parsed
            except Exception as e:
                print(f"[transcribe/subtitles] SRT parse notice: {e}", flush=True)

    # 2. Query YouTubeTranscriptApi directly
    from .downloader import _extract_youtube_video_id
    vid = _extract_youtube_video_id(video_url or media_path)
    if vid:
        try:
            from youtube_transcript_api import YouTubeTranscriptApi
            api = YouTubeTranscriptApi()
            t_list = api.list(vid)
            target_t = None
            langs = [language] if language else ["ru", "ru-orig", "en", "en-orig"]
            for l in langs:
                try:
                    target_t = t_list.find_transcript([l])
                    if target_t:
                        break
                except Exception:
                    pass
            if not target_t:
                all_tracks = list(t_list)
                pref_prefixes = (f"{language.lower()}",) if language else ("ru", "en")
                # Prefer RU/EN regional variants (e.g. en-US) and non-generated original tracks
                # before falling back arbitrarily to the first alphabetical foreign language.
                target_t = next(
                    (
                        tr for tr in all_tracks
                        if any((getattr(tr, "language_code", "") or "").lower().split("-")[0] == p for p in pref_prefixes)
                    ),
                    None,
                ) or next((tr for tr in all_tracks if not getattr(tr, "is_generated", True)), None) or (
                    all_tracks[0] if all_tracks else None
                )
            if target_t:
                data = target_t.fetch()
                segments = []
                for entry in data:
                    start = float(entry["start"] if isinstance(entry, dict) else getattr(entry, "start", 0.0))
                    dur = float((entry.get("duration", 2.0) if isinstance(entry, dict) else getattr(entry, "duration", 2.0)) or 2.0)
                    text = str(entry.get("text", "") if isinstance(entry, dict) else getattr(entry, "text", "")).strip().replace("\r", "").replace("\n", " ")
                    if text:
                        segments.append({"start": start, "end": round(start + dur, 3), "text": text})
                if segments:
                    duration = segments[-1]["end"]
                    print(f"[transcribe/youtube-api] Instant native captions fetched ({len(segments)} segments, {duration:.0f}s) in < 0.5s!", flush=True)
                    return {"duration": duration, "segments": segments}
        except Exception as e:
            print(f"[transcribe/youtube-api] YouTube native transcript note: {e}", flush=True)

        # 3. Fallback: yt-dlp native subtitle extraction (bypasses YouTubeTranscriptApi IP blocks / 429)
        try:
            from .downloader import _import_ytdlp
            yt_dlp = _import_ytdlp()
            target_url = video_url if (video_url and video_url.startswith("http")) else f"https://www.youtube.com/watch?v={vid}"

            if media_path and Path(media_path).parent.exists():
                out_dir = Path(media_path).parent
                out_stem = Path(media_path).stem
            else:
                out_dir = Path("output")
                out_dir.mkdir(parents=True, exist_ok=True)
                out_stem = f"source_{vid}"

            sub_template = str(out_dir / f"{out_stem}.%(ext)s")
            sub_langs = [language] if language else ["ru", "ru-orig", "en", "en-orig"]

            cookie_file = os.path.join(ROOT_DIR, "cookies.txt")
            ydl_sub_opts = {
                "skip_download": True,
                "writesubtitles": True,
                "writeautomaticsub": True,
                "subtitleslangs": sub_langs,
                "subtitlesformat": "vtt",
                "outtmpl": sub_template,
                "quiet": True,
                "no_warnings": True,
                "ignoreerrors": True,
            }
            if os.path.exists(cookie_file) and os.path.getsize(cookie_file) > 0:
                ydl_sub_opts["cookiefile"] = cookie_file

            print(f"[transcribe/yt-dlp-subs] Fetching YouTube subtitles for {vid} via yt-dlp...", flush=True)
            with yt_dlp.YoutubeDL(ydl_sub_opts) as ydl:
                ydl.download([target_url])

            vtt_matches = sorted(
                out_dir.glob(f"{out_stem}*.vtt"),
                key=lambda p: 0 if (language and f".{language}." in p.name.lower()) or (".id." in p.name.lower() or "-id." in p.name.lower()) else 1
            )
            for sub_file in vtt_matches:
                try:
                    with open(sub_file, "r", encoding="utf-8", errors="ignore") as f:
                        parsed = _parse_vtt_content(f.read())
                    if parsed and parsed.get("segments"):
                        print(f"[transcribe/subtitles] Extracted yt-dlp VTT subtitle: {sub_file.name} ({len(parsed['segments'])} segments)", flush=True)
                        return parsed
                except Exception as e:
                    print(f"[transcribe/subtitles] VTT parse notice: {e}", flush=True)
        except Exception as e:
            print(f"[transcribe/yt-dlp-subs] yt-dlp subtitle extraction notice: {e}", flush=True)

    return None


def transcribe_local(
    media_path: str,
    video_url: Optional[str] = None,
    language: Optional[str] = None,
    on_status: Optional[Callable[[str], None]] = None,
) -> Dict:
    """Return a transcript for media_path.

    Sequence:
      1. Reuses cached transcript if valid.
      2. Checks YouTube native captions (YouTubeTranscriptApi / yt-dlp subtitles) in 0.5s.
      3. If no native captions, falls back to Groq Whisper Large v3 Turbo (runs in ~2-4s).
      4. Fallback to faster-whisper local if Groq not configured.
    """
    # the cache is scoped to the configured provider and requested language
    cache_provider = transcribe_provider()
    cache_path = _transcript_cache_path(media_path, cache_provider, language)
    if cache_path.exists():
        source_mtime = os.path.getmtime(media_path)
        cache_mtime = cache_path.stat().st_mtime
        if cache_mtime >= source_mtime:
            print(f"[transcribe/local] reusing cached transcript: {cache_path}", flush=True)
            try:
                cached = _load_srt_cache(cache_path)
            except (OSError, ValueError) as e:
                # corrupt timestamps or unreadable text: drop it and transcribe again
                print(f"[transcribe/local] cached transcript is invalid ({e}), deleting: {cache_path}", flush=True)
                cache_path.unlink(missing_ok=True)
                cached = None
            if cached is not None:
                if not cached["segments"] or cached["duration"] <= 0.0:
                    print(f"[transcribe/local] cache is empty/invalid, deleting: {cache_path}", flush=True)
                    cache_path.unlink(missing_ok=True)
                else:
                    print(
                        f"[transcribe/local] {len(cached['segments'])} cached segments, "
                        f"{cached['duration']:.0f}s of audio",
                        flush=True,
                    )
                    if on_status:
                        on_status("transcript_found")
                    _attach_youtube_words(cached, media_path, video_url)
                    return cached

    # Step 1: Check YouTube native transcript
    if on_status:
        on_status("checking_transcript")

    native_transcript = _try_fetch_native_youtube_subtitles(video_url, media_path, language=language)
    if native_transcript and native_transcript.get("segments"):
        native_transcript["provider"] = "YouTube Subtitle Scraper"
        if on_status:
            on_status("transcript_found")
        _write_srt_cache(media_path, native_transcript, cache_provider, language)
        _attach_youtube_words(native_transcript, media_path, video_url)
        return native_transcript

    # Step 2: Native not found, fallback to Groq Whisper
    if on_status:
        on_status("transcribing_groq")

    provider = transcribe_provider()
    if provider == "groq":
        transcript = _transcribe_local_groq(media_path, language=language, on_status=on_status)
        transcript["provider"] = "Groq Cloud Whisper"
    elif provider == "gemini":
        transcript = _transcribe_local_gemini(media_path, language=language, on_status=on_status)
        transcript["provider"] = "Gemini AI"
    elif provider == "whisper":
        transcript = _transcribe_local_whisper(media_path, language=language)
        transcript["provider"] = "Faster-Whisper Local"
    else:
        raise RuntimeError(
            f"Unknown LOCAL_TRANSCRIBE_PROVIDER={provider!r}. Use 'groq', 'gemini', or 'whisper'."
        )

    cache_path = _write_srt_cache(media_path, transcript, cache_provider, language)
    print(f"[transcribe/local] wrote cache: {cache_path} (provider: {transcript.get('provider')})", flush=True)
    _attach_youtube_words(transcript, media_path, video_url)
    return transcript


def _words_cache_path(media_path: str) -> Path:
    return Path(media_path).parent / f"{Path(media_path).stem}.words.json"


def _attach_youtube_words(transcript: Dict, media_path: str, video_url: Optional[str]) -> None:
    """Add word-level timings for the captions, when YouTube publishes them.

    Caption lines are 5-12 words, so burned-in text always trails the speaker a bit.
    A json3 caption track carries one timestamp per word and costs a single request;
    without it the renderer keeps spreading a line's time across its words.
    """
    if not video_url or "youtu" not in str(video_url) or not transcript.get("segments"):
        return
    cache = _words_cache_path(media_path)
    try:
        if cache.exists() and cache.stat().st_mtime >= os.path.getmtime(media_path):
            cached = json.loads(cache.read_text(encoding="utf-8"))
            words = cached.get("words") or []
            if words:
                transcript["words"] = words
                print(f"[transcribe/words] reused {len(words)} cached word timings", flush=True)
                return
    except (OSError, ValueError):
        pass

    try:
        import yt_dlp

        from .yt_words import from_info
    except Exception as e:  # optional dependency or broken install must not fail the job
        print(f"[transcribe/words] unavailable ({e})", flush=True)
        return

    cookie_file = os.path.join(ROOT_DIR, "cookies.txt")
    options = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "noplaylist": True,
        "socket_timeout": 20,
    }
    if os.path.exists(cookie_file):
        options["cookiefile"] = cookie_file
    try:
        with yt_dlp.YoutubeDL(options) as ydl:
            info = ydl.extract_info(video_url, download=False)
        words = from_info(info) or []
    except Exception as e:
        print(f"[transcribe/words] fetch failed ({e})", flush=True)
        words = []

    try:
        cache.write_text(json.dumps({"words": words}, ensure_ascii=False), encoding="utf-8")
    except OSError:
        pass
    if words:
        transcript["words"] = words
        print(f"[transcribe/words] {len(words)} word timings from YouTube captions", flush=True)


GROQ_FREE_TIER_MAX_BYTES = 25 * 1024 * 1024  # 25MB, Groq free-tier upload limit


def _extract_compressed_audio(media_path: str, out_path: str) -> None:
    """Extract audio-only, mono 16kHz Opus at a low bitrate.

    This is what keeps the upload small enough for Groq's free-tier 25MB
    limit — sending the raw video (or even raw-quality audio) blows past it
    on anything longer than a few minutes. Speech recognition doesn't need
    music-quality audio, so a low bitrate here costs nothing in practice.
    """
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-i", media_path,
        "-vn",  # no video
        "-ac", "1",  # mono
        "-ar", "16000",  # 16kHz
        "-c:a", "libopus", "-b:a", "24k",
        out_path,
    ]
    _run_ffmpeg(cmd)


def _transcribe_local_groq(
    media_path: str,
    language: Optional[str] = None,
    on_status: Optional[Callable[[str], None]] = None,
) -> Dict:
    """Transcribe via Groq's hosted Whisper Large v3 Turbo (fast, needs GROQ_API_KEY).

    on_status, if given, is called with short human-readable status strings
    ("extracting_audio", "uploading") so the caller (e.g. the web app)
    can show progress without this module knowing anything about the caller UI.
    """
    from openai import OpenAI

    from .config import groq_base_url, groq_whisper_model, require_groq_key

    if on_status:
        on_status("extracting_audio")

    groq_model_name = groq_whisper_model()
    with tempfile.TemporaryDirectory() as tmpdir:
        audio_path = os.path.join(tmpdir, "audio.ogg")
        _extract_compressed_audio(media_path, audio_path)

        audio_size = os.path.getsize(audio_path)
        print(f"[transcribe/local] extracted audio: {audio_size / 1024 / 1024:.1f} MB", flush=True)

        if audio_size > GROQ_FREE_TIER_MAX_BYTES:
            raise RuntimeError(
                f"Extracted audio ({audio_size / 1024 / 1024:.1f} MB) still exceeds "
                f"the Groq free-tier upload limit (25 MB). The video may be too long "
                f"for cloud transcription — set LOCAL_TRANSCRIBE_PROVIDER=whisper in "
                f".env for local transcription, or use a shorter video."
            )

        if on_status:
            on_status("uploading")

        print(f"[transcribe/local] groq model={groq_model_name}", flush=True)
        client = OpenAI(api_key=require_groq_key(), base_url=groq_base_url())

        with open(audio_path, "rb") as f:
            response = client.audio.transcriptions.create(
                file=f,
                model=groq_model_name,
                language=language,
                response_format="verbose_json",
                timestamp_granularities=["segment"],
            )

    raw_segments = getattr(response, "segments", None) or []
    segments = [
        {
            "start": float(s["start"] if isinstance(s, dict) else s.start),
            "end": float(s["end"] if isinstance(s, dict) else s.end),
            "text": str(s["text"] if isinstance(s, dict) else s.text).strip(),
        }
        for s in raw_segments
    ]
    duration = float(getattr(response, "duration", 0.0) or 0.0) or (
        segments[-1]["end"] if segments else 0.0
    )
    print(f"[transcribe/local] {len(segments)} segments, {duration:.0f}s of audio (groq)", flush=True)
    return {"duration": duration, "segments": segments}



def _transcribe_local_whisper(media_path: str, language: Optional[str] = None) -> Dict:
    """Run faster-whisper on this machine (CPU or CUDA GPU if available)."""

    try:
        from faster_whisper import WhisperModel  # type: ignore
    except ImportError as e:
        raise RuntimeError(
            "faster-whisper is required for --mode local. Install it with:\n"
            "    pip install -r requirements-whisper.txt"
        ) from e

    device = _resolve_device()
    compute_type = "float16" if device == "cuda" else "int8"
    whisper_model_name = local_whisper_model()
    print(f"[transcribe/local] faster-whisper model={whisper_model_name} device={device}", flush=True)

    model = WhisperModel(whisper_model_name, device=device, compute_type=compute_type)

    transcribe_kwargs = {
        "audio": media_path,
        "language": language,
        "beam_size": 5,
        "condition_on_previous_text": False,
    }
    if local_whisper_vad_filter():
        transcribe_kwargs["vad_filter"] = True
        transcribe_kwargs["vad_parameters"] = local_whisper_vad_parameters()
    else:
        transcribe_kwargs["vad_filter"] = False

    segments_iter, info = model.transcribe(**transcribe_kwargs)

    segments = []
    total_dur = getattr(info, "duration", 0.0)
    for s in segments_iter:
        if total_dur > 0:
            pct = (float(s.end) / float(total_dur)) * 100
            print(f"[transcribe/local] {s.end:.1f}s / {total_dur:.1f}s ({pct:.1f}%)", flush=True)

        segments.append({
            "start": float(s.start),
            "end": float(s.end),
            "text": (s.text or "").strip(),
        })

    duration = float(getattr(info, "duration", 0.0)) or (segments[-1]["end"] if segments else 0.0)
    print(f"[transcribe/local] {len(segments)} segments, {duration:.0f}s of audio", flush=True)
    return {"duration": duration, "segments": segments}


GEMINI_CHUNK_SECONDS = 600  # 10 minutes: one request per chunk keeps the JSON response complete


def _probe_media_duration(path: str) -> float:
    """Return a media file's duration in seconds via ffprobe."""
    out = _run_ffmpeg(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            path,
        ],
        timeout=60,
    ).stdout.strip()
    return float(out)


def _split_audio_chunks(audio_path: str, tmp_dir: str) -> List[Tuple[str, float]]:
    """Cut audio into <=10-minute pieces, returning (path, offset_seconds) pairs.

    An empty list means the audio could not be measured or split (no ffprobe,
    unusual codec), so the caller should fall back to one whole-file request.
    """
    try:
        duration = _probe_media_duration(audio_path)
    except Exception as e:
        print(f"[transcribe/gemini] cannot read audio duration ({e}), sending one request", flush=True)
        return []
    if duration <= GEMINI_CHUNK_SECONDS:
        return [(audio_path, 0.0)]

    chunks: List[Tuple[str, float]] = []
    offset = 0.0
    index = 0
    while offset < duration:
        chunk_path = os.path.join(tmp_dir, f"chunk_{index:03d}.mp3")
        try:
            _run_ffmpeg([
                "ffmpeg", "-y", "-loglevel", "error",
                "-ss", f"{offset:.3f}",
                "-t", f"{GEMINI_CHUNK_SECONDS:.3f}",
                "-i", audio_path,
                "-c", "copy",
                chunk_path,
            ])
        except RuntimeError as e:
            print(f"[transcribe/gemini] chunk split failed ({e}), sending one request", flush=True)
            return []
        if not os.path.exists(chunk_path) or os.path.getsize(chunk_path) == 0:
            return []
        chunks.append((chunk_path, offset))
        offset += GEMINI_CHUNK_SECONDS
        index += 1
    return chunks


def _transcribe_local_gemini(
    media_path: str,
    language: Optional[str] = None,
    on_status: Optional[Callable[[str], None]] = None,
) -> Dict:
    """Transcribe audio using Gemini Multimodal Audio API, one <=10 min chunk per request."""
    try:
        from google import genai
        from google.genai import types
    except ImportError as e:
        raise RuntimeError(
            "google-genai is required for LOCAL_TRANSCRIBE_PROVIDER=gemini. Install it with:\n"
            "    pip install google-genai"
        ) from e

    if on_status:
        on_status("extracting_audio")

    with tempfile.TemporaryDirectory() as tmpdir:
        audio_path = os.path.join(tmpdir, "audio.mp3")
        # Extract audio as 16kHz mono MP3
        cmd = [
            "ffmpeg", "-y", "-loglevel", "error",
            "-i", media_path,
            "-vn",
            "-ac", "1",
            "-ar", "16000",
            "-c:a", "libmp3lame", "-b:a", "64k",
            audio_path,
        ]
        _run_ffmpeg(cmd)

        audio_size = os.path.getsize(audio_path)
        print(f"[transcribe/gemini] extracted audio: {audio_size / 1024 / 1024:.1f} MB", flush=True)

        chunks = _split_audio_chunks(audio_path, tmpdir) or [(audio_path, 0.0)]
        print(f"[transcribe/gemini] transcribing {len(chunks)} audio chunk(s)", flush=True)

        lang_instruction = f" The audio language is {language}." if language else ""
        prompt = f"""Transcribe this audio file verbatim with accurate timestamps for each sentence or dialogue segment.{lang_instruction}

Return a valid JSON object matching this schema:
{{
  "duration": <total duration in seconds as float>,
  "segments": [
    {{
      "start": <start timestamp in seconds as float>,
      "end": <end timestamp in seconds as float>,
      "text": "<transcribed text for this segment>"
    }}
  ]
}}

Rules:
- Capture every spoken sentence verbatim with natural sentence breaks.
- Transcribe faithfully in the spoken language actually heard; never substitute or translate into an unrelated script.
- Ensure 'start' and 'end' are numbers in seconds (e.g. 0.0, 14.5).
- Do not skip parts of the audio or summarize.
- Output pure JSON only.
"""

        from .llm import GEMINI_AUDIO_TIMEOUT_MS, build_gemini_client

        client = build_gemini_client(require_gemini_key(), timeout_ms=GEMINI_AUDIO_TIMEOUT_MS)
        model_name = gemini_model()
        segments: List[Dict] = []
        total_duration = 0.0
        uploaded_names: List[str] = []
        try:
            for chunk_index, (chunk_path, offset) in enumerate(chunks, 1):
                if on_status:
                    on_status("uploading")
                print(
                    f"[transcribe/gemini] uploading chunk {chunk_index}/{len(chunks)} to Gemini Files API...",
                    flush=True,
                )
                uploaded_file = client.files.upload(file=chunk_path)
                uploaded_names.append(uploaded_file.name)

                # Wait for file to become ACTIVE if still processing
                import time
                for _ in range(30):
                    if not uploaded_file.state or uploaded_file.state.name == "ACTIVE":
                        break
                    if uploaded_file.state.name == "FAILED":
                        raise RuntimeError("Gemini audio file processing failed on server.")
                    print("[transcribe/gemini] waiting for audio file to be ready...", flush=True)
                    time.sleep(2)
                    uploaded_file = client.files.get(name=uploaded_file.name)

                if on_status:
                    on_status("transcribing_gemini")

                print(
                    f"[transcribe/gemini] generating transcription for chunk "
                    f"{chunk_index}/{len(chunks)} with model={model_name} (this may take 15-45s)...",
                    flush=True,
                )
                try:
                    from .llm import gemini_generate_with_fallback
                    response = gemini_generate_with_fallback(
                        client,
                        contents=[uploaded_file, prompt],
                        config=types.GenerateContentConfig(
                            response_mime_type="application/json",
                            temperature=0.1,
                            max_output_tokens=8192,
                        ),
                        log_prefix="[transcribe/gemini]",
                    )
                    raw_text = response.text or "{}"
                    clean_json = re.sub(r"^```(?:json)?\s*", "", raw_text.strip(), flags=re.MULTILINE)
                    clean_json = re.sub(r"\s*```$", "", clean_json.strip(), flags=re.MULTILINE)
                    data = json.loads(clean_json)
                except json.JSONDecodeError as e:
                    if len(chunks) > 1:
                        raise RuntimeError(
                            f"Gemini returned invalid JSON for audio chunk {chunk_index}/{len(chunks)}: {e}"
                        ) from e
                    raise RuntimeError(
                        "Gemini returned invalid JSON for the audio and it could not be retried in "
                        "smaller chunks (is ffprobe installed?). "
                        "Set LOCAL_TRANSCRIBE_PROVIDER=groq or whisper to use another provider."
                    ) from e

                chunk_last_end = 0.0
                for s in data.get("segments", []):
                    try:
                        start = float(s.get("start", 0.0)) + offset
                        end = float(s.get("end", 0.0)) + offset
                        text = str(s.get("text", "")).strip()
                    except (ValueError, TypeError):
                        continue
                    if text and end > start:
                        segments.append({"start": start, "end": end, "text": text})
                        chunk_last_end = max(chunk_last_end, end - offset)

                chunk_duration = float(data.get("duration", 0.0) or 0.0)
                total_duration = max(total_duration, offset + max(chunk_duration, chunk_last_end))
                print(
                    f"[transcribe/gemini] chunk {chunk_index}/{len(chunks)} done, "
                    f"{len(segments)} segments so far",
                    flush=True,
                )
        finally:
            for file_name in uploaded_names:
                try:
                    client.files.delete(name=file_name)
                except Exception as e:
                    print(f"[transcribe/gemini] warning deleting remote file: {e}", flush=True)

    segments.sort(key=lambda segment: float(segment["start"]))
    duration = total_duration
    if duration <= 0.0 and segments:
        duration = segments[-1]["end"]

    print(f"[transcribe/gemini] {len(segments)} segments, {duration:.0f}s of audio (gemini)", flush=True)
    return {"duration": duration, "segments": segments}
