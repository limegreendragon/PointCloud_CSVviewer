// Small top-right overview panel: draws every point's rough footprint from
// directly above, plus a rectangle showing how much of that footprint the
// main view currently covers -- the same idea as the little "you are here"
// navigator panel in image editors, applied to a 3D point cloud.

import { THEME } from './theme.js';

const MARGIN = 10;
const MAX_DOTS = 2500;

export class Minimap {
  constructor(canvasEl, viewer) {
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d');
    this.viewer = viewer;
    this.dots = [];
    this.bounds = null;

    canvasEl.addEventListener('click', (event) => this._onClick(event));
  }

  setGrid(grid, bounds) {
    this.bounds = bounds;
    const { x_coords: xCoords, y_coords: yCoords, z_grid: zGrid } = grid;
    const rows = zGrid.length;
    const cols = rows > 0 ? zGrid[0].length : 0;
    const totalCells = rows * cols;
    const stride = Math.max(1, Math.floor(Math.sqrt(totalCells / MAX_DOTS)));

    const dots = [];
    for (let r = 0; r < rows; r += stride) {
      for (let c = 0; c < cols; c += stride) {
        if (zGrid[r][c] == null) continue;
        dots.push([xCoords[c], yCoords[r]]);
      }
    }
    this.dots = dots;
  }

  _worldToCanvas(x, y) {
    const { canvas, bounds } = this;
    const w = canvas.width;
    const h = canvas.height;
    const spanX = bounds.maxX - bounds.minX || 1;
    const spanY = bounds.maxY - bounds.minY || 1;
    const normX = (x - bounds.minX) / spanX;
    const normY = (y - bounds.minY) / spanY;
    return [
      MARGIN + normX * (w - 2 * MARGIN),
      MARGIN + (1 - normY) * (h - 2 * MARGIN), // flip Y so "north" is up
    ];
  }

  _canvasToWorld(px, py) {
    const { canvas, bounds } = this;
    const w = canvas.width;
    const h = canvas.height;
    const normX = (px - MARGIN) / (w - 2 * MARGIN);
    const normY = 1 - (py - MARGIN) / (h - 2 * MARGIN);
    return [
      bounds.minX + normX * (bounds.maxX - bounds.minX),
      bounds.minY + normY * (bounds.maxY - bounds.minY),
    ];
  }

  update() {
    const { ctx, canvas, bounds, viewer } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!bounds) return;

    const colors = THEME[viewer.theme] || THEME.dark;

    ctx.fillStyle = colors.minimapFill;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = colors.minimapDot;
    for (const [x, y] of this.dots) {
      const [px, py] = this._worldToCanvas(x, y);
      ctx.fillRect(px, py, 1.5, 1.5);
    }

    // Current viewport footprint, approximated from the camera's field of
    // view and its distance to the orbit target -- wider FOV or a closer
    // camera both mean "more zoomed in", i.e. a smaller rectangle here.
    const camera = viewer.camera;
    const target = viewer.controls.target;
    const distance = camera.position.distanceTo(target);
    const fovRad = (camera.fov * Math.PI) / 180;
    const visibleHeight = 2 * distance * Math.tan(fovRad / 2);
    const visibleWidth = visibleHeight * camera.aspect;

    const [cx1, cy1] = this._worldToCanvas(
      target.x - visibleWidth / 2,
      target.y - visibleHeight / 2
    );
    const [cx2, cy2] = this._worldToCanvas(
      target.x + visibleWidth / 2,
      target.y + visibleHeight / 2
    );

    ctx.strokeStyle = colors.minimapViewport;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(
      Math.min(cx1, cx2),
      Math.min(cy1, cy2),
      Math.abs(cx2 - cx1),
      Math.abs(cy2 - cy1)
    );
  }

  _onClick(event) {
    if (!this.bounds) return;
    const rect = this.canvas.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * this.canvas.width;
    const py = ((event.clientY - rect.top) / rect.height) * this.canvas.height;
    const [worldX, worldY] = this._canvasToWorld(px, py);

    const { controls, camera } = this.viewer;
    const dx = worldX - controls.target.x;
    const dy = worldY - controls.target.y;
    controls.target.x = worldX;
    controls.target.y = worldY;
    camera.position.x += dx;
    camera.position.y += dy;
    controls.update();
  }
}
