# SPDX-License-Identifier: MIT
# This file is part of Luna's clip pipeline. See luna/clipper/LICENSE and
# THIRD_PARTY_NOTICES.md for the upstream notice.

import os
from typing import Optional

from dotenv import load_dotenv

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv(os.path.join(ROOT_DIR, ".env"))

DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1"
DEFAULT_OPENAI_MODEL = "gpt-4o-mini"
DEFAULT_GEMINI_MODEL = "gemini-3.8-flash"
DEFAULT_CLIP_LANGUAGE = "en"
SUPPORTED_CLIP_LANGUAGES = ("en", "ru")
DEFAULT_STUDIO_BACKGROUND = "obsidian"
SUPPORTED_STUDIO_BACKGROUNDS = (
    "obsidian",
    "lunar-waves",
    "crimson-horizon",
    "emerald-horizon",
    "dark-horizon",
    "crimson-abyss",
    "emerald-abyss",
    "violet-abyss",
    "ocean-glow",
    "copper-forge",
    "stellar-mist",
    "cosmic-nebula",
    "prismatic-aurora",
)


def normalize_clip_language(value: Optional[str]) -> Optional[str]:
    """Return canonical 'en'/'ru' for valid clip language aliases, or None otherwise."""
    raw = str(value or "").strip().lower()
    if raw in ("en", "english", "inggris"):
        return "en"
    if raw in ("ru", "russian", "русский", "русский язык"):
        return "ru"
    return None


def clip_language() -> str:
    """Preferred language ('en' or 'ru') for AI-generated clip titles and captions."""
    return normalize_clip_language(os.getenv("CLIP_OUTPUT_LANGUAGE", "")) or DEFAULT_CLIP_LANGUAGE


def normalize_studio_background(value: Optional[str]) -> Optional[str]:
    """Return canonical studio background preset id, or None when unsupported."""
    raw = str(value or "").strip().lower()
    if raw in ("default", "minimal", "workspace", "none"):
        return DEFAULT_STUDIO_BACKGROUND
    if raw in SUPPORTED_STUDIO_BACKGROUNDS:
        return raw
    return None


def studio_background() -> str:
    """Active Studio background preset id (defaults to lightweight 'obsidian')."""
    return normalize_studio_background(os.getenv("STUDIO_BACKGROUND", "")) or DEFAULT_STUDIO_BACKGROUND


# Settings rewrites .env while the app is running, so these read os.getenv on
# every call instead of freezing the values at import time.
def gemini_model() -> str:
    return os.getenv("GEMINI_MODEL", "").strip() or DEFAULT_GEMINI_MODEL


# Kept as groq_base_url()'s fallback: existing callers and tests still patch
# this module-level name.
GROQ_BASE_URL = os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1").rstrip("/")


def groq_base_url() -> str:
    return (os.getenv("GROQ_BASE_URL", "").strip() or GROQ_BASE_URL).rstrip("/")


def groq_whisper_model() -> str:
    return os.getenv("GROQ_WHISPER_MODEL", "").strip() or "whisper-large-v3-turbo"


def local_whisper_model() -> str:
    return os.getenv("LOCAL_WHISPER_MODEL", "").strip() or "base"


def local_whisper_device() -> str:
    return os.getenv("LOCAL_WHISPER_DEVICE", "").strip() or "auto"  # auto / cpu / cuda


def local_output_dir() -> str:
    raw = os.getenv("LOCAL_OUTPUT_DIR", "output").strip()
    if "=" in raw or not raw:
        raw = "output"
    return raw


# VAD (Voice Activity Detection) settings for faster-whisper.
# Disabled by default because VAD is too aggressive on mixed speech/music content.
def local_whisper_vad_filter() -> bool:
    return os.getenv("LOCAL_WHISPER_VAD_FILTER", "false").strip().lower() == "true"


# Match faster-whisper defaults when VAD is enabled
DEFAULT_WHISPER_VAD_PARAMETERS = {
    "threshold": 0.5,
    "min_speech_duration_ms": 250,
    "max_speech_duration_s": float("inf"),
    "min_silence_duration_ms": 2000,
    "speech_pad_ms": 400,
}


def local_whisper_vad_parameters() -> dict:
    raw = os.getenv("LOCAL_WHISPER_VAD_PARAMETERS", "").strip()
    if not raw:
        return dict(DEFAULT_WHISPER_VAD_PARAMETERS)
    import json
    return json.loads(raw)

TRANSCRIBE_PROVIDER_LABELS = {
    "groq": "Groq Cloud Whisper",
    "gemini": "Gemini AI",
    "whisper": "Faster-Whisper Local",
}


def transcribe_provider() -> str:
    """"groq" uses hosted Whisper, "gemini" the Gemini audio API, "whisper" faster-whisper on this machine."""
    return os.getenv("LOCAL_TRANSCRIBE_PROVIDER", "").strip().lower() or "groq"


def transcribe_provider_label() -> str:
    provider = transcribe_provider()
    return TRANSCRIBE_PROVIDER_LABELS.get(provider, provider)


# These read the environment on each call so a Settings save applies to the next job.
# `or` also covers the blank values .env files carry: the SDK would use "" as a literal base URL.
def llm_provider() -> str:
    """LLM_PROVIDER wins. Left blank, default to Gemini for fresh/Gemini-only setups, or OpenAI if OPENAI_API_KEY is set."""
    configured = os.getenv("LLM_PROVIDER", "").strip().lower()
    if configured:
        return configured
    if os.getenv("OPENAI_API_KEY", "").strip():
        return "openai"
    return "gemini"


def openai_base_url() -> str:
    return (os.getenv("OPENAI_BASE_URL", "").strip() or DEFAULT_OPENAI_BASE_URL).rstrip("/")


def openai_model() -> str:
    return os.getenv("OPENAI_MODEL", "").strip() or DEFAULT_OPENAI_MODEL


def require_openai_key() -> str:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError(
            "OPENAI_API_KEY is not set. Add a key for your OpenAI-compatible provider in Settings or .env."
        )
    return api_key


def require_gemini_key() -> str:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not set. Add it in Settings or .env, or choose another provider.")
    return api_key


def require_groq_key() -> str:
    api_key = os.getenv("GROQ_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError(
            "GROQ_API_KEY is not set. Add it in Settings or .env, or set LOCAL_TRANSCRIBE_PROVIDER=whisper."
        )
    return api_key
