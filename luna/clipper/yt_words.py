# SPDX-License-Identifier: MIT
# Ported from NeonClipping (https://github.com/iamajmeena/neonclipping), MIT License.
# Copyright (c) NeonClipping contributors. Adapted for Luna: typed return values,
# network errors folded into None, and docstrings rewritten. See THIRD_PARTY_NOTICES.md.

"""Word-timed transcript from YouTube's own json3 auto-captions.

Luna otherwise works with caption lines, which are 5-12 words long. Those lines
cannot say when a single word is spoken, so burned-in captions have to spread the
line's time across its words and always trail the speaker a little. The json3 track
carries a timestamp per word, costs one small HTTP request, and needs no speech model.
"""
import json
import re
import urllib.request
from typing import Dict, List, Optional

_BRACKETED = re.compile(r"[\[(].*[\])]")
_USER_AGENT = "Mozilla/5.0"
_MAX_PAYLOAD = 40_000_000


def _fetch_json(url: str) -> Dict:
    """Download and decode a caption track. Kept separate so tests can patch it."""
    request = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read(_MAX_PAYLOAD))


def from_info(info: Dict) -> Optional[List[Dict]]:
    """Return [{'start','end','text'}] in absolute seconds, or None when YouTube has no json3 track."""
    automatic = info.get("automatic_captions") or {}
    manual = info.get("subtitles") or {}
    language = info.get("language") or ""
    original_tracks = [key for key in automatic if key.endswith("-orig")]

    key: Optional[str] = None
    if language and f"{language}-orig" in automatic:
        key = f"{language}-orig"
    elif language and language in automatic:
        key = language
    elif len(original_tracks) == 1:
        key = original_tracks[0]
    elif "en-orig" in automatic:
        # several tracks and no declared language: English is the safest guess
        key = "en-orig"
    elif original_tracks:
        key = original_tracks[0]

    group = automatic
    if not key:  # a human-written track in the spoken language
        key = language if language in manual else None
        group = manual
    track = None
    if key:
        track = next((f for f in group.get(key) or [] if f.get("ext") == "json3" and f.get("url")), None)
    if not track:
        return None

    data = _fetch_json(track["url"])
    words: List[Dict] = []
    skipping = False
    for event in data.get("events") or []:
        segments = [seg for seg in event.get("segs") or [] if (seg.get("utf8") or "").strip()]
        if not segments:
            continue
        event_start = float(event.get("tStartMs") or 0)
        event_duration = float(event.get("dDurationMs") or 0)
        timed = len(segments) > 1 or "tOffsetMs" in segments[0]
        for segment in segments:
            parts = segment["utf8"].split()
            for index, word in enumerate(parts):
                if skipping:  # inside a multi-word [Music ...] span
                    if word.endswith(("]", ")")):
                        skipping = False
                    continue
                if word[:1] in "[(" and not _BRACKETED.fullmatch(word):
                    skipping = True
                    continue
                if _BRACKETED.fullmatch(word) or word in ("[", "]", "__", ">>", "-"):
                    continue
                at = (
                    event_start + float(segment.get("tOffsetMs") or 0)
                    if timed
                    else event_start + event_duration * index / max(1, len(parts))
                )
                words.append({"start": round(at / 1000, 2), "text": word})

    if not words:
        return None
    words.sort(key=lambda item: item["start"])
    for index, word in enumerate(words):
        following = words[index + 1]["start"] if index + 1 < len(words) else word["start"] + 0.4
        word["end"] = round(max(word["start"] + 0.08, min(following, word["start"] + 0.6)), 2)
    return words


def window(words: List[Dict], start: float, end: float) -> List[Dict]:
    """Words inside [start, end) with times relative to the window start."""
    return [
        {
            "start": round(word["start"] - start, 3),
            "end": round(min(word["end"], end) - start, 3),
            "text": word["text"],
        }
        for word in words
        if start <= word["start"] < end
    ]
