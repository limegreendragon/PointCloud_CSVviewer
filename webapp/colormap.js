// Colour ramps used to paint the point cloud. Both take a single number
// `t` normalised to 0..1 (0 = lowest Z in the file, 1 = highest) and return
// an [r, g, b] triple in the 0..1 range that three.js expects.

// A handful of hand-picked stops running blue -> cyan -> green -> yellow ->
// red, which reads as a fairly standard "heatmap" colour scheme.
const HEATMAP_STOPS = [
  [0.00, [0.05, 0.05, 0.30]],
  [0.25, [0.00, 0.55, 0.85]],
  [0.50, [0.10, 0.75, 0.30]],
  [0.75, [0.95, 0.80, 0.10]],
  [1.00, [0.85, 0.10, 0.10]],
];

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function heatmapColor(t) {
  t = Math.min(1, Math.max(0, t));
  for (let i = 0; i < HEATMAP_STOPS.length - 1; i++) {
    const [t0, c0] = HEATMAP_STOPS[i];
    const [t1, c1] = HEATMAP_STOPS[i + 1];
    if (t >= t0 && t <= t1) {
      const localT = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
      return [
        lerp(c0[0], c1[0], localT),
        lerp(c0[1], c1[1], localT),
        lerp(c0[2], c1[2], localT),
      ];
    }
  }
  return HEATMAP_STOPS[HEATMAP_STOPS.length - 1][1];
}

export function greyscaleColor(t) {
  t = Math.min(1, Math.max(0, t));
  // Keep it out of pure black/white so points and contour lines both stay
  // visible against the scene background.
  const v = lerp(0.12, 0.95, t);
  return [v, v, v];
}

export function colorForMode(mode, t) {
  return mode === 'greyscale' ? greyscaleColor(t) : heatmapColor(t);
}
