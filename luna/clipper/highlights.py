# Copyright (C) 2026 Miqdad
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# This file is part of Luna. See LICENSE and NOTICE at the repository root.

"""Pick the transcript stretches worth cutting into short clips.

The model sees numbered transcript segments and answers with segment numbers,
never timestamps. Every clip therefore starts and ends on a segment boundary,
which is where a sentence starts and ends, and the model cannot invent a time
that is not in the video. Long transcripts go to the model in windows.
"""
import json
import math
import re
import threading
import time
from typing import Callable, Dict, List, Optional

from .config import clip_language as cfg_clip_language, normalize_clip_language
from .llm import GeminiFallbackExhaustedError, call_llm

LLMFn = Callable[[str], str]

MIN_CLIP_SECONDS = 15.0
MAX_CLIP_SECONDS = 60.0
WINDOW_CHARS = 40_000
WINDOW_OVERLAP_SEGMENTS = 8
ATTEMPTS = 3
LEAD_IN = 0.15
TAIL_OUT = 0.35
# Auto-captions end segments mid-sentence, so a clip often opens on "и вот тогда".
# A couple of segments back is enough to reach the sentence start; walking further
# would dilute the hook with a different thought.
SNAP_SEGMENTS = 3
SNAP_MAX_GAP = 2.5

PROMPT = """You select the strongest moments from a video transcript and turn them into standalone short vertical clips.

{context}Each transcript line is a segment: its number, its start time, then what was said.

Pick the {count} strongest moments, not the {count} most evenly spaced ones. Coverage is worthless when the clip is weak on its own; a viewer scrolls past in two seconds.

A clip earns a high score when:
- it opens on a hook a stranger understands at once: a claim, a hard number, a question, a conflict, a promise, a surprise;
- it carries one complete idea, answer, story or punchline and ends after it lands, not mid-thought;
- it makes sense with no surrounding context, so every name and reference inside it is explained or readable on its own;
- it is concrete: money, numbers, places, steps, names instead of vague talk.

Take points away when:
- the speaker greets, introduces himself or the channel, or announces the topic ("в этом видео", "привет, меня зовут", "сегодня поговорим");
- it is small talk, filler, an ad read, a like and subscribe reminder, or a link in the description;
- the same point is repeated twice inside the clip;
- the clip starts or ends in the middle of a sentence. Auto-captions split lines wherever they fit, so if the chosen first line starts mid-thought, take the line before it too, and if the last line stops mid-thought, take the line after it.

Length: {low:.0f} to {high:.0f} seconds, counted from the first line's time to the next line after the last one. Clips must not overlap.
{language_instruction}

Answer with JSON only, in this shape:
{{"clips": [{{"first": <segment number>, "last": <segment number>, "score": <0-100>, "title": "...", "caption": "..."}}]}}

Transcript:
{lines}
"""

RERANK_PROMPT = """You rank candidate clips cut from one video and keep the best {keep}.

{context}What makes a clip strong: it opens on a hook a stranger understands at once, carries one complete idea and ends after it lands. What makes it weak: greetings, channel intros, topic announcements, small talk, ad reads, subscribe reminders, starting or ending mid-sentence. Concrete numbers, money, places and steps beat vague talk.

Candidates, one per line: id | time range | model title | opening words.
{candidates}

Reply with JSON only:
{{"picks": [{{"id": <candidate id>, "score": <0-100>, "reason": "<short why>"}}]}}

Return exactly {keep} picks ordered best first, using only the ids listed above.
"""


TOPUP_PROMPT = """You previously selected {have} valid clip(s) from this transcript, so we still need {need} more non-overlapping clip(s).

{context}Already selected time ranges (DO NOT repeat or overlap these):
{picked}

Pick {ask} NEW clips from the unused parts of the transcript. Hold the same bar as the first pass: a stranger must understand the hook in the first seconds, one complete idea, and no greetings, ads or topic announcements. Each clip {low:.0f} to {high:.0f} seconds, non-overlapping, scored 0-100.
{language_instruction}

Answer with JSON only, in this shape:
{{"clips": [{{"first": <segment number>, "last": <segment number>, "score": <0-100>, "title": "...", "caption": "..."}}]}}

Transcript:
{lines}
"""


def clip_language_instruction(lang: Optional[str] = None) -> str:
    """Build explicit title/caption output language guidance for 'en' or 'ru'."""
    resolved = normalize_clip_language(lang) or cfg_clip_language()
    if resolved == "ru":
        return (
            "Write every clip title (at most 8 words) and caption (1-2 plain sentences, "
            "no hashtags, no emoji) strictly in natural, engaging Russian. Even if parts "
            "of the transcript are in another language or non-Latin script, translate and "
            "adapt the title and caption cleanly into natural Russian."
        )
    return (
        "Write every clip title (at most 8 words) and caption (1-2 plain sentences, "
        "no hashtags, no emoji) strictly in natural English. Even if parts of the "
        "transcript are in another language or non-Latin script, translate and adapt "
        "the title and caption cleanly into natural English."
    )

_EMOJI = re.compile(
    "[\U0001F000-\U0001FAFF\U00002600-\U000027BF\U0001F1E6-\U0001F1FF‍️⭐⭕⬛⬜⤴⤵]"
)
_HASHTAG = re.compile(r"(?<!\w)#\w+")
_DASH = re.compile(r"\s*[—–]\s*")
_TERMINAL = (".", "!", "?", "…", "。")
_JUNK = re.compile(
    r"^\[?(музыка|аплодисменты|смех|закадровый смех|music|applause|laughter)\]?$"
    r"|субтитры\s+(сделал|создавал|подготовил|редактор)"
    r"|продолжение\s+следует"
    r"|подписывайтесь\s+на\s+канал"
    r"|спасибо\s+за\s+просмотр",
    re.IGNORECASE,
)


def format_context(context: Optional[Dict]) -> str:
    """Describe the video for the model, so it can judge topics it already knows."""
    if not context:
        return ""
    lines: List[str] = []
    title = str(context.get("title") or "").strip()
    channel = str(context.get("channel") or "").strip()
    description = str(context.get("description") or "").strip()
    if title:
        lines.append(f'Video: "{title}"')
    if channel:
        lines.append(f"Channel: {channel}")
    if description:
        lines.append(f"Description: {description[:300]}")
    return "\n".join(lines) + "\n\n" if lines else ""


def _is_junk(text: str) -> bool:
    """Drop segment text that can never become a clip: captions credits, applause, ad lines."""
    cleaned = " ".join(str(text or "").split())
    if not cleaned or not re.search(r"\w", cleaned):
        return True
    if len(cleaned) > 140:
        return False
    return bool(_JUNK.search(cleaned))


def _ends_sentence(text: str) -> bool:
    return str(text or "").rstrip().endswith(_TERMINAL)


_SENTENCE_END = re.compile(r"[.!?…。]+(?=\s|$)")


def _trim_to_sentence_start(segments: List[Dict], first: int, start: float, end: float) -> float:
    """Auto-captions often begin a line mid-sentence; start where the sentence inside it starts."""
    segment = segments[first]
    text = str(segment["text"])
    length = segment["end"] - segment["start"]
    if length <= 0 or not text:
        return start
    match = _SENTENCE_END.search(text)
    if not match:
        return start
    offset = match.end() / max(1, len(text))
    if offset > 0.7:  # the sentence ends near the line end, so the line already opens one
        return start
    trimmed = segment["start"] + length * offset
    if end - trimmed < MIN_CLIP_SECONDS * 0.7:
        return start
    return max(start, trimmed)


def _trim_to_sentence_end(segments: List[Dict], last: int, start: float, end: float) -> float:
    """End the clip on a sentence that finishes inside the last caption line, not after it."""
    segment = segments[last]
    text = str(segment["text"])
    length = segment["end"] - segment["start"]
    if length <= 0 or not text:
        return end
    match = _SENTENCE_END.search(text)
    if not match:
        return end
    offset = match.end() / max(1, len(text))
    if offset < 0.25:  # the line ends right after the sentence, keep the natural tail
        return end
    trimmed = segment["start"] + length * offset
    if trimmed - start < MIN_CLIP_SECONDS * 0.7:
        return end
    return min(end, trimmed + TAIL_OUT)




def clean_caption(caption: Optional[str]) -> str:
    """Strip emoji and hashtags, turn em and en dashes into commas."""
    if not caption:
        return ""
    text = _EMOJI.sub("", str(caption))
    text = _HASHTAG.sub("", text)
    text = _DASH.sub(", ", text)
    text = re.sub(r"([!?.,;:]),", r"\1", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text.strip(" ,;:")


def _windows(segments: List[Dict]) -> List[range]:
    """Split segment indexes into windows that fit WINDOW_CHARS, overlapping a little."""
    windows: List[range] = []
    start = 0
    while start < len(segments):
        size, end = 0, start
        while end < len(segments) and (end == start or size + len(segments[end]["text"]) + 16 <= WINDOW_CHARS):
            size += len(segments[end]["text"]) + 16
            end += 1
        windows.append(range(start, end))
        if end >= len(segments):
            break
        start = max(start + 1, end - WINDOW_OVERLAP_SEGMENTS)
    return windows


def _parse(raw: str) -> List[Dict]:
    """Read the model's JSON, tolerating code fences or text around it."""
    first, last = raw.find("{"), raw.rfind("}")
    if first < 0 or last < first:
        raise ValueError(f"no JSON object in the reply: {raw[:200]!r}")
    clips = json.loads(raw[first:last + 1]).get("clips")
    if not isinstance(clips, list):
        raise ValueError("the reply has no clips list")
    return [c for c in clips if isinstance(c, dict)]


def call_highlight_api(
    prompt: str,
    llm_fn: LLMFn = call_llm,
    cancel_event: Optional[threading.Event] = None,
    parser: Optional[Callable[[str], List[Dict]]] = None,
) -> List[Dict]:
    """Ask the model, retrying parse/transient issues without multiplying full Gemini fallback cascades."""
    parse = parser or _parse
    error: Optional[Exception] = None
    for attempt in range(ATTEMPTS):
        if cancel_event is not None and cancel_event.is_set():
            raise RuntimeError("CANCELLED_BY_USER")
        if attempt:
            time.sleep(2 * attempt)
        try:
            raw = llm_fn(prompt, cancel_event=cancel_event) if llm_fn is call_llm else llm_fn(prompt)
            return parse(raw)
        except GeminiFallbackExhaustedError as e:
            # All Gemini fallback models already failed; do not multiply the entire cascade by ATTEMPTS.
            print(f"[highlights] Gemini fallback cascade exhausted: {e}", flush=True)
            raise RuntimeError(f"The AI model could not pick clips: {e}") from e
        except Exception as e:  # provider errors and bad JSON are both worth a retry
            if str(e) == "CANCELLED_BY_USER":
                raise
            error = e
            print(f"[highlights] attempt {attempt + 1}/{ATTEMPTS} failed: {e}", flush=True)
    raise RuntimeError(f"The AI model could not pick clips: {error}")


def _parse_picks(raw: str) -> List[Dict]:
    """Read the rerank reply, tolerating code fences or text around it."""
    first, last = raw.find("{"), raw.rfind("}")
    if first < 0 or last < first:
        raise ValueError(f"no JSON object in the reply: {raw[:200]!r}")
    picks = json.loads(raw[first:last + 1]).get("picks")
    if not isinstance(picks, list):
        raise ValueError("the reply has no picks list")
    return [p for p in picks if isinstance(p, dict)]



def _to_highlight(
    clip: Dict,
    segments: List[Dict],
    window: range,
    duration: float,
    snap_sentences: bool = False,
) -> Optional[Dict]:
    """Turn segment numbers into a clip on segment boundaries, inside the length limits."""
    try:
        first, last = int(clip["first"]), int(clip["last"])
    except (KeyError, TypeError, ValueError):
        return None
    first, last = max(first, window.start), min(last, window.stop - 1)
    if first > last:
        return None
    # Too long: end on the latest sentence end that fits, else on the latest segment that fits.
    if segments[last]["end"] - segments[first]["start"] > MAX_CLIP_SECONDS:
        fits = [i for i in range(first, last + 1) if segments[i]["end"] - segments[first]["start"] <= MAX_CLIP_SECONDS]
        ends = [i for i in fits if segments[i]["text"].rstrip().endswith((".", "!", "?", "\u3002"))]
        last = (ends or fits or [first])[-1]
    # Too short: add the next segments, then earlier ones.
    while segments[last]["end"] - segments[first]["start"] < MIN_CLIP_SECONDS:
        if last + 1 < len(segments) and segments[last + 1]["end"] - segments[first]["start"] <= MAX_CLIP_SECONDS:
            last += 1
        elif first > 0 and segments[last]["end"] - segments[first - 1]["start"] <= MAX_CLIP_SECONDS:
            first -= 1
        else:
            break
    # Auto-captions cut sentences in arbitrary places, so a clip can open on "и вот тогда".
    # Walk back to where the previous sentence ended, and forward to where this one lands.
    if snap_sentences:
        for _ in range(SNAP_SEGMENTS):
            if first <= max(window.start, 0):
                break
            previous = segments[first - 1]
            if _ends_sentence(previous["text"]):
                break
            if segments[first]["start"] - previous["end"] > SNAP_MAX_GAP:
                break
            if segments[last]["end"] - previous["start"] > MAX_CLIP_SECONDS:
                break
            first -= 1
        for _ in range(SNAP_SEGMENTS):
            if last + 1 >= len(segments) or last + 1 >= window.stop:
                break
            if _ends_sentence(segments[last]["text"]):
                break
            if segments[last + 1]["start"] - segments[last]["end"] > SNAP_MAX_GAP:
                break
            if segments[last + 1]["end"] - segments[first]["start"] > MAX_CLIP_SECONDS:
                break
            last += 1

    # A little air around the words so the first and last syllables are not clipped,
    # while skipping clamp if neighbouring auto-captions intentionally overlap.
    start = max(0.0, segments[first]["start"] - LEAD_IN)
    if first > 0 and segments[first - 1]["end"] <= segments[first]["start"]:
        start = max(start, segments[first - 1]["end"])
    end = segments[last]["end"] + TAIL_OUT
    if last + 1 < len(segments) and segments[last + 1]["start"] >= segments[last]["end"]:
        end = min(end, segments[last + 1]["start"])
    if snap_sentences:
        start = _trim_to_sentence_start(segments, first, start, end)
        end = _trim_to_sentence_end(segments, last, start, end)
    if duration:
        end = min(end, duration)
    try:
        score = max(0, min(100, int(round(float(clip.get("score", 50))))))
    except (TypeError, ValueError):
        score = 50
    title = clean_caption(clip.get("title")) or "Highlight"
    return {
        "start_time": round(start, 2),
        "end_time": round(end, 2),
        "score": score,
        "title": title,
        "caption": clean_caption(clip.get("caption")) or title,
    }


def _drop_overlaps(highlights: List[Dict]) -> List[Dict]:
    """Keep the higher-scored clip when two cover more than half of the shorter one."""
    kept: List[Dict] = []
    for h in sorted(highlights, key=lambda h: h["score"], reverse=True):
        length = h["end_time"] - h["start_time"]
        if all(
            min(h["end_time"], k["end_time"]) - max(h["start_time"], k["start_time"])
            <= 0.5 * min(length, k["end_time"] - k["start_time"])
            for k in kept
        ):
            kept.append(h)
    return kept


def _has_unused_span(highlights: List[Dict], duration: float) -> bool:
    """True when there is at least one uncovered stretch long enough for a new clip."""
    if not highlights:
        return duration >= MIN_CLIP_SECONDS
    cursor = 0.0
    for h in sorted(highlights, key=lambda item: item["start_time"]):
        if h["start_time"] - cursor >= MIN_CLIP_SECONDS:
            return True
        cursor = max(cursor, h["end_time"])
    return (duration - cursor) >= MIN_CLIP_SECONDS


def _format_ts(seconds: float) -> str:
    mins, secs = divmod(max(0.0, seconds), 60)
    return f"{int(mins):02d}:{secs:04.1f}"


def _excerpt(highlight: Dict, segments: List[Dict], limit: int = 16) -> str:
    """First words spoken inside a clip, so the reranker sees content, not just a title."""
    words: List[str] = []
    for segment in segments:
        if segment["end"] <= highlight["start_time"]:
            continue
        if segment["start"] >= highlight["end_time"]:
            break
        words.extend(str(segment["text"]).split())
        if len(words) >= limit:
            break
    return " ".join(words[:limit])


def _rerank_highlights(
    highlights: List[Dict],
    segments: List[Dict],
    num_clips: int,
    llm_fn: LLMFn,
    cancel_event: Optional[threading.Event],
    context_text: str,
) -> List[Dict]:
    """Second pass: the model sees all candidates at once and reorders them by hook strength.

    The first pass decides what is worth cutting; this pass decides what is worth publishing.
    Any failure keeps the first-pass order, so a rerank is never required for a job to finish.
    """
    if len(highlights) <= num_clips:
        return highlights
    candidates = "\n".join(
        f'{i}. {_format_ts(h["start_time"])}-{_format_ts(h["end_time"])} | '
        f'{str(h.get("title", ""))[:70]} | {_excerpt(h, segments)}'
        for i, h in enumerate(highlights)
    )
    prompt = RERANK_PROMPT.format(keep=num_clips, context=context_text, candidates=candidates)
    try:
        picks = call_highlight_api(prompt, llm_fn=llm_fn, cancel_event=cancel_event, parser=_parse_picks)
    except Exception as e:
        if str(e) == "CANCELLED_BY_USER":
            raise
        print(f"[highlights] rerank skipped ({e})", flush=True)
        return highlights

    ordered: List[Dict] = []
    used: set = set()
    for pick in picks:
        try:
            index = int(pick["id"])
        except (KeyError, TypeError, ValueError):
            continue
        if index < 0 or index >= len(highlights) or index in used:
            continue
        used.add(index)
        item = dict(highlights[index])
        try:
            item["score"] = max(0, min(100, int(round(float(pick.get("score", item["score"]))))))
        except (TypeError, ValueError):
            pass
        ordered.append(item)
    if not ordered:
        return highlights
    ordered = ordered[:max(1, num_clips)]
    rest = [h for i, h in enumerate(highlights) if i not in used]
    print(f"[highlights] reranked {len(ordered)} of {len(highlights)} candidates", flush=True)
    return ordered + rest



def _format_window_lines(segments: List[Dict], window: range) -> str:
    return "\n".join(
        f"{i} [{_format_ts(segments[i]['start'])}] {segments[i]['text']}"
        for i in window
    )


def get_highlights(
    transcript: Dict,
    num_clips: int = 3,
    llm_fn: Optional[LLMFn] = None,
    clip_language: Optional[str] = None,
    cancel_event: Optional[threading.Event] = None,
    context: Optional[Dict] = None,
    snap_sentences: bool = False,
    rerank: bool = True,
) -> Dict:
    """Return {"highlights": [...]} sorted by score, best first, filling num_clips when possible."""
    llm_fn = llm_fn or call_llm
    lang_rule = clip_language_instruction(clip_language)
    context_text = format_context(context)
    segments = [
        {"start": float(s["start"]), "end": float(s["end"]), "text": " ".join(str(s.get("text", "")).split())}
        for s in transcript.get("segments", [])
        if str(s.get("text", "")).strip()
    ]
    # Caption credits, applause markers, subscribe reminders and repeated auto-caption lines
    # only dilute the prompt: a model asked to pick 5 clips from 656 lines sees noise as signal.
    cleaned: List[Dict] = []
    for segment in segments:
        if _is_junk(segment["text"]):
            continue
        # Auto-captions repeat whole phrases across consecutive segments; short single
        # words repeat legitimately ("да", "вот"), so only long identical lines collapse.
        if cleaned and len(segment["text"]) >= 40 and cleaned[-1]["text"] == segment["text"]:
            continue
        cleaned.append(segment)
    segments = cleaned
    if not segments:
        return {"highlights": []}
    duration = float(transcript.get("duration") or segments[-1]["end"])
    windows = _windows(segments)
    target = min(num_clips, max(1, int(duration // MIN_CLIP_SECONDS)))
    wanted = num_clips + 2  # a few spares, since some candidates overlap or come out weak

    found: List[Dict] = []
    succeeded_windows: List[range] = []
    error: Optional[Exception] = None
    for window in windows:
        if cancel_event is not None and cancel_event.is_set():
            raise RuntimeError("CANCELLED_BY_USER")
        span = segments[window.stop - 1]["end"] - segments[window.start]["start"]
        count = wanted if len(windows) == 1 else min(10, max(2, math.ceil(wanted * span / max(duration, 1))))
        win_target = target if len(windows) == 1 else min(count, max(1, math.ceil(target * span / max(duration, 1))))
        lines = _format_window_lines(segments, window)
        prompt = PROMPT.format(
            count=count,
            target=win_target,
            low=MIN_CLIP_SECONDS,
            high=MAX_CLIP_SECONDS,
            language_instruction=lang_rule,
            context=context_text,
            lines=lines,
        )
        try:
            clips = call_highlight_api(prompt, llm_fn=llm_fn, cancel_event=cancel_event)
        except RuntimeError as e:
            if str(e) == "CANCELLED_BY_USER":
                raise
            error = e  # one bad window should not throw away the others
            continue
        succeeded_windows.append(window)
        found += [
            h for h in (
                _to_highlight(c, segments, window, duration, snap_sentences=snap_sentences)
                for c in clips
            ) if h
        ]

    if not found and error:
        raise error
    highlights = _drop_overlaps(found)

    # Top up once if the model returned fewer non-overlapping clips than requested
    # and the transcript still has at least one unused stretch >= MIN_CLIP_SECONDS.
    if 0 < len(highlights) < target and succeeded_windows and _has_unused_span(highlights, duration):
        for window in succeeded_windows:
            if cancel_event is not None and cancel_event.is_set():
                raise RuntimeError("CANCELLED_BY_USER")
            missing = target - len(highlights)
            if missing <= 0:
                break
            picked_lines = "\n".join(
                f"- {_format_ts(h['start_time'])} - {_format_ts(h['end_time'])}: {h.get('title', 'Highlight')}"
                for h in sorted(highlights, key=lambda item: item["start_time"])
            )
            topup_prompt = TOPUP_PROMPT.format(
                have=len(highlights),
                need=missing,
                ask=min(10, missing + 1),
                picked=picked_lines,
                low=MIN_CLIP_SECONDS,
                high=MAX_CLIP_SECONDS,
                language_instruction=lang_rule,
                context=context_text,
                lines=_format_window_lines(segments, window),
            )
            try:
                extra_clips = call_highlight_api(topup_prompt, llm_fn=llm_fn, cancel_event=cancel_event)
            except RuntimeError as e:
                if str(e) == "CANCELLED_BY_USER":
                    raise
                continue
            found += [
                h for h in (
                    _to_highlight(c, segments, window, duration, snap_sentences=snap_sentences)
                    for c in extra_clips
                ) if h
            ]
            highlights = _drop_overlaps(found)

    if rerank:
        highlights = _rerank_highlights(highlights, segments, num_clips, llm_fn, cancel_event, context_text)

    print(f"[highlights] {len(highlights)} clips from {len(windows)} window(s), {duration:.0f}s", flush=True)
    return {"highlights": highlights}
