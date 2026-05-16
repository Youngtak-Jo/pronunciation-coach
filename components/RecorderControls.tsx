'use client';

/**
 * Shared microphone capture UI: record / stop, countdown, and a live
 * scrolling level meter (canvas). Used by Step 1 (clone) and Step 2 (shadow).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';
import { startRecording, type RecorderHandle } from '@/lib/audio/recorder';
import { setupCanvas } from '@/lib/canvas';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface RecorderControlsProps {
  maxSeconds: number;
  minSeconds?: number;
  onComplete: (blob: Blob) => void;
  onError?: (message: string) => void;
  disabled?: boolean;
  idleLabel?: string;
  processingLabel?: string;
  processing?: boolean;
}

const METER_BARS = 96;

export function RecorderControls({
  maxSeconds,
  minSeconds = 1,
  onComplete,
  onError,
  disabled = false,
  idleLabel = '녹음 시작',
  processingLabel = '처리 중…',
  processing = false,
}: RecorderControlsProps) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const handleRef = useRef<RecorderHandle | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const levelsRef = useRef<number[]>(new Array(METER_BARS).fill(0));
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const teardownAudio = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (tickRef.current != null) clearInterval(tickRef.current);
    tickRef.current = null;
    analyserRef.current = null;
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  }, []);

  const drawMeter = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas) return;

    const cssW = wrapRef.current?.clientWidth || 480;
    const cssH = 72;
    const { ctx, width, height } = setupCanvas(canvas, cssW, cssH);

    if (analyser) {
      const buf = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buf.length);
      const levels = levelsRef.current;
      levels.push(Math.min(1, rms * 3.2));
      if (levels.length > METER_BARS) levels.shift();
    }

    ctx.clearRect(0, 0, width, height);
    const levels = levelsRef.current;
    const barW = width / METER_BARS;
    const mid = height / 2;
    for (let i = 0; i < levels.length; i++) {
      const lvl = levels[i];
      const h = Math.max(2, lvl * (height - 8));
      const x = i * barW;
      const alpha = 0.35 + 0.65 * (i / METER_BARS);
      ctx.fillStyle = `hsla(199, 89%, 56%, ${alpha})`;
      ctx.fillRect(x + barW * 0.18, mid - h / 2, barW * 0.64, h);
    }
  }, []);

  const stop = useCallback(async () => {
    const handle = handleRef.current;
    handleRef.current = null;
    setRecording(false);
    teardownAudio();
    if (!handle) return;
    const blob = await handle.stop();
    onComplete(blob);
  }, [onComplete, teardownAudio]);

  const begin = useCallback(async () => {
    if (disabled || processing) return;
    levelsRef.current = new Array(METER_BARS).fill(0);
    setElapsed(0);
    try {
      const handle = await startRecording();
      handleRef.current = handle;

      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const audioCtx = new Ctor();
      const source = audioCtx.createMediaStreamSource(handle.stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      audioCtxRef.current = audioCtx;
      analyserRef.current = analyser;

      startedAtRef.current = performance.now();
      setRecording(true);

      tickRef.current = setInterval(() => {
        const secs = (performance.now() - startedAtRef.current) / 1000;
        setElapsed(secs);
        if (secs >= maxSeconds) void stop();
      }, 100);
    } catch (e) {
      onError?.(
        `마이크 접근에 실패했습니다: ${(e as Error).message}. 브라우저 권한을 확인하세요.`,
      );
    }
  }, [disabled, processing, drawMeter, maxSeconds, stop, onError]);

  // while recording: animate every frame; while idle: a single static draw
  useEffect(() => {
    if (!recording) {
      drawMeter();
      return;
    }
    let active = true;
    const loop = () => {
      if (!active) return;
      drawMeter();
      rafRef.current = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      active = false;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [recording, drawMeter]);

  useEffect(() => {
    return () => {
      handleRef.current?.cancel();
      teardownAudio();
    };
  }, [teardownAudio]);

  const remaining = Math.max(0, maxSeconds - elapsed);
  const canStop = elapsed >= minSeconds;

  return (
    <div className="flex flex-col gap-4">
      <div
        ref={wrapRef}
        className="rounded-xl border border-border bg-secondary/30 p-3"
      >
        <canvas ref={canvasRef} className="block w-full" />
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="font-mono text-sm text-muted-foreground tabular-nums">
          {recording ? (
            <span className="text-primary">
              ● REC {elapsed.toFixed(1)}s
              <span className="text-muted-foreground">
                {' '}
                / 남은 {remaining.toFixed(1)}s
              </span>
            </span>
          ) : (
            <span>최대 {maxSeconds}s</span>
          )}
        </div>

        {!recording ? (
          <Button
            onClick={begin}
            disabled={disabled || processing}
            size="lg"
            className="gap-2"
          >
            {processing ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Mic className="h-5 w-5" />
            )}
            {processing ? processingLabel : idleLabel}
          </Button>
        ) : (
          <Button
            onClick={() => void stop()}
            disabled={!canStop}
            size="lg"
            variant="destructive"
            className={cn('gap-2', !canStop && 'opacity-60')}
          >
            <Square className="h-4 w-4 fill-current" />
            {canStop ? '녹음 중지' : `${minSeconds}s 이상 녹음하세요`}
          </Button>
        )}
      </div>
    </div>
  );
}
