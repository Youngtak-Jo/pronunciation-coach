'use client';

/**
 * Audio decoding, resampling and WAV (PCM 16-bit) encoding utilities.
 * Used to turn MediaRecorder/Cartesia blobs into:
 *  - 16 kHz mono WAV for Azure Pronunciation Assessment
 *  - 16 kHz mono Float32 samples for in-browser acoustic analysis
 */

let sharedCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!sharedCtx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    sharedCtx = new Ctor();
  }
  return sharedCtx;
}

/** Decode any browser-supported audio blob into an AudioBuffer. */
export async function decodeBlob(blob: Blob): Promise<AudioBuffer> {
  const arrayBuf = await blob.arrayBuffer();
  const ctx = getAudioContext();
  // slice() to hand decodeAudioData a fresh, non-detached buffer
  return ctx.decodeAudioData(arrayBuf.slice(0));
}

/** Mix an AudioBuffer down to a single mono Float32Array. */
export function toMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) {
    return buffer.getChannelData(0).slice();
  }
  const len = buffer.length;
  const out = new Float32Array(len);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < len; i++) out[i] += data[i];
  }
  const inv = 1 / buffer.numberOfChannels;
  for (let i = 0; i < len; i++) out[i] *= inv;
  return out;
}

/**
 * Resample an AudioBuffer to mono at `targetRate` using OfflineAudioContext.
 * Returns the resampled mono samples.
 */
export async function resampleMono(
  buffer: AudioBuffer,
  targetRate: number,
): Promise<Float32Array> {
  const duration = buffer.duration;
  const length = Math.max(1, Math.ceil(duration * targetRate));
  const offline = new OfflineAudioContext(1, length, targetRate);
  const src = offline.createBufferSource();
  src.buffer = buffer;
  src.connect(offline.destination);
  src.start(0);
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0).slice();
}

/** Encode mono Float32 samples as a 16-bit PCM WAV Blob. */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const numSamples = samples.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // audio format = PCM
  view.setUint16(22, 1, true); // channels = mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    s = s < 0 ? s * 0x8000 : s * 0x7fff;
    view.setInt16(offset, s, true);
    offset += 2;
  }

  return new Blob([view], { type: 'audio/wav' });
}

/** Result of preparing an audio blob for both Azure and local analysis. */
export interface PreparedAudio {
  /** 16 kHz mono WAV blob — Azure Pronunciation Assessment input. */
  wav16k: Blob;
  /** 16 kHz mono Float32 samples — STFT/formant/pitch analysis input. */
  samples16k: Float32Array;
  /** sample rate of `samples16k` (always 16000). */
  sampleRate: number;
  /** total duration in seconds. */
  duration: number;
}

export const ANALYSIS_RATE = 16000;

/** Decode -> resample to 16 kHz mono -> produce WAV blob + analysis samples. */
export async function prepareAudio(blob: Blob): Promise<PreparedAudio> {
  const decoded = await decodeBlob(blob);
  const samples16k = await resampleMono(decoded, ANALYSIS_RATE);
  return {
    wav16k: encodeWav(samples16k, ANALYSIS_RATE),
    samples16k,
    sampleRate: ANALYSIS_RATE,
    duration: samples16k.length / ANALYSIS_RATE,
  };
}

/** Decode a blob and re-encode as a mono WAV at its native sample rate. */
export async function blobToWavNative(blob: Blob): Promise<Blob> {
  const decoded = await decodeBlob(blob);
  const mono = toMono(decoded);
  return encodeWav(mono, decoded.sampleRate);
}
