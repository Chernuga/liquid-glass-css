import { createRaster, type Raster } from "./raster";

export interface SpecularShape {
  width: number;
  height: number;
  radius: number;
  bezelWidth: number;
}

/**
 * Rim-light specular highlight along the bezel: brightest where the surface
 * orientation faces (or directly opposes) the light direction, concentrated
 * in the outermost `rimWidth` px of the bezel — the thin bright edge you see
 * on real curved glass.
 *
 * The highlight is grayscale; intensity is carried by both RGB and alpha so
 * the filter chain can fade it further with a simple `feFuncA` slope.
 *
 * @param angle Light direction in radians (screen space, y down).
 * @param rimWidth Width of the bright rim in CSS px.
 */
export function buildSpecularMap(
  shape: SpecularShape,
  angle: number = Math.PI / 3,
  rimWidth: number = 1.2,
  dpr: number = 1,
): Raster {
  const width = Math.max(1, Math.round(shape.width * dpr));
  const height = Math.max(1, Math.round(shape.height * dpr));
  const raster = createRaster(width, height); // transparent black = no highlight

  const radius = Math.min(Math.round(shape.radius * dpr), width >> 1, height >> 1);
  const bezel = Math.min(Math.max(1, Math.round(shape.bezelWidth * dpr)), radius);
  if (radius <= 0) return raster;

  const lightX = Math.cos(angle);
  const lightY = Math.sin(angle);

  const outerSquared = (radius + 1) ** 2;
  const innerSquared = (radius - bezel) ** 2;
  const radiusSquared = radius ** 2;
  const outerRadius = Math.sqrt(outerSquared);
  const rim = Math.max(1e-6, rimWidth * dpr);
  const spanX = width - 2 * radius;
  const spanY = height - 2 * radius;

  for (let y = 0; y < height; y++) {
    const py = y + 0.5; // sample at pixel centers → symmetric distance field
    const cy = py < radius ? py - radius : py >= height - radius ? py - radius - spanY : 0;
    for (let x = 0; x < width; x++) {
      const px = x + 0.5;
      const cx = px < radius ? px - radius : px >= width - radius ? px - radius - spanX : 0;
      const distSquared = cx * cx + cy * cy;
      if (distSquared > outerSquared || distSquared < innerSquared) continue;

      const dist = Math.sqrt(distSquared);
      const fromSide = radius - dist;
      if (fromSide >= rim) continue;

      const inv = dist > 0 ? 1 / dist : 0;
      // Surface orientation (y flipped: screen y points down).
      const facing = Math.abs(cx * inv * lightX + -cy * inv * lightY);
      // Circular falloff across the rim: 0 at the very edge and at rim depth.
      const t = Math.min(1, fromSide / rim);
      const profile = Math.sqrt(Math.max(0, 1 - (1 - t) ** 2));
      const coefficient = facing * profile;
      if (coefficient <= 0) continue;

      const fade =
        distSquared <= radiusSquared
          ? 1
          : Math.max(0, 1 - (dist - radius) / (outerRadius - radius));

      const value = 255 * coefficient;
      const i = (y * width + x) * 4;
      raster.data[i] = value;
      raster.data[i + 1] = value;
      raster.data[i + 2] = value;
      raster.data[i + 3] = value * coefficient * fade;
    }
  }
  return raster;
}
