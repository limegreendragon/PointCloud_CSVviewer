// Colours for everything in the 3D scene that isn't the data itself
// (background, contour lines, the base grid, the minimap) -- these live
// outside the DOM, so they can't come from style.css's CSS variables the
// way the rest of the UI's light/dark theming does. Point cloud colours
// (heatmap/greyscale) are deliberately NOT here: they represent data, so
// they stay the same regardless of theme.
export const THEME = {
  dark: {
    background: 0x11151c,
    contourHeatmap: 0xffffff,
    contourGreyscale: 0xff8a3d,
    baseLine: 0x5a6a8a,
    baseGrid: 0x394158,
    minimapFill: 'rgba(15, 18, 26, 0.85)',
    minimapDot: 'rgba(120, 170, 255, 0.55)',
    minimapViewport: '#ffb454',
  },
  light: {
    background: 0xeef1f7,
    contourHeatmap: 0x1b2130,
    contourGreyscale: 0xc8571a,
    baseLine: 0x9aa3b8,
    baseGrid: 0xccd2e0,
    minimapFill: 'rgba(255, 255, 255, 0.9)',
    minimapDot: 'rgba(47, 111, 237, 0.55)',
    minimapViewport: '#c8571a',
  },
};
