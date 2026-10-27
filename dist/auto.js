import {
  startLiquidGlass
} from "./chunk-EUFHCOGY.js";

// src/auto.ts
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => startLiquidGlass(), {
      once: true
    });
  } else {
    startLiquidGlass();
  }
}
//# sourceMappingURL=auto.js.map