// Marching-squares contour extraction, run entirely in the browser against
// the z_grid the app sent us. Produces the "trendlines" that trace the
// surface's shape, the same way contour lines on a topographic map do.
//
// This is a from-scratch, dependency-free implementation: for every 2x2
// cell in the grid we check which of its four edges the target height
// ("level") crosses, interpolate the crossing point along each edge, and
// connect the crossing points into one or two short line segments. Doing
// that for every cell at every level and stitching the segments together
// is what a contour line actually is.

function clampT(t) {
  if (!Number.isFinite(t)) return 0.5;
  return Math.min(1, Math.max(0, t));
}

// Interpolated grid position (fractional row/col) for the world-space
// [x, y] of a query. Coordinate arrays are usually evenly spaced, but we
// don't assume that -- linear interpolation between whichever two entries
// bracket the fractional index the query landed on.
function interpArray(arr, index) {
  const i0 = Math.floor(index);
  const i1 = Math.min(i0 + 1, arr.length - 1);
  const t = index - i0;
  return arr[i0] + (arr[i1] - arr[i0]) * t;
}

function gridPointToWorld(row, col, xCoords, yCoords, z) {
  return [interpArray(xCoords, col), interpArray(yCoords, row), z];
}

// One iso-level's worth of segments, in fractional [row, col] space.
function segmentsForLevel(zGrid, rows, cols, level) {
  const segments = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const tl = zGrid[r][c];
      const tr = zGrid[r][c + 1];
      const bl = zGrid[r + 1][c];
      const br = zGrid[r + 1][c + 1];
      if (tl == null || tr == null || bl == null || br == null) continue;

      // Crossing points are pushed in a fixed order (top, right, bottom,
      // left) so that if all four edges cross (the ambiguous "saddle"
      // case) we can pair them up predictably below.
      const edges = [];
      if ((tl >= level) !== (tr >= level)) {
        edges.push([r, c + clampT((level - tl) / (tr - tl))]);
      }
      if ((tr >= level) !== (br >= level)) {
        edges.push([r + clampT((level - tr) / (br - tr)), c + 1]);
      }
      if ((bl >= level) !== (br >= level)) {
        edges.push([r + 1, c + clampT((level - bl) / (br - bl))]);
      }
      if ((tl >= level) !== (bl >= level)) {
        edges.push([r + clampT((level - tl) / (bl - tl)), c]);
      }

      if (edges.length === 2) {
        segments.push([edges[0], edges[1]]);
      } else if (edges.length === 4) {
        // Saddle case: two plausible ways to connect the four crossing
        // points. Resolve using the cell's average height, same trick
        // most marching-squares implementations use.
        const center = (tl + tr + bl + br) / 4;
        if (center >= level) {
          segments.push([edges[0], edges[3]]);
          segments.push([edges[1], edges[2]]);
        } else {
          segments.push([edges[0], edges[1]]);
          segments.push([edges[2], edges[3]]);
        }
      }
    }
  }
  return segments;
}

// Returns a flat array of {level, p1: [x,y,z], p2: [x,y,z]} segments across
// `levelCount` evenly spaced heights between the grid's min and max Z
// (skipping the very top/bottom so lines don't hug the extreme edges).
export function computeContourSegments(grid, levelCount = 10) {
  const { x_coords: xCoords, y_coords: yCoords, z_grid: zGrid } = grid;
  const rows = zGrid.length;
  const cols = rows > 0 ? zGrid[0].length : 0;
  if (rows < 2 || cols < 2) return [];

  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const row of zGrid) {
    for (const value of row) {
      if (value == null) continue;
      if (value < minZ) minZ = value;
      if (value > maxZ) maxZ = value;
    }
  }
  if (!Number.isFinite(minZ) || !Number.isFinite(maxZ) || minZ === maxZ) return [];

  const result = [];
  for (let i = 1; i <= levelCount; i++) {
    const level = minZ + ((maxZ - minZ) * i) / (levelCount + 1);
    const segments = segmentsForLevel(zGrid, rows, cols, level);
    for (const [a, b] of segments) {
      result.push({
        level,
        p1: gridPointToWorld(a[0], a[1], xCoords, yCoords, level),
        p2: gridPointToWorld(b[0], b[1], xCoords, yCoords, level),
      });
    }
  }
  return result;
}
