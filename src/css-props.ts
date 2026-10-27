import type { LiquidGlassOptions } from "./options";
import { surfaceNames, type SurfaceName } from "./surfaces";

/**
 * CSS custom property API. Every option maps to one custom property:
 *
 *   --lg-surface          circle | squircle | concave | lip
 *   --lg-bezel            <length>  bezel width
 *   --lg-thickness        <number>  virtual glass depth
 *   --lg-ior              <number>  index of refraction
 *   --lg-intensity        <number>  displacement scale ratio
 *   --lg-blur             <length>  backdrop blur
 *   --lg-saturate         <number>  post-refraction saturation
 *   --lg-specular         <number>  specular opacity 0..1
 *   --lg-specular-angle   <angle>   light direction
 *   --lg-specular-width   <length>  rim width
 *   --lg-scheme           none | light | dark
 *   --lg-magnify          <number>  magnify scale in px (0 = off)
 *   --lg-radius           <length>  corner radius (defaults to border-radius)
 */

const num = (raw: string | undefined): number | undefined => {
  if (!raw) return undefined;
  const v = parseFloat(raw);
  return Number.isFinite(v) ? v : undefined;
};

/** Computed lengths arrive in px; bare numbers are accepted too. */
const length = num;

/** Accepts deg, rad, grad, turn, or a bare number (degrees). */
const angle = (raw: string | undefined): number | undefined => {
  if (!raw) return undefined;
  const v = parseFloat(raw);
  if (!Number.isFinite(v)) return undefined;
  const unit = raw.trim().slice(String(v).length).toLowerCase();
  switch (unit) {
    case "rad":
      return (v * 180) / Math.PI;
    case "turn":
      return v * 360;
    case "grad":
      return v * 0.9;
    default:
      return v; // deg or unitless
  }
};

const keyword = <T extends string>(
  raw: string | undefined,
  allowed: readonly T[],
): T | undefined => {
  if (!raw) return undefined;
  const v = raw.trim().toLowerCase() as T;
  return allowed.includes(v) ? v : undefined;
};

export interface ResolvedElementGlass {
  options: LiquidGlassOptions;
  width: number;
  height: number;
}

/**
 * Reads the `--lg-*` custom properties from an element's computed style and
 * merges them over `base` (defaults). Anything not set in CSS falls back to
 * the library defaults.
 */
export function optionsFromElement(
  el: HTMLElement,
  base: LiquidGlassOptions,
  computed?: CSSStyleDeclaration,
): ResolvedElementGlass {
  const style = computed ?? getComputedStyle(el);
  const get = (name: string): string | undefined => {
    const v = style.getPropertyValue(name);
    return v && v.trim() !== "" ? v : undefined;
  };

  const radius =
    length(get("--lg-radius")) ?? num(style.borderTopLeftRadius) ?? 0;

  const rect = el.getBoundingClientRect();

  return {
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
    options: {
      ...base,
      surface:
        keyword(get("--lg-surface"), surfaceNames as readonly string[]) as
          | SurfaceName
          | undefined ?? base.surface,
      bezelWidth: length(get("--lg-bezel")) ?? base.bezelWidth,
      thickness: num(get("--lg-thickness")) ?? base.thickness,
      ior: num(get("--lg-ior")) ?? base.ior,
      intensity: num(get("--lg-intensity")) ?? base.intensity,
      blur: length(get("--lg-blur")) ?? base.blur,
      saturate: num(get("--lg-saturate")) ?? base.saturate,
      specularOpacity: num(get("--lg-specular")) ?? base.specularOpacity,
      specularAngle: angle(get("--lg-specular-angle")) ?? base.specularAngle,
      specularWidth: length(get("--lg-specular-width")) ?? base.specularWidth,
      scheme: keyword(get("--lg-scheme"), ["none", "light", "dark"]) ?? base.scheme,
      magnify: length(get("--lg-magnify")) ?? base.magnify,
      radius,
    },
  };
}
