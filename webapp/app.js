import { PointCloudViewer } from './viewer.js';

// Applied as early as possible (before the viewer/scene are created) so
// there's no flash of the wrong theme, and so the very first render uses
// the right scene background.
const THEME_STORAGE_KEY = 'pcv-theme';
const initialTheme = localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
document.documentElement.dataset.theme = initialTheme;

const els = {
  dropzone: document.getElementById('dropzone'),
  themeToggleBtn: document.getElementById('themeToggleBtn'),
  browseFileBtn: document.getElementById('browseFileBtn'),
  browseFolderBtn: document.getElementById('browseFolderBtn'),
  fileListWrap: document.getElementById('fileListWrap'),
  fileList: document.getElementById('fileList'),
  controls: document.getElementById('controls'),
  heatmapModeBtn: document.getElementById('heatmapModeBtn'),
  greyscaleModeBtn: document.getElementById('greyscaleModeBtn'),
  contoursToggle: document.getElementById('contoursToggle'),
  contourDensitySlider: document.getElementById('contourDensitySlider'),
  contourDensityValue: document.getElementById('contourDensityValue'),
  baseToggle: document.getElementById('baseToggle'),
  resetViewBtn: document.getElementById('resetViewBtn'),
  exportPngBtn: document.getElementById('exportPngBtn'),
  exportPdfBtn: document.getElementById('exportPdfBtn'),
  status: document.getElementById('status'),
  scene: document.getElementById('scene'),
  minimap: document.getElementById('minimap'),
  hTrack: document.getElementById('hScrollTrack'),
  hThumb: document.getElementById('hScrollThumb'),
  vTrack: document.getElementById('vScrollTrack'),
  vThumb: document.getElementById('vScrollThumb'),
};

const viewer = new PointCloudViewer(els.scene, els.minimap, {
  hTrack: els.hTrack,
  hThumb: els.hThumb,
  vTrack: els.vTrack,
  vThumb: els.vThumb,
});

// ---- light / dark mode ---

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  viewer.setTheme(theme);
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

applyTheme(initialTheme);

els.themeToggleBtn.addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
});

let currentFileName = null;

function setStatus(text, isError = false) {
  els.status.textContent = text;
  els.status.classList.toggle('error', isError);
}

function hasNativeApi() {
  return Boolean(window.pywebview && window.pywebview.api);
}

function showControls(visible) {
  els.controls.hidden = !visible;
}

function markActiveFile(path) {
  [...els.fileList.children].forEach((li) => {
    li.classList.toggle('active', li.dataset.path === path);
  });
}

function applyGrid(grid, displayName) {
  viewer.loadGrid(grid);
  currentFileName = displayName;
  showControls(true);
  setStatus(`Loaded ${displayName}\n${grid.z_grid.length} x ${grid.z_grid[0].length} grid`);
}

// ---- loading: native path (Browse File / Browse Folder) -----------------

async function loadFromPath(path, displayName) {
  if (!hasNativeApi()) {
    setStatus('Browse is only available in the desktop app.', true);
    return;
  }
  setStatus(`Loading ${displayName}…`);
  try {
    const grid = await window.pywebview.api.load_path(path);
    applyGrid(grid, displayName);
    markActiveFile(path);
  } catch (err) {
    setStatus(`Couldn't load ${displayName}: ${err}`, true);
  }
}

// Fallback-only grid parser used when there's no pywebview backend to hand
// the CSV text to (e.g. this page opened directly in a plain browser for
// testing). The real app always goes through Api.load_csv_text in Python
// instead, which is the version that matters for the packaged app.
function parseGridCsvClientSide(text) {
  const lines = text.replace(/^﻿/, '').split(/\r\n|\n/).filter((l) => l.length > 0);
  const header = lines[0].split(',');
  const xCoords = header.slice(1).map(Number);
  const yCoords = [];
  const zGrid = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',');
    yCoords.push(Number(cells[0]));
    const row = [];
    for (let c = 0; c < xCoords.length; c++) {
      const raw = cells[c + 1];
      row.push(raw === undefined || raw.trim() === '' ? null : Number(raw));
    }
    zGrid.push(row);
  }
  return { x_coords: xCoords, y_coords: yCoords, z_grid: zGrid };
}

// ---- loading: drag-and-drop (reads file contents directly in-browser) ---

async function loadFromDroppedFile(file) {
  if (!file.name.toLowerCase().endsWith('.csv')) {
    setStatus(`"${file.name}" isn't a .csv file.`, true);
    return;
  }
  setStatus(`Loading ${file.name}…`);
  try {
    const text = await file.text();
    const grid = hasNativeApi()
      ? await window.pywebview.api.load_csv_text(text, file.name)
      : parseGridCsvClientSide(text);
    applyGrid(grid, file.name);
    els.fileListWrap.hidden = true;
  } catch (err) {
    setStatus(`Couldn't load ${file.name}: ${err}`, true);
  }
}

// ---- drag and drop wiring ---

['dragenter', 'dragover'].forEach((eventName) => {
  els.dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.dropzone.classList.add('dragover');
  });
});

['dragleave', 'dragend'].forEach((eventName) => {
  els.dropzone.addEventListener(eventName, () => {
    els.dropzone.classList.remove('dragover');
  });
});

els.dropzone.addEventListener('drop', (event) => {
  event.preventDefault();
  els.dropzone.classList.remove('dragover');
  const file = event.dataTransfer.files && event.dataTransfer.files[0];
  if (!file) return;
  loadFromDroppedFile(file);
});

// ---- browse buttons ---

els.browseFileBtn.addEventListener('click', async () => {
  if (!hasNativeApi()) {
    setStatus('Browse is only available in the desktop app.', true);
    return;
  }
  const path = await window.pywebview.api.pick_file();
  if (path) {
    els.fileListWrap.hidden = true;
    loadFromPath(path, path.split(/[\\/]/).pop());
  }
});

els.browseFolderBtn.addEventListener('click', async () => {
  if (!hasNativeApi()) {
    setStatus('Browse is only available in the desktop app.', true);
    return;
  }
  const entries = await window.pywebview.api.pick_folder();
  if (!entries || entries.length === 0) {
    if (entries) setStatus('No .csv files found in that folder.', true);
    return;
  }
  els.fileList.innerHTML = '';
  entries.forEach((entry) => {
    const li = document.createElement('li');
    li.textContent = entry.name;
    li.dataset.path = entry.path;
    li.addEventListener('click', () => loadFromPath(entry.path, entry.name));
    els.fileList.appendChild(li);
  });
  els.fileListWrap.hidden = false;
  setStatus(`Found ${entries.length} CSV file${entries.length === 1 ? '' : 's'}. Pick one to view.`);
});

// ---- colour mode + contours ---

function setColorMode(mode) {
  viewer.setColorMode(mode);
  els.heatmapModeBtn.classList.toggle('active', mode === 'heatmap');
  els.greyscaleModeBtn.classList.toggle('active', mode === 'greyscale');
}

els.heatmapModeBtn.addEventListener('click', () => setColorMode('heatmap'));
els.greyscaleModeBtn.addEventListener('click', () => setColorMode('greyscale'));

els.contoursToggle.addEventListener('change', () => {
  viewer.setContoursVisible(els.contoursToggle.checked);
});

els.contourDensitySlider.addEventListener('input', () => {
  const count = Number(els.contourDensitySlider.value);
  els.contourDensityValue.textContent = `${count} lines`;
  viewer.setContourLevelCount(count);
});

els.baseToggle.addEventListener('change', () => {
  viewer.setBaseVisible(els.baseToggle.checked);
});

els.resetViewBtn.addEventListener('click', () => viewer.resetView());

// ---- export ---

function suggestedBaseName() {
  const stem = (currentFileName || 'pointcloud').replace(/\.csv$/i, '');
  return stem;
}

async function handleExport(format) {
  const images = viewer.exportViews();
  if (!images) {
    setStatus('Load a CSV before exporting.', true);
    return;
  }
  if (!hasNativeApi()) {
    // Browser-preview fallback: trigger plain downloads of the PNGs so the
    // export path can still be exercised without the desktop app's native
    // save dialog.
    Object.entries(images).forEach(([view, dataUrl]) => {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${suggestedBaseName()}_${view}.png`;
      a.click();
    });
    return;
  }
  setStatus(`Exporting ${format.toUpperCase()}…`);
  try {
    const result = await window.pywebview.api.export_views({
      format,
      images,
      base_name: suggestedBaseName(),
    });
    setStatus(result && result.cancelled ? 'Export cancelled.' : `Exported ${format.toUpperCase()}.`);
  } catch (err) {
    setStatus(`Export failed: ${err}`, true);
  }
}

els.exportPngBtn.addEventListener('click', () => handleExport('png'));
els.exportPdfBtn.addEventListener('click', () => handleExport('pdf'));

if (!hasNativeApi()) {
  setStatus('Drop a CSV file, or browse for one.\n(Running without the desktop backend — Browse/Export are limited.)');
}
