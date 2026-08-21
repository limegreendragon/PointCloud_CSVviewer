// Custom scrollbars for the 3D view. Real scrollbars only make sense for a
// flat, pannable surface, so these track the camera's *target* (the point
// it's orbiting/panning around) against the point cloud's X/Y bounding box:
// thumb position = where the target sits within the bounds, thumb size =
// how zoomed in we are (camera distance vs. the distance we started at).

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export class ScrollBars {
  constructor({ hTrack, hThumb, vTrack, vThumb }, viewer) {
    this.hTrack = hTrack;
    this.hThumb = hThumb;
    this.vTrack = vTrack;
    this.vThumb = vThumb;
    this.viewer = viewer;
    this._dragging = null;

    hThumb.addEventListener('pointerdown', (event) => this._startDrag('h', event));
    vThumb.addEventListener('pointerdown', (event) => this._startDrag('v', event));
    window.addEventListener('pointermove', (event) => this._onDrag(event));
    window.addEventListener('pointerup', () => this._endDrag());
  }

  update() {
    const { bounds, camera, controls, fitDistance } = this.viewer;
    if (!bounds) {
      this.hTrack.style.visibility = 'hidden';
      this.vTrack.style.visibility = 'hidden';
      return;
    }
    this.hTrack.style.visibility = 'visible';
    this.vTrack.style.visibility = 'visible';

    const distance = camera.position.distanceTo(controls.target);
    const zoomFraction = clamp(distance / (fitDistance || distance), 0.04, 1);

    const hTrackLen = this.hTrack.clientWidth;
    const hThumbLen = Math.max(24, zoomFraction * hTrackLen);
    const spanX = bounds.maxX - bounds.minX || 1;
    const normX = clamp((controls.target.x - bounds.minX) / spanX, 0, 1);
    this.hThumb.style.width = `${hThumbLen}px`;
    this.hThumb.style.left = `${normX * (hTrackLen - hThumbLen)}px`;

    const vTrackLen = this.vTrack.clientHeight;
    const vThumbLen = Math.max(24, zoomFraction * vTrackLen);
    const spanY = bounds.maxY - bounds.minY || 1;
    const normY = clamp((controls.target.y - bounds.minY) / spanY, 0, 1);
    this.vThumb.style.height = `${vThumbLen}px`;
    // Inverted so dragging the thumb up moves the view towards higher Y,
    // matching the minimap's "north is up" convention.
    this.vThumb.style.top = `${(1 - normY) * (vTrackLen - vThumbLen)}px`;
  }

  _startDrag(axis, event) {
    event.preventDefault();
    this._dragging = {
      axis,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startTarget: this.viewer.controls.target.clone(),
    };
  }

  _onDrag(event) {
    if (!this._dragging) return;
    const { axis, startClientX, startClientY, startTarget } = this._dragging;
    const { bounds, controls, camera } = this.viewer;

    if (axis === 'h') {
      const trackLen = this.hTrack.clientWidth;
      const spanX = bounds.maxX - bounds.minX || 1;
      const deltaWorld = ((event.clientX - startClientX) / trackLen) * spanX;
      const newX = clamp(startTarget.x + deltaWorld, bounds.minX, bounds.maxX);
      camera.position.x += newX - controls.target.x;
      controls.target.x = newX;
    } else {
      const trackLen = this.vTrack.clientHeight;
      const spanY = bounds.maxY - bounds.minY || 1;
      const deltaWorld = -((event.clientY - startClientY) / trackLen) * spanY;
      const newY = clamp(startTarget.y + deltaWorld, bounds.minY, bounds.maxY);
      camera.position.y += newY - controls.target.y;
      controls.target.y = newY;
    }
    controls.update();
  }

  _endDrag() {
    this._dragging = null;
  }
}
