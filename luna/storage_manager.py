# Copyright (C) 2026 Miqdad
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# This file is part of Luna. See LICENSE and NOTICE at the repository root.

import datetime
import json
import os
import re
import sys
import tempfile
import unicodedata
from typing import Dict, Optional, Union

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# The packaged build keeps media in the user's app data: the install folder may be read-only.
_DATA_DIR = (
    os.environ.get("LUNA_DATA_DIR")
    or os.path.join(os.environ.get("LOCALAPPDATA") or os.path.expanduser("~"), "Luna")
    if getattr(sys, "frozen", False)
    else BASE_DIR
)
DEFAULT_D_PATH = r"D:\Luna-Media" if os.name == "nt" else os.path.join(_DATA_DIR, "output")
FALLBACK_PATH = os.path.join(_DATA_DIR, "output")

# Resolving the root probes the disk, so cache it per (target, default, fallback).
# Settings changes and storage migrations call invalidate_storage_root_cache().
_ROOT_CACHE: Dict[tuple, str] = {}

# Windows refuses these names (with or without an extension) in any directory.
_RESERVED_NAMES = {
    "CON", "PRN", "AUX", "NUL",
    *(f"COM{i}" for i in range(1, 10)),
    *(f"LPT{i}" for i in range(1, 10)),
}

CATEGORY_MAP = {
    "youtube_ai_clip": "01-AI-Clips",
    "youtube_video": "02-YouTube-Full",
    "instagram_video": "03-Instagram-Reels",
    "tiktok_video": "04-TikTok-Clean",
    "youtube_audio": "05-Audio-MP3",
}

ACTION_CATEGORY_MAP = {
    "type_yt_ai_clip": "01-AI-Clips",
    "ai_clip": "01-AI-Clips",
    "youtube_ai_clip": "01-AI-Clips",
    "type_yt_video": "02-YouTube-Full",
    "type_yt_short": "02-YouTube-Full",
    "type_yt_clip": "02-YouTube-Full",
    "clip": "02-YouTube-Full",
    "manual_clip": "02-YouTube-Full",
    "youtube_video": "02-YouTube-Full",
    "type_ig_reels": "03-Instagram-Reels",
    "ig_reels": "03-Instagram-Reels",
    "instagram_video": "03-Instagram-Reels",
    "type_tt_video": "04-TikTok-Clean",
    "tt_video": "04-TikTok-Clean",
    "tiktok_video": "04-TikTok-Clean",
    "type_yt_mp3": "05-Audio-MP3",
    "type_tt_mp3": "05-Audio-MP3",
    "mp3": "05-Audio-MP3",
    "audio_mp3": "05-Audio-MP3",
    "youtube_audio": "05-Audio-MP3",
}

WORKSPACE_SUBDIRS = frozenset({*CATEGORY_MAP.values(), "01-AI-Clipper"})


def is_temp_job_directory(src_root: str, dirpath: str, filenames) -> bool:
    """Return True for internal temporary job folders so Workspace stats/migrations ignore them."""
    names = set(filenames or ())
    if "job.json" in names or "job.json.tmp" in names:
        return True
    abs_root = os.path.abspath(src_root)
    abs_fallback = os.path.abspath(FALLBACK_PATH)
    abs_dir = os.path.abspath(dirpath)
    if abs_root == abs_fallback and abs_dir != abs_fallback:
        rel = os.path.relpath(abs_dir, abs_fallback)
        top = rel.split(os.sep)[0]
        if top not in WORKSPACE_SUBDIRS and "meta.json" not in names:
            return True
    return False


def is_writable(path: str) -> bool:
    """Check if a directory path can be created and written to."""
    try:
        os.makedirs(path, exist_ok=True)
        # mkstemp gives every caller (threads included) its own file name; the old
        # pid-based name let two threads delete each other's probe and report False.
        fd, test_file = tempfile.mkstemp(prefix=".write_test_", dir=path)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                f.write("test")
        finally:
            try:
                os.remove(test_file)
            except OSError:
                pass
        return True
    except Exception:
        return False


def invalidate_storage_root_cache() -> None:
    """Forget the resolved root, e.g. after Settings changes MEDIA_STORAGE_DIR."""
    _ROOT_CACHE.clear()


def get_storage_root() -> str:
    """Return writable path: tries D:\\Luna-Media (or MEDIA_STORAGE_DIR), falls back to output/."""
    target_path = os.getenv("MEDIA_STORAGE_DIR") or DEFAULT_D_PATH
    key = (
        os.path.abspath(target_path),
        os.path.abspath(DEFAULT_D_PATH),
        os.path.abspath(FALLBACK_PATH),
    )
    cached = _ROOT_CACHE.get(key)
    if cached and os.path.isdir(cached):
        return cached

    resolved = os.path.abspath(target_path) if is_writable(target_path) else os.path.abspath(FALLBACK_PATH)
    if resolved == os.path.abspath(FALLBACK_PATH):
        os.makedirs(FALLBACK_PATH, exist_ok=True)
    _ROOT_CACHE[key] = resolved
    return resolved


def get_category_folder(action: str) -> str:
    """Create and return category directory based on action."""
    root = get_storage_root()
    folder_name = CATEGORY_MAP.get(action) or ACTION_CATEGORY_MAP.get(action)
    if not folder_name:
        if action in CATEGORY_MAP.values():
            folder_name = action
        else:
            folder_name = sanitize_name(action) or "00-Misc"

    folder_path = os.path.join(root, folder_name)
    os.makedirs(folder_path, exist_ok=True)
    return folder_path


def get_workspace_folder(action: str, workspace_name: str) -> str:
    """Create and return category directory with subfolder for the workspace."""
    cat_folder = get_category_folder(action)
    ws_clean = sanitize_name(workspace_name) or "Workspace 01"
    ws_dir = os.path.join(cat_folder, ws_clean)
    os.makedirs(ws_dir, exist_ok=True)
    return ws_dir


def sanitize_name(name: str, max_length: int = 80) -> str:
    """Make a name safe for Windows/Linux folders and files.

    Strips separators and reserved characters, removes control characters, normalises
    unicode, refuses "." and "..", escapes Windows device names and drops trailing
    dots/spaces. Returns "" for names that carry no usable characters.
    """
    if not name:
        return ""
    cleaned = unicodedata.normalize("NFC", str(name))
    cleaned = re.sub(r'[\x00-\x1f\x7f\\/*?:"<>|#]', "", cleaned)
    cleaned = " ".join(cleaned.split()).strip()
    if max_length and len(cleaned) > max_length:
        cleaned = cleaned[:max_length]
    cleaned = cleaned.rstrip(" .")
    if cleaned in ("", ".", ".."):
        return ""
    if cleaned.split(".")[0].upper() in _RESERVED_NAMES:
        cleaned = f"_{cleaned}"
    return cleaned


def category_root_paths() -> Dict[str, str]:
    """Return {category_name: path} without creating anything on disk."""
    root = get_storage_root()
    return {name: os.path.join(root, name) for name in CATEGORY_MAP.values()}


def format_media_filename(
    title: str,
    ext: str,
    prefix: str = "",
    date: Optional[Union[datetime.date, str]] = None,
) -> str:
    """Return YYYY-MM-DD_[prefix_]clean_title.ext."""
    if date is None:
        date_str = datetime.date.today().strftime("%Y-%m-%d")
    elif isinstance(date, (datetime.date, datetime.datetime)):
        date_str = date.strftime("%Y-%m-%d")
    else:
        date_str = str(date).strip()

    clean_title = sanitize_name(title) or "media"
    clean_ext = ext.lstrip(".")

    # The prefix comes from the request (e.g. the chosen quality), so sanitize it too.
    prefix_clean = sanitize_name(prefix.strip("_"), max_length=24) if prefix else ""
    prefix_part = f"{prefix_clean}_" if prefix_clean else ""

    return f"{date_str}_{prefix_part}{clean_title}.{clean_ext}"


def format_clip_folder(
    title: str,
    date: Optional[Union[datetime.date, str]] = None,
) -> str:
    """Return YYYY-MM-DD_clean_title."""
    if date is None:
        date_str = datetime.date.today().strftime("%Y-%m-%d")
    elif isinstance(date, (datetime.date, datetime.datetime)):
        date_str = date.strftime("%Y-%m-%d")
    else:
        date_str = str(date).strip()

    clean_title = sanitize_name(title) or "media"
    return f"{date_str}_{clean_title}"


def _is_within(child: str, parent: str) -> bool:
    """True when child is parent or lives under it (compare real paths)."""
    try:
        child_real = os.path.realpath(os.path.abspath(child))
        parent_real = os.path.realpath(os.path.abspath(parent))
        return os.path.commonpath([parent_real, child_real]) == parent_real
    except ValueError:
        return False


_META_PATH_KEYS = ("file_path", "folder_path", "cover_path", "thumbnail_path")


def _rewrite_migrated_meta(meta_path: str, src_roots: list[str], new_root: str) -> None:
    """Rewrite stored filesystem paths inside migrated meta.json to point under new_root."""
    try:
        with open(meta_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return

    changed = False

    def _remap(path_val: str) -> str:
        for base in src_roots:
            if _is_within(path_val, base):
                rel = os.path.relpath(os.path.abspath(path_val), os.path.abspath(base))
                return new_root if rel == "." else os.path.join(new_root, rel)
        return path_val

    def _visit(node) -> None:
        nonlocal changed
        if isinstance(node, list):
            for item in node:
                _visit(item)
            return
        if not isinstance(node, dict):
            return
        for key in _META_PATH_KEYS:
            val = node.get(key)
            if isinstance(val, str) and val:
                updated = _remap(val)
                if updated != val:
                    node[key] = updated
                    changed = True
        files = node.get("files")
        if isinstance(files, list):
            _visit(files)

    _visit(data)
    if not changed:
        return

    tmp_path = f"{meta_path}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp_path, meta_path)


def migrate_storage(old_root: str, new_root: str) -> dict:
    """Migrate media directories and metadata from old_root (and fallback output/) to new_root."""
    import shutil

    old_root = os.path.abspath(old_root)
    new_root = os.path.abspath(new_root)

    if not is_writable(new_root):
        raise ValueError(f"Destination directory '{new_root}' is not writable.")

    # Moving a vault into its own subfolder (or the reverse) scatters it across two roots.
    if _is_within(new_root, old_root) or _is_within(old_root, new_root):
        raise ValueError("The new storage folder cannot be inside the current one, or the other way around.")

    sources_to_migrate = []
    if old_root != new_root and os.path.exists(old_root):
        sources_to_migrate.append(old_root)
    fallback = os.path.abspath(FALLBACK_PATH)
    if os.path.exists(fallback) and fallback != new_root and fallback not in sources_to_migrate:
        sources_to_migrate.append(fallback)

    if not sources_to_migrate:
        return {"migrated_files": 0, "status": "same_directory"}

    migrated_count = 0
    failed: list[str] = []

    def _move_file(src_file: str, dst_file: str) -> None:
        """Copy, verify, then delete the source. No source is ever deleted unverified."""
        shutil.copy2(src_file, dst_file)
        if not os.path.exists(dst_file) or os.path.getsize(dst_file) != os.path.getsize(src_file):
            raise OSError(f"verification failed after copying {src_file}")
        os.remove(src_file)

    for src_dir in sources_to_migrate:
        if not os.path.exists(src_dir) or src_dir == new_root:
            continue
        is_fallback_src = os.path.abspath(src_dir) == fallback
        for root_dir, dirs, files in os.walk(src_dir, topdown=True):
            if is_temp_job_directory(src_dir, root_dir, files):
                dirs[:] = []
                continue
            rel = os.path.relpath(root_dir, src_dir)
            if rel == "." and is_fallback_src:
                # Only move recognized Workspace subfolders or folders with meta.json from shared output/.
                dirs[:] = [
                    d for d in dirs
                    if d in WORKSPACE_SUBDIRS
                    or (
                        os.path.isfile(os.path.join(root_dir, d, "meta.json"))
                        and not os.path.exists(os.path.join(root_dir, d, "job.json"))
                    )
                ]
                continue
            dirs[:] = [
                d for d in dirs
                if not os.path.exists(os.path.join(root_dir, d, "job.json"))
                and not os.path.exists(os.path.join(root_dir, d, "job.json.tmp"))
            ]
            target_dir = new_root if rel == "." else os.path.join(new_root, rel)
            os.makedirs(target_dir, exist_ok=True)
            for f in files:
                if f.endswith((".part", ".ytdl", ".tmp")):
                    continue
                s_f = os.path.join(root_dir, f)
                d_f = os.path.join(target_dir, f)
                if not os.path.isfile(s_f):
                    continue
                try:
                    if os.path.exists(d_f):
                        if os.path.getsize(d_f) == os.path.getsize(s_f):
                            os.remove(s_f)
                            if f == "meta.json":
                                _rewrite_migrated_meta(d_f, sources_to_migrate, new_root)
                        else:
                            # Keep the source so a name collision cannot destroy media.
                            failed.append(f"{s_f} (destination already exists)")
                        continue
                    _move_file(s_f, d_f)
                    if f == "meta.json":
                        _rewrite_migrated_meta(d_f, sources_to_migrate, new_root)
                    migrated_count += 1
                except Exception as e:
                    failed.append(f"{s_f}: {e}")

        # Prune the source tree only where it is now empty.
        for root_dir, _dirs, _files in os.walk(src_dir, topdown=False):
            try:
                if not os.listdir(root_dir):
                    os.rmdir(root_dir)
            except OSError:
                pass

    status = "success" if not failed else "partial"
    return {"migrated_files": migrated_count, "failed": failed[:20], "status": status}
