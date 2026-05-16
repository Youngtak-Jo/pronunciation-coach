'use client';

/** Canvas helpers — devicePixelRatio-aware sizing (SPEC §7 rendering rule). */

export interface CanvasCtx {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
}

/**
 * Size a canvas for crisp HiDPI rendering: the backing store is scaled by
 * devicePixelRatio while drawing stays in CSS pixels.
 */
export function setupCanvas(
  canvas: HTMLCanvasElement,
  cssWidth: number,
  cssHeight: number,
): CanvasCtx {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(cssWidth * dpr));
  canvas.height = Math.max(1, Math.round(cssHeight * dpr));
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width: cssWidth, height: cssHeight };
}
