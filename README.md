# Grid CSV → Point Cloud → 3D Viewer (Crab Scanner)

This repository turns **grid-formatted CSV surface files** (exported by the
crab scanner / Gocator capture tool) into a standard **X,Y,Z point cloud**
and opens it in **PointCloud Viewer** — a single interactive window where
you can look around the scan, switch how it's coloured, and export it as an
image.

The input CSV is **not** a typical point-per-row CSV. Instead, it represents
a surface grid:

- **Row headers (column 1):** Y coordinates (mm)
- **Column headers (row 1, from column 2 onward):** X coordinates (mm)
- **Cells:** Z heights (mm)
- **Blank cells:** invalid/missing points

This tool reconstructs the full coordinate mesh and turns it into a clean
point cloud.

## Installation

Python 3.9+ recommended.

```bash
git clone https://github.com/limegreendragon/PointCloud_CSVviewer.git
cd PointCloud_CSVviewer
pip install -r Requirements.txt
```

## To run

```bash
python Convert_and_plot.py
```

This opens the **PointCloud Viewer** window — there's no file to pass on
the command line anymore, everything's done from inside the app:

1. **Load a file** — drag a `.csv` onto the drop zone, click **Browse
   File…** for one file, or **Browse Folder…** to pick from every CSV in a
   folder (each file is its own separate point cloud; pick one from the
   list to view it).
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
   it.
4. **Light/dark mode** — the switch next to the title in the sidebar swaps
   the whole app's theme; your choice is remembered next time you open it.
5. **Export** — **PNG** or **PDF** saves the current point cloud from three
   fixed orthographic angles: top-down (plan), left-right (side), and
   front-back. PNG saves three separate images; PDF saves one three-page
   file. You'll be asked where to save it.

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

1. Reads a grid CSV (or a folder of them)
2. Builds an X/Y mesh from the headers
3. Sends the grid to the viewer, which renders it as a 3D point cloud
   coloured by height, with adjustable-density contour lines traced across
   the surface and a base grid for orientation
4. Lets you freely rotate/pan/zoom/roll around it in light or dark mode,
   and export the result as a PNG or PDF in three fixed views

---

## What it looks like:
Dark mode:
<img width="1184" height="778" alt="Screenshot 2026-08-21 at 11 44 24" src="https://github.com/user-attachments/assets/4b92a445-22a3-4183-9710-e1453a03ab5e" />
Light Mode:
<img width="1176" height="749" alt="Screenshot 2026-08-21 at 11 44 56" src="https://github.com/user-attachments/assets/da1129e2-01ff-44af-8353-c5ca4e245e07" />
Exported PMGs:
<img width="899" height="1200" alt="2026-06-04_08-59-19-566_top" src="https://github.com/user-attachments/assets/122931d2-4a29-40d3-b5ad-7d74ac9615b5" />
<img width="1200" height="247" alt="2026-06-04_08-59-19-566_side" src="https://github.com/user-attachments/assets/f4b9e6f6-2167-41b6-b345-b571762664a3" />
<img width="1200" height="329" alt="2026-06-04_08-59-19-566_front" src="https://github.com/user-attachments/assets/b627a0ed-1e66-42b4-9b2f-d0d1179efce5" />



## Under the hood, briefly

`Convert_and_plot.py` opens one native window using
[pywebview](https://pywebview.flowrl.com/), which hosts the actual viewer —
a small HTML/JS app in `webapp/` built on [Three.js](https://threejs.org/)
for the 3D rendering, split into a few focused files: `viewer.js` (the 3D
scene itself), `contours.js` (traces the height-band lines), `minimap.js`
and `scrollbars.js` (the navigation aids), `colormap.js` (heatmap/greyscale
colouring) and `theme.js` (light/dark colours for everything that isn't
plain HTML/CSS). `pointcloud/loaders.py` has the grid-parsing logic (the
same math the original single-file script used); `Convert_and_plot.py`
just exposes it to the window's JavaScript so the UI can call it. Nothing
gets uploaded anywhere — the CSV never leaves your machine.
