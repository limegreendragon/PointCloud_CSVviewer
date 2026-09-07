"""PointCloud Viewer -- entry point.

Opens a single native window (via pywebview) that hosts the interactive
viewer built in webapp/ (HTML/CSS/JS + Three.js). This window lets you:
  - drag-and-drop a grid CSV, or Browse for one/a whole folder of them
    (including .zip archives -- see pointcloud/archives.py)
  - view it as a heatmap or greyscale point cloud, with contour lines
  - freely pan/zoom/rotate, with a minimap + scrollbars to stay oriented
  - see an archive's accompanying JSON metadata (GPS, timestamp, etc.)
  - export the current point cloud as PNG or PDF in three fixed views

Why a local HTTP server instead of pointing the window straight at
webapp/index.html on disk: the viewer uses ES module imports
(`import ... from './vendor/three.module.js'`), and several webview
backends refuse to load module scripts from file:// URLs (they treat it as
a disallowed cross-origin request). Serving the same folder over
http://127.0.0.1 sidesteps that entirely, and costs nothing since it's a
few static files served from a background thread on this machine only.

Startup is split into two stages -- a splash window shown immediately,
and the real work (which needs pandas/numpy/PIL, all genuinely slow to
import cold) done afterwards -- see main() at the bottom for why.
"""

import base64
import functools
import http.server
import io
import os
import shutil
import sys
import threading
import traceback

import webview

WINDOW_TITLE = "PointCloud Viewer"
EXPORT_VIEW_ORDER = ["top", "side", "front"]
DEBUG_LOG_PATH = os.path.expanduser("~/PointCloudViewer_debug_log.txt")

# Plain inline HTML/CSS for the splash -- deliberately not part of webapp/
# (no need to involve the local HTTP server just to show a loading
# message), and deliberately not theme-aware (light/dark preference lives
# in the real window's localStorage, which doesn't matter for a screen
# that's only up for a second or two).
_SPLASH_HTML = """
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  html, body {
    margin: 0;
    height: 100%;
    background: #0f121a;
    color: #e7ebf3;
    font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
    -webkit-user-select: none;
    user-select: none;
  }
  .box { text-align: center; }
  h1 { font-size: 15px; font-weight: 600; margin: 16px 0 4px; }
  p { font-size: 12px; color: #8b93a7; margin: 0; }
  .spinner {
    width: 26px;
    height: 26px;
    margin: 0 auto;
    border: 3px solid #262c3d;
    border-top-color: #4f8dff;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
  <div class="box">
    <div class="spinner"></div>
    <h1>PointCloud Viewer</h1>
    <p>Starting up&hellip;</p>
  </div>
</body>
</html>
"""

_STARTUP_ERROR_HTML = """
<body style="font-family: -apple-system, sans-serif; padding: 32px; max-width: 560px;">
  <h2>{title}</h2>
  <p>{message}</p>
  <p>A debug log was written to:<br><code>{log_path}</code></p>
  <p>Please share that file so this can be fixed.</p>
</body>
"""


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
    from PIL import Image  # deferred -- see the lazy-import note on main()

    _header, b64_data = data_url.split(",", 1)
    raw_bytes = base64.b64decode(b64_data)
    return Image.open(io.BytesIO(raw_bytes)).convert("RGB")


class Api:
    """Methods exposed to the viewer's JavaScript as
    `window.pywebview.api.<name>(...)`."""

    def __init__(self):
        # archive path -> extraction dir, so re-clicking the same archive
        # in one session doesn't re-extract it, and so main() knows what
        # to clean up when the app closes.
        self._extracted_dirs = {}

    def pick_file(self):
        window = webview.windows[0]
        result = window.create_file_dialog(
            webview.OPEN_DIALOG,
            file_types=("CSV or Zip files (*.csv;*.zip)", "All files (*.*)"),
        )
        return _first_path(result)

    def pick_folder(self):
        """Opens a folder picker and returns the manifest of .csv files
        and archives found inside it (name + path + kind), ready for the
        sidebar file list."""
        from pointcloud.loaders import list_openable_files

        window = webview.windows[0]
        result = window.create_file_dialog(webview.FOLDER_DIALOG)
        folder = _first_path(result)
        if not folder:
            return None
        return list_openable_files(folder)

    def load_path(self, path):
        from pointcloud.loaders import load_csv_grid

        return load_csv_grid(path)

    def load_csv_text(self, csv_text, source_name="dropped file"):
        from pointcloud.loaders import load_csv_text as _load_csv_text

        return _load_csv_text(csv_text, source_name=source_name)

    def load_archive(self, path):
        """Extracts a .zip archive (cached per path for the life of the
        app -- see __init__) and returns
        {"grid": ..., "metadata": ... | None}. The extraction/PPMd
        handling lives in pointcloud/archives.py; the CSV/JSON inside
        aren't assumed to have any particular name."""
        from pointcloud.archives import extract_archive, find_csv_and_json
        from pointcloud.loaders import load_csv_grid, load_json_metadata

        path = os.path.expanduser(path)
        extracted_dir = self._extracted_dirs.get(path)
        if extracted_dir is None or not os.path.isdir(extracted_dir):
            extracted_dir = extract_archive(path)
            self._extracted_dirs[path] = extracted_dir

        csv_path, json_path = find_csv_and_json(extracted_dir)
        if csv_path is None:
            raise ValueError(f"No .csv file found inside {os.path.basename(path)}")

        result = {"grid": load_csv_grid(csv_path), "metadata": None}

        if json_path is None:
            # Diagnostic aid: list what's actually in there rather than
            # silently showing no metadata, so it's easy to report back.
            result["extracted_files"] = sorted(
                os.path.relpath(os.path.join(root, name), extracted_dir)
                for root, _dirs, files in os.walk(extracted_dir)
                for name in files
            )
        else:
            metadata, error = load_json_metadata(json_path)
            result["metadata"] = metadata or None
            if error:
                # Found the file but couldn't read/parse it -- surface the
                # real reason instead of it just quietly showing nothing.
                result["metadata_error"] = error
        return result

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

    def cleanup(self):
        """Removes every archive's extracted temp folder. Called once,
        when the whole app is closing -- not per-file -- per an explicit
        product decision: keeping extracted scans around for the whole
        session means flipping between recently-viewed archives doesn't
        re-extract them. PNG/PDF exports are never in these directories
        (they go through their own native Save dialog to wherever the
        user picked), so this can't touch them."""
        for extracted_dir in self._extracted_dirs.values():
            shutil.rmtree(extracted_dir, ignore_errors=True)
        self._extracted_dirs.clear()


def _write_debug_log(lines):
    """Best-effort: if even this fails, we still want to fall through to
    the on-screen error page rather than raise."""
    try:
        with open(DEBUG_LOG_PATH, "w") as f:
            f.write("\n".join(lines) + "\n")
    except OSError:
        pass


def _write_missing_webapp_debug_log(webapp_dir):
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
    _write_debug_log(lines)


def _show_startup_error(title, message):
    """Shown in place of the real window when startup fails -- either
    webapp/ wasn't found (a packaging bug) or something else went wrong
    during the deferred setup work. Assumes webview's event loop is
    already running (called from within main()'s func= callback), so
    unlike the real window this does NOT call webview.start() itself."""
    webview.create_window(
        WINDOW_TITLE,
        html=_STARTUP_ERROR_HTML.format(title=title, message=message, log_path=DEBUG_LOG_PATH),
        width=640,
        height=420,
    )


def main():
    from pointcloud.resources import resource_path

    splash = webview.create_window(
        "Loading",
        html=_SPLASH_HTML,
        width=380,
        height=220,
        frameless=True,
        on_top=True,
        resizable=False,
        background_color="#0f121a",  # matches the splash's own dark background, no white flash before it paints
    )

    api = Api()

    def _finish_startup():
        # Everything in here (and everything it calls) is where
        # pandas/numpy/PIL/pyppmd actually get imported -- deferred to
        # this point, which only runs after the splash above is already
        # on screen, rather than at module load time, so there's
        # something visible immediately instead of a long silent wait.
        try:
            webapp_dir = resource_path("webapp")
            if not os.path.isfile(os.path.join(webapp_dir, "index.html")):
                _write_missing_webapp_debug_log(webapp_dir)
                splash.destroy()
                _show_startup_error(
                    "PointCloud Viewer couldn't start",
                    "The app's viewer files (the <code>webapp</code> folder) weren't "
                    "found where this build expected them -- that's a packaging bug, "
                    "not something wrong with your CSV or computer.",
                )
                return

            port = _start_local_server(webapp_dir)
            webview.create_window(
                WINDOW_TITLE,
                url=f"http://127.0.0.1:{port}/index.html",
                js_api=api,
                width=1180,
                height=780,
                min_size=(860, 560),
            )
            splash.destroy()
        except Exception:
            _write_debug_log(
                ["PointCloud Viewer startup crash", "", traceback.format_exc()]
            )
            splash.destroy()
            _show_startup_error(
                "PointCloud Viewer hit a problem starting up",
                "Something unexpected went wrong during startup.",
            )

    try:
        webview.start(_finish_startup)
    finally:
        api.cleanup()


if __name__ == "__main__":
    main()
