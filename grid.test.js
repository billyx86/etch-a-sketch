// Unit tests for the pure grid model in lib.js (undoable drawing state).
// Run with: node --test grid.test.js  (no dependencies, stdlib only)
import test from "node:test";
import assert from "node:assert/strict";

import {
    createGrid,
    paintCell,
    paintLine,
    undo,
    clearGrid,
    resizeGrid,
    canUndo,
    MAX_HISTORY,
} from "./lib.js";

test("createGrid makes a blank grid of the requested size", () => {
    const g = createGrid(4);
    assert.equal(g.size, 4);
    assert.equal(g.cells.length, 16);
    assert.ok(g.cells.every((c) => c === null));
    assert.equal(g.history.length, 0);
});

test("createGrid rejects out-of-range sizes with RangeError", () => {
    for (const bad of [0, 151, -3, 2.5]) {
        assert.throws(() => createGrid(bad), RangeError, `expected ${bad} to throw`);
    }
});

test("paintCell paints, is a no-op on the same colour, and records history", () => {
    const g = createGrid(3);
    assert.equal(paintCell(g, 4, "black"), true);
    assert.equal(g.cells[4], "black");
    assert.equal(g.history.length, 1);
    // Same colour again: no change, no new history entry.
    assert.equal(paintCell(g, 4, "black"), false);
    assert.equal(g.history.length, 1);
    // A different colour records a second entry.
    assert.equal(paintCell(g, 4, "white"), true);
    assert.equal(g.cells[4], "white");
    assert.equal(g.history.length, 2);
});

test("undo reverses paints in LIFO order", () => {
    const g = createGrid(3);
    paintCell(g, 0, "black");
    paintCell(g, 1, "hsl(120, 100%, 50%)");
    assert.equal(undo(g), true);
    assert.equal(g.cells[1], null);
    assert.equal(g.cells[0], "black");
    assert.equal(undo(g), true);
    assert.equal(g.cells[0], null);
    assert.equal(undo(g), false, "empty history");
    assert.equal(canUndo(g), false);
});

test("paintLine paints the straight run between two cells as ONE undo level", () => {
    const g = createGrid(5);
    // Row 2, columns 0..4.
    const changed = paintLine(g, 2 * 5 + 0, 2 * 5 + 4, "black");
    assert.equal(changed, 5);
    assert.equal(g.history.length, 1, "one drag = one undo level");
    for (let c = 0; c < 5; c++) assert.equal(g.cells[2 * 5 + c], "black");
    undo(g);
    assert.ok(g.cells.every((c) => c === null), "undo restores the whole drag");
});

test("paintLine handles a short diagonal and skips already-painted cells", () => {
    const g = createGrid(4);
    paintLine(g, 0, 7, "black"); // (0,0) -> (3,1)
    // Bresenham for slope 1/3: (0,0) (1,0) (2,1) (3,1) = flat 0,1,6,7.
    assert.equal(g.cells[0], "black");
    assert.equal(g.cells[1], "black");
    assert.equal(g.cells[6], "black");
    assert.equal(g.cells[7], "black");
    assert.equal(g.cells[5], null, "off-line cell untouched");
    assert.equal(g.cells[2], null, "off-line cell untouched");
    // Repaint the same run: nothing changes, no new history.
    assert.equal(paintLine(g, 0, 7, "black"), 0);
    assert.equal(g.history.length, 1);
});

test("paintLine handles a general (non-axis-aligned) run and terminates", () => {
    const g = createGrid(8);
    // (0,0) -> (5,3): 6 cells, never wraps, always reaches the target.
    const changed = paintLine(g, 0 * 8 + 0, 3 * 8 + 5, "black");
    assert.equal(changed, 6);
    assert.equal(g.cells[3 * 8 + 5], "black", "endpoint painted");
    const painted = g.cells.filter((c) => c !== null).length;
    assert.equal(painted, 6);
    assert.equal(undo(g), true);
    assert.ok(g.cells.every((c) => c === null));
});

test("clearGrid blanks everything as one undo level", () => {
    const g = createGrid(3);
    paintCell(g, 0, "black");
    paintCell(g, 8, "black");
    assert.equal(clearGrid(g), 2);
    assert.ok(g.cells.every((c) => c === null));
    assert.equal(undo(g), true);
    assert.equal(g.cells[0], "black");
    assert.equal(g.cells[8], "black");
});

test("clearGrid on an already-blank grid is a no-op", () => {
    const g = createGrid(3);
    assert.equal(clearGrid(g), 0);
    assert.equal(g.history.length, 0);
});

test("history is capped at MAX_HISTORY levels", () => {
    const g = createGrid(8);
    for (let i = 0; i < MAX_HISTORY + 10; i++) paintCell(g, i % 64, "black");
    assert.equal(g.history.length, MAX_HISTORY);
});

test("resizeGrid keeps the overlapping top-left drawing", () => {
    const g = createGrid(4);
    g.cells[0] = "black"; // (0,0)
    g.cells[4 + 1] = "black"; // (1,1)
    const bigger = resizeGrid(g, 6);
    assert.equal(bigger.size, 6);
    assert.equal(bigger.cells[0], "black");
    assert.equal(bigger.cells[6 + 1], "black");
    const smaller = resizeGrid(g, 2);
    assert.equal(smaller.size, 2);
    assert.equal(smaller.cells[0], "black"); // (0,0) survives
    assert.equal(smaller.cells[1], null);
    // Original grid untouched.
    assert.equal(g.size, 4);
});

test("resizeGrid rejects bad sizes with RangeError", () => {
    const g = createGrid(4);
    assert.throws(() => resizeGrid(g, 0), RangeError);
    assert.throws(() => resizeGrid(g, 151), RangeError);
});
