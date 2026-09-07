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
  metadataBar: document.getElementById('metadataBar'),
  metadataGrid: document.getElementById('metadataGrid'),
  metadataToggleBtn: document.getElementById('metadataToggleBtn'),
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

function markActiveFile(path) {
  [...els.fileList.children].forEach((li) => {
    li.classList.toggle('active', li.dataset.path === path);
  });
}

function applyGrid(grid, displayName) {
  viewer.loadGrid(grid);
  currentFileName = displayName;
  setStatus(`Loaded ${displayName}\n${grid.z_grid.length} x ${grid.z_grid[0].length} grid`);
}

// ---- metadata bar (the JSON alongside a scan inside an archive) ---------

function formatMetadataLabel(key) {
  // "gps.lat" / "capture_time" / "deviceId" -> "Gps Lat" / "Capture Time" / "Device Id"
  const spaced = key
    .replace(/\./g, ' ')
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return spaced.replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatMetadataValue(value) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// Flattens exactly one level of nesting (a "gps": {"lat":.., "lon":..}
// object becomes "gps.lat" / "gps.lon" rows) -- deeper nesting or arrays
// just get stringified as a single value rather than flattened further,
// since we don't know the real shape of this data yet.
function flattenMetadata(metadata) {
  const rows = [];
  for (const [key, value] of Object.entries(metadata)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        rows.push([`${key}.${nestedKey}`, nestedValue]);
      }
    } else {
      rows.push([key, value]);
    }
  }
  return rows;
}

function renderMetadata(metadata) {
  els.metadataGrid.innerHTML = '';

  if (!metadata || Object.keys(metadata).length === 0) {
    els.metadataBar.hidden = true;
    return;
  }

  const rows = flattenMetadata(metadata);
  if (rows.length === 0) {
    els.metadataBar.hidden = true;
    return;
  }

  for (const [key, value] of rows) {
    const item = document.createElement('div');
    item.className = 'metadata-item';
    const label = document.createElement('div');
    label.className = 'metadata-label';
    label.textContent = formatMetadataLabel(key);
    const val = document.createElement('div');
    val.className = 'metadata-value';
    val.textContent = formatMetadataValue(value);
    val.title = val.textContent; // full value on hover, in case it's truncated
    item.appendChild(label);
    item.appendChild(val);
    els.metadataGrid.appendChild(item);
  }

  els.metadataBar.hidden = false;
}

els.metadataToggleBtn.addEventListener('click', () => {
  els.metadataBar.classList.toggle('collapsed');
});

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
    renderMetadata(null); // a loose CSV has no accompanying JSON
    markActiveFile(path);
  } catch (err) {
    setStatus(`Couldn't load ${displayName}: ${err}`, true);
  }
}

// ---- loading: archive (Browse File / Browse Folder, a .zip entry) -------

async function loadFromArchive(path, displayName) {
  if (!hasNativeApi()) {
    setStatus('Browse is only available in the desktop app.', true);
    return;
  }
  setStatus(`Extracting ${displayName}…`);
  try {
    const result = await window.pywebview.api.load_archive(path);
    applyGrid(result.grid, displayName);
    renderMetadata(result.metadata);
    markActiveFile(path);
    if (result.extracted_files) {
      // No .json found -- show what actually got extracted instead of
      // just silently having no metadata, so this is easy to report back.
      setStatus(
        `${els.status.textContent}\nNo .json found. Archive contains:\n${result.extracted_files.join('\n')}`
      );
    } else if (result.metadata_error) {
      // Found the .json but couldn't parse it -- show the real reason.
      setStatus(`${els.status.textContent}\nMetadata error: ${result.metadata_error}`, true);
    }
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
    renderMetadata(null); // a loose CSV has no accompanying JSON
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
    const name = path.split(/[\\/]/).pop();
    if (path.toLowerCase().endsWith('.zip')) {
      loadFromArchive(path, name);
    } else {
      loadFromPath(path, name);
    }
  }
});

els.browseFolderBtn.addEventListener('click', async () => {
  if (!hasNativeApi()) {
    setStatus('Browse is only available in the desktop app.', true);
    return;
  }
  const entries = await window.pywebview.api.pick_folder();
  if (!entries || entries.length === 0) {
    if (entries) setStatus('No .csv or .zip files found in that folder.', true);
    return;
  }
  els.fileList.innerHTML = '';
  entries.forEach((entry) => {
    const li = document.createElement('li');
    const badge = document.createElement('span');
    badge.className = `file-kind-badge ${entry.kind}`;
    badge.textContent = entry.kind === 'archive' ? 'ZIP' : 'CSV';
    const name = document.createElement('span');
    name.className = 'file-name';
    name.textContent = entry.name;
    li.appendChild(badge);
    li.appendChild(name);
    li.dataset.path = entry.path;
    li.addEventListener('click', () => {
      if (entry.kind === 'archive') {
        loadFromArchive(entry.path, entry.name);
      } else {
        loadFromPath(entry.path, entry.name);
      }
    });
    els.fileList.appendChild(li);
  });
  els.fileListWrap.hidden = false;
  setStatus(`Found ${entries.length} file${entries.length === 1 ? '' : 's'}. Pick one to view.`);
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
