#REquirments
import argparse
import os
import pandas as pd
import numpy as np
import plotly.graph_objects as go

# Argument parsing
parser = argparse.ArgumentParser(
    description="Convert crab scanner grid CSV into 3D point cloud")
parser.add_argument(
    "file",
    help="Path to the grid-formatted CSV file"
)
args = parser.parse_args()
file_path = os.path.expanduser(args.file)
print(f"Loading file: {file_path}")

# Load CSV
df = pd.read_csv(file_path)

# Convert grid to point cloud
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

# 7. Create new dataframe
point_cloud = pd.DataFrame({
    "X": X_clean,
    "Y": Y_clean,
    "Z": Z_clean
})

print(point_cloud.head())
# Plot
fig = go.Figure(
    data=[
        go.Scatter3d(
            x=point_cloud["X"],
            y=point_cloud["Y"],
            z=point_cloud["Z"],
            mode='markers',
            marker=dict(
                size=2,
                color=point_cloud["Z"],
                colorscale="RdYlGn_r",
                colorbar=dict(title="Height (Z)"),
                opacity=0.8
            )
        )
    ]
)

fig.update_layout(
    title="3D Crab Scanner Point Cloud (Height Coloured)",
    scene=dict(
        xaxis_title="X",
        yaxis_title="Y",
        zaxis_title="Z"
    ),
    height=800
)

fig.show()
