import os
import traceback
import tkinter as tk
from tkinter import filedialog, messagebox

import pandas as pd
import numpy as np
import plotly.graph_objects as go

try:
    from tkinterdnd2 import DND_FILES, TkinterDnD
    DND_AVAILABLE = True
except ImportError:
    DND_AVAILABLE = False


def convert_and_plot(file_path):
    """Load a grid-formatted CSV, convert it to an XYZ point cloud, and plot it.
    This is your original script's logic, unchanged, just wrapped in a function."""
    file_path = os.path.expanduser(file_path)
    print(f"Loading file: {file_path}")

    df = pd.read_csv(file_path)

    # 1. Extract Y values (first column)
    y_vals = df.iloc[:, 0].astype(float).values
    # 2. Extract X values (column headers except first)
    x_vals = df.columns[1:].astype(float)
    # 3. Extract Z matrix
    z_vals = df.iloc[:, 1:].astype(float).values
    # 4. Create meshgrid
    X, Y = np.meshgrid(x_vals, y_vals)
    # 5. Flatten everything
    X_flat = X.flatten()
    Y_flat = Y.flatten()
    Z_flat = z_vals.flatten()
    # 6. Remove NaNs
    mask = ~np.isnan(Z_flat)
    X_clean = X_flat[mask]
    Y_clean = Y_flat[mask]
    Z_clean = Z_flat[mask]
    # 7. Build point cloud dataframe
    point_cloud = pd.DataFrame({"X": X_clean, "Y": Y_clean, "Z": Z_clean})
    print(point_cloud.head())

    fig = go.Figure(
        data=[
            go.Scatter3d(
                x=point_cloud["X"],
                y=point_cloud["Y"],
                z=point_cloud["Z"],
                mode="markers",
                marker=dict(
                    size=2,
                    color=point_cloud["Z"],
                    colorscale="RdYlGn_r",
                    colorbar=dict(title="Height (Z)"),
                    opacity=0.8,
                ),
            )
        ]
    )
    fig.update_layout(
        title="3D Crab Scanner Point Cloud (Height Coloured)",
        scene=dict(xaxis_title="X", yaxis_title="Y", zaxis_title="Z"),
        height=800,
    )
    fig.show()


class App:
    def __init__(self, root):
        self.root = root
        root.title("Crab Scanner Point Cloud Viewer")
        root.geometry("480x280")
        root.resizable(False, False)

        self.status_var = tk.StringVar(value="Drop a CSV file below, or browse for one")

        title = tk.Label(root, text="Grid CSV \u2192 3D Point Cloud", font=("Segoe UI", 14, "bold"))
        title.pack(pady=(20, 5))

        self.drop_frame = tk.Frame(
            root, width=400, height=140, bg="#f0f0f0",
            highlightbackground="#999999", highlightthickness=2
        )
        self.drop_frame.pack(pady=10)
        self.drop_frame.pack_propagate(False)

        self.drop_label = tk.Label(
            self.drop_frame, textvariable=self.status_var, bg="#f0f0f0",
            wraplength=360, justify="center"
        )
        self.drop_label.pack(expand=True)

        browse_btn = tk.Button(root, text="Browse for CSV...", command=self.browse_file, width=20)
        browse_btn.pack(pady=(5, 20))

        if DND_AVAILABLE:
            self.drop_frame.drop_target_register(DND_FILES)
            self.drop_frame.dnd_bind("<<Drop>>", self.on_drop)
        else:
            self.status_var.set(
                "Drag-and-drop unavailable (tkinterdnd2 not installed).\nUse Browse instead."
            )

    def on_drop(self, event):
        # event.data can wrap the path in {} if it contains spaces
        path = event.data.strip()
        if path.startswith("{") and path.endswith("}"):
            path = path[1:-1]
        self.handle_file(path)

    def browse_file(self):
        path = filedialog.askopenfilename(
            title="Select a grid CSV file",
            filetypes=[("CSV files", "*.csv"), ("All files", "*.*")],
        )
        if path:
            self.handle_file(path)

    def handle_file(self, path):
        if not path.lower().endswith(".csv"):
            messagebox.showerror("Invalid file", "Please choose a .csv file.")
            return
        self.status_var.set(f"Loading:\n{os.path.basename(path)}")
        self.root.update_idletasks()
        try:
            convert_and_plot(path)
            self.status_var.set("Done \u2014 plot opened in your browser.\nDrop another file, or browse.")
        except Exception as e:
            traceback.print_exc()
            messagebox.showerror("Error processing file", str(e))
            self.status_var.set("Drop a CSV file below, or browse for one")


def main():
    if DND_AVAILABLE:
        root = TkinterDnD.Tk()
    else:
        root = tk.Tk()
    App(root)
    root.mainloop()


if __name__ == "__main__":
    main()
