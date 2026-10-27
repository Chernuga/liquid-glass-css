import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeDisplacementProfile,
  buildDisplacementMap,
  buildSpecularMap,
  buildMagnifyMap,
  surfaces,
  resolveSurface,
} from "../dist/index.js";

describe("surface functions", () => {
  it("resolve by name and accept custom functions", () => {
    assert.equal(resolveSurface("circle"), surfaces.circle);
    const custom = (x) => x;
    assert.equal(resolveSurface(custom), custom);
  });

  it("convex profiles start at 0 on the outer edge", () => {
    for (const name of ["circle", "squircle", "lip"]) {
      assert.ok(Math.abs(surfaces[name](0)) < 1e-9, `${name}(0) = ${surfaces[name](0)}`);
    }
    // Concave is the complement: full height at the rim, 0 in the interior.
    assert.ok(Math.abs(surfaces.concave(0) - 1) < 1e-9);
    assert.ok(Math.abs(surfaces.concave(1)) < 1e-9);
  });

  it("convex profiles reach full height at the inner edge", () => {
    assert.ok(Math.abs(surfaces.circle(1) - 1) < 1e-9);
    assert.ok(Math.abs(surfaces.squircle(1) - 1) < 1e-9);
  });

  it("squircle stays flatter than circle near the interior", () => {
    // The squircle transitions to flat sooner → lower slope near x=1.
    const slope = (fn, x) => (fn(x + 0.001) - fn(x - 0.001)) / 0.002;
    assert.ok(slope(surfaces.squircle, 0.95) < slope(surfaces.circle, 0.95));
  });
});

describe("computeDisplacementProfile", () => {
  it("produces (numerically) zero displacement with ior = 1", () => {
    const { profile, max } = computeDisplacementProfile({ ior: 1 });
    assert.ok(max < 1e-9, `expected ~0, got max=${max}`);
    assert.ok(profile.every((d) => Math.abs(d) < 1e-9));
  });

  it("convex surfaces displace inward (positive)", () => {
    const { profile, max } = computeDisplacementProfile({
      surface: "squircle",
      ior: 1.5,
      bezelWidth: 20,
      thickness: 60,
    });
    assert.ok(max > 0);
    // No outward displacement anywhere for a convex profile.
    assert.ok(profile.every((d) => d >= 0));
  });

  it("concave surfaces displace outward (negative)", () => {
    const { profile, max } = computeDisplacementProfile({
      surface: "concave",
      ior: 1.5,
    });
    assert.ok(max > 0);
    assert.ok(profile.every((d) => d <= 0));
  });

  it("flat interior (x → 1) barely displaces", () => {
    const { profile } = computeDisplacementProfile({ surface: "squircle" });
    const last = Math.abs(profile[profile.length - 1]);
    assert.ok(last < 1e-3, `expected ~0 at flat interior, got ${last}`);
  });

  it("higher refractive index → stronger displacement", () => {
    const glass = computeDisplacementProfile({ ior: 1.5 });
    const dense = computeDisplacementProfile({ ior: 2.0 });
    assert.ok(dense.max > glass.max);
  });

  it("thicker glass → stronger displacement", () => {
    const thin = computeDisplacementProfile({ thickness: 10 });
    const thick = computeDisplacementProfile({ thickness: 100 });
    assert.ok(thick.max > thin.max);
  });
});

describe("buildDisplacementMap", () => {
  const { profile, max } = computeDisplacementProfile({
    surface: "squircle",
    bezelWidth: 10,
    thickness: 60,
  });
  const shape = { width: 100, height: 60, radius: 20, bezelWidth: 10 };
  const map = buildDisplacementMap(shape, profile, max, 1);
  const px = (x, y) => {
    const i = (y * map.width + x) * 4;
    return [map.data[i], map.data[i + 1], map.data[i + 2], map.data[i + 3]];
  };

  it("has the requested size", () => {
    assert.equal(map.width, 100);
    assert.equal(map.height, 60);
    assert.equal(map.data.length, 100 * 60 * 4);
  });

  it("is neutral (128,128) in the flat interior", () => {
    const [r, g] = px(50, 30);
    assert.equal(r, 128);
    assert.equal(g, 128);
  });

  it("pulls the left edge inward (+x) and the right edge inward (−x)", () => {
    // Mid-height, a few px inside the bezel on each side.
    const left = px(3, 30);
    const right = px(96, 30);
    assert.ok(left[0] > 128, `left R=${left[0]} should be > 128`);
    assert.ok(right[0] < 128, `right R=${right[0]} should be < 128`);
  });

  it("pulls the top edge downward (+y) and bottom edge upward (−y)", () => {
    const top = px(50, 3);
    const bottom = px(50, 56);
    assert.ok(top[1] > 128, `top G=${top[1]} should be > 128`);
    assert.ok(bottom[1] < 128, `bottom G=${bottom[1]} should be < 128`);
  });

  it("is symmetric about both axes (within raster rounding)", () => {
    for (const [x, y] of [[2, 2], [5, 10], [17, 7]]) {
      const tl = px(x, y);
      const tr = px(99 - x, y);
      const bl = px(x, 59 - y);
      assert.ok(
        Math.abs((tl[0] - 128) + (tr[0] - 128)) <= 3,
        `x-symmetry at ${x},${y}: ${tl[0]} vs ${tr[0]}`,
      );
      assert.ok(
        Math.abs((tl[1] - 128) + (bl[1] - 128)) <= 3,
        `y-symmetry at ${x},${y}: ${tl[1]} vs ${bl[1]}`,
      );
    }
  });

  it("scales the raster with dpr", () => {
    const retina = buildDisplacementMap(shape, profile, max, 2);
    assert.equal(retina.width, 200);
    assert.equal(retina.height, 120);
  });
});

describe("buildSpecularMap", () => {
  const shape = { width: 100, height: 60, radius: 20, bezelWidth: 10 };
  const map = buildSpecularMap(shape, Math.PI / 3, 2, 1);

  it("produces no highlight in the flat interior", () => {
    const i = (30 * map.width + 50) * 4;
    assert.equal(map.data[i + 3], 0);
  });

  it("places highlights along the light axis", () => {
    // Light at 60° → strongest rim near the corner facing 60°/240°.
    let litSum = 0;
    let darkSum = 0;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const i = (y * map.width + x) * 4;
        const a = map.data[i + 3];
        const angle = Math.atan2(-(y - 30), x - 50); // y up
        const deg = ((angle * 180) / Math.PI + 360) % 360;
        if (Math.abs(deg - 60) < 20 || Math.abs(deg - 240) < 20) litSum += a;
        if (Math.abs(deg - 150) < 20 || Math.abs(deg - 330) < 20) darkSum += a;
      }
    }
    assert.ok(litSum > darkSum, `lit ${litSum} should exceed dark ${darkSum}`);
  });
});

describe("buildMagnifyMap", () => {
  it("is neutral at the center and samples inward at the corners", () => {
    const map = buildMagnifyMap(100, 60, 1);
    const center = ((30 * map.width + 50) * 4);
    assert.ok(Math.abs(map.data[center] - 128) <= 1);
    assert.ok(Math.abs(map.data[center + 1] - 128) <= 1);
    // Top-left samples toward +x/+y (inward = magnify).
    assert.ok(map.data[0] > 200, `corner R=${map.data[0]}`);
    assert.ok(map.data[1] > 150, `corner G=${map.data[1]}`);
    // Bottom-right samples toward −x/−y.
    const br = ((map.height - 1) * map.width + (map.width - 1)) * 4;
    assert.ok(map.data[br] < 55, `bottom-right R=${map.data[br]}`);
    assert.ok(map.data[br + 1] < 105, `bottom-right G=${map.data[br + 1]}`);
  });
});
