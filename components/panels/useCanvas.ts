'use client';

/** Shared hook: a devicePixelRatio-aware canvas that redraws on resize. */
import { useCallback, useEffect, useRef } from 'react';
import { setupCanvas, type CanvasCtx } from '@/lib/canvas';

export function useCanvas(height: number, draw: (c: CanvasCtx) => void) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const render = useCallback(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const width = Math.max(160, wrap.clientWidth);
    draw(setupCanvas(canvas, width, height));
  }, [draw, height]);

  useEffect(() => {
    render();
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => render());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [render]);

  return { wrapRef, canvasRef };
}

export type { CanvasCtx };
