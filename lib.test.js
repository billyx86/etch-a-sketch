// Unit tests for the pure grid/colour logic in lib.js.
// Run with: node --test lib.test.js  (no dependencies, stdlib only)
import test from "node:test";
import assert from "node:assert/strict";

import {
    MIN_GRID_SIZE,
    MAX_GRID_SIZE,
    resolveGridSize,
    cellCount,
    pickRandomColor,
    TOOLS,
    isToolId,
} from "./lib.js";

test("MIN/MAX grid size bounds", () => {
    assert.equal(MIN_GRID_SIZE, 1);
    assert.equal(MAX_GRID_SIZE, 150);
});

test("resolveGridSize accepts valid slider values as strings", () => {
    assert.deepEqual(resolveGridSize("16"), { ok: true, size: 16, message: "" });
    assert.equal(resolveGridSize("2").size, 2);
    assert.equal(resolveGridSize("150").size, 150);
    assert.equal(resolveGridSize(16).size, 16); // numbers pass through
});

test("resolveGridSize rejects out-of-range values", () => {
    for (const bad of ["0", "151", "999", "-1"]) {
        const r = resolveGridSize(bad);
        assert.equal(r.ok, false, `expected ${bad} to be rejected`);
        assert.equal(r.size, null);
        assert.match(r.message, /integer between 1-150/);
    }
});

test("resolveGridSize rejects non-numeric values", () => {
    for (const bad of ["", "abc", "3.7", null, undefined, NaN]) {
        const r = resolveGridSize(bad);
        assert.equal(r.ok, false, `expected ${String(bad)} to be rejected`);
        assert.equal(r.size, null);
    }
});

test("cellCount is the square of the size", () => {
    assert.equal(cellCount(1), 1);
    assert.equal(cellCount(16), 256);
    assert.equal(cellCount(150), 22500);
});

test("pickRandomColor returns a full-saturation HSL colour", () => {
    for (let i = 0; i < 200; i++) {
        const c = pickRandomColor();
        const m = c.match(/^hsl\((\d{1,3}), 100%, 50%\)$/);
        assert.ok(m, `unexpected colour format: ${c}`);
        const hue = Number.parseInt(m[1], 10);
        assert.ok(hue >= 0 && hue < 360);
    }
});

test("pickRandomColor varies between calls", () => {
    const colours = new Set(Array.from({ length: 50 }, () => pickRandomColor()));
    assert.ok(colours.size > 1, "expected at least two distinct colours in 50 draws");
});

test("TOOLS exposes the three toolbar tools with stable ids", () => {
    assert.deepEqual(Object.keys(TOOLS).sort(), ["black", "random", "white"]);
    assert.equal(TOOLS.black.label, "Black");
    assert.equal(TOOLS.white.label, "Eraser");
    assert.equal(TOOLS.random.label, "Random Colour");
});

test("isToolId only accepts known tool ids", () => {
    assert.ok(isToolId("black"));
    assert.ok(isToolId("white"));
    assert.ok(isToolId("random"));
    assert.ok(!isToolId("blue"));
    assert.ok(!isToolId("__proto__"));
});
