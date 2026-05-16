/**
 * Hybrid Segmented DTW + bidirectional TimeMap — SPEC §4.2.
 *
 * Running one global DTW over a whole utterance blurs word boundaries, so
 * instead each matched word pair gets its own local DTW (cosine distance,
 * Sakoe-Chiba band); the sampled warping paths are stitched, with explicit
 * word-boundary anchors, into a single monotone target<->attempt TimeMap.
 */
import type { Spectrogram } from './audio/stft';
import type { DtwSegment, TimeMapPoint } from './types';

/** cosine distance between two amplitude spectra (0 = identical). */
function cosineDistance(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 1;
  const cos = dot / (Math.sqrt(na) * Math.sqrt(nb));
  return 1 - Math.max(-1, Math.min(1, cos));
}

export interface LocalDtw {
  /** local cosine-distance cost matrix; out-of-band cells are NaN. */
  matrix: number[][];
  /** optimal warping path, [targetIdx, attemptIdx] pairs (ascending). */
  path: Array<[number, number]>;
  /** path-length-normalized total cost. */
  cost: number;
  /** Sakoe-Chiba band half-width actually used (cells). */
  band: number;
}

/**
 * Local DTW between two frame sequences with a Sakoe-Chiba band.
 * `bandFrac` is the band half-width as a fraction of the longer sequence.
 */
export function localDTW(
  a: Float32Array[],
  b: Float32Array[],
  bandFrac = 0.2,
): LocalDtw {
  const n = a.length;
  const m = b.length;
  const band = Math.max(2, Math.round(bandFrac * Math.max(n, m)));

  // local[i][j] = per-cell cosine distance (the heatmap); NaN outside band
  const local: number[][] = Array.from({ length: n }, () =>
    new Array<number>(m).fill(NaN),
  );
  // acc[i][j] = accumulated cost, used only for path backtracking
  const acc: number[][] = Array.from({ length: n }, () =>
    new Array<number>(m).fill(NaN),
  );

  const jCenter = (i: number) => (n === 1 ? 0 : (i * (m - 1)) / (n - 1));

  for (let i = 0; i < n; i++) {
    const c = jCenter(i);
    const jLo = Math.max(0, Math.floor(c - band));
    const jHi = Math.min(m - 1, Math.ceil(c + band));
    for (let j = jLo; j <= jHi; j++) {
      const d = cosineDistance(a[i], b[j]);
      local[i][j] = d;
      if (i === 0 && j === 0) {
        acc[i][j] = d;
        continue;
      }
      let best = Infinity;
      if (i > 0 && j > 0 && Number.isFinite(acc[i - 1][j - 1])) {
        best = Math.min(best, acc[i - 1][j - 1]);
      }
      if (i > 0 && Number.isFinite(acc[i - 1][j])) {
        best = Math.min(best, acc[i - 1][j]);
      }
      if (j > 0 && Number.isFinite(acc[i][j - 1])) {
        best = Math.min(best, acc[i][j - 1]);
      }
      acc[i][j] = d + (Number.isFinite(best) ? best : 0);
    }
  }

  // backtrack the optimal warping path from the end corner
  const path: Array<[number, number]> = [];
  let i = n - 1;
  let j = m - 1;
  path.push([i, j]);
  let guard = 0;
  while ((i > 0 || j > 0) && guard++ < n + m + 4) {
    const candidates: Array<[number, number]> = [];
    if (i > 0 && j > 0) candidates.push([i - 1, j - 1]);
    if (i > 0) candidates.push([i - 1, j]);
    if (j > 0) candidates.push([i, j - 1]);
    let bi = candidates[0][0];
    let bj = candidates[0][1];
    let bv = Infinity;
    for (const [ci, cj] of candidates) {
      const v = acc[ci][cj];
      if (Number.isFinite(v) && v < bv) {
        bv = v;
        bi = ci;
        bj = cj;
      }
    }
    i = bi;
    j = bj;
    path.push([i, j]);
  }
  path.reverse();

  const total = Number.isFinite(acc[n - 1][m - 1]) ? acc[n - 1][m - 1] : 0;
  return { matrix: local, path, cost: total / Math.max(1, path.length), band };
}

/** Evenly downsample a frame sequence to at most `maxLen` frames. */
function downsample(
  frames: Float32Array[],
  times: number[],
  maxLen: number,
): { frames: Float32Array[]; times: number[] } {
  if (frames.length <= maxLen) return { frames, times };
  const outF: Float32Array[] = [];
  const outT: number[] = [];
  for (let k = 0; k < maxLen; k++) {
    const idx = Math.round((k * (frames.length - 1)) / (maxLen - 1));
    outF.push(frames[idx]);
    outT.push(times[idx]);
  }
  return { frames: outF, times: outT };
}

/** Frames of `spec` whose center time falls within [start, end]. */
function sliceSpec(
  spec: Spectrogram,
  start: number,
  end: number,
): { frames: Float32Array[]; times: number[] } {
  const frames: Float32Array[] = [];
  const times: number[] = [];
  for (let i = 0; i < spec.times.length; i++) {
    const t = spec.times[i];
    if (t >= start && t <= end) {
      frames.push(spec.frames[i]);
      times.push(t);
    }
  }
  return { frames, times };
}

export interface WordPair {
  word: string;
  tStart: number;
  tEnd: number;
  aStart: number;
  aEnd: number;
}

export interface HybridDtwOutput {
  timeMap: TimeMapPoint[];
  segments: DtwSegment[];
}

/** Number of warping-path samples taken per word segment. */
const PATH_SAMPLES = 10;
const MAX_SEG_FRAMES = 100;

/**
 * Build the global TimeMap by stitching per-word local DTW paths together
 * with word-boundary anchors (SPEC §4.2).
 */
export function buildHybridDTW(
  targetSpec: Spectrogram,
  attemptSpec: Spectrogram,
  pairs: WordPair[],
  targetDuration: number,
  attemptDuration: number,
): HybridDtwOutput {
  const raw: TimeMapPoint[] = [{ targetTime: 0, attemptTime: 0 }];
  const segments: DtwSegment[] = [];

  for (const p of pairs) {
    raw.push({ targetTime: p.tStart, attemptTime: p.aStart });

    const subT = sliceSpec(targetSpec, p.tStart, p.tEnd);
    const subA = sliceSpec(attemptSpec, p.aStart, p.aEnd);

    if (subT.frames.length >= 2 && subA.frames.length >= 2) {
      const dsT = downsample(subT.frames, subT.times, MAX_SEG_FRAMES);
      const dsA = downsample(subA.frames, subA.times, MAX_SEG_FRAMES);
      const dtw = localDTW(dsT.frames, dsA.frames, 0.2);

      segments.push({
        word: p.word,
        tStart: p.tStart,
        tEnd: p.tEnd,
        aStart: p.aStart,
        aEnd: p.aEnd,
        matrix: dtw.matrix,
        path: dtw.path,
        band: dtw.band,
      });

      const step = Math.max(1, Math.floor(dtw.path.length / PATH_SAMPLES));
      for (let k = 0; k < dtw.path.length; k += step) {
        const [pi, pj] = dtw.path[k];
        raw.push({
          targetTime: dsT.times[pi],
          attemptTime: dsA.times[pj],
        });
      }
    }

    raw.push({ targetTime: p.tEnd, attemptTime: p.aEnd });
  }

  raw.push({ targetTime: targetDuration, attemptTime: attemptDuration });

  // sort by target time, then enforce strict monotonicity in both axes
  raw.sort((x, y) => x.targetTime - y.targetTime);
  const timeMap: TimeMapPoint[] = [];
  for (const pt of raw) {
    const prev = timeMap[timeMap.length - 1];
    if (!prev) {
      timeMap.push({ ...pt });
      continue;
    }
    if (pt.targetTime <= prev.targetTime + 1e-4) continue;
    timeMap.push({
      targetTime: pt.targetTime,
      attemptTime: Math.max(prev.attemptTime, pt.attemptTime),
    });
  }
  if (timeMap.length < 2) {
    timeMap.length = 0;
    timeMap.push({ targetTime: 0, attemptTime: 0 });
    timeMap.push({
      targetTime: Math.max(targetDuration, 0.01),
      attemptTime: Math.max(attemptDuration, 0.01),
    });
  }

  return { timeMap, segments };
}

/** Binary search: largest index with `key(arr[i]) <= x`. */
function lowerIndex(
  map: TimeMapPoint[],
  x: number,
  key: (p: TimeMapPoint) => number,
): number {
  let lo = 0;
  let hi = map.length - 1;
  if (x <= key(map[0])) return 0;
  if (x >= key(map[hi])) return hi - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (key(map[mid]) <= x) lo = mid;
    else hi = mid - 1;
  }
  return Math.min(lo, map.length - 2);
}

/** Map a target time to the corresponding attempt time (interpolated). */
export function lookupTimeMap(map: TimeMapPoint[], t: number): number {
  if (map.length === 0) return t;
  if (map.length === 1) return map[0].attemptTime;
  const i = lowerIndex(map, t, (p) => p.targetTime);
  const a = map[i];
  const b = map[i + 1];
  const span = b.targetTime - a.targetTime;
  const frac = span > 1e-9 ? (t - a.targetTime) / span : 0;
  return a.attemptTime + frac * (b.attemptTime - a.attemptTime);
}

/** Map an attempt time back to the corresponding target time (interpolated). */
export function lookupTargetTime(map: TimeMapPoint[], t: number): number {
  if (map.length === 0) return t;
  if (map.length === 1) return map[0].targetTime;
  const i = lowerIndex(map, t, (p) => p.attemptTime);
  const a = map[i];
  const b = map[i + 1];
  const span = b.attemptTime - a.attemptTime;
  const frac = span > 1e-9 ? (t - a.attemptTime) / span : 0;
  return a.targetTime + frac * (b.targetTime - a.targetTime);
}
