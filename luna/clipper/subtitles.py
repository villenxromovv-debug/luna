# SPDX-License-Identifier: MIT
# This file is part of Luna's clip pipeline. See luna/clipper/LICENSE and
# THIRD_PARTY_NOTICES.md for the upstream notice.

"""Burn transcript segments into clips as rendered images.

Common FFmpeg builds, including Homebrew's, ship without the subtitles, ass and drawtext
filters. The overlay filter is always there, so the text is drawn with Pillow instead.

Auto captions arrive as 5-12 word segments. Each segment is cut into one-line screens of
two to four words, so the text changes with the speaker instead of ending on a fragment
of a wrapped line.
"""
import math
import os
from typing import Dict, List, Optional, Sequence, Tuple

from PIL import Image, ImageDraw, ImageFont

MAX_LINES_PER_CUE = 2

# Windows caps a command line at ~32k chars and every rendered cue costs one
# -i plus a filter term, so past this the graph goes into a script file instead.
MAX_INLINE_OVERLAY_SCREENS = 40

# Reels-style screens: one line, two to four words, timed against the segment.
MIN_WORDS_PER_SCREEN = 2
MAX_WORDS_PER_SCREEN = 4
MIN_SCREEN_SECONDS = 0.6
MAX_SCREEN_SECONDS = 3.2
MIN_CHUNK_SECONDS_TO_MERGE = 0.35
MAX_FONT_SHRINK = 0.85
TEXT_WIDTH_RATIO = 0.9

DEFAULT_STYLE = "classic"
DEFAULT_OVERLAY_Y = "H*0.86-h"

# Every preset is a complete record, so rendering never merges defaults.
# stroke_scale, plate_padding and plate_radius are fractions of the font size;
# anchor_y is the bottom edge of the PNG as a fraction of the frame height.
SUBTITLE_STYLES: Dict[str, Dict] = {
    "classic": {
        "font_scale": 0.055,
        "stroke_scale": 0.10,
        "fill": "white",
        "stroke_fill": "black",
        "anchor_y": 0.86,
        "uppercase": False,
        "plate": False,
        "plate_fill": (0, 0, 0, 170),
        "plate_padding": 0.55,
        "plate_radius": 0.30,
    },
    "bold": {
        "font_scale": 0.07,
        "stroke_scale": 0.18,
        "fill": "white",
        "stroke_fill": "black",
        "anchor_y": 0.86,
        "uppercase": False,
        "plate": False,
        "plate_fill": (0, 0, 0, 170),
        "plate_padding": 0.55,
        "plate_radius": 0.30,
    },
    "plate": {
        "font_scale": 0.055,
        "stroke_scale": 0.06,
        "fill": "white",
        "stroke_fill": "black",
        "anchor_y": 0.86,
        "uppercase": False,
        "plate": True,
        "plate_fill": (0, 0, 0, 170),
        "plate_padding": 0.55,
        "plate_radius": 0.30,
    },
    "top": {
        "font_scale": 0.055,
        "stroke_scale": 0.10,
        "fill": "white",
        "stroke_fill": "black",
        "anchor_y": 0.30,
        "uppercase": False,
        "plate": False,
        "plate_fill": (0, 0, 0, 170),
        "plate_padding": 0.55,
        "plate_radius": 0.30,
    },
    "accent": {
        "font_scale": 0.055,
        "stroke_scale": 0.12,
        "fill": "white",
        "stroke_fill": (255, 226, 0),
        "anchor_y": 0.86,
        "uppercase": False,
        "plate": False,
        "plate_fill": (0, 0, 0, 170),
        "plate_padding": 0.55,
        "plate_radius": 0.30,
    },
    "shadow": {
        "font_scale": 0.062,
        "stroke_scale": 0.0,
        "fill": "white",
        "stroke_fill": "black",
        "anchor_y": 0.86,
        "uppercase": False,
        "plate": False,
        "plate_fill": (0, 0, 0, 170),
        "plate_padding": 0.55,
        "plate_radius": 0.30,
        "shadow": True,
    },
    "mono": {
        "font_scale": 0.048,
        "stroke_scale": 0.08,
        "fill": "white",
        "stroke_fill": "black",
        "anchor_y": 0.86,
        "uppercase": True,
        "plate": False,
        "plate_fill": (0, 0, 0, 170),
        "plate_padding": 0.55,
        "plate_radius": 0.30,
    },
    "karaoke": {
        "font_scale": 0.062,
        "stroke_scale": 0.14,
        "fill": "white",
        "stroke_fill": "black",
        "anchor_y": 0.86,
        "uppercase": False,
        "plate": False,
        "plate_fill": (0, 0, 0, 170),
        "plate_padding": 0.55,
        "plate_radius": 0.30,
        "karaoke": True,
        "highlight_fill": (255, 226, 0),
    },
}
STYLES = SUBTITLE_STYLES  # short alias for callers that list available presets

# Pillow's bundled font only covers Latin. Prefer a system TrueType face with
# wider coverage; the path is resolved once and reused for every clip.
_FONT_CANDIDATES = [
    r"C:\Windows\Fonts\segoeui.ttf",
    r"C:\Windows\Fonts\arialuni.ttf",
    r"C:\Windows\Fonts\msyh.ttc",
    "/System/Library/Fonts/Helvetica.ttc",
    "/System/Library/Fonts/PingFang.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]
_RESOLVED_FONT_PATH: Optional[str] = None
_FONT_PATH_RESOLVED = False
# A clip has 40-70 screens; rebuilding the face per screen is the slow part.
_FONT_SIZE_CACHE: Dict[int, ImageFont.ImageFont] = {}
_MEASURE_PROBE = ImageDraw.Draw(Image.new("RGBA", (1, 1)))


def _resolve_font_path() -> Optional[str]:
    """Find a usable system font once, including fonts Pillow reports itself."""
    global _RESOLVED_FONT_PATH, _FONT_PATH_RESOLVED
    if _FONT_PATH_RESOLVED:
        return _RESOLVED_FONT_PATH
    _FONT_PATH_RESOLVED = True
    for candidate in _FONT_CANDIDATES:
        try:
            ImageFont.truetype(candidate, 16)
            _RESOLVED_FONT_PATH = candidate
            return _RESOLVED_FONT_PATH
        except (OSError, ValueError):
            continue
    try:
        # matplotlib ships DejaVu on platforms without a path we can hardcode
        from matplotlib import font_manager  # type: ignore
        resolved = font_manager.findfont("DejaVu Sans", fallback_to_default=False)
        ImageFont.truetype(resolved, 16)
        _RESOLVED_FONT_PATH = resolved
    except Exception:
        _RESOLVED_FONT_PATH = None
    return _RESOLVED_FONT_PATH


def _load_font(size: int) -> ImageFont.ImageFont:
    """Return a font with CJK/emoji coverage, falling back to Pillow's default."""
    size = max(1, int(size))
    cached = _FONT_SIZE_CACHE.get(size)
    if cached is not None:
        return cached
    path = _resolve_font_path()
    font: ImageFont.ImageFont
    if path:
        try:
            font = ImageFont.truetype(path, size)
        except (OSError, ValueError):
            font = ImageFont.load_default(size=size)
    else:
        font = ImageFont.load_default(size=size)
    _FONT_SIZE_CACHE[size] = font
    return font


def segments_for_clip(segments: List[Dict], clip_start: float, clip_end: float) -> List[Dict]:
    """Return segments overlapping the clip, as cues timed from the start of the clip."""
    cues = []
    for seg in sorted(segments, key=lambda s: float(s["start"])):
        text = " ".join(str(seg.get("text", "")).split())
        start = max(float(seg["start"]), clip_start) - clip_start
        end = min(float(seg["end"]), clip_end) - clip_start
        if text and end > start:
            cues.append({"start": start, "end": end, "text": text})
    # Auto-captions overlap, and two cues on screen at once would be drawn on top of each other.
    for current, following in zip(cues, cues[1:]):
        current["end"] = min(current["end"], following["start"])
    return [c for c in cues if c["end"] > c["start"]]


CUE_MAX_GAP = 0.45
CUE_SENTENCE_ENDS = (".", "!", "?", "…")


def cues_from_words(words: List[Dict], clip_start: float, clip_end: float, max_words: int = 4) -> List[Dict]:
    """Build short cues from word timings, so each screen starts when its words are spoken.

    A caption line says what was said in a 2-4 second window; a word list says exactly
    when. Grouping words by pause and sentence end keeps captions on the speaker's heels
    instead of spreading a line's time evenly across it.
    """
    inside = [
        word for word in sorted(words, key=lambda item: float(item["start"]))
        if float(word["end"]) > clip_start
        and float(word["start"]) < clip_end
        and str(word.get("text", "")).strip()
    ]
    cues: List[Dict] = []
    current: List[Dict] = []

    def flush() -> None:
        nonlocal current
        if not current:
            return
        start = max(float(current[0]["start"]), clip_start) - clip_start
        end = min(float(current[-1]["end"]), clip_end) - clip_start
        text = " ".join(str(word["text"]).strip() for word in current)
        if text and end > start:
            cues.append({
                "start": round(start, 3),
                "end": round(end, 3),
                "text": text,
                "word_times": [
                    {
                        "start": round(max(float(word["start"]), clip_start) - clip_start, 3),
                        "end": round(min(float(word["end"]), clip_end) - clip_start, 3),
                        "text": str(word["text"]).strip(),
                    }
                    for word in current
                ],
            })
        current = []

    for word in inside:
        if current:
            gap = float(word["start"]) - float(current[-1]["end"])
            if gap > CUE_MAX_GAP or len(current) >= max_words:
                flush()
            elif str(current[-1]["text"]).rstrip().endswith(CUE_SENTENCE_ENDS):
                flush()
        current.append(word)
    flush()
    return cues


def _resolve_style(style: str) -> Dict:
    """Return a preset by name; an unknown name falls back to classic, never raises."""
    preset = SUBTITLE_STYLES.get(style) if isinstance(style, str) else None
    return preset if preset is not None else SUBTITLE_STYLES[DEFAULT_STYLE]


def _normalize_text(text: object) -> str:
    """Collapse whitespace and drop speaker-change markers that auto-captions prepend."""
    cleaned = " ".join(str(text or "").split())
    while cleaned[:2] in (">>", "››") or cleaned[:1] in (">", "›"):
        cleaned = cleaned.lstrip(">›").lstrip()
    return cleaned


_PUNCTUATION = ",;:.!?…—–"
_CLOSERS = "\"'»”’)]}"


def _ends_with_punctuation(word: str) -> bool:
    bare = word.rstrip(_CLOSERS)
    return bool(bare) and bare[-1] in _PUNCTUATION


def _chunk_text(text: str) -> List[List[str]]:
    """Cut a segment into word groups of two to four words, preferring punctuation."""
    words = text.split()
    chunks: List[List[str]] = []
    index = 0
    while index < len(words):
        window = min(MAX_WORDS_PER_SCREEN, len(words) - index)
        take = window
        # Prefer the longest punctuation break inside the window, but never go
        # below two words (a lone word makes a screen that is read before it registers).
        for candidate in range(window, MIN_WORDS_PER_SCREEN - 1, -1):
            if _ends_with_punctuation(words[index + candidate - 1]):
                take = candidate
                break
        chunks.append(words[index:index + take])
        index += take
    _rebalance_chunks(chunks)
    return chunks


def _rebalance_chunks(chunks: List[List[str]]) -> None:
    """Remove one-word screens by borrowing a word from a neighbour or merging."""
    index = 0
    while index < len(chunks):
        chunk = chunks[index]
        guard = 0
        while len(chunk) < MIN_WORDS_PER_SCREEN and len(chunks) > 1 and guard < MAX_WORDS_PER_SCREEN:
            guard += 1
            previous = chunks[index - 1] if index > 0 else None
            following = chunks[index + 1] if index + 1 < len(chunks) else None
            if previous is not None and len(previous) > MIN_WORDS_PER_SCREEN:
                chunk.insert(0, previous.pop())
            elif following is not None and len(following) > MIN_WORDS_PER_SCREEN:
                chunk.append(following.pop(0))
            elif previous is not None and len(previous) + len(chunk) <= MAX_WORDS_PER_SCREEN:
                previous.extend(chunk)
                del chunks[index]
                index -= 1
                break
            elif following is not None and len(chunk) + len(following) <= MAX_WORDS_PER_SCREEN:
                chunk.extend(following)
                del chunks[index + 1]
            else:
                break
        index += 1


def _merge_short_chunks(chunks: List[List[str]], duration: float) -> List[List[str]]:
    """Merge a chunk shorter than 0.35 s into a neighbour that can hold its words."""
    merged = [list(chunk) for chunk in chunks]
    index = 0
    while index < len(merged) and len(merged) > 1:
        total_words = sum(len(chunk) for chunk in merged) or 1
        if duration * len(merged[index]) / total_words >= MIN_CHUNK_SECONDS_TO_MERGE:
            index += 1
            continue
        neighbours = []
        if index > 0:
            neighbours.append(index - 1)
        if index + 1 < len(merged):
            neighbours.append(index + 1)
        neighbours.sort(key=lambda j: len(merged[j]))
        target = next(
            (j for j in neighbours if len(merged[j]) + len(merged[index]) <= MAX_WORDS_PER_SCREEN),
            None,
        )
        if target is None:
            index += 1
            continue
        if target < index:
            merged[target].extend(merged[index])
            del merged[index]
            index = max(0, target)
        else:
            merged[target][:0] = merged[index]
            del merged[index]
    return merged


def _layout(text: str, size: int, preset: Dict) -> Tuple[ImageFont.ImageFont, int, int, int, int, int, int]:
    """Measure one line: font, stroke, plate pad, image width and height, bbox offsets."""
    font = _load_font(size)
    stroke = max(1, int(round(size * preset["stroke_scale"]))) if preset["stroke_scale"] > 0 else 0
    pad = max(0, int(round(size * preset["plate_padding"]))) if preset["plate"] else 0
    left, top, right, bottom = _MEASURE_PROBE.textbbox((0, 0), text, font=font, stroke_width=stroke)
    width = math.ceil(right - left) + 2 + 2 * pad
    height = math.ceil(bottom - top) + 2 + 2 * pad
    return font, stroke, pad, width, height, left, top


def _fit_font_size(text: str, base_size: int, max_width: int, preset: Dict) -> Optional[int]:
    """Largest size down to 85% that keeps the line inside max_width, else None."""
    width = _layout(text, base_size, preset)[3]
    if width <= max_width:
        return base_size
    floor_size = max(1, int(math.floor(base_size * MAX_FONT_SHRINK)))
    if width <= 0:
        return base_size
    scaled = int(math.floor(base_size * max_width / width))
    for size in range(max(floor_size, min(base_size, scaled)), floor_size - 1, -1):
        if _layout(text, size, preset)[3] <= max_width:
            return size
    return None


def _fit_chunks(
    chunks: List[List[str]], base_size: int, max_width: int, preset: Dict, uppercase: bool
) -> List[Dict]:
    """Fit every chunk on one line; split a chunk in two when even 85% is too wide."""
    screens: List[Dict] = []
    for chunk in chunks:
        text = " ".join(chunk)
        if uppercase:
            text = text.upper()
        size = _fit_font_size(text, base_size, max_width, preset)
        if size is not None:
            screens.append({"words": chunk, "text": text, "size": size})
            continue
        if len(chunk) > 1:
            middle = len(chunk) // 2
            screens.extend(_fit_chunks([chunk[:middle], chunk[middle:]], base_size, max_width, preset, uppercase))
            continue
        # A single word that still overflows at 85%: there is nothing left to split.
        screens.append({
            "words": chunk,
            "text": text,
            "size": max(1, int(math.floor(base_size * MAX_FONT_SHRINK))),
        })
    return screens


def _draw_line(text: str, size: int, preset: Dict) -> Image.Image:
    """Draw one fitted line (with its optional plate) on a transparent image."""
    font, stroke, pad, width, height, left, top = _layout(text, size, preset)
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    if preset["plate"]:
        radius = max(1, int(round(size * preset["plate_radius"])))
        radius = min(radius, max(1, min(width, height) // 2))
        draw.rounded_rectangle((0, 0, width - 1, height - 1), radius=radius, fill=preset["plate_fill"])
    position = (pad + 1 - left, pad + 1 - top)
    if preset.get("shadow"):
        offset = max(2, int(round(size * 0.06)))
        draw.text(
            (position[0] + offset, position[1] + offset),
            text,
            font=font,
            fill=(0, 0, 0, 170),
            stroke_width=offset,
            stroke_fill=(0, 0, 0, 120),
        )
    draw.text(
        position,
        text,
        font=font,
        fill=preset["fill"],
        stroke_width=stroke,
        stroke_fill=preset["stroke_fill"],
    )
    return image


def _draw_karaoke(text: str, size: int, preset: Dict, active: int) -> Image.Image:
    """Draw one line with the spoken word highlighted, the way karaoke captions read."""
    font, stroke, pad, width, height, left, top = _layout(text, size, preset)
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    if preset["plate"]:
        radius = max(1, int(round(size * preset["plate_radius"])))
        radius = min(radius, max(1, min(width, height) // 2))
        draw.rounded_rectangle((0, 0, width - 1, height - 1), radius=radius, fill=preset["plate_fill"])
    x = pad + 1 - left
    y = pad + 1 - top
    space = font.getlength(" ")
    highlight = preset.get("highlight_fill", (255, 226, 0))
    for index, word in enumerate(text.split(" ")):
        draw.text(
            (x, y),
            word,
            font=font,
            fill=highlight if index == active else preset["fill"],
            stroke_width=stroke,
            stroke_fill=preset["stroke_fill"],
        )
        x += font.getlength(word) + space
    return image


def _karaoke_windows(start: float, end: float, words: Sequence[str]) -> List[Tuple[float, float]]:
    """Split a screen into one window per word, weighted by word length."""
    if not words:
        return []
    weights = [max(1, len(word)) for word in words]
    weight_sum = sum(weights)
    duration = max(0.0, end - start)
    windows: List[Tuple[float, float]] = []
    cursor = start
    for index, weight in enumerate(weights):
        step = duration * weight / weight_sum
        window_end = end if index == len(weights) - 1 else min(end, cursor + step)
        windows.append((cursor, window_end))
        cursor = window_end
    return windows


def _allocate_windows(start: float, end: float, word_counts: Sequence[int]) -> List[Tuple[float, float]]:
    """Split a cue's time proportionally to word counts, within the cue and without overlaps."""
    count = len(word_counts)
    if count == 0:
        return []
    total = max(0.0, end - start)
    weights = [max(1, int(words)) for words in word_counts]
    weight_sum = sum(weights)
    if total <= 0.0 or weight_sum <= 0:
        return [(start, start) for _ in weights]
    raw = [total * weight / weight_sum for weight in weights]
    durations = [min(MAX_SCREEN_SECONDS, max(MIN_SCREEN_SECONDS, seconds)) for seconds in raw]
    target_total = sum(durations)
    minimum_total = count * MIN_SCREEN_SECONDS
    if target_total > total:
        if total >= minimum_total and target_total > minimum_total:
            # Shave only the time above the floor, so no screen drops below 0.6 s.
            surplus = (total - minimum_total) / (target_total - minimum_total)
            durations = [MIN_SCREEN_SECONDS + (seconds - MIN_SCREEN_SECONDS) * surplus for seconds in durations]
        else:
            # The segment is too short for even the floor: keep it proportional and
            # inside the cue rather than leaving text on screen past the speech.
            durations = raw
    windows: List[Tuple[float, float]] = []
    cursor = start
    for index, seconds in enumerate(durations):
        window_end = min(end, cursor + seconds)
        if index == count - 1:
            window_end = max(cursor, window_end)
        windows.append((cursor, window_end))
        cursor = window_end
    return windows


class RenderedScreen(tuple):
    """A screen as (start, end, path), carrying its overlay y offset and text.

    It unpacks and compares like the old three-item tuple, so callers keep working
    while a style can place the same PNGs at another height.
    """

    def __new__(cls, start: float, end: float, path: str, y: str, text: str = "") -> "RenderedScreen":
        screen = super().__new__(cls, (start, end, path))
        screen.y = y
        screen.text = text
        return screen


def render_cues(
    cues: List[Dict], frame_w: int, frame_h: int, out_dir: str, style: str = "classic"
) -> List[Tuple[float, float, str]]:
    """Render cues to PNG files and return (start, end, path) for each one-line screen."""
    preset = _resolve_style(style)
    base_size = max(12, int(min(frame_w, frame_h) * preset["font_scale"]))
    max_width = int(frame_w * TEXT_WIDTH_RATIO)
    overlay_y = f"H*{preset['anchor_y']:g}-h"
    rendered: List[Tuple[float, float, str]] = []
    for cue in cues:
        try:
            cue_start = float(cue["start"])
            cue_end = float(cue["end"])
        except (KeyError, TypeError, ValueError):
            continue
        text = _normalize_text(cue.get("text", ""))
        if not text or cue_end <= cue_start:
            continue
        word_times = cue.get("word_times") or []
        if preset.get("karaoke") and len(word_times) > 1 and " ".join(
            _normalize_text(item.get("text", "")) for item in word_times
        ) == text:
            # Real per-word timings: the highlight moves exactly when the word is spoken.
            size = _fit_font_size(text, base_size, max_width, preset)
            if size is not None:
                for index, item in enumerate(word_times):
                    word_start = max(cue_start, float(item["start"]))
                    word_end = min(cue_end, float(item["end"]))
                    if word_end - word_start < 0.05:
                        word_end = min(cue_end, word_start + 0.12)
                    if word_end <= word_start:
                        continue
                    path = os.path.join(out_dir, f"cue_{len(rendered):04d}.png")
                    _draw_karaoke(text, size, preset, index).save(path)
                    rendered.append(RenderedScreen(word_start, word_end, path, overlay_y, text))
                continue
        chunks = _chunk_text(text)
        chunks = _merge_short_chunks(chunks, cue_end - cue_start)
        screens = _fit_chunks(chunks, base_size, max_width, preset, bool(preset["uppercase"]))
        windows = _allocate_windows(cue_start, cue_end, [len(screen["words"]) for screen in screens])
        for screen, (start, end) in zip(screens, windows):
            if preset.get("karaoke") and len(screen["words"]) > 1:
                for word_index, (word_start, word_end) in enumerate(
                    _karaoke_windows(start, end, screen["words"])
                ):
                    path = os.path.join(out_dir, f"cue_{len(rendered):04d}.png")
                    _draw_karaoke(screen["text"], screen["size"], preset, word_index).save(path)
                    rendered.append(RenderedScreen(word_start, word_end, path, overlay_y, screen["text"]))
                continue
            path = os.path.join(out_dir, f"cue_{len(rendered):04d}.png")
            _draw_line(screen["text"], screen["size"], preset).save(path)
            rendered.append(RenderedScreen(start, end, path, overlay_y, screen["text"]))
    return rendered


def _wrap(text: str, font: ImageFont.ImageFont, max_width: int) -> List[str]:
    lines: List[str] = []
    current = ""
    for word in text.split():
        candidate = f"{current} {word}".strip()
        if current and font.getlength(candidate) > max_width:
            lines.append(current)
            current = word
        else:
            current = candidate
    return lines + [current] if current else lines


def split_cue(cue: Dict, lines: List[str]) -> List[Tuple[float, float, List[str]]]:
    """Split a long cue into two-line screens, timed in proportion to their length."""
    screens = [lines[i:i + MAX_LINES_PER_CUE] for i in range(0, len(lines), MAX_LINES_PER_CUE)]
    total_chars = sum(len(line) for line in lines) or 1
    duration = cue["end"] - cue["start"]
    result = []
    start = cue["start"]
    for screen in screens:
        end = start + duration * sum(len(line) for line in screen) / total_chars
        result.append((start, end, screen))
        start = end
    return result


def _draw_screen(lines: List[str], font: ImageFont.ImageFont, stroke: int) -> Image.Image:
    text = "\n".join(lines)
    probe = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    left, top, right, bottom = probe.multiline_textbbox((0, 0), text, font=font, align="center", stroke_width=stroke)
    image = Image.new("RGBA", (math.ceil(right - left) + 2, math.ceil(bottom - top) + 2), (0, 0, 0, 0))
    ImageDraw.Draw(image).multiline_text(
        (1 - left, 1 - top), text, font=font, fill="white", align="center",
        stroke_width=stroke, stroke_fill="black",
    )
    return image


def _overlay_y(screen: Tuple) -> str:
    """Read the y expression off a rendered screen, defaulting to the classic height."""
    value = getattr(screen, "y", None)
    return value if isinstance(value, str) and value else DEFAULT_OVERLAY_Y


def overlay_args(rendered: List[Tuple[float, float, str]], base_filter: str) -> List[str]:
    """Build the FFmpeg inputs and filter graph, with the video source already as input 0."""
    inputs: List[str] = []
    graph = [f"[0:v]{base_filter or 'null'}[v0]"]
    for i, screen in enumerate(rendered, 1):
        start, end, path = screen
        inputs += ["-i", path]
        graph.append(
            f"[v{i - 1}][{i}:v]overlay=x=(W-w)/2:y={_overlay_y(screen)}:"
            f"enable='between(t,{start:.3f},{end:.3f})'[v{i}]"
        )
    return [*inputs, "-filter_complex", ";".join(graph), "-map", f"[v{len(rendered)}]", "-map", "0:a?"]


def overlay_args_script(rendered: List[Tuple[float, float, str]], base_filter: str, script_path: str) -> List[str]:
    """Like overlay_args, but write the filtergraph to a file ffmpeg reads itself."""
    args = overlay_args(rendered, base_filter)
    graph_index = args.index("-filter_complex")
    with open(script_path, "w", encoding="utf-8") as f:
        f.write(args[graph_index + 1])
    return [*args[:graph_index], "-filter_complex_script", script_path, *args[graph_index + 2:]]
