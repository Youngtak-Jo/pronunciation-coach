/**
 * Formant estimation (F1/F2/F3) by spectral-envelope peak picking.
 *
 * SPEC: "LPC 포먼트는 spectral envelope peak picking으로 충분." The amplitude
 * spectrum already comes from Meyda (see stft.ts); here it is converted to dB,
 * tilt-compensated, smoothed with a moving average (the spectral envelope) and
 * the three lowest envelope peaks are taken as F1/F2/F3. No FFT is performed.
 */
import type { Spectrogram } from './stft';

export interface FormantFrame {
  f1: number;
  f2: number;
  f3: number;
}

/** Plausible formant search ranges (Hz). */
const F1_RANGE: [number, number] = [200, 1100];
const F2_RANGE: [number, number] = [700, 3000];
const F3_RANGE: [number, number] = [1700, 4050];
const DEFAULTS: FormantFrame = { f1: 500, f2: 1500, f3: 2600 };

const MAX_FREQ = 4500; // search ceiling
const SMOOTH_RADIUS = 5; // moving-average half-window (bins)
const TILT = 0.0035; // dB per Hz — mild high-frequency emphasis

/** A spectral-envelope peak: interpolated frequency (Hz) + dB magnitude. */
interface Peak {
  freq: number;
  mag: number;
}

/** Find F1/F2/F3 for a single amplitude-spectrum frame. */
function pickFormants(mag: Float32Array, binHz: number): FormantFrame {
  const maxBin = Math.min(mag.length - 2, Math.floor(MAX_FREQ / binHz));
  if (maxBin < 4) return { ...DEFAULTS };

  // log-magnitude with high-frequency tilt compensation
  const db = new Float32Array(maxBin + 1);
  for (let k = 0; k <= maxBin; k++) {
    db[k] = 20 * Math.log10(mag[k] + 1e-6) + k * binHz * TILT;
  }

  // moving-average smoothing -> spectral envelope
  const env = new Float32Array(maxBin + 1);
  for (let k = 0; k <= maxBin; k++) {
    let sum = 0;
    let cnt = 0;
    for (let j = k - SMOOTH_RADIUS; j <= k + SMOOTH_RADIUS; j++) {
      if (j >= 0 && j <= maxBin) {
        sum += db[j];
        cnt++;
      }
    }
    env[k] = sum / cnt;
  }

  // local maxima, with parabolic interpolation for sub-bin frequency
  const peaks: Peak[] = [];
  for (let k = 1; k < maxBin; k++) {
    if (env[k] > env[k - 1] && env[k] >= env[k + 1]) {
      const denom = env[k - 1] - 2 * env[k] + env[k + 1];
      const delta = denom !== 0 ? (0.5 * (env[k - 1] - env[k + 1])) / denom : 0;
      peaks.push({ freq: (k + delta) * binHz, mag: env[k] });
    }
  }
  peaks.sort((a, b) => a.freq - b.freq);

  const inRange = (f: number, r: [number, number]) => f >= r[0] && f <= r[1];

  const f1 = peaks.find((p) => inRange(p.freq, F1_RANGE))?.freq ?? DEFAULTS.f1;
  const f2 =
    peaks.find((p) => p.freq > f1 + 200 && inRange(p.freq, F2_RANGE))?.freq ??
    Math.max(DEFAULTS.f2, f1 + 300);
  const f3 =
    peaks.find((p) => p.freq > f2 + 250 && inRange(p.freq, F3_RANGE))?.freq ??
    Math.max(DEFAULTS.f3, f2 + 350);

  return {
    f1: Math.round(f1),
    f2: Math.round(Math.max(f2, f1 + 200)),
    f3: Math.round(Math.max(f3, f2 + 250)),
  };
}

/**
 * Estimate formants for every frame of a precomputed magnitude spectrogram.
 * Reuses the Meyda spectra so no extra transform is needed.
 */
export function computeFormants(spec: Spectrogram): FormantFrame[] {
  const binHz = spec.sampleRate / spec.fftSize;
  return spec.frames.map((frame) => pickFormants(frame, binHz));
}
