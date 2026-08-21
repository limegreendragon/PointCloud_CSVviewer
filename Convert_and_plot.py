"""PointCloud Viewer -- entry point.

Opens a single native window (via pywebview) that hosts the interactive
viewer built in webapp/ (HTML/CSS/JS + Three.js). This window lets you:
  - drag-and-drop a grid CSV, or Browse for one/a whole folder of them
  - view it as a heatmap or greyscale point cloud, with contour lines
  - freely pan/zoom/rotate, with a minimap + scrollbars to stay oriented
  - export the current point cloud as PNG or PDF in three fixed views

Why a local HTTP server instead of pointing the window straight at
webapp/index.html on disk: the viewer uses ES module imports
(`import ... from './vendor/three.module.js'`), and several webview
backends refuse to load module scripts from file:// URLs (they treat it as
a disallowed cross-origin request). Serving the same folder over
http://127.0.0.1 sidesteps that entirely, and costs nothing since it's a
few static files served from a background thread on this machine only.
"""

import base64
import functools
import http.server
import io
import os
import sys
import threading

import webview
from PIL import Image

from pointcloud.loaders import list_csv_files, load_csv_grid, load_csv_text
from pointcloud.resources import resource_path

WINDOW_TITLE = "PointCloud Viewer"
EXPORT_VIEW_ORDER = ["top", "side", "front"]
DEBUG_LOG_PATH = os.path.expanduser("~/PointCloudViewer_debug_log.txt")


class _QuietRequestHandler(http.server.SimpleHTTPRequestHandler):
    """Same as the default handler, just without a log line for every
    request -- there's nothing useful to see there for this app."""

    def log_message(self, format, *args):  # noqa: A002 (matches base signature)
        pass


def _start_local_server(directory):
    """Serve `directory` on 127.0.0.1 at an OS-assigned free port, in a
    background thread. Returns the port number."""
    handler = functools.partial(_QuietRequestHandler, directory=directory)
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    return httpd.server_address[1]


def _first_path(dialog_result):
    """pywebview's create_file_dialog returns a tuple of chosen paths (or
    None if the user cancelled). We only ever ask for one."""
    if not dialog_result:
        return None
    if isinstance(dialog_result, (list, tuple)):
        return dialog_result[0] if dialog_result else None
    return dialog_result


def _decode_data_url(data_url):
    """'data:image/png;base64,AAAA...' -> a Pillow Image."""
    _header, b64_data = data_url.split(",", 1)
    raw_bytes = base64.b64decode(b64_data)
    return Image.open(io.BytesIO(raw_bytes)).convert("RGB")


class Api:
    """Methods exposed to the viewer's JavaScript as
    `window.pywebview.api.<name>(...)`."""

    def pick_file(self):
        window = webview.windows[0]
        result = window.create_file_dialog(
            webview.OPEN_DIALOG,
            file_types=("CSV Files (*.csv)", "All files (*.*)"),
        )
        return _first_path(result)

    def pick_folder(self):
        """Opens a folder picker and returns the manifest of .csv files
        found inside it (name + path), ready for the sidebar file list."""
        window = webview.windows[0]
        result = window.create_file_dialog(webview.FOLDER_DIALOG)
        folder = _first_path(result)
        if not folder:
            return None
        return list_csv_files(folder)

    def load_path(self, path):
        return load_csv_grid(path)

    def load_csv_text(self, csv_text, source_name="dropped file"):
        return load_csv_text(csv_text, source_name=source_name)

    def export_views(self, payload):
        """payload: {"format": "png"|"pdf", "images": {"top"/"side"/"front":
        <data URL>}, "base_name": str}. Opens a native save dialog and
        writes the file(s) with Pillow."""
        export_format = payload.get("format", "png")
        base_name = payload.get("base_name") or "pointcloud"
        images = {
            view: _decode_data_url(data_url)
            for view, data_url in payload.get("images", {}).items()
        }
        window = webview.windows[0]

        if export_format == "pdf":
            chosen = window.create_file_dialog(
                webview.SAVE_DIALOG, save_filename=f"{base_name}.pdf"
            )
            path = _first_path(chosen)
            if not path:
                return {"cancelled": True}
            if not path.lower().endswith(".pdf"):
                path += ".pdf"
            ordered = [images[v] for v in EXPORT_VIEW_ORDER if v in images]
            if not ordered:
                return {"cancelled": True}
            ordered[0].save(path, save_all=True, append_images=ordered[1:])
            return {"cancelled": False, "path": path}

        chosen = window.create_file_dialog(webview.FOLDER_DIALOG)
        folder = _first_path(chosen)
        if not folder:
            return {"cancelled": True}
        for view, image in images.items():
            image.save(os.path.join(folder, f"{base_name}_{view}.png"))
        return {"cancelled": False, "path": folder}


def _write_startup_debug_log(webapp_dir):
    """Writes what we know about where the app looked for its viewer
    files, so a report from a broken build actually says something
    useful instead of just "it showed a 404". Best-effort: if even this
    fails, we still want to fall through to the on-screen error page."""
    lines = [
        "PointCloud Viewer startup diagnostic",
        f"frozen (running from a packaged build): {getattr(sys, 'frozen', False)}",
        f"sys._MEIPASS: {getattr(sys, '_MEIPASS', '(not set -- running from source)')}",
        f"expected webapp folder: {webapp_dir}",
        f"webapp folder exists: {os.path.isdir(webapp_dir)}",
    ]
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass and os.path.isdir(meipass):
        lines.append(f"contents of {meipass}:")
        lines.extend(f"  - {name}" for name in sorted(os.listdir(meipass)))
    try:
        with open(DEBUG_LOG_PATH, "w") as f:
            f.write("\n".join(lines) + "\n")
    except OSError:
        pass  # nothing more we can do if we can't even write the log


def _show_missing_webapp_error():
    """Shown instead of a blank/broken window when the viewer's own
    HTML/JS files (webapp/index.html etc.) can't be found -- this is a
    packaging bug, not something a user did wrong, so this points at the
    debug log rather than pretending there's a fix to try."""
    webview.create_window(
        WINDOW_TITLE,
        html=f"""
        <body style="font-family: -apple-system, sans-serif; padding: 32px; max-width: 560px;">
          <h2>PointCloud Viewer couldn't start</h2>
          <p>The app's viewer files (the <code>webapp</code> folder) weren't
          found where this build expected them -- that's a packaging bug,
          not something wrong with your CSV or computer.</p>
          <p>A debug log was written to:<br><code>{DEBUG_LOG_PATH}</code></p>
          <p>Please share that file so this can be fixed.</p>
        </body>
        """,
        width=640,
        height=420,
    )
    webview.start()


def main():
    webapp_dir = resource_path("webapp")
    if not os.path.isfile(os.path.join(webapp_dir, "index.html")):
        _write_startup_debug_log(webapp_dir)
        _show_missing_webapp_error()
        return

    port = _start_local_server(webapp_dir)
    api = Api()
    webview.create_window(
        WINDOW_TITLE,
        url=f"http://127.0.0.1:{port}/index.html",
        js_api=api,
        width=1180,
        height=780,
        min_size=(860, 560),
    )
    webview.start()


if __name__ == "__main__":
    main()
