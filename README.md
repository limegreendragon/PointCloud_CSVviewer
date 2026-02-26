# Grid CSV → Point Cloud → 3D Visualisation (Crab Scanner)

This repository converts **grid-formatted CSV surface files** (exported by the crab scanner / Gocator capture tool) into a standard **X,Y,Z point cloud** and plots it in 3D.

The input CSV is **not** a typical point-per-row CSV. Instead, it represents a surface grid:

- **Row headers (column 1):** Y coordinates (mm)
- **Column headers (row 1, from column 2 onward):** X coordinates (mm)
- **Cells:** Z heights (mm)
- **Blank cells:** invalid/missing points

This tool reconstructs the full coordinate mesh and outputs a clean point cloud.

---

## Example input format (grid CSV)
,0.00,0.10,0.20
0.00,1.2,1.3,
0.10,1.1,,1.4
0.20,1.0,1.2,1.3
(See examples folder for an actual file made from the MerraScanner)


- Top-left cell is blank
- First column is Y
- Header row (excluding first cell) is X
- Z values are in the grid

---

## What it does

1. Reads a grid CSV  
2. Builds an X/Y mesh from headers  
3. Flattens to X,Y,Z rows  
4. Removes invalid points (NaN / blank)  
5. Plots an interactive 3D scatter with height-based coloring
---

## Installation

Python 3.9+ recommended.

```bash
pip install -r requirements.txt
