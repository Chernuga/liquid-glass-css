/**
 * `liquid-glass-css/auto` — importing this entry applies the effect to all
 * `.liquid-glass` / `[data-liquid-glass]` elements and keeps watching the
 * DOM, with zero further code:
 *
 * ```html
 * <script type="module" src="https://unpkg.com/liquid-glass-css/dist/auto.js"></script>
 * ```
 */
import { startLiquidGlass } from "./runtime";

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => startLiquidGlass(), {
      once: true,
    });
  } else {
    startLiquidGlass();
  }
}
