"""Entry point for the packaged desktop build."""

import multiprocessing
import sys


def main() -> int:
    # Keep the same behaviour as `python -m luna.start`.
    from luna.start import main as start_main

    return start_main()


if __name__ == "__main__":
    multiprocessing.freeze_support()
    sys.exit(main())
