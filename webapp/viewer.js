import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { colorForMode } from './colormap.js';
import { computeContourSegments } from './contours.js';
import { Minimap } from './minimap.js';
import { ScrollBars } from './scrollbars.js';
import { THEME } from './theme.js';

const MAX_POINTS = 500000; // safety cap so a huge scan doesn't choke the GPU
const DEFAULT_CONTOUR_LEVEL_COUNT = 25;
const MARGIN_FACTOR = 1.08;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export class PointCloudViewer {
  constructor(canvasEl, minimapCanvasEl, scrollbarEls) {
    this.canvas = canvasEl;

    this.renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);

    this.theme = 'dark';
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(THEME[this.theme].background);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100000);
    this.camera.position.set(0, -10, 10);
    // The scan's "up" is Z (height), not three.js's default Y -- this has
    // to be set before OrbitControls is constructed below, because it
    // reads camera.up once at construction time to decide which axis to
    // orbit around. Without this, dragging left/right orbits around the
    // wrong (Y) axis and the view appears to flip/tumble instead of
    // smoothly turning around the scan.
    this.camera.up.set(0, 0, 1);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;

    this.grid = null;
    this.bounds = null;
    this.fitDistance = null;
    this.colorMode = 'heatmap';
    this.contoursVisible = true;
    this.contourLevelCount = DEFAULT_CONTOUR_LEVEL_COUNT;
    this.baseVisible = true;

    this._pointsObject = null;
    this._pointColorT = null; // cached normalised heights, for fast recolouring
    this._contourObject = null;
    this._baseObject = null;
    this._pointTexture = this._makeCircleTexture();

    this.minimap = new Minimap(minimapCanvasEl, this);
    this.scrollbars = new ScrollBars(scrollbarEls, this);

    this.controls.addEventListener('change', () => {
      this.minimap.update();
      this.scrollbars.update();
    });

    this._setupRollControl();

    new ResizeObserver(() => this._onResize()).observe(this.canvas.parentElement);
    this._onResize();

    this._animate = this._animate.bind(this);
    requestAnimationFrame(this._animate);
  }

  // A soft circular sprite used for every point, so zoomed-in points read
  // as dots rather than the hard-edged squares WebGL draws by default.
  _makeCircleTexture() {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const r = size / 2;
    const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.8, 'rgba(255,255,255,1)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(r, r, r, 0, Math.PI * 2);
    ctx.fill();
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  // Hold Ctrl and drag to "roll" the camera (tilt what counts as level)
  // instead of the normal orbit. This rotates camera.up around the current
  // view direction, using a steering-wheel-style gesture: the roll amount
  // is however far the mouse has swept around the canvas's centre point,
  // so both left/right and up/down movement naturally contribute.
  //
  // This is intentionally kept separate from OrbitControls' own drag
  // handling (which stays in charge of the plain left-drag orbit): we
  // disable controls.enableRotate for as long as Ctrl is held, based on
  // keydown/keyup rather than the drag's own pointerdown, so there's no
  // race over which handler sees the mouse button first.
  _setupRollControl() {
    let rollDrag = null;

    const setCtrlHeld = (held) => {
      this.controls.enableRotate = !held;
      if (!held) rollDrag = null;
    };

    window.addEventListener('keydown', (event) => {
      if (event.key === 'Control') setCtrlHeld(true);
    });
    window.addEventListener('keyup', (event) => {
      if (event.key === 'Control') setCtrlHeld(false);
    });
    window.addEventListener('blur', () => setCtrlHeld(false));

    this.canvas.addEventListener('pointerdown', (event) => {
      if (!event.ctrlKey || event.button !== 0) return;
      event.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      rollDrag = { cx, cy, lastAngle: Math.atan2(event.clientY - cy, event.clientX - cx) };
    });

    window.addEventListener('pointermove', (event) => {
      if (!rollDrag) return;
      const angle = Math.atan2(event.clientY - rollDrag.cy, event.clientX - rollDrag.cx);
      let delta = angle - rollDrag.lastAngle;
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;
      rollDrag.lastAngle = angle;

      const forward = new THREE.Vector3()
        .subVectors(this.camera.position, this.controls.target)
        .normalize();
      this.camera.up.applyAxisAngle(forward, delta).normalize();
    });

    window.addEventListener('pointerup', () => {
      rollDrag = null;
    });
  }

  _onResize() {
    const parent = this.canvas.parentElement;
    const width = parent.clientWidth;
    const height = parent.clientHeight;
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  _animate() {
    requestAnimationFrame(this._animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  // ---- loading -----------------------------------------------------

  loadGrid(grid) {
    this.grid = grid;
    this.bounds = this._computeBounds(grid);
    this._buildPointCloud();
    this._buildContours();
    this._buildBase();
    this._fitCameraToBounds();
    this.minimap.setGrid(grid, this.bounds);
    this.minimap.update();
    this.scrollbars.update();
  }

  _computeBounds(grid) {
    const { x_coords: xCoords, y_coords: yCoords, z_grid: zGrid } = grid;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const row of zGrid) {
      for (const value of row) {
        if (value == null) continue;
        if (value < minZ) minZ = value;
        if (value > maxZ) maxZ = value;
      }
    }
    if (!Number.isFinite(minZ)) {
      minZ = 0;
      maxZ = 1;
    }
    const minX = Math.min(...xCoords);
    const maxX = Math.max(...xCoords);
    const minY = Math.min(...yCoords);
    const maxY = Math.max(...yCoords);

    const sizeX = Math.max(maxX - minX, 1e-6);
    const sizeY = Math.max(maxY - minY, 1e-6);
    const sizeZ = Math.max(maxZ - minZ, 1e-6);

    return {
      minX, maxX, minY, maxY, minZ, maxZ,
      sizeX, sizeY, sizeZ,
      sizeMax: Math.max(sizeX, sizeY, sizeZ),
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
      centerZ: (minZ + maxZ) / 2,
    };
  }

  _buildPointCloud() {
    if (this._pointsObject) {
      this.scene.remove(this._pointsObject);
      this._pointsObject.geometry.dispose();
      this._pointsObject.material.dispose();
      this._pointsObject = null;
    }

    const { x_coords: xCoords, y_coords: yCoords, z_grid: zGrid } = this.grid;
    const rows = zGrid.length;
    const cols = rows > 0 ? zGrid[0].length : 0;
    const totalCells = rows * cols;
    const stride = Math.max(1, Math.floor(Math.sqrt(totalCells / MAX_POINTS)));

    const positions = [];
    const colorTs = [];
    const { minZ, maxZ } = this.bounds;
    const spanZ = maxZ - minZ || 1;

    for (let r = 0; r < rows; r += stride) {
      for (let c = 0; c < cols; c += stride) {
        const z = zGrid[r][c];
        if (z == null) continue;
        positions.push(xCoords[c], yCoords[r], z);
        colorTs.push((z - minZ) / spanZ);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const colors = new Float32Array(colorTs.length * 3);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    this._pointColorT = colorTs;
    this._applyPointColors(geometry);

    // sizeAttenuation:true (the default) sizes points in *world* units, so
    // they grow the closer the camera gets -- which is exactly backwards
    // for telling individual points apart: the more you zoom in, the
    // bigger (and more overlapping) each dot got. A fixed pixel size
    // instead means each dot stays the same size on screen regardless of
    // zoom, so zooming in increases the *gap* between dots (in screen
    // space) rather than the dots themselves, and they resolve into
    // separate points instead of smearing into a solid sheet.
    const pointSize = 3.5;
    const material = new THREE.PointsMaterial({
      size: pointSize,
      vertexColors: true,
      sizeAttenuation: false,
      map: this._pointTexture,
      transparent: true,
      alphaTest: 0.4, // discards the texture's transparent corners, so points read as circles, not squares
    });

    this._pointsObject = new THREE.Points(geometry, material);
    this.scene.add(this._pointsObject);
  }

  _applyPointColors(geometry) {
    const colorAttr = geometry.getAttribute('color');
    for (let i = 0; i < this._pointColorT.length; i++) {
      const [r, g, b] = colorForMode(this.colorMode, this._pointColorT[i]);
      colorAttr.setXYZ(i, r, g, b);
    }
    colorAttr.needsUpdate = true;
  }

  setColorMode(mode) {
    this.colorMode = mode;
    if (this._pointsObject) {
      this._applyPointColors(this._pointsObject.geometry);
    }
  }

  // Point cloud colours (heatmap/greyscale) represent data, so they stay
  // the same in both themes -- only the scene chrome around them (backdrop,
  // contour lines, base grid, minimap) needs to change for contrast.
  setTheme(theme) {
    this.theme = theme === 'light' ? 'light' : 'dark';
    this.scene.background = new THREE.Color(THEME[this.theme].background);
    this._buildContours();
    this._buildBase();
    this.minimap.update();
  }

  _buildContours() {
    if (this._contourObject) {
      this.scene.remove(this._contourObject);
      this._contourObject.geometry.dispose();
      this._contourObject.material.dispose();
      this._contourObject = null;
    }
    if (!this.contoursVisible || !this.grid) return;

    const segments = computeContourSegments(this.grid, this.contourLevelCount);
    if (segments.length === 0) return;

    // Nudged very slightly above the surface so the line doesn't sit
    // exactly level with -- and get hidden behind -- the points at that
    // same height; combined with depthTest:false below, this keeps the
    // lines visibly on top of the point cloud from any angle instead of
    // getting lost in it.
    const zEpsilon = this.bounds.sizeZ * 0.004;
    const positions = new Float32Array(segments.length * 6);
    segments.forEach((seg, i) => {
      const offset = i * 6;
      positions[offset] = seg.p1[0];
      positions[offset + 1] = seg.p1[1];
      positions[offset + 2] = seg.p1[2] + zEpsilon;
      positions[offset + 3] = seg.p2[0];
      positions[offset + 4] = seg.p2[1];
      positions[offset + 5] = seg.p2[2] + zEpsilon;
    });

    const themeColors = THEME[this.theme];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({
      color: this.colorMode === 'greyscale' ? themeColors.contourGreyscale : themeColors.contourHeatmap,
      depthTest: false, // always draw on top of the point cloud, not buried inside it
    });
    this._contourObject = new THREE.LineSegments(geometry, material);
    this._contourObject.renderOrder = 1;
    this.scene.add(this._contourObject);
  }

  setContoursVisible(visible) {
    this.contoursVisible = visible;
    this._buildContours();
  }

  // More levels = more, closer-together lines -- useful for tracing detail
  // (like a carapace's curve) that only spans a small slice of the scan's
  // overall height range and would otherwise be under-represented.
  setContourLevelCount(count) {
    this.contourLevelCount = Math.round(clamp(count, 3, 80));
    this._buildContours();
  }

  // A flat reference grid sitting at the lowest point of the scan, so you
  // can tell which way is "down" and how the scan sits relative to a
  // level base while you're freely rotating around it.
  _buildBase() {
    if (this._baseObject) {
      this.scene.remove(this._baseObject);
      this._baseObject.geometry.dispose();
      this._baseObject.material.dispose();
      this._baseObject = null;
    }
    if (!this.baseVisible || !this.bounds) return;

    const b = this.bounds;
    const size = b.sizeMax * 1.2;
    const divisions = 20;
    const themeColors = THEME[this.theme];
    const grid = new THREE.GridHelper(size, divisions, themeColors.baseLine, themeColors.baseGrid);
    grid.material.transparent = true;
    grid.material.opacity = 0.5;
    // GridHelper lies flat in the X-Z plane (three.js's default "ground"),
    // so it needs a 90 degree turn to lie flat in our X-Y plane instead.
    grid.rotation.x = Math.PI / 2;
    grid.position.set(b.centerX, b.centerY, b.minZ);

    this._baseObject = grid;
    this.scene.add(this._baseObject);
  }

  setBaseVisible(visible) {
    this.baseVisible = visible;
    this._buildBase();
  }

  // ---- camera --------------------------------------------------------

  _fitCameraToBounds() {
    const { bounds, camera, controls } = this;
    const radius = Math.sqrt(bounds.sizeX ** 2 + bounds.sizeY ** 2 + bounds.sizeZ ** 2) / 2;
    const fovRad = (camera.fov * Math.PI) / 180;
    const distance = (radius / Math.sin(fovRad / 2)) * 1.15;
    this.fitDistance = distance;

    camera.up.set(0, 0, 1); // undo any Ctrl-drag roll -- Reset View means level again
    const dir = new THREE.Vector3(0.6, -0.85, 0.55).normalize();
    controls.target.set(bounds.centerX, bounds.centerY, bounds.centerZ);
    camera.position.copy(controls.target).addScaledVector(dir, distance);
    camera.near = Math.max(distance / 200, 0.01);
    camera.far = distance * 200;
    camera.updateProjectionMatrix();
    controls.update();
  }

  resetView() {
    if (this.bounds) this._fitCameraToBounds();
  }

  // ---- export ----------------------------------------------------------

  _makeOrthoCamera(view) {
    const b = this.bounds;
    const halfSizeMax = (b.sizeMax / 2 + 1) * 4; // generous placement distance
    let camera;

    if (view === 'top') {
      const halfX = (b.sizeX / 2) * MARGIN_FACTOR;
      const halfY = (b.sizeY / 2) * MARGIN_FACTOR;
      camera = new THREE.OrthographicCamera(-halfX, halfX, halfY, -halfY, 0.1, b.sizeZ * 4 + halfSizeMax * 2);
      camera.position.set(b.centerX, b.centerY, b.maxZ + halfSizeMax);
      camera.up.set(0, 1, 0);
    } else if (view === 'side') {
      const halfY = (b.sizeY / 2) * MARGIN_FACTOR;
      const halfZ = (b.sizeZ / 2) * MARGIN_FACTOR;
      camera = new THREE.OrthographicCamera(-halfY, halfY, halfZ, -halfZ, 0.1, b.sizeX * 4 + halfSizeMax * 2);
      camera.position.set(b.maxX + halfSizeMax, b.centerY, b.centerZ);
      camera.up.set(0, 0, 1);
    } else {
      // 'front'
      const halfX = (b.sizeX / 2) * MARGIN_FACTOR;
      const halfZ = (b.sizeZ / 2) * MARGIN_FACTOR;
      camera = new THREE.OrthographicCamera(-halfX, halfX, halfZ, -halfZ, 0.1, b.sizeY * 4 + halfSizeMax * 2);
      camera.position.set(b.centerX, b.minY - halfSizeMax, b.centerZ);
      camera.up.set(0, 0, 1);
    }
    camera.lookAt(b.centerX, b.centerY, b.centerZ);
    camera.updateProjectionMatrix();
    return camera;
  }

  // Renders the point cloud from the three fixed orthographic angles and
  // returns { top, side, front } as PNG data URLs. Runs fully synchronously
  // (no awaits) so the render loop's requestAnimationFrame can't sneak a
  // frame in between resizing the canvas and putting it back.
  exportViews() {
    if (!this.bounds) return null;

    const prevSize = new THREE.Vector2();
    this.renderer.getSize(prevSize);
    const prevPixelRatio = this.renderer.getPixelRatio();
    const prevBackground = this.scene.background;

    const exportDim = 1200;
    const images = {};

    this.renderer.setPixelRatio(1);
    this.scene.background = new THREE.Color(0xffffff);

    for (const view of ['top', 'side', 'front']) {
      const camera = this._makeOrthoCamera(view);
      const aspect = (camera.right - camera.left) / (camera.top - camera.bottom);
      const width = aspect >= 1 ? exportDim : Math.max(200, Math.round(exportDim * aspect));
      const height = aspect >= 1 ? Math.max(200, Math.round(exportDim / aspect)) : exportDim;

      this.renderer.setSize(width, height, false);
      this.renderer.render(this.scene, camera);
      images[view] = this.renderer.domElement.toDataURL('image/png');
    }

    this.scene.background = prevBackground;
    this.renderer.setPixelRatio(prevPixelRatio);
    this.renderer.setSize(prevSize.x, prevSize.y, false);
    this.camera.updateProjectionMatrix();

    return images;
  }
}
