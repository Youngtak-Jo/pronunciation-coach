'use client';

/**
 * Panel 5 — Spectrogram + Pitch Contour (SPEC §7.5).
 * Target and attempt spectrograms stacked, viridis colormap, log frequency
 * 0-4 kHz, F0 pitch contour overlaid, word-boundary verticals.
 * Canvas direct rendering, devicePixelRatio aware.
 */
import { useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCanvas, type CanvasCtx } from './useCanvas';
import { viridisRGB } from '@/lib/colormap';
import type { Spectrogram as Spec } from '@/lib/audio/stft';
import type { FrameFeat } from '@/lib/types';
import type { DiagnosisResult } from '@/lib/diagnosis';

const HEIGHT = 392;
const BAND_H = 142;
const T_Y = 30;
const A_Y = 226;
const F_LO = 80;
const F_HI = 4000;
const LOG_LO = Math.log(F_LO);
const LOG_HI = Math.log(F_HI);
const ROWS = 256;

/** Render a spectrogram into an offscreen canvas (frames x log-freq rows). */
function renderSpec(spec: Spec): HTMLCanvasElement {
  const nF = Math.max(1, spec.frames.length);
  const off = document.createElement('canvas');
  off.width = nF;
  off.height = ROWS;
  const octx = off.getContext('2d');
  if (!octx) return off;
  const img = octx.createImageData(nF, ROWS);
  const binHz = spec.sampleRate / spec.fftSize;

  let maxDb = -Infinity;
  for (const fr of spec.frames) {
    for (let k = 0; k < fr.length; k++) {
      const d = 20 * Math.log10(fr[k] + 1e-6);
      if (d > maxDb) maxDb = d;
    }
  }
  if (!Number.isFinite(maxDb)) maxDb = 0;
  const floor = maxDb - 68;
  const span = Math.max(1, maxDb - floor);

  for (let r = 0; r < ROWS; r++) {
    const logF = LOG_HI - (r / (ROWS - 1)) * (LOG_HI - LOG_LO);
    const bin = Math.min(
      spec.nFreq - 1,
      Math.max(0, Math.round(Math.exp(logF) / binHz)),
    );
    for (let c = 0; c < nF; c++) {
      const mag = spec.frames[c][bin] || 0;
      const db = 20 * Math.log10(mag + 1e-6);
      let t = (db - floor) / span;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const [R, G, B] = viridisRGB(t);
      const idx = (r * nF + c) * 4;
      img.data[idx] = R;
      img.data[idx + 1] = G;
      img.data[idx + 2] = B;
      img.data[idx + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return off;
}

function yForFreq(f: number, y0: number): number {
  const lf = Math.log(Math.max(F_LO, Math.min(F_HI, f)));
  return y0 + ((LOG_HI - lf) / (LOG_HI - LOG_LO)) * BAND_H;
}

export function Spectrogram({ result }: { result: DiagnosisResult }) {
  const draw = useCallback(
    ({ ctx, width, height }: CanvasCtx) => {
      ctx.clearRect(0, 0, width, height);
      const x0 = 40;
      const plotW = width - x0 - 12;

      const drawBand = (
        spec: Spec,
        series: FrameFeat[],
        y0: number,
        duration: number,
        boundaries: number[],
        label: string,
      ) => {
        // spectrogram image
        const off = renderSpec(spec);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(off, x0, y0, plotW, BAND_H);
        ctx.strokeStyle = 'hsl(217 33% 26%)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x0, y0, plotW, BAND_H);

        const dur = Math.max(0.01, duration);

        // word-boundary verticals
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.setLineDash([3, 3]);
        for (const t of boundaries) {
          const x = x0 + (t / dur) * plotW;
          ctx.beginPath();
          ctx.moveTo(x, y0);
          ctx.lineTo(x, y0 + BAND_H);
          ctx.stroke();
        }
        ctx.setLineDash([]);

        // pitch contour (F0)
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        let drawing = false;
        ctx.beginPath();
        for (let i = 0; i < series.length; i++) {
          const f = series[i].f0;
          const x =
            x0 + (series.length > 1 ? i / (series.length - 1) : 0) * plotW;
          if (f > 0) {
            const y = yForFreq(f, y0);
            if (drawing) ctx.lineTo(x, y);
            else {
              ctx.moveTo(x, y);
              drawing = true;
            }
          } else {
            drawing = false;
          }
        }
        ctx.stroke();

        // freq ticks
        ctx.fillStyle = 'hsl(215 20% 62%)';
        ctx.font = '10px ui-monospace, monospace';
        for (const f of [4000, 2000, 1000, 500, 200]) {
          const y = yForFreq(f, y0);
          ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, 6, y + 3);
        }
        ctx.fillStyle = 'hsl(210 40% 90%)';
        ctx.font = '11px ui-monospace, monospace';
        ctx.fillText(label, x0 + 4, y0 - 6);
      };

      const tWords = result.matchedWords.map((w) => w.tStart).filter((t) => t > 0);
      const aWords = result.matchedWords.map((w) => w.aStart).filter((t) => t > 0);

      drawBand(
        result.targetAnalysis.spectrogram,
        result.targetAnalysis.series,
        T_Y,
        result.targetDuration,
        tWords,
        'TARGET (AI)  ·  F0 contour ─',
      );
      drawBand(
        result.attemptAnalysis.spectrogram,
        result.attemptAnalysis.series,
        A_Y,
        result.attemptDuration,
        aWords,
        'ATTEMPT (YOU)  ·  F0 contour ─',
      );

      ctx.fillStyle = 'hsl(215 20% 62%)';
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText('Hz', 6, T_Y - 6);
    },
    [result],
  );

  const { wrapRef, canvasRef } = useCanvas(HEIGHT, draw);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          Spectrogram · Pitch Contour
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div ref={wrapRef} className="w-full">
          <canvas ref={canvasRef} className="block w-full" />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          viridis 컬러맵 · 로그 주파수 0–4kHz. 흰 선은 F0 피치, 점선은 단어
          경계입니다.
        </p>
      </CardContent>
    </Card>
  );
}
