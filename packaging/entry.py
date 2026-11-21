"""Entry point for the packaged desktop build."""

import logging
import multiprocessing
import os
import sys
import traceback


def _data_dir() -> str:
    path = os.environ.get("LUNA_DATA_DIR") or os.path.join(
        os.environ.get("LOCALAPPDATA") or os.path.expanduser("~"), "Luna"
    )
    os.makedirs(path, exist_ok=True)
    return path


def _redirect_output_to_log() -> str:
    """A windowed build has no console, so stdout, stderr and tracebacks go to a log file."""
    log_path = os.path.join(_data_dir(), "luna.log")
    if sys.stdout is not None and sys.stderr is not None:
        return log_path
    try:
        stream = open(log_path, "a", encoding="utf-8", buffering=1)
    except OSError:
        return log_path
    if sys.stdout is None:
        sys.stdout = stream
    if sys.stderr is None:
        sys.stderr = stream
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        handlers=[logging.StreamHandler(stream)],
        force=True,
    )
    return log_path


def main() -> int:
    # Same behaviour as `python -m luna.start`.
    from luna.start import main as start_main

    return start_main()


if __name__ == "__main__":
    log_file = _redirect_output_to_log()
    multiprocessing.freeze_support()
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except BaseException:
        with open(log_file, "a", encoding="utf-8") as handle:
            handle.write("\n=== crash ===\n")
            handle.write(traceback.format_exc())
        raise
