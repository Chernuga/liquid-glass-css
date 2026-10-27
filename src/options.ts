import type { SurfaceFunction, SurfaceName } from "./surfaces";

/** Full set of knobs controlling the Liquid Glass effect. */
export interface LiquidGlassOptions {
  /** Bezel surface profile. Default "squircle". */
  surface: SurfaceName | SurfaceFunction;
  /** Width of the curved bezel ring, px. Default 16. */
  bezelWidth: number;
  /** Virtual glass depth below the bezel, px — amplifies displacement. Default 60. */
  thickness: number;
  /** Index of refraction (glass ≈ 1.5). Default 1.5. */
  ior: number;
  /**
   * Effect intensity: multiplies the displacement scale. Animate this to
   * fade the refraction in/out without rebuilding the maps. Default 1.
   */
  intensity: number;
  /** Backdrop blur before refraction (frost), px. Default 2. */
  blur: number;
  /** Saturation boost applied after refraction. Default 1.1. */
  saturate: number;
  /** Opacity of the specular rim highlight, 0–1. Default 0.5. */
  specularOpacity: number;
  /** Direction of the light for the specular rim, degrees. Default 60. */
  specularAngle: number;
  /** Width of the specular rim, px. Default 1.2. */
  specularWidth: number;
  /**
   * Brightness compensation: "light" slightly brightens the backdrop,
   * "dark" slightly darkens it. Default "none".
   */
  scheme: "none" | "light" | "dark";
  /**
   * Magnifying pre-pass scale, px (0 = off). Pulls samples toward the
   * element center before refraction — a zoom lens under the glass.
   */
  magnify: number;
  /**
   * Corner radius, px. When omitted, the element's computed
   * `border-radius` is used.
   */
  radius?: number;
  /** Device pixel ratio override (defaults to window.devicePixelRatio). */
  dpr?: number;
}

export const defaultOptions: LiquidGlassOptions = {
  surface: "squircle",
  bezelWidth: 16,
  thickness: 60,
  ior: 1.5,
  intensity: 1,
  blur: 2,
  saturate: 1.1,
  specularOpacity: 0.5,
  specularAngle: 60,
  specularWidth: 1.2,
  scheme: "none",
  magnify: 0,
};

export function resolveOptions(
  partial: Partial<LiquidGlassOptions> = {},
): LiquidGlassOptions {
  return { ...defaultOptions, ...partial };
}
