import { createRaster, type Raster } from "./raster";

/**
 * Radial displacement map that pulls every sample toward the element's
 * center, producing a magnifying (zoom) effect when applied with
 * `<feDisplacementMap scale="…">`. Applied to the source *before* the glass
 * refraction pass, so the bezel refracts the already-magnified backdrop.
 */
export function buildMagnifyMap(
  cssWidth: number,
  cssHeight: number,
  dpr: number = 1,
): Raster {
  const width = Math.max(1, Math.round(cssWidth * dpr));
  const height = Math.max(1, Math.round(cssHeight * dpr));
  const raster = createRaster(width, height);

  const ratio = Math.max(width, height) / 2;
  const halfW = width / 2;
  const halfH = height / 2;

  for (let y = 0; y < height; y++) {
    const ry = (y - halfH) / ratio;
    for (let x = 0; x < width; x++) {
      const rx = (x - halfW) / ratio;
      const i = (y * width + x) * 4;
      raster.data[i] = 128 - rx * 127;
      raster.data[i + 1] = 128 - ry * 127;
      raster.data[i + 2] = 0;
      raster.data[i + 3] = 255;
    }
  }
  return raster;
}
