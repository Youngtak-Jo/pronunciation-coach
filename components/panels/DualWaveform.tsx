'use client';

/**
 * Panel 2 — Dual Waveform with DTW Alignment (SPEC §7.2, signature visual).
 * Target waveform on top, attempt below, with connector lines drawn between
 * the two from TimeMap anchors — green where aligned, red where it drifts.
 * Canvas direct rendering, devicePixelRatio aware.
 */
import { useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCanvas, type CanvasCtx } from './useCanvas';
import type { DiagnosisResult } from '@/lib/diagnosis';

const HEIGHT = 300;
const T_CENTER = 78;
const A_CENTER = 232;
const HALF = 56;
const LINK_TOP = 138;
const LINK_BOT = 172;

/** Peak-amplitude envelope, downsampled to `buckets` and normalized to 0..1. */
function envelope(samples: Float32Array, buckets: number): number[] {
  const out = new Array<number>(buckets).fill(0);
  if (samples.length === 0) return out;
  const per = samples.length / buckets;
  let max = 1e-6;
  for (let b = 0; b < buckets; b++) {
    const s = Math.floor(b * per);
    const e = Math.min(samples.length, Math.floor((b + 1) * per) + 1);
    let m = 0;
    for (let i = s; i < e; i++) {
      const a = Math.abs(samples[i]);
      if (a > m) m = a;
    }
    out[b] = m;
    if (m > max) max = m;
  }
  for (let b = 0; b < buckets; b++) out[b] /= max;
  return out;
}

function devColor(dev: number): string {
  if (dev < 0.05) return 'hsl(152 65% 52%)';
  if (dev < 0.12) return 'hsl(42 92% 56%)';
  return 'hsl(0 75% 60%)';
}

export function DualWaveform({ result }: { result: DiagnosisResult }) {
  const draw = useCallback(
    ({ ctx, width, height }: CanvasCtx) => {
      ctx.clearRect(0, 0, width, height);
      const buckets = Math.max(60, Math.floor(width / 2));

      const tEnv = envelope(result.targetSamples, buckets);
      const aEnv = envelope(result.attemptSamples, buckets);
      const tDur = Math.max(0.01, result.targetDuration);
      const aDur = Math.max(0.01, result.attemptDuration);

      // baselines
      ctx.strokeStyle = 'hsl(217 33% 24%)';
      ctx.lineWidth = 1;
      for (const cy of [T_CENTER, A_CENTER]) {
        ctx.beginPath();
        ctx.moveTo(0, cy);
        ctx.lineTo(width, cy);
        ctx.stroke();
      }

      // waveforms
      const drawWave = (env: number[], cy: number, color: string) => {
        const bw = width / env.length;
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1, bw * 0.7);
        for (let b = 0; b < env.length; b++) {
          const x = b * bw + bw / 2;
          const h = Math.max(0.6, env[b] * HALF);
          ctx.beginPath();
          ctx.moveTo(x, cy - h);
          ctx.lineTo(x, cy + h);
          ctx.stroke();
        }
      };
      drawWave(tEnv, T_CENTER, 'hsl(199 89% 60%)');
      drawWave(aEnv, A_CENTER, 'hsl(263 70% 68%)');

      // word-boundary ticks
      ctx.strokeStyle = 'hsl(210 40% 96% / 0.18)';
      ctx.lineWidth = 1;
      for (const w of result.matchedWords) {
        const xt = (w.tStart / tDur) * width;
        ctx.beginPath();
        ctx.moveTo(xt, T_CENTER - HALF - 6);
        ctx.lineTo(xt, T_CENTER + HALF + 6);
        ctx.stroke();
        const xa = (w.aStart / aDur) * width;
        ctx.beginPath();
        ctx.moveTo(xa, A_CENTER - HALF - 6);
        ctx.lineTo(xa, A_CENTER + HALF + 6);
        ctx.stroke();
      }

      // alignment connectors from TimeMap anchors (SPEC: 12-20 anchors)
      const map = result.timeMap;
      const ANCHORS = Math.min(20, Math.max(12, map.length));
      for (let k = 0; k < ANCHORS; k++) {
        const idx =
          map.length <= ANCHORS
            ? Math.min(map.length - 1, k)
            : Math.round((k * (map.length - 1)) / (ANCHORS - 1));
        const pt = map[idx];
        if (!pt) continue;
        const tN = Math.min(1, Math.max(0, pt.targetTime / tDur));
        const aN = Math.min(1, Math.max(0, pt.attemptTime / aDur));
        const x1 = tN * width;
        const x2 = aN * width;
        const dev = Math.abs(aN - tN);
        const color = devColor(dev);

        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x1, LINK_TOP);
        ctx.lineTo(x2, LINK_BOT);
        ctx.stroke();
        ctx.globalAlpha = 1;

        for (const [x, y] of [
          [x1, LINK_TOP],
          [x2, LINK_BOT],
        ]) {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(x, y, 2.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // band labels
      ctx.fillStyle = 'hsl(215 20% 62%)';
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillText('TARGET (AI)', 6, 18);
      ctx.fillText('ATTEMPT (YOU)', 6, height - 8);
    },
    [result],
  );

  const { wrapRef, canvasRef } = useCanvas(HEIGHT, draw);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span>Dual Waveform · DTW Alignment</span>
          <span className="flex gap-3 text-xs font-normal text-muted-foreground">
            <Legend color="hsl(152 65% 52%)" label="정렬됨" />
            <Legend color="hsl(42 92% 56%)" label="약간 어긋남" />
            <Legend color="hsl(0 75% 60%)" label="틀어짐" />
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div ref={wrapRef} className="w-full">
          <canvas ref={canvasRef} className="block w-full" />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Hybrid Segmented DTW의 TimeMap 앵커가 두 발화를 잇습니다. 선이 수직에
          가까울수록 타이밍이 정확합니다.
        </p>
      </CardContent>
    </Card>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span
        className="inline-block h-2 w-3 rounded-sm"
        style={{ background: color }}
      />
      {label}
    </span>
  );
}
