# Copyright (C) 2026 Miqdad
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# This file is part of Luna. See LICENSE and NOTICE at the repository root.

"""Entry point for start.sh and start.bat (python -m luna.start).

Finds a port before starting the server, so a busy port 8000 never sends the
browser to some other application:

- Luna already answers on the port: open the browser there and exit, so a second
  launch does not start a second server on the same job store.
- The port is taken by something else: use the next free one, unless LUNA_PORT was
  set, in which case the user asked for that port and gets a clear error.
"""
import os
import socket
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser

from .updater import RESTART_EXIT_CODE

HOST = "127.0.0.1"
DEFAULT_PORT = 8000
PORTS_TO_TRY = 20


def port_in_use(port: int) -> bool:
    # Connect catches a listener on 0.0.0.0 that Windows would still let us bind next to.
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.settimeout(0.5)
        if probe.connect_ex((HOST, port)) == 0:
            return True
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        try:
            probe.bind((HOST, port))
        except OSError:
            return True
    return False


def luna_answers(port: int) -> bool:
    try:
        with urllib.request.urlopen(f"http://{HOST}:{port}/", timeout=2) as response:
            return b"<title>Luna" in response.read(4096)
    except (OSError, ValueError):
        return False


def choose_port(requested: int, fixed: bool) -> tuple[int, bool]:
    """Return (port, already_running). Raises SystemExit with a message when stuck."""
    if not port_in_use(requested):
        return requested, False
    if luna_answers(requested):
        return requested, True
    if fixed:
        raise SystemExit(
            f"Port {requested} is used by another application. "
            f"Close it, or set LUNA_PORT to a different port."
        )
    for port in range(requested + 1, requested + PORTS_TO_TRY):
        if not port_in_use(port):
            return port, False
        if luna_answers(port):
            return port, True
    raise SystemExit(f"No free port between {requested} and {requested + PORTS_TO_TRY - 1}. Set LUNA_PORT.")


def open_browser_when_ready(url: str) -> None:
    for _ in range(120):
        try:
            urllib.request.urlopen(url, timeout=2).close()
            break
        except OSError:
            time.sleep(0.5)
    webbrowser.open(url)


def _wait_for_port_release(port: int, timeout_sec: float = 8.0) -> None:
    deadline = time.monotonic() + timeout_sec
    while time.monotonic() < deadline:
        if not port_in_use(port):
            return
        time.sleep(0.2)


def run_supervised_server(port: int, url: str, *, no_browser: bool = False) -> int:
    """Run uvicorn as a child in the same terminal and restart in-place on RESTART_EXIT_CODE."""
    if not no_browser:
        threading.Thread(target=open_browser_when_ready, args=(url,), daemon=True).start()

    if getattr(sys, "frozen", False):
        # A packaged build has no interpreter to spawn `python -m uvicorn`, so the server
        # runs in this process. Updates replace the whole installed build, not the module.
        import uvicorn

        from .app import app as fastapi_app

        uvicorn.run(fastapi_app, host=HOST, port=port, log_level="info")
        return 0

    while True:
        child_env = dict(os.environ)
        child_env["LUNA_PORT"] = str(port)
        child_env["LUNA_SUPERVISED"] = "1"
        child_env["LUNA_NO_BROWSER"] = "1"

        proc = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "luna.app:app", "--host", HOST, "--port", str(port)],
            env=child_env,
        )
        try:
            rc = proc.wait()
        except KeyboardInterrupt:
            try:
                proc.terminate()
                proc.wait(timeout=5)
            except Exception:
                proc.kill()
            return 0

        if rc == RESTART_EXIT_CODE:
            print(f"[Luna] Update applied — restarting server on {url}...", flush=True)
            _wait_for_port_release(port)
            continue

        return rc


def wants_desktop_window() -> bool:
    """Desktop window mode: the packaged build by default, or LUNA_DESKTOP=1 from source."""
    value = os.getenv("LUNA_DESKTOP", "").strip().lower()
    if value in ("0", "false", "no"):
        return False
    if value in ("1", "true", "yes"):
        return True
    return getattr(sys, "frozen", False)


def main() -> int:
    raw = os.getenv("LUNA_PORT", "").strip()
    try:
        requested = int(raw) if raw else DEFAULT_PORT
    except ValueError:
        raise SystemExit(f"LUNA_PORT must be a number, got {raw!r}.")
    desktop = wants_desktop_window()
    port, running = choose_port(requested, fixed=bool(raw))
    url = f"http://localhost:{port}"
    no_browser = os.getenv("LUNA_NO_BROWSER", "").strip() == "1" or desktop
    if running:
        message = f"Luna is already running at {url}"
        print(message)
        if desktop:
            from .desktop import show_error

            show_error(f"Luna уже запущена: {url}")
        elif not no_browser:
            webbrowser.open(url)
        return 0
    if port != requested:
        print(f"Port {requested} is busy, using {port} instead.")
    os.environ["LUNA_PORT"] = str(port)  # the startup banner reads it
    if desktop:
        from .desktop import describe_error, run_desktop, show_error

        try:
            return run_desktop(port)
        except Exception as exc:
            print(f"[Luna] Desktop window failed: {exc}", flush=True)
            show_error(f"Не удалось открыть окно Luna.\n\n{describe_error(exc)}")
            return 1
    print(f"Opening {url}. Add your API keys in Settings. Press Ctrl+C to stop.")
    return run_supervised_server(port, url, no_browser=no_browser)


if __name__ == "__main__":
    sys.exit(main())
