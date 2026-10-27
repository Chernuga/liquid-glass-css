// src/surfaces.ts
var clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
var circleSurface = (x) => Math.sqrt(Math.max(0, 1 - (1 - clamp01(x)) ** 2));
var squircleSurface = (x) => Math.pow(Math.max(0, 1 - (1 - clamp01(x)) ** 4), 0.25);
var concaveSurface = (x) => 1 - circleSurface(x);
var smootherstep = (x) => {
  const t = clamp01(x);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
var lipSurface = (x) => {
  const convex = squircleSurface(clamp01(x * 2));
  const concave = concaveSurface(x) + 0.1;
  const t = smootherstep(x);
  return convex * (1 - t) + concave * t;
};
var surfaces = {
  circle: circleSurface,
  squircle: squircleSurface,
  concave: concaveSurface,
  lip: lipSurface
};
var surfaceNames = Object.keys(surfaces);
function resolveSurface(surface) {
  if (typeof surface === "function") return surface;
  return surfaces[surface] ?? squircleSurface;
}

// src/css-props.ts
var num = (raw) => {
  if (!raw) return void 0;
  const v = parseFloat(raw);
  return Number.isFinite(v) ? v : void 0;
};
var length = num;
var angle = (raw) => {
  if (!raw) return void 0;
  const v = parseFloat(raw);
  if (!Number.isFinite(v)) return void 0;
  const unit = raw.trim().slice(String(v).length).toLowerCase();
  switch (unit) {
    case "rad":
      return v * 180 / Math.PI;
    case "turn":
      return v * 360;
    case "grad":
      return v * 0.9;
    default:
      return v;
  }
};
var keyword = (raw, allowed) => {
  if (!raw) return void 0;
  const v = raw.trim().toLowerCase();
  return allowed.includes(v) ? v : void 0;
};
function optionsFromElement(el2, base, computed) {
  const style = computed ?? getComputedStyle(el2);
  const get = (name) => {
    const v = style.getPropertyValue(name);
    return v && v.trim() !== "" ? v : void 0;
  };
  const radius = length(get("--lg-radius")) ?? num(style.borderTopLeftRadius) ?? 0;
  const rect = el2.getBoundingClientRect();
  return {
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
    options: {
      ...base,
      surface: keyword(get("--lg-surface"), surfaceNames) ?? base.surface,
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
      radius
    }
  };
}

// src/raster.ts
function createRaster(width, height) {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
}

// src/displacement-map.ts
function buildDisplacementMap(shape, profile, maxDisplacement, dpr = 1) {
  const width = Math.max(1, Math.round(shape.width * dpr));
  const height = Math.max(1, Math.round(shape.height * dpr));
  const raster = createRaster(width, height);
  new Uint32Array(raster.data.buffer).fill(4278222976);
  const radius = Math.min(Math.round(shape.radius * dpr), width >> 1, height >> 1);
  const bezel = Math.min(Math.max(1, Math.round(shape.bezelWidth * dpr)), radius);
  if (radius <= 0 || profile.length === 0) return raster;
  const outerSquared = (radius + 1) ** 2;
  const innerSquared = (radius - bezel) ** 2;
  const radiusSquared = radius ** 2;
  const outerRadius = Math.sqrt(outerSquared);
  const max = maxDisplacement || 1;
  const spanX = width - 2 * radius;
  const spanY = height - 2 * radius;
  const n = profile.length;
  for (let y = 0; y < height; y++) {
    const py = y + 0.5;
    const cy = py < radius ? py - radius : py >= height - radius ? py - radius - spanY : 0;
    for (let x = 0; x < width; x++) {
      const px = x + 0.5;
      const cx = px < radius ? px - radius : px >= width - radius ? px - radius - spanX : 0;
      const distSquared = cx * cx + cy * cy;
      if (distSquared > outerSquared || distSquared < innerSquared) continue;
      const dist = Math.sqrt(distSquared);
      const fromSide = radius - dist;
      const index = Math.min(n - 1, Math.max(0, fromSide / bezel * n | 0));
      const displacement = profile[index] ?? 0;
      if (displacement === 0) continue;
      const inv = dist > 0 ? 1 / dist : 0;
      const dx = -cx * inv * displacement / max;
      const dy = -cy * inv * displacement / max;
      const fade = distSquared <= radiusSquared ? 1 : Math.max(0, 1 - (dist - radius) / (outerRadius - radius));
      const i = (y * width + x) * 4;
      raster.data[i] = 128 + dx * 127 * fade;
      raster.data[i + 1] = 128 + dy * 127 * fade;
    }
  }
  return raster;
}

// src/magnify-map.ts
function buildMagnifyMap(cssWidth, cssHeight, dpr = 1) {
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

// src/refraction.ts
function computeDisplacementProfile(options = {}) {
  const {
    thickness = 60,
    bezelWidth = 16,
    surface = "squircle",
    ior = 1.5,
    samples = 128
  } = options;
  const fn = resolveSurface(surface);
  const eta = 1 / ior;
  const profile = new Array(samples);
  const eps = 1e-4;
  for (let i = 0; i < samples; i++) {
    const x = i / samples;
    const h = fn(x);
    const xa = Math.max(0, x - eps);
    const xb = Math.min(1, x + eps);
    const slope = xb > xa ? (fn(xb) - fn(xa)) / (xb - xa) : 0;
    const len = Math.hypot(slope, 1);
    const nx = -slope / len;
    const ny = -1 / len;
    const dot = ny;
    const k = 1 - eta * eta * (1 - dot * dot);
    if (k < 0) {
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

// src/specular-map.ts
function buildSpecularMap(shape, angle2 = Math.PI / 3, rimWidth = 1.2, dpr = 1) {
  const width = Math.max(1, Math.round(shape.width * dpr));
  const height = Math.max(1, Math.round(shape.height * dpr));
  const raster = createRaster(width, height);
  const radius = Math.min(Math.round(shape.radius * dpr), width >> 1, height >> 1);
  const bezel = Math.min(Math.max(1, Math.round(shape.bezelWidth * dpr)), radius);
  if (radius <= 0) return raster;
  const lightX = Math.cos(angle2);
  const lightY = Math.sin(angle2);
  const outerSquared = (radius + 1) ** 2;
  const innerSquared = (radius - bezel) ** 2;
  const radiusSquared = radius ** 2;
  const outerRadius = Math.sqrt(outerSquared);
  const rim = Math.max(1e-6, rimWidth * dpr);
  const spanX = width - 2 * radius;
  const spanY = height - 2 * radius;
  for (let y = 0; y < height; y++) {
    const py = y + 0.5;
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
      const facing = Math.abs(cx * inv * lightX + -cy * inv * lightY);
      const t = Math.min(1, fromSide / rim);
      const profile = Math.sqrt(Math.max(0, 1 - (1 - t) ** 2));
      const coefficient = facing * profile;
      if (coefficient <= 0) continue;
      const fade = distSquared <= radiusSquared ? 1 : Math.max(0, 1 - (dist - radius) / (outerRadius - radius));
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

// src/to-data-url.ts
function rasterToDataURL(raster) {
  const canvas = document.createElement("canvas");
  canvas.width = raster.width;
  canvas.height = raster.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("liquid-glass-css: 2D canvas context unavailable");
  ctx.putImageData(
    new ImageData(
      new Uint8ClampedArray(raster.data),
      raster.width,
      raster.height
    ),
    0,
    0
  );
  return canvas.toDataURL("image/png");
}

// src/filter-svg.ts
var SVG_NS = "http://www.w3.org/2000/svg";
var uid = 0;
var SCHEME_MATRIX = {
  light: "1.03 0 0 0 0.2 0 1.03 0 0 0.2 0 0 1.03 0 0.2 0 0 0 1 0",
  dark: "0.9 0 0 0 -0.3 0 0.9 0 0 -0.3 0 0 0.9 0 -0.3 0 0 0 1 0"
};
var el = (name, attrs) => {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
};
function createGlassFilter(options, width, height) {
  const dpr = options.dpr ?? (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
  const radius = Math.max(
    Math.min(options.radius ?? 0, width / 2, height / 2),
    Math.min(options.bezelWidth, width / 2, height / 2)
  );
  const shape = { width, height, radius, bezelWidth: options.bezelWidth };
  const { profile, max } = computeDisplacementProfile({
    thickness: options.thickness,
    bezelWidth: options.bezelWidth,
    surface: options.surface,
    ior: options.ior
  });
  const displacementURL = rasterToDataURL(
    buildDisplacementMap(shape, profile, max, dpr)
  );
  const id = `lgf-${++uid}`;
  const filter = el("filter", {
    id,
    "color-interpolation-filters": "sRGB"
  });
  let input = "SourceGraphic";
  if (options.magnify > 0) {
    const magnifyURL = rasterToDataURL(buildMagnifyMap(width, height, dpr));
    filter.appendChild(
      el("feImage", {
        href: magnifyURL,
        x: 0,
        y: 0,
        width,
        height,
        preserveAspectRatio: "none",
        result: "lg-mag-map"
      })
    );
    filter.appendChild(
      el("feDisplacementMap", {
        in: input,
        in2: "lg-mag-map",
        scale: options.magnify,
        xChannelSelector: "R",
        yChannelSelector: "G",
        result: "lg-magnified"
      })
    );
    input = "lg-magnified";
  }
  if (options.scheme !== "none") {
    filter.appendChild(
      el("feColorMatrix", {
        in: input,
        type: "matrix",
        values: SCHEME_MATRIX[options.scheme],
        result: "lg-scheme"
      })
    );
    input = "lg-scheme";
  }
  if (options.blur > 0) {
    filter.appendChild(
      el("feGaussianBlur", {
        in: input,
        stdDeviation: options.blur,
        result: "lg-blur"
      })
    );
    input = "lg-blur";
  }
  filter.appendChild(
    el("feImage", {
      href: displacementURL,
      x: 0,
      y: 0,
      width,
      height,
      preserveAspectRatio: "none",
      result: "lg-map"
    })
  );
  filter.appendChild(
    el("feDisplacementMap", {
      in: input,
      in2: "lg-map",
      scale: max * options.intensity,
      xChannelSelector: "R",
      yChannelSelector: "G",
      result: "lg-refract"
    })
  );
  input = "lg-refract";
  if (options.saturate !== 1) {
    filter.appendChild(
      el("feColorMatrix", {
        in: input,
        type: "saturate",
        values: options.saturate,
        result: "lg-sat"
      })
    );
    input = "lg-sat";
  }
  if (options.specularOpacity > 0) {
    const specularURL = rasterToDataURL(
      buildSpecularMap(
        shape,
        options.specularAngle * Math.PI / 180,
        options.specularWidth,
        dpr
      )
    );
    filter.appendChild(
      el("feImage", {
        href: specularURL,
        x: 0,
        y: 0,
        width,
        height,
        preserveAspectRatio: "none",
        result: "lg-spec"
      })
    );
    const transfer = el("feComponentTransfer", {
      in: "lg-spec",
      result: "lg-spec-faded"
    });
    transfer.appendChild(
      el("feFuncA", { type: "linear", slope: options.specularOpacity })
    );
    filter.appendChild(transfer);
    filter.appendChild(
      el("feBlend", { in: "lg-spec-faded", in2: input, mode: "normal" })
    );
  }
  return {
    id,
    element: filter,
    dispose() {
      filter.remove();
    }
  };
}

// src/options.ts
var defaultOptions = {
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
  magnify: 0
};
function resolveOptions(partial = {}) {
  return { ...defaultOptions, ...partial };
}

// src/runtime.ts
var SVG_NS2 = "http://www.w3.org/2000/svg";
var SELECTOR = ".liquid-glass, [data-liquid-glass]";
function supportsLiquidGlass() {
  return typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("backdrop-filter", 'url("#liquid-glass")');
}
var svgHost = null;
var filterCache = /* @__PURE__ */ new Map();
var applied = /* @__PURE__ */ new WeakMap();
var resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver((entries) => {
  for (const entry of entries) {
    if (entry.target instanceof HTMLElement) refreshLiquidGlass(entry.target);
  }
}) : null;
function ensureSvgHost() {
  if (svgHost && svgHost.isConnected) return svgHost;
  svgHost = document.createElementNS(SVG_NS2, "svg");
  svgHost.setAttribute("aria-hidden", "true");
  svgHost.setAttribute(
    "style",
    "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none"
  );
  (document.body ?? document.documentElement).appendChild(svgHost);
  return svgHost;
}
function optionsKey(options, width, height, dpr) {
  const surface = typeof options.surface === "function" ? options.surface.name || "custom" : options.surface;
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
    dpr
  ]);
}
function acquireFilter(key, factory) {
  const cached = filterCache.get(key);
  if (cached) {
    cached.refs++;
    return cached;
  }
  const built = factory();
  ensureSvgHost().appendChild(built.element);
  const entry = {
    id: built.id,
    refs: 1,
    dispose: built.dispose
  };
  filterCache.set(key, entry);
  return entry;
}
function releaseFilter(key) {
  const entry = filterCache.get(key);
  if (!entry) return;
  entry.refs--;
  if (entry.refs <= 0) {
    entry.dispose();
    filterCache.delete(key);
  }
}
function fallback(el2) {
  el2.classList.add("lg-fallback");
}
function applyLiquidGlass(el2, overrides = {}, base = defaultOptions) {
  if (!supportsLiquidGlass()) {
    fallback(el2);
    return () => el2.classList.remove("lg-fallback");
  }
  const { options: cssOptions, width, height } = optionsFromElement(el2, base);
  const options = { ...cssOptions, ...overrides };
  const dpr = options.dpr ?? window.devicePixelRatio ?? 1;
  const key = optionsKey(options, width, height, dpr);
  const previous = applied.get(el2);
  if (previous && previous.key === key) return () => releaseLiquidGlass(el2);
  if (previous && previous.filterId) releaseFilter(previous.key);
  const entry = acquireFilter(key, () => createGlassFilter(options, width, height));
  el2.style.backdropFilter = `url("#${entry.id}")`;
  applied.set(el2, { key, filterId: entry.id });
  if (resizeObserver && !previous) resizeObserver.observe(el2);
  return () => releaseLiquidGlass(el2);
}
function refreshLiquidGlass(el2, base = defaultOptions) {
  const previous = applied.get(el2);
  if (!previous) return;
  const { options, width, height } = optionsFromElement(el2, base);
  const dpr = options.dpr ?? window.devicePixelRatio ?? 1;
  const key = optionsKey(options, width, height, dpr);
  if (key === previous.key) return;
  releaseFilter(previous.key);
  const entry = acquireFilter(key, () => createGlassFilter(options, width, height));
  el2.style.backdropFilter = `url("#${entry.id}")`;
  applied.set(el2, { key, filterId: entry.id });
}
function releaseLiquidGlass(el2) {
  const previous = applied.get(el2);
  if (!previous) return;
  if (previous.filterId) releaseFilter(previous.key);
  el2.style.backdropFilter = "";
  applied.delete(el2);
  resizeObserver?.unobserve(el2);
}
function scanLiquidGlass(root = document) {
  const found = [];
  if (root instanceof HTMLElement && root.matches(SELECTOR)) found.push(root);
  for (const el2 of root.querySelectorAll(SELECTOR)) {
    if (el2 instanceof HTMLElement) found.push(el2);
  }
  for (const el2 of found) applyLiquidGlass(el2);
  return found;
}
function startLiquidGlass(options = {}) {
  const { root = document, observe = true } = options;
  scanLiquidGlass(root);
  if (!observe) return () => {
  };
  const mutations = new MutationObserver((records) => {
    let rescanNeeded = false;
    for (const record of records) {
      if (record.type === "childList") {
        for (const node of record.addedNodes) {
          if (node instanceof HTMLElement && (node.matches(SELECTOR) || node.querySelector(SELECTOR))) {
            rescanNeeded = true;
          }
        }
        for (const node of record.removedNodes) {
          if (node instanceof HTMLElement) releaseLiquidGlass(node);
        }
      } else if (record.type === "attributes" && record.target instanceof HTMLElement) {
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
    attributeFilter: ["class", "style"]
  });
  return () => {
    mutations.disconnect();
    resizeObserver?.disconnect();
  };
}

export {
  circleSurface,
  squircleSurface,
  concaveSurface,
  lipSurface,
  surfaces,
  surfaceNames,
  resolveSurface,
  optionsFromElement,
  createRaster,
  buildDisplacementMap,
  buildMagnifyMap,
  computeDisplacementProfile,
  buildSpecularMap,
  rasterToDataURL,
  createGlassFilter,
  defaultOptions,
  resolveOptions,
  supportsLiquidGlass,
  applyLiquidGlass,
  refreshLiquidGlass,
  releaseLiquidGlass,
  scanLiquidGlass,
  startLiquidGlass
};
//# sourceMappingURL=chunk-EUFHCOGY.js.map