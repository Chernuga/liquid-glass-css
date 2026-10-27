/**
 * Minimal ImageData-like raster so the core math stays DOM-free and can run
 * (and be tested) in Node. Converted to a data URL in the browser layer.
 */
export interface Raster {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export function createRaster(width: number, height: number): Raster {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
}
