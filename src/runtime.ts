import { optionsFromElement } from "./css-props";
import { createGlassFilter } from "./filter-svg";
import { defaultOptions, type LiquidGlassOptions } from "./options";

const SVG_NS = "http://www.w3.org/2000/svg";
const SELECTOR = ".liquid-glass, [data-liquid-glass]";

/** True when the browser can use SVG filters as `backdrop-filter`. */
export function supportsLiquidGlass(): boolean {
  return (
    typeof CSS !== "undefined" &&
    typeof CSS.supports === "function" &&
    CSS.supports("backdrop-filter", 'url("#liquid-glass")')
  );
}

interface CacheEntry {
  id: string;
  refs: number;
  dispose(): void;
}

interface AppliedState {
  key: string;
  filterId: string | null;
}

let svgHost: SVGSVGElement | null = null;
const filterCache = new Map<string, CacheEntry>();
const applied = new WeakMap<HTMLElement, AppliedState>();
const resizeObserver =
  typeof ResizeObserver !== "undefined"
    ? new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.target instanceof HTMLElement) refreshLiquidGlass(entry.target);
        }
      })
    : null;

function ensureSvgHost(): SVGSVGElement {
  if (svgHost && svgHost.isConnected) return svgHost;
  svgHost = document.createElementNS(SVG_NS, "svg");
  svgHost.setAttribute("aria-hidden", "true");
  svgHost.setAttribute(
    "style",
    "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none",
  );
  (document.body ?? document.documentElement).appendChild(svgHost);
  return svgHost;
}

function optionsKey(
  options: LiquidGlassOptions,
  width: number,
  height: number,
  dpr: number,
): string {
  const surface =
    typeof options.surface === "function" ? options.surface.name || "custom" : options.surface;
  return JSON.stringify([
    surface,
    options.bezelWidth,
    options.thickness,
    options.ior,
    options.intensity,
    options.blur,
    options.saturate,
    options.specularOpacity,
    options.specularAngle,
    options.specularWidth,
    options.scheme,
    options.magnify,
    options.radius,
    width,
    height,
    dpr,
  ]);
}

function acquireFilter(key: string, factory: () => { id: string; element: SVGFilterElement; dispose(): void }): CacheEntry {
  const cached = filterCache.get(key);
  if (cached) {
    cached.refs++;
    return cached;
  }
  const built = factory();
  ensureSvgHost().appendChild(built.element);
  const entry: CacheEntry = {
    id: built.id,
    refs: 1,
    dispose: built.dispose,
  };
  filterCache.set(key, entry);
  return entry;
}

function releaseFilter(key: string): void {
  const entry = filterCache.get(key);
  if (!entry) return;
  entry.refs--;
  if (entry.refs <= 0) {
    entry.dispose();
    filterCache.delete(key);
  }
}

function fallback(el: HTMLElement): void {
  el.classList.add("lg-fallback");
}

/**
 * Applies the Liquid Glass effect to a single element. Options are read
 * from the element's `--lg-*` custom properties (merged over `base`); any
 * `overrides` win over the CSS values.
 *
 * Returns a release function that removes the effect.
 */
export function applyLiquidGlass(
  el: HTMLElement,
  overrides: Partial<LiquidGlassOptions> = {},
  base: LiquidGlassOptions = defaultOptions,
): () => void {
  if (!supportsLiquidGlass()) {
    fallback(el);
    return () => el.classList.remove("lg-fallback");
  }

  const { options: cssOptions, width, height } = optionsFromElement(el, base);
  const options: LiquidGlassOptions = { ...cssOptions, ...overrides };
  const dpr = options.dpr ?? window.devicePixelRatio ?? 1;
  const key = optionsKey(options, width, height, dpr);

  const previous = applied.get(el);
  if (previous && previous.key === key) return () => releaseLiquidGlass(el);
  if (previous && previous.filterId) releaseFilter(previous.key);

  const entry = acquireFilter(key, () => createGlassFilter(options, width, height));
  el.style.backdropFilter = `url("#${entry.id}")`;
  applied.set(el, { key, filterId: entry.id });

  if (resizeObserver && !previous) resizeObserver.observe(el);

  return () => releaseLiquidGlass(el);
}

/**
 * Re-reads the element's CSS custom properties and rebuilds the filter if
 * the effective configuration changed (also called automatically on resize).
 */
export function refreshLiquidGlass(
  el: HTMLElement,
  base: LiquidGlassOptions = defaultOptions,
): void {
  const previous = applied.get(el);
  if (!previous) return;
  const { options, width, height } = optionsFromElement(el, base);
  const dpr = options.dpr ?? window.devicePixelRatio ?? 1;
  const key = optionsKey(options, width, height, dpr);
  if (key === previous.key) return;

  releaseFilter(previous.key);
  const entry = acquireFilter(key, () => createGlassFilter(options, width, height));
  el.style.backdropFilter = `url("#${entry.id}")`;
  applied.set(el, { key, filterId: entry.id });
}

/** Removes the effect from an element previously passed to `applyLiquidGlass`. */
export function releaseLiquidGlass(el: HTMLElement): void {
  const previous = applied.get(el);
  if (!previous) return;
  if (previous.filterId) releaseFilter(previous.key);
  el.style.backdropFilter = "";
  applied.delete(el);
  resizeObserver?.unobserve(el);
}

/**
 * Applies the effect to every `.liquid-glass` / `[data-liquid-glass]`
 * element under `root` (the root itself included when it matches).
 * Returns the matched elements.
 */
export function scanLiquidGlass(root: ParentNode = document): HTMLElement[] {
  const found: HTMLElement[] = [];
  if (root instanceof HTMLElement && root.matches(SELECTOR)) found.push(root);
  for (const el of root.querySelectorAll(SELECTOR)) {
    if (el instanceof HTMLElement) found.push(el);
  }
  for (const el of found) applyLiquidGlass(el);
  return found;
}

export interface StartOptions {
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
export function startLiquidGlass(options: StartOptions = {}): () => void {
  const { root = document, observe = true } = options;
  scanLiquidGlass(root);

  if (!observe) return () => {};

  const mutations = new MutationObserver((records) => {
    let rescanNeeded = false;
    for (const record of records) {
      if (record.type === "childList") {
        for (const node of record.addedNodes) {
          if (
            node instanceof HTMLElement &&
            (node.matches(SELECTOR) || node.querySelector(SELECTOR))
          ) {
            rescanNeeded = true;
          }
        }
        for (const node of record.removedNodes) {
          if (node instanceof HTMLElement) releaseLiquidGlass(node);
        }
      } else if (
        record.type === "attributes" &&
        record.target instanceof HTMLElement
      ) {
        const target = record.target;
        if (target.matches(SELECTOR)) {
          if (applied.has(target)) refreshLiquidGlass(target);
          else applyLiquidGlass(target);
        } else if (applied.has(target)) {
          releaseLiquidGlass(target);
        }
      }
    }
    if (rescanNeeded) scanLiquidGlass(root);
  });

  const observeTarget = root instanceof Document ? root.documentElement : root;
  mutations.observe(observeTarget, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style"],
  });

  return () => {
    mutations.disconnect();
    resizeObserver?.disconnect();
  };
}
