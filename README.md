# Grid CSV → Point Cloud → 3D Viewer (Crab Scanner)

This repository turns **grid-formatted CSV surface files** (exported by the
crab scanner / Gocator capture tool) into a standard **X,Y,Z point cloud**
and opens it in **PointCloud Viewer** — a single interactive window where
you can browse straight to the scanner's own compressed archives, look
around the scan, switch how it's coloured, read its GPS/timestamp metadata,
and export it as an image.

The input CSV is **not** a typical point-per-row CSV. Instead, it represents
a surface grid:

- **Row headers (column 1):** Y coordinates (mm)
- **Column headers (row 1, from column 2 onward):** X coordinates (mm)
- **Cells:** Z heights (mm)
- **Blank cells:** invalid/missing points

This tool reconstructs the full coordinate mesh and turns it into a clean
point cloud.

## Installation

## Windows app
Go to the Release tag on the right hand side of this page - go to the latest release and download it. When you double click it, it will likely complain and say this is from an untrusted source - if you click show me more, there will be a run anyway option. Click that and give it a few seconds and it will open!

## Mac app
Again - go to the Releases tag on the right hand side. If you are an intel core Mac - download the intel version if you have an M1/2 chip Mac download the other version. Again it will say not from a trusted source. Try and open it - DONT CLICK MOVE TO BIN! - Navigate to your Macs Settings and Privacy and Security and then scroll to the bottom and say trust this app.
Double click on the package and voilá!

## CLI
Python 3.9+ recommended.

```bash
git clone https://github.com/limegreendragon/PointCloud_CSVviewer.git
cd PointCloud_CSVviewer
pip install -r Requirements.txt
python Convert_and_plot.py
```
A small loading screen appears immediately, then the **PointCloud Viewer**
window opens — there's no file to pass on the command line, everything's
done from inside the app:

1. **Load a file** — drag a `.csv` onto the drop zone, click **Browse
   File…** for one file (`.csv` or `.zip`), or **Browse Folder…** to list
   every CSV *and* archive in a folder (badged `CSV`/`ZIP`, scrollable if
   there are a lot of them). Each `.zip` is one of the scanner's own
   compressed exports — click it and it's extracted to a temporary location
   automatically (see **Archives** below); pick any entry to view it.
2. **Look around** — left-drag orbits around the scan (it always stays
   level, no flipping), scroll to zoom, right-drag/shift-drag to pan. Hold
   **Ctrl** and drag to roll/tilt the camera instead — a separate control
   from the normal orbit, for canting the view. A **minimap** in the
   top-right corner shows where your current view sits relative to the
   whole scan, and the **scrollbars** along the bottom/right of the canvas
   track and let you drag your position the same way. **Reset View**
   re-centres, re-fits and un-rolls the camera if you get lost.
3. **Colour mode** — toggle between **Heatmap** (blue → red by height) and
   **Greyscale**. **Contour lines** overlays evenly-spaced height bands on
   the surface (the "trendlines" that trace the shape, like elevation rings
   on a topographic map) — switch it off, or use the **Density** slider to
   add more/fewer bands (raise it to resolve fine detail like a shell's
   curve, which only spans a narrow slice of the scan's overall height
   range). **Base grid** adds a flat reference grid at the bottom of the
   scan so you can tell which way is "down" while rotating freely around
   it. These controls (and Export, below) are there from the moment the app
   opens — set them how you like before loading anything and they'll apply
   to whatever you load first.
4. **Light/dark mode** — the sun/moon icons and switch next to the title
   swap the whole app's theme; your choice is remembered next time you open
   it.
5. **Metadata** — when a loaded archive has a JSON file alongside its CSV
   (GPS, capture time, device info, etc.), it's laid out as a label/value
   grid in the collapsible bar along the bottom of the window. Nothing to
   do here — it fills in automatically, and stays hidden for a plain CSV
   with no matching JSON.
6. **Export** — **PNG** or **PDF** saves the current point cloud from three
   fixed orthographic angles: top-down (plan), left-right (side), and
   front-back. PNG saves three separate images; PDF saves one three-page
   file. You'll be asked where to save it.

## Archives

The scanner's real output is a `.zip` per scan (PPMd-compressed — an
unusual compression method most zip tools don't support, handled here
without any extra software needed), each containing one CSV and one JSON
file. Clicking one in **Browse Folder…** extracts it into a temporary
folder on your machine, loads the CSV as normal, and reads the JSON into
the metadata bar. Nothing is written back into the archive or its folder.

Extracted temp folders are cleaned up **when you close the app**, not as
you switch between files — so flipping back and forth between scans in one
session doesn't re-extract them. Anything you've exported as PNG/PDF is
saved wherever you chose in the Save dialog, never inside a temp folder, so
it's completely unaffected by that cleanup.

## Example input format (grid CSV)
```
,0.00,0.10,0.20
0.00,1.2,1.3,
0.10,1.1,,1.4
0.20,1.0,1.2,1.3
```
(See the `Examples` folder for real files produced by the scanner.)

- Top-left cell is blank
- First column is Y
- Header row (excluding first cell) is X
- Z values are in the grid

---

## What it does

1. Reads a grid CSV — on its own, in a folder of them, or straight out of
   the scanner's compressed `.zip` archives
2. Builds an X/Y mesh from the headers
3. Sends the grid to the viewer, which renders it as a 3D point cloud
   coloured by height, with adjustable-density contour lines traced across
   the surface and a base grid for orientation
4. Reads an archive's accompanying JSON (GPS, timestamp, etc.) into a
   metadata panel alongside the point cloud
5. Lets you freely rotate/pan/zoom/roll around it in light or dark mode,
   and export the result as a PNG or PDF in three fixed views

---

## What it looks like:
### Dark mode:

<img width="1178" height="1071" alt="Screenshot 2026-09-07 at 09 55 58" src="https://github.com/user-attachments/assets/572b862e-30ae-4e03-b405-63f72ec49cb4" />

### Light Mode:
<img width="1174" height="1032" alt="Screenshot 2026-09-07 at 10 22 34" src="https://github.com/user-attachments/assets/dae16414-1ee2-4955-8a28-333bf70173c0" />

### Browsing a folder of archives:
<img width="269" height="454" alt="Screenshot 2026-09-07 at 10 22 47" src="https://github.com/user-attachments/assets/771fe64d-f442-4c03-aec8-6706ef1635cf" />

### Metadata bar:
<img width="1176" height="153" alt="Screenshot 2026-09-07 at 10 22 57" src="https://github.com/user-attachments/assets/8065bba1-32ad-4088-855a-8a38fd14c0cc" />

### Exported PNGs:
<img width="899" height="1200" alt="2026-06-04_08-59-19-566_top" src="https://github.com/user-attachments/assets/122931d2-4a29-40d3-b5ad-7d74ac9615b5" />
<img width="1200" height="247" alt="2026-06-04_08-59-19-566_side" src="https://github.com/user-attachments/assets/f4b9e6f6-2167-41b6-b345-b571762664a3" />
<img width="1200" height="329" alt="2026-06-04_08-59-19-566_front" src="https://github.com/user-attachments/assets/b627a0ed-1e66-42b4-9b2f-d0d1179efce5" />



## Under the hood, (briefly)

`Convert_and_plot.py` opens one native window using
[pywebview](https://pywebview.flowrl.com/), which hosts the actual viewer —
a small HTML/JS app in `webapp/` built on [Three.js](https://threejs.org/)
for the 3D rendering, split into a few focused files: `viewer.js` (the 3D
scene itself), `contours.js` (traces the height-band lines), `minimap.js`
and `scrollbars.js` (the navigation aids), `colormap.js` (heatmap/greyscale
colouring) and `theme.js` (light/dark colours for everything that isn't
plain HTML/CSS). On the Python side, `pointcloud/loaders.py` has the
grid-parsing and JSON-metadata logic (the same grid math the original
single-file script used), and `pointcloud/archives.py` handles extracting
the scanner's PPMd-compressed `.zip` archives — Python's own `zipfile`
module can't read that compression method, so this registers a small
decoder for it built on the `pyppmd` library. `Convert_and_plot.py` wires
both up and exposes them to the window's JavaScript so the UI can call
them, and shows the splash window before any of the slower imports
(pandas/numpy/PIL) happen, so something appears on screen immediately
rather than after a silent delay. Nothing gets uploaded anywhere — your
files never leave your machine.
