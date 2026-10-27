/**
 * Surface profile functions.
 *
 * A surface function maps `x` — the distance from the outer edge of the
 * bezel, normalized to [0, 1] — to the relative height of the virtual glass
 * surface at that point. The shape of this curve defines how light rays are
 * bent, i.e. the "profile" of the glass bezel.
 *
 * Physics approach follows Chris Feijoo's article "Liquid Glass in the
 * Browser: Refraction with CSS and SVG" (https://kube.io/blog/liquid-glass-css-svg/).
 */

export type SurfaceFunction = (x: number) => number;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Circular arc — a simple spherical dome. */
export const circleSurface: SurfaceFunction = (x) =>
  Math.sqrt(Math.max(0, 1 - (1 - clamp01(x)) ** 2));

/**
 * Squircle — a superellipse-based profile with a softer flat→curve
 * transition. Keeps refraction gradients smooth when the shape is stretched
 * into a rectangle, and makes the bezel look optically thinner.
 */
export const squircleSurface: SurfaceFunction = (x) =>
  Math.pow(Math.max(0, 1 - (1 - clamp01(x)) ** 4), 0.25);

/** Concave bowl — rays diverge outward, past the glass boundaries. */
export const concaveSurface: SurfaceFunction = (x) => 1 - circleSurface(x);

/** Smootherstep easing (Ken Perlin's improved smoothstep). */
const smootherstep = (x: number): number => {
  const t = clamp01(x);
  return t * t * t * (t * (t * 6 - 15) + 10);
};

/**
 * Lip — a raised rim with a shallow center dip, blending the squircle and
 * concave profiles through smootherstep. Used by Apple for Switch-like
 * components: the center appears zoomed out while the rim refracts inward.
 */
export const lipSurface: SurfaceFunction = (x) => {
  const convex = squircleSurface(clamp01(x * 2));
  const concave = concaveSurface(x) + 0.1;
  const t = smootherstep(x);
  return convex * (1 - t) + concave * t;
};

export const surfaces = {
  circle: circleSurface,
  squircle: squircleSurface,
  concave: concaveSurface,
  lip: lipSurface,
} as const;

export type SurfaceName = keyof typeof surfaces;

export const surfaceNames: SurfaceName[] = Object.keys(surfaces) as SurfaceName[];

export function resolveSurface(
  surface: SurfaceName | SurfaceFunction,
): SurfaceFunction {
  if (typeof surface === "function") return surface;
  return surfaces[surface] ?? squircleSurface;
}
