#!/usr/bin/env python3
"""Legacy build entrypoint.

Historically this repo used `build_mission_site.py` for local builds.
The newer build pipeline now lives in `build_solo_leveling_site.py`.
This file keeps the old command working by delegating to the new script.
"""

from __future__ import annotations

from pathlib import Path
import runpy
import sys


def main():
    script = Path(__file__).with_name("build_solo_leveling_site.py")
    sys.path.insert(0, str(script.parent))
    result = runpy.run_path(str(script), run_name="__main__")
    if not result:
        return


if __name__ == "__main__":
    main()
