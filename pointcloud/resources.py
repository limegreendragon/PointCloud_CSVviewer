"""Helper for finding bundled files (the webapp/ folder) both when running
this app normally with `python Convert_and_plot.py`, and when it's been
frozen into a single executable by PyInstaller.

Why this is needed: PyInstaller's --onefile mode unpacks everything into a
temporary folder at startup and tells us where via `sys._MEIPASS`. A normal
`python` run has no such thing, so we fall back to the folder this file
lives in. Every place that needs to find webapp/index.html (or any other
bundled asset) should go through resource_path() instead of hardcoding a
path, so it works the same way in both cases.
"""

import os
import sys


def resource_path(*parts):
    """Return an absolute path to a bundled resource, e.g.
    resource_path("webapp", "index.html").

    Works both in normal `python Convert_and_plot.py` runs and inside a
    PyInstaller --onefile executable.
    """
    if hasattr(sys, "_MEIPASS"):
        # Running as a frozen PyInstaller executable: assets were unpacked
        # into this temporary directory at startup.
        base_dir = sys._MEIPASS
    else:
        # Running normally: resolve relative to the project root (one level
        # up from this pointcloud/ package).
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base_dir, *parts)
