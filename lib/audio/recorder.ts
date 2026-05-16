'use client';

/** Thin wrapper around MediaRecorder for fixed/free-form microphone capture. */

export interface RecorderHandle {
  stop: () => Promise<Blob>;
  cancel: () => void;
  stream: MediaStream;
}

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
}

/** Start recording. Resolve a handle whose `stop()` returns the recorded Blob. */
export async function startRecording(): Promise<RecorderHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      channelCount: 1,
    },
  });

  const mimeType = pickMimeType();
  const recorder = mimeType
    ? new MediaRecorder(stream, { mimeType })
    : new MediaRecorder(stream);
  const chunks: BlobPart[] = [];

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  recorder.start(100);

  const cleanup = () => {
    for (const track of stream.getTracks()) track.stop();
  };

  return {
    stream,
    stop: () =>
      new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          cleanup();
          resolve(new Blob(chunks, { type: mimeType || 'audio/webm' }));
        };
        if (recorder.state !== 'inactive') recorder.stop();
        else {
          cleanup();
          resolve(new Blob(chunks, { type: mimeType || 'audio/webm' }));
        }
      }),
    cancel: () => {
      if (recorder.state !== 'inactive') {
        recorder.onstop = null;
        recorder.stop();
      }
      cleanup();
    },
  };
}
