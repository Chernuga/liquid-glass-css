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
type SurfaceFunction = (x: number) => number;
/** Circular arc — a simple spherical dome. */
declare const circleSurface: SurfaceFunction;
/**
 * Squircle — a superellipse-based profile with a softer flat→curve
 * transition. Keeps refraction gradients smooth when the shape is stretched
 * into a rectangle, and makes the bezel look optically thinner.
 */
declare const squircleSurface: SurfaceFunction;
/** Concave bowl — rays diverge outward, past the glass boundaries. */
declare const concaveSurface: SurfaceFunction;
/**
 * Lip — a raised rim with a shallow center dip, blending the squircle and
 * concave profiles through smootherstep. Used by Apple for Switch-like
 * components: the center appears zoomed out while the rim refracts inward.
 */
declare const lipSurface: SurfaceFunction;
declare const surfaces: {
    readonly circle: SurfaceFunction;
    readonly squircle: SurfaceFunction;
    readonly concave: SurfaceFunction;
    readonly lip: SurfaceFunction;
};
type SurfaceName = keyof typeof surfaces;
declare const surfaceNames: SurfaceName[];
declare function resolveSurface(surface: SurfaceName | SurfaceFunction): SurfaceFunction;

/** Full set of knobs controlling the Liquid Glass effect. */
interface LiquidGlassOptions {
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
declare const defaultOptions: LiquidGlassOptions;
declare function resolveOptions(partial?: Partial<LiquidGlassOptions>): LiquidGlassOptions;

interface ResolvedElementGlass {
    options: LiquidGlassOptions;
    width: number;
    height: number;
}
/**
 * Reads the `--lg-*` custom properties from an element's computed style and
 * merges them over `base` (defaults). Anything not set in CSS falls back to
 * the library defaults.
 */
declare function optionsFromElement(el: HTMLElement, base: LiquidGlassOptions, computed?: CSSStyleDeclaration): ResolvedElementGlass;

/**
 * Minimal ImageData-like raster so the core math stays DOM-free and can run
 * (and be tested) in Node. Converted to a data URL in the browser layer.
 */
interface Raster {
    width: number;
    height: number;
    data: Uint8ClampedArray;
}
declare function createRaster(width: number, height: number): Raster;

interface GlassShape {
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
declare function buildDisplacementMap(shape: GlassShape, profile: number[], maxDisplacement: number, dpr?: number): Raster;

interface GlassFilter {
    /** Filter id — apply with `backdrop-filter: url(#id)`. */
    id: string;
    element: SVGFilterElement;
    /** Removes the filter element from the DOM. */
    dispose(): void;
}
/**
 * Builds the full SVG filter for one element size + option set:
 *
 *   backdrop ──(magnify)──(scheme tint)──(blur)──▶ displaced ──(saturate)──▶ + specular
 *
 * The displacement and specular layers are rasterized at the device pixel
 * ratio and referenced as `<feImage>`s, so the browser does the per-pixel
 * work on the GPU while the expensive ray tracing only happens once per
 * unique configuration.
 */
declare function createGlassFilter(options: LiquidGlassOptions, width: number, height: number): GlassFilter;

/**
 * Radial displacement map that pulls every sample toward the element's
 * center, producing a magnifying (zoom) effect when applied with
 * `<feDisplacementMap scale="…">`. Applied to the source *before* the glass
 * refraction pass, so the bezel refracts the already-magnified backdrop.
 */
declare function buildMagnifyMap(cssWidth: number, cssHeight: number, dpr?: number): Raster;

interface DisplacementProfileOptions {
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
interface DisplacementProfile {
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
declare function computeDisplacementProfile(options?: DisplacementProfileOptions): DisplacementProfile;

/** True when the browser can use SVG filters as `backdrop-filter`. */
declare function supportsLiquidGlass(): boolean;
/**
 * Applies the Liquid Glass effect to a single element. Options are read
 * from the element's `--lg-*` custom properties (merged over `base`); any
 * `overrides` win over the CSS values.
 *
 * Returns a release function that removes the effect.
 */
declare function applyLiquidGlass(el: HTMLElement, overrides?: Partial<LiquidGlassOptions>, base?: LiquidGlassOptions): () => void;
/**
 * Re-reads the element's CSS custom properties and rebuilds the filter if
 * the effective configuration changed (also called automatically on resize).
 */
declare function refreshLiquidGlass(el: HTMLElement, base?: LiquidGlassOptions): void;
/** Removes the effect from an element previously passed to `applyLiquidGlass`. */
declare function releaseLiquidGlass(el: HTMLElement): void;
/**
 * Applies the effect to every `.liquid-glass` / `[data-liquid-glass]`
 * element under `root` (the root itself included when it matches).
 * Returns the matched elements.
 */
declare function scanLiquidGlass(root?: ParentNode): HTMLElement[];
interface StartOptions {
    root?: ParentNode;
    /**
     * Watch for added/removed elements, `class`/`style` mutations and
     * resizes, keeping filters in sync automatically. Default true.
     */
    observe?: boolean;
}
/**
 * One-call setup: scans for glass elements and (optionally) keeps them in
 * sync with the DOM forever after. Returns a stop function.
 *
 * ```js
 * import { startLiquidGlass } from "liquid-glass-css";
 * startLiquidGlass();
 * ```
 */
declare function startLiquidGlass(options?: StartOptions): () => void;

interface SpecularShape {
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
declare function buildSpecularMap(shape: SpecularShape, angle?: number, rimWidth?: number, dpr?: number): Raster;

/**
 * Converts a raster to a PNG data URL using an in-memory canvas.
 * Browser-only — the DOM-free core returns rasters, this is the bridge.
 */
declare function rasterToDataURL(raster: Raster): string;

export { type DisplacementProfile, type DisplacementProfileOptions, type LiquidGlassOptions, type Raster, type StartOptions, type SurfaceFunction, type SurfaceName, applyLiquidGlass, buildDisplacementMap, buildMagnifyMap, buildSpecularMap, circleSurface, computeDisplacementProfile, concaveSurface, createGlassFilter, createRaster, defaultOptions, lipSurface, optionsFromElement, rasterToDataURL, refreshLiquidGlass, releaseLiquidGlass, resolveOptions, resolveSurface, scanLiquidGlass, squircleSurface, startLiquidGlass, supportsLiquidGlass, surfaceNames, surfaces };
