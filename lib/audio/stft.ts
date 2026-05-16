/**
 * Short-Time Fourier Transform — magnitude spectrogram via Meyda.
 *
 * Per SPEC ("직접 FFT 구현 대신 Meyda + Pitchy 조합") the FFT itself is never
 * hand-rolled: each frame's amplitude spectrum is produced by Meyda's offline
 * `extract()` API. Window = 1024 samples (64 ms @ 16 kHz, Hann), hop = 160
 * samples (10 ms).
 */
import Meyda from 'meyda';

/** Loosely-typed view of Meyda's static offline API (typings vary by version). */
interface MeydaStatic {
  sampleRate: number;
  bufferSize: number;
  windowingFunction: string;
  extract: (
    features: string[],
    signal: Float32Array,
  ) => Record<string, unknown> | null;
}
const M = Meyda as unknown as MeydaStatic;

export const FFT_SIZE = 1024;
export const HOP = 160;

export interface Spectrogram {
  /** amplitude spectrum per frame; each Float32Array has `nFreq` bins. */
  frames: Float32Array[];
  /** frame center times in seconds. */
  times: Float32Array;
  /** number of frequency bins = fftSize / 2. */
  nFreq: number;
  fftSize: number;
  /** hop between frames in seconds. */
  hopSec: number;
  /** analysis window length in seconds. */
  winSec: number;
  sampleRate: number;
}

/** Amplitude spectrum of one frame via Meyda (FFT performed inside Meyda). */
function meydaAmplitude(buf: Float32Array, sampleRate: number): Float32Array {
  M.sampleRate = sampleRate;
  M.bufferSize = FFT_SIZE;
  M.windowingFunction = 'hanning';
  const res = M.extract(['amplitudeSpectrum'], buf);
  const amp = res?.['amplitudeSpectrum'] as
    | Float32Array
    | number[]
    | undefined;
  if (!amp) return new Float32Array(FFT_SIZE / 2);
  return amp instanceof Float32Array ? amp : Float32Array.from(amp);
}

/** Compute the magnitude spectrogram of mono samples. */
export function computeSTFT(
  samples: Float32Array,
  sampleRate: number,
): Spectrogram {
  const nFreq = FFT_SIZE / 2;
  const frames: Float32Array[] = [];
  const times: number[] = [];
  const buf = new Float32Array(FFT_SIZE);

  const lastStart = samples.length - FFT_SIZE;
  const limit = Math.max(0, lastStart);
  for (let start = 0; start <= limit; start += HOP) {
    buf.fill(0);
    const n = Math.min(FFT_SIZE, samples.length - start);
    for (let i = 0; i < n; i++) buf[i] = samples[start + i];
    // copy out: Meyda may reuse its internal buffers across calls
    frames.push(Float32Array.from(meydaAmplitude(buf, sampleRate)));
    times.push((start + FFT_SIZE / 2) / sampleRate);
    if (lastStart < 0) break;
  }

  return {
    frames,
    times: Float32Array.from(times),
    nFreq,
    fftSize: FFT_SIZE,
    hopSec: HOP / sampleRate,
    winSec: FFT_SIZE / sampleRate,
    sampleRate,
  };
}

/** Index of the first frame whose center time is >= t (clamped to range). */
export function frameIndexAtTime(spec: Spectrogram, t: number): number {
  const times = spec.times;
  if (times.length === 0) return 0;
  let lo = 0;
  let hi = times.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
