/**
 * Acoustic analysis orchestrator: turns 16 kHz mono samples into a frame-by
 * -frame feature time series (F0, F1-F3, voicing) plus the magnitude
 * spectrogram. SPEC §4.1 step 5.
 */
import type { FrameFeat } from '../types';
import { computeSTFT, type Spectrogram } from './stft';
import { computeFormants } from './formants';
import { computePitch } from './pitch';

export interface AudioAnalysis {
  spectrogram: Spectrogram;
  /** per-frame feature vectors, aligned 1:1 with `spectrogram.times`. */
  series: FrameFeat[];
  duration: number;
}

/** Median filter a numeric track with a small odd window (jitter reduction). */
function medianFilter(values: number[], window: number): number[] {
  const half = window >> 1;
  const out = new Array<number>(values.length);
  for (let i = 0; i < values.length; i++) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(values.length - 1, i + half);
    const slice = values.slice(lo, hi + 1).sort((a, b) => a - b);
    out[i] = slice[slice.length >> 1];
  }
  return out;
}

/** Run the full STFT + formant + pitch analysis on one audio clip. */
export function analyzeAudio(
  samples: Float32Array,
  sampleRate: number,
): AudioAnalysis {
  const spectrogram = computeSTFT(samples, sampleRate);
  const { times } = spectrogram;

  const formants = computeFormants(spectrogram);
  const pitch = computePitch(samples, sampleRate, times);

  // smooth formant tracks to suppress per-frame peak-picking jitter
  const f1 = medianFilter(formants.map((f) => f.f1), 5);
  const f2 = medianFilter(formants.map((f) => f.f2), 5);
  const f3 = medianFilter(formants.map((f) => f.f3), 5);

  const series: FrameFeat[] = times.length
    ? Array.from(times, (t, i) => ({
        t,
        f0: pitch[i]?.f0 ?? 0,
        f1: f1[i] ?? 0,
        f2: f2[i] ?? 0,
        f3: f3[i] ?? 0,
        voicing: pitch[i]?.voicing ?? 0,
      }))
    : [];

  return {
    spectrogram,
    series,
    duration: samples.length / sampleRate,
  };
}
