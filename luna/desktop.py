# SPDX-License-Identifier: AGPL-3.0-or-later
"""Native desktop window for the local Luna server.

The server stays a local FastAPI app, but the user gets an application window with
the Luna icon instead of a browser tab pointing at localhost. On Windows the window
is Microsoft Edge WebView2, so no browser install is required.
"""
import threading
import time
import urllib.request
from typing import Optional

HOST = "127.0.0.1"
WINDOW_TITLE = "Luna"


def _wait_until_ready(port: int, timeout: float = 40.0) -> bool:
    deadline = time.monotonic() + timeout
    url = f"http://{HOST}:{port}/"
    while time.monotonic() < deadline:
        try:
            urllib.request.urlopen(url, timeout=1).close()
            return True
        except OSError:
            time.sleep(0.15)
    return False


def _window_size() -> tuple:
    """Fit the window to the screen: a fixed 1500x950 is bigger than a laptop display."""
    try:
        import ctypes

        user32 = ctypes.windll.user32
        screen_w = int(user32.GetSystemMetrics(0))
        screen_h = int(user32.GetSystemMetrics(1))
    except Exception:
        screen_w, screen_h = 1366, 768
    width = min(1360, max(1024, int(screen_w * 0.86)))
    height = min(880, max(700, int(screen_h * 0.86)))
    return width, height


def run_desktop(port: int, title: str = WINDOW_TITLE) -> int:
    """Serve the API on 127.0.0.1 and show it inside a native window until the user closes it."""
    import uvicorn
    import webview

    from .app import app as fastapi_app

    config = uvicorn.Config(fastapi_app, host=HOST, port=port, log_config=None, access_log=False)
    server = uvicorn.Server(config)
    server.install_signal_handlers = lambda: None  # signals belong to the window loop
    thread = threading.Thread(target=server.run, name="luna-server", daemon=True)
    thread.start()

    if not _wait_until_ready(port):
        raise RuntimeError(f"The local server did not start on port {port}.")

    width, height = _window_size()
    webview.create_window(
        title,
        f"http://{HOST}:{port}",
        width=width,
        height=height,
        min_size=(1024, 700),
        background_color="#0b0b0b",
    )
    webview.start()
    server.should_exit = True
    thread.join(timeout=5.0)
    return 0


def show_error(message: str) -> None:
    """Show a blocking message box, since a windowed build has nowhere to print."""
    try:
        import ctypes

        ctypes.windll.user32.MessageBoxW(None, message, WINDOW_TITLE, 0x10)
    except Exception:
        pass


def describe_error(exc: BaseException) -> str:
    return f"{type(exc).__name__}: {exc}"


def optional_port(value: Optional[str], default: int) -> int:
    try:
        return int(value) if value else default
    except ValueError:
        return default
