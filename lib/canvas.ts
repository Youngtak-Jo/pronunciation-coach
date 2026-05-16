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
  const targetW = Math.max(1, Math.round(cssWidth * dpr));
  const targetH = Math.max(1, Math.round(cssHeight * dpr));
  // Only mutate sizing when it changes — avoids per-frame style writes that
  // can create a layout feedback loop with the parent (canvas style.width
  // px-pinning + clientWidth re-measure → monotonic horizontal growth).
  if (canvas.width !== targetW) canvas.width = targetW;
  if (canvas.height !== targetH) canvas.height = targetH;
  const cssWStr = `${cssWidth}px`;
  const cssHStr = `${cssHeight}px`;
  if (canvas.style.width !== cssWStr) canvas.style.width = cssWStr;
  if (canvas.style.height !== cssHStr) canvas.style.height = cssHStr;
  if (canvas.style.display !== 'block') canvas.style.display = 'block';
  if (canvas.style.maxWidth !== '100%') canvas.style.maxWidth = '100%';
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width: cssWidth, height: cssHeight };
}
