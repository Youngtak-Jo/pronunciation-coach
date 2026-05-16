/**
 * Fundamental frequency (F0) + voicing confidence via Pitchy (McLeod pitch
 * method). One estimate per STFT hop frame, evaluated on a window centered on
 * the frame so it stays time-aligned with the spectrogram / formant tracks.
 */
import { PitchDetector } from 'pitchy';

export interface PitchFrame {
  f0: number; // Hz, 0 when unvoiced
  voicing: number; // clarity 0..1
}

const PITCH_WIN = 1024; // power of two; ~64 ms at 16 kHz
const MIN_F0 = 70;
const MAX_F0 = 450;

/** Estimate F0 + voicing for every frame center time in `times`. */
export function computePitch(
  samples: Float32Array,
  sampleRate: number,
  times: Float32Array,
): PitchFrame[] {
  const detector = PitchDetector.forFloat32Array(PITCH_WIN);
  // pitchy requires (0, 1]; use a tiny value so we effectively threshold ourselves below.
  detector.clarityThreshold = Number.EPSILON;
  const buf = new Float32Array(PITCH_WIN);
  const out: PitchFrame[] = [];

  for (let fi = 0; fi < times.length; fi++) {
    const center = Math.round(times[fi] * sampleRate);
    const start = center - PITCH_WIN / 2;
    buf.fill(0);
    for (let i = 0; i < PITCH_WIN; i++) {
      const idx = start + i;
      buf[i] = idx >= 0 && idx < samples.length ? samples[idx] : 0;
    }
    const [pitch, clarity] = detector.findPitch(buf, sampleRate);
    const voiced = clarity > 0.55 && pitch >= MIN_F0 && pitch <= MAX_F0;
    out.push({
      f0: voiced ? pitch : 0,
      voicing: Math.max(0, Math.min(1, clarity)),
    });
  }

  return out;
}
