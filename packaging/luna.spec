# PyInstaller spec for the Luna desktop build.
# Build: .venv\Scripts\pyinstaller.exe packaging\luna.spec --noconfirm
import os
import sys

from PyInstaller.utils.hooks import collect_all, copy_metadata

ROOT = os.path.abspath(os.path.join(SPECPATH, ".."))
sys.path.insert(0, ROOT)

datas = [
    (os.path.join(ROOT, "luna", "templates"), os.path.join("luna", "templates")),
    (os.path.join(ROOT, "luna", "assets"), os.path.join("luna", "assets")),
]
binaries = []
# ffmpeg, ffprobe and deno ship inside the build so a fresh machine needs no extra install.
for tool in ("ffmpeg.exe", "ffprobe.exe", "deno.exe"):
    tool_path = os.path.join(ROOT, "packaging", "vendor", tool)
    if os.path.exists(tool_path):
        binaries.append((tool_path, "."))
hiddenimports = [
    "uvicorn.logging",
    "uvicorn.loops.auto",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan.on",
]

# Wheels that ship binaries, data files or lazy submodules need an explicit sweep.
for package in (
    "yt_dlp",
    "youtube_transcript_api",
    "static_ffmpeg",
    "deno",
    "curl_cffi",
    "certifi",
    "google",
    "google.genai",
    "openai",
    "fastapi",
    "uvicorn",
    "websockets",
    "PIL",
    "cv2",
    "nh3",
):
    try:
        package_datas, package_binaries, package_hidden = collect_all(package)
    except Exception as exc:  # an optional dependency missing from the build must not stop it
        print(f"[spec] skipped {package}: {exc}")
        continue
    datas += package_datas
    binaries += package_binaries
    hiddenimports += package_hidden

for distribution in ("fastapi", "pydantic", "openai", "google-genai", "yt-dlp", "uvicorn", "certifi"):
    try:
        datas += copy_metadata(distribution)
    except Exception as exc:
        print(f"[spec] no metadata for {distribution}: {exc}")

excludes = [
    "tkinter",
    "matplotlib",
    "IPython",
    "pytest",
    "mcp",
    "httpx",
    "torch",
    "tensorflow",
]

block_cipher = None

a = Analysis(
    [os.path.join(ROOT, "packaging", "entry.py")],
    pathex=[ROOT],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=excludes,
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="Luna",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    icon=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="Luna",
)
