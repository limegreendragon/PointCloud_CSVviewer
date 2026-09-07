"""Loads the laser scanner's grid-format CSV files into the shape the
viewer window expects.

Input CSV shape (unchanged from the original script):
- Row headers (column 1): Y coordinates
- Column headers (row 1, from column 2 onward): X coordinates
- Cells: Z heights
- Blank cells: invalid/missing points

We keep the data as a 2D grid (rather than flattening to X,Y,Z rows) because
the viewer needs the grid shape to draw contour lines and to look up
neighbouring points -- flattening happens on the JavaScript side instead.
"""

import io
import json
import os

import numpy as np
import pandas as pd

from pointcloud.archives import is_archive

CSV_EXTENSION = ".csv"


def _grid_from_dataframe(df, source_name="csv"):
    """Shared conversion from a raw grid dataframe to the
    {"x_coords", "y_coords", "z_grid"} shape the viewer expects. Used by
    both the path-based and text-based loaders below.
    """
    # Row headers (first column) are Y; column headers (all but the first)
    # are X; everything else is the Z grid. Same logic as the original
    # Convert_and_plot.py script.
    y_vals = df.iloc[:, 0].astype(float).values
    x_vals = df.columns[1:].astype(float).to_numpy()
    z_vals = df.iloc[:, 1:].astype(float).values

    if z_vals.shape != (len(y_vals), len(x_vals)):
        raise ValueError(
            f"Grid shape mismatch in {source_name}: "
            f"expected {(len(y_vals), len(x_vals))}, got {z_vals.shape}"
        )

    # Swap NaN -> None so this survives a plain json.dumps() on the way to
    # the viewer. tolist() first so we get native Python floats, not
    # numpy.float64 (which json can't serialize either).
    z_grid = z_vals.tolist()
    for row in z_grid:
        for i, value in enumerate(row):
            if value is None or (isinstance(value, float) and np.isnan(value)):
                row[i] = None

    return {
        "x_coords": x_vals.tolist(),
        "y_coords": y_vals.tolist(),
        "z_grid": z_grid,
    }


def load_csv_grid(file_path):
    """Load one grid-formatted CSV from disk (used by Browse File / Browse
    Folder, which give us a real filesystem path from the native dialog).
    """
    file_path = os.path.expanduser(file_path)
    df = pd.read_csv(file_path)
    return _grid_from_dataframe(df, source_name=os.path.basename(file_path))


def load_csv_text(csv_text, source_name="dropped file"):
    """Load one grid-formatted CSV from raw text (used by drag-and-drop:
    dropped-file objects in a webview don't reliably expose a real
    filesystem path across platforms, so the browser side reads the file's
    contents itself and sends us the text instead).
    """
    df = pd.read_csv(io.StringIO(csv_text))
    return _grid_from_dataframe(df, source_name=source_name)


def list_openable_files(folder_path):
    """Scan a folder (non-recursive) for .csv files and supported archives
    (currently PPMd .zip files -- see pointcloud/archives.py) and return a
    manifest for the sidebar file list:
    [{"name": ..., "path": ..., "kind": "csv" | "archive"}, ...],
    sorted by name. The real-world case is a folder full of one or the
    other, not usually both, but either is handled the same way here.
    """
    folder_path = os.path.expanduser(folder_path)
    entries = []
    for name in os.listdir(folder_path):
        lower = name.lower()
        if lower.endswith(CSV_EXTENSION):
            kind = "csv"
        elif is_archive(lower):
            kind = "archive"
        else:
            continue
        entries.append({
            "name": name,
            "path": os.path.join(folder_path, name),
            "kind": kind,
        })
    entries.sort(key=lambda entry: entry["name"].lower())
    return entries


def load_json_metadata(file_path):
    """Reads a metadata JSON file (GPS, timestamp, etc. alongside a scan's
    CSV inside an archive). A failure here shouldn't block viewing the
    point cloud, so this never raises -- but unlike a plain try/except
    that swallows everything into an empty dict, it returns
    (metadata_dict, error_message) so the caller can tell "genuinely no
    metadata" apart from "found the file but couldn't read it", and
    surface the second case instead of it just silently vanishing.

    encoding="utf-8-sig" (not plain "utf-8") is deliberate: JSON written
    by Windows-originated tools often has a UTF-8 byte-order-mark at the
    start of the file, which plain utf-8 doesn't strip and json.load()
    then fails on with a cryptic "Expecting value" error -- utf-8-sig
    strips it if present and behaves identically to utf-8 if it's not.
    """
    try:
        with open(file_path, encoding="utf-8-sig") as f:
            return json.load(f), None
    except OSError as e:
        return {}, f"couldn't open {os.path.basename(file_path)}: {e}"
    except ValueError as e:
        return {}, f"couldn't parse {os.path.basename(file_path)} as JSON: {e}"
