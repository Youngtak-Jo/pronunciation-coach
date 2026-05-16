/**
 * Perceptual colormaps for canvas heatmaps.
 * viridis -> Spectrogram panel, plasma -> DTW cost-matrix panel (SPEC §7).
 */

type RGB = [number, number, number];

const VIRIDIS: RGB[] = [
  [68, 1, 84],
  [72, 40, 120],
  [62, 74, 137],
  [49, 104, 142],
  [38, 130, 142],
  [31, 158, 137],
  [53, 183, 121],
  [110, 206, 88],
  [181, 222, 43],
  [253, 231, 37],
];

const PLASMA: RGB[] = [
  [13, 8, 135],
  [75, 3, 161],
  [125, 3, 168],
  [168, 34, 150],
  [203, 70, 121],
  [229, 107, 93],
  [248, 148, 65],
  [253, 195, 40],
  [240, 249, 33],
  [240, 249, 33],
];

function sample(stops: RGB[], t: number): RGB {
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = stops[i];
  const b = stops[Math.min(stops.length - 1, i + 1)];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

/** viridis color as `rgb(...)` for value t in [0,1]. */
export function viridis(t: number): string {
  const [r, g, b] = sample(VIRIDIS, t);
  return `rgb(${r},${g},${b})`;
}

/** plasma color as `rgb(...)` for value t in [0,1]. */
export function plasma(t: number): string {
  const [r, g, b] = sample(PLASMA, t);
  return `rgb(${r},${g},${b})`;
}

/** viridis color as `[r,g,b]` for direct ImageData writes. */
export function viridisRGB(t: number): RGB {
  return sample(VIRIDIS, t);
}

/** plasma color as `[r,g,b]` for direct ImageData writes. */
export function plasmaRGB(t: number): RGB {
  return sample(PLASMA, t);
}
