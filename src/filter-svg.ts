import { buildDisplacementMap } from "./displacement-map";
import { buildMagnifyMap } from "./magnify-map";
import type { LiquidGlassOptions } from "./options";
import { computeDisplacementProfile } from "./refraction";
import { buildSpecularMap } from "./specular-map";
import { rasterToDataURL } from "./to-data-url";

const SVG_NS = "http://www.w3.org/2000/svg";

let uid = 0;

const SCHEME_MATRIX: Record<"light" | "dark", string> = {
  light: "1.03 0 0 0 0.2 0 1.03 0 0 0.2 0 0 1.03 0 0.2 0 0 0 1 0",
  dark: "0.9 0 0 0 -0.3 0 0.9 0 0 -0.3 0 0 0.9 0 -0.3 0 0 0 1 0",
};

export interface GlassFilter {
  /** Filter id — apply with `backdrop-filter: url(#id)`. */
  id: string;
  element: SVGFilterElement;
  /** Removes the filter element from the DOM. */
  dispose(): void;
}

const el = <K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] => {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
};

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
export function createGlassFilter(
  options: LiquidGlassOptions,
  width: number,
  height: number,
): GlassFilter {
  const dpr = options.dpr ?? (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
  const radius = Math.max(
    Math.min(options.radius ?? 0, width / 2, height / 2),
    Math.min(options.bezelWidth, width / 2, height / 2),
  );
  const shape = { width, height, radius, bezelWidth: options.bezelWidth };

  const { profile, max } = computeDisplacementProfile({
    thickness: options.thickness,
    bezelWidth: options.bezelWidth,
    surface: options.surface,
    ior: options.ior,
  });

  const displacementURL = rasterToDataURL(
    buildDisplacementMap(shape, profile, max, dpr),
  );

  const id = `lgf-${++uid}`;
  const filter = el("filter", {
    id,
    "color-interpolation-filters": "sRGB",
  });

  // The input of each stage is the output of the previous one.
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
        result: "lg-mag-map",
      }),
    );
    filter.appendChild(
      el("feDisplacementMap", {
        in: input,
        in2: "lg-mag-map",
        scale: options.magnify,
        xChannelSelector: "R",
        yChannelSelector: "G",
        result: "lg-magnified",
      }),
    );
    input = "lg-magnified";
  }

  if (options.scheme !== "none") {
    filter.appendChild(
      el("feColorMatrix", {
        in: input,
        type: "matrix",
        values: SCHEME_MATRIX[options.scheme],
        result: "lg-scheme",
      }),
    );
    input = "lg-scheme";
  }

  if (options.blur > 0) {
    filter.appendChild(
      el("feGaussianBlur", {
        in: input,
        stdDeviation: options.blur,
        result: "lg-blur",
      }),
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
      result: "lg-map",
    }),
  );
  filter.appendChild(
    el("feDisplacementMap", {
      in: input,
      in2: "lg-map",
      scale: max * options.intensity,
      xChannelSelector: "R",
      yChannelSelector: "G",
      result: "lg-refract",
    }),
  );
  input = "lg-refract";

  if (options.saturate !== 1) {
    filter.appendChild(
      el("feColorMatrix", {
        in: input,
        type: "saturate",
        values: options.saturate,
        result: "lg-sat",
      }),
    );
    input = "lg-sat";
  }

  if (options.specularOpacity > 0) {
    const specularURL = rasterToDataURL(
      buildSpecularMap(
        shape,
        (options.specularAngle * Math.PI) / 180,
        options.specularWidth,
        dpr,
      ),
    );
    filter.appendChild(
      el("feImage", {
        href: specularURL,
        x: 0,
        y: 0,
        width,
        height,
        preserveAspectRatio: "none",
        result: "lg-spec",
      }),
    );
    const transfer = el("feComponentTransfer", {
      in: "lg-spec",
      result: "lg-spec-faded",
    });
    transfer.appendChild(
      el("feFuncA", { type: "linear", slope: options.specularOpacity }),
    );
    filter.appendChild(transfer);
    filter.appendChild(
      el("feBlend", { in: "lg-spec-faded", in2: input, mode: "normal" }),
    );
  }

  return {
    id,
    element: filter,
    dispose() {
      filter.remove();
    },
  };
}
