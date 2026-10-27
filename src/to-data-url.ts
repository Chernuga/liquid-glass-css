import type { Raster } from "./raster";

/**
 * Converts a raster to a PNG data URL using an in-memory canvas.
 * Browser-only — the DOM-free core returns rasters, this is the bridge.
 */
export function rasterToDataURL(raster: Raster): string {
  const canvas = document.createElement("canvas");
  canvas.width = raster.width;
  canvas.height = raster.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("liquid-glass-css: 2D canvas context unavailable");
  ctx.putImageData(
    new ImageData(
      new Uint8ClampedArray(raster.data),
      raster.width,
      raster.height,
    ),
    0,
    0,
  );
  return canvas.toDataURL("image/png");
}
