'use client';

/**
 * Panel 3 — DTW Cost Matrix Heatmap (SPEC §7.3).
 * Per-word local DTW cost matrix in the plasma colormap, with the optimal
 * warping path stroked in white and animated on (dashoffset-style reveal).
 * Canvas direct rendering, devicePixelRatio aware.
 */
import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { setupCanvas } from '@/lib/canvas';
import { plasma } from '@/lib/colormap';
import type { DtwSegment } from '@/lib/types';
import type { DiagnosisResult } from '@/lib/diagnosis';

const HEIGHT = 320;

function drawHeatmap(
  ctx: CanvasRenderingContext2D,
  seg: DtwSegment,
  width: number,
  height: number,
) {
  ctx.fillStyle = 'hsl(222 47% 5%)';
  ctx.fillRect(0, 0, width, height);

  const n = seg.matrix.length;
  const m = n > 0 ? seg.matrix[0].length : 0;
  if (n === 0 || m === 0) return;

  let mn = Infinity;
  let mx = -Infinity;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      const v = seg.matrix[i][j];
      if (Number.isFinite(v)) {
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
    }
  }
  if (!Number.isFinite(mn)) {
    mn = 0;
    mx = 1;
  }
  const range = mx - mn || 1;
  const cw = width / m;
  const ch = height / n;

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      const v = seg.matrix[i][j];
      if (!Number.isFinite(v)) {
        ctx.fillStyle = 'hsl(222 45% 8%)';
      } else {
        ctx.fillStyle = plasma((v - mn) / range);
      }
      ctx.fillRect(j * cw, i * ch, cw + 0.7, ch + 0.7);
    }
  }
}

function drawPath(
  ctx: CanvasRenderingContext2D,
  seg: DtwSegment,
  width: number,
  height: number,
  progress: number,
) {
  const n = seg.matrix.length;
  const m = n > 0 ? seg.matrix[0].length : 0;
  if (n === 0 || m === 0 || seg.path.length < 2) return;
  const cw = width / m;
  const ch = height / n;
  const pts = seg.path.map(
    ([i, j]) => [(j + 0.5) * cw, (i + 0.5) * ch] as [number, number],
  );
  const count = Math.max(2, Math.floor(pts.length * progress));
  const visible = pts.slice(0, count);

  const stroke = (w: number, style: string) => {
    ctx.strokeStyle = style;
    ctx.lineWidth = w;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    visible.forEach((p, k) => {
      if (k === 0) ctx.moveTo(p[0], p[1]);
      else ctx.lineTo(p[0], p[1]);
    });
    ctx.stroke();
  };
  stroke(6, 'rgba(255,255,255,0.22)');
  stroke(2, '#ffffff');

  const head = visible[visible.length - 1];
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(head[0], head[1], 3.6, 0, Math.PI * 2);
  ctx.fill();
}

export function DTWMatrix({ result }: { result: DiagnosisResult }) {
  const segments = result.segments;
  const [selected, setSelected] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const sel = Math.min(selected, Math.max(0, segments.length - 1));

  useEffect(() => {
    if (segments.length === 0) return;
    const seg = segments[sel];
    let cancelled = false;

    const render = () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      const wrap = wrapRef.current;
      const canvas = canvasRef.current;
      if (!wrap || !canvas) return;
      const width = Math.max(220, wrap.clientWidth);
      const { ctx } = setupCanvas(canvas, width, HEIGHT);

      // offscreen heatmap (built once per render, blitted each frame)
      const dpr = window.devicePixelRatio || 1;
      const off = document.createElement('canvas');
      off.width = Math.round(width * dpr);
      off.height = Math.round(HEIGHT * dpr);
      const octx = off.getContext('2d');
      if (!octx) return;
      octx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawHeatmap(octx, seg, width, HEIGHT);

      let p = 0;
      const step = () => {
        if (cancelled) return;
        ctx.clearRect(0, 0, width, HEIGHT);
        ctx.drawImage(off, 0, 0, width, HEIGHT);
        drawPath(ctx, seg, width, HEIGHT, Math.min(1, p));

        // axis labels
        ctx.fillStyle = 'hsl(215 20% 70%)';
        ctx.font = '11px ui-monospace, monospace';
        ctx.fillText('Attempt frames →', 8, HEIGHT - 8);
        ctx.save();
        ctx.translate(13, 14);
        ctx.fillText('Target frames →', 0, 0);
        ctx.restore();

        if (p < 1) {
          p += 0.022;
          rafRef.current = requestAnimationFrame(step);
        }
      };
      step();
    };

    render();
    const ro = new ResizeObserver(render);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => {
      cancelled = true;
      ro.disconnect();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [segments, sel]);

  if (segments.length === 0) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">DTW Cost Matrix</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-12 text-center text-sm text-muted-foreground">
            정렬할 단어 구간을 찾지 못했습니다.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">DTW Cost Matrix · Heatmap</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          {segments.map((s, i) => (
            <button
              key={`${s.word}-${i}`}
              onClick={() => setSelected(i)}
              className={
                i === sel
                  ? 'rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground'
                  : 'rounded-md bg-secondary px-2.5 py-1 text-xs text-muted-foreground hover:bg-secondary/70'
              }
            >
              {s.word}
            </button>
          ))}
        </div>
        <div ref={wrapRef} className="w-full">
          <canvas ref={canvasRef} className="block w-full rounded-lg" />
        </div>
        <p className="text-xs text-muted-foreground">
          &ldquo;{segments[sel].word}&rdquo; 구간의 국소 DTW · 코사인 거리 매트릭스.
          흰 선이 최적 워핑 경로 (Sakoe-Chiba band {segments[sel].band}).
        </p>
      </CardContent>
    </Card>
  );
}
