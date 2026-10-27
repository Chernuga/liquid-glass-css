import { createRaster, type Raster } from "./raster";

export interface GlassShape {
  /** Element width in CSS px. */
  width: number;
  /** Element height in CSS px. */
  height: number;
  /** Corner radius in CSS px. */
  radius: number;
  /** Bezel width in CSS px. */
  bezelWidth: number;
}

/**
 * Encodes a displacement vector field as an RGBA image usable by
 * `<feDisplacementMap>`: red channel = X axis, green = Y axis, 128 neutral.
 *
 * The shape is a rounded rectangle. Every bezel pixel maps to a point on a
 * corner circle of radius `radius` (straight sections collapse onto a single
 * axis, which yields the distance field of a rounded box), looks up the
 * precomputed 1D displacement for its distance from the outer edge, and
 * rotates that magnitude orthogonally to the border.
 *
 * Displacements are normalized by `maxDisplacement`; the SVG filter's
 * `scale` attribute multiplies them back to real pixels.
 */
export function buildDisplacementMap(
  shape: GlassShape,
  profile: number[],
  maxDisplacement: number,
  dpr: number = 1,
): Raster {
  const width = Math.max(1, Math.round(shape.width * dpr));
  const height = Math.max(1, Math.round(shape.height * dpr));
  const raster = createRaster(width, height);

  // Neutral fill: R=128, G=128, B=0, A=255 (0xff008080 little-endian RGBA).
  new Uint32Array(raster.data.buffer).fill(0xff008080);

  const radius = Math.min(Math.round(shape.radius * dpr), width >> 1, height >> 1);
  const bezel = Math.min(Math.max(1, Math.round(shape.bezelWidth * dpr)), radius);
  if (radius <= 0 || profile.length === 0) return raster;

  const outerSquared = (radius + 1) ** 2; // +1px ring for edge anti-aliasing
  const innerSquared = (radius - bezel) ** 2;
  const radiusSquared = radius ** 2;
  const outerRadius = Math.sqrt(outerSquared);
  const max = maxDisplacement || 1;
  const spanX = width - 2 * radius; // lengths of the straight sections
  const spanY = height - 2 * radius;
  const n = profile.length;

  for (let y = 0; y < height; y++) {
    const py = y + 0.5; // sample at pixel centers → symmetric distance field
    const cy = py < radius ? py - radius : py >= height - radius ? py - radius - spanY : 0;
    for (let x = 0; x < width; x++) {
      const px = x + 0.5;
      const cx = px < radius ? px - radius : px >= width - radius ? px - radius - spanX : 0;
      const distSquared = cx * cx + cy * cy;
      if (distSquared > outerSquared || distSquared < innerSquared) continue;

      const dist = Math.sqrt(distSquared);
      const fromSide = radius - dist; // 0 at outer edge → bezel at inner edge
      const index = Math.min(n - 1, Math.max(0, ((fromSide / bezel) * n) | 0));
      const displacement = profile[index] ?? 0;
      if (displacement === 0) continue;

      // Direction orthogonal to the border, pointing inward.
      const inv = dist > 0 ? 1 / dist : 0;
      const dx = (-cx * inv * displacement) / max;
      const dy = (-cy * inv * displacement) / max;

      // Fade over the outermost device pixel to avoid a hard aliased edge.
      const fade =
        distSquared <= radiusSquared
          ? 1
          : Math.max(0, 1 - (dist - radius) / (outerRadius - radius));

      const i = (y * width + x) * 4;
      raster.data[i] = 128 + dx * 127 * fade;
      raster.data[i + 1] = 128 + dy * 127 * fade;
    }
  }
  return raster;
}
