import { resolveSurface, type SurfaceFunction, type SurfaceName } from "./surfaces";

export interface DisplacementProfileOptions {
  /**
   * Virtual depth of the flat part of the glass, in px. Rays travel this
   * extra distance after crossing the bezel, so higher values amplify the
   * displacement. Default 60.
   */
  thickness?: number;
  /** Width of the curved bezel ring, in px. Default 16. */
  bezelWidth?: number;
  /** Surface profile. Default "squircle". */
  surface?: SurfaceName | SurfaceFunction;
  /** Index of refraction (air → material). Glass ≈ 1.5. Default 1.5. */
  ior?: number;
  /** Number of ray samples computed across the bezel. Default 128. */
  samples?: number;
}

export interface DisplacementProfile {
  /**
   * Horizontal displacement in px for each sample, ordered from the outer
   * edge of the bezel (index 0) to the inner edge (last index).
   * Positive values displace inward; negative values (concave) outward.
   */
  profile: number[];
  /** Largest absolute displacement in the profile (0 when optically flat). */
  max: number;
}

/**
 * Traces rays through one half-slice of the glass bezel using Snell's law
 * (n₁ sin θ₁ = n₂ sin θ₂) in vector form, with a vertical incident ray.
 *
 * Because the displacement magnitude is rotationally symmetric around the
 * bezel, this 1D profile is later rotated around the whole shape — the heavy
 * physics only runs `samples` times instead of once per pixel.
 *
 * Simplifications (same as the reference article): a single refraction
 * event, orthogonal incident rays, no gap between glass and background.
 */
export function computeDisplacementProfile(
  options: DisplacementProfileOptions = {},
): DisplacementProfile {
  const {
    thickness = 60,
    bezelWidth = 16,
    surface = "squircle",
    ior = 1.5,
    samples = 128,
  } = options;

  const fn = resolveSurface(surface);
  const eta = 1 / ior;
  const profile = new Array<number>(samples);
  const eps = 1e-4;

  for (let i = 0; i < samples; i++) {
    const x = i / samples;
    const h = fn(x);

    // Numeric derivative of the surface function (central difference,
    // clamped at the domain borders).
    const xa = Math.max(0, x - eps);
    const xb = Math.min(1, x + eps);
    const slope = xb > xa ? (fn(xb) - fn(xa)) / (xb - xa) : 0;

    // Surface normal: derivative rotated by -90°, normalized.
    const len = Math.hypot(slope, 1);
    const nx = -slope / len;
    const ny = -1 / len;

    // Snell refraction of the incident ray I = (0, 1) — the GLSL-style
    // vector form: T = η·I − (η·(N·I) + √k)·N, with k = 1 − η²(1 − (N·I)²).
    const dot = ny; // I·N, since I = (0, 1)
    const k = 1 - eta * eta * (1 - dot * dot);
    if (k < 0) {
      // Total internal reflection — the ray never exits, treat as no shift.
      profile[i] = 0;
      continue;
    }
    const c = eta * dot + Math.sqrt(k);
    const tx = -c * nx;
    const ty = eta - c * ny;
    if (ty <= 1e-6) {
      profile[i] = 0;
      continue;
    }

    // Horizontal distance travelled while descending through the remaining
    // glass (bezel height at this point + flat thickness below it).
    const travel = h * bezelWidth + thickness;
    profile[i] = tx * (travel / ty);
  }

  let max = 0;
  for (const d of profile) {
    const a = Math.abs(d);
    if (a > max) max = a;
  }
  return { profile, max };
}
