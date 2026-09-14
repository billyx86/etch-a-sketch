// Unit tests for grid persistence (issue #9).
// Run with: node --test persistence.test.js  (no dependencies, stdlib only)
import test from "node:test";
import assert from "node:assert/strict";

import {
    STORAGE_KEY,
    loadGrid,
    saveGrid,
    createGrid,
    paintCell,
    MAX_GRID_SIZE,
} from "./lib.js";

/** In-memory stand-in for window.localStorage (getItem/setItem/removeItem). */
function makeStorage(failSet = false) {
    const map = new Map();
    return {
        getItem: (k) => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => {
            if (failSet) throw new Error("QuotaExceededError");
            map.set(k, String(v));
        },
        removeItem: (k) => map.delete(k),
        keys: () => [...map.keys()],
    };
}

test("saveGrid stores a versioned payload under the stable key", () => {
    const storage = makeStorage();
    const grid = createGrid(3);
    paintCell(grid, 4, "black");

    assert.equal(saveGrid(storage, grid), true);
    assert.deepEqual(storage.keys(), [STORAGE_KEY]);

    const payload = JSON.parse(storage.getItem(STORAGE_KEY));
    assert.equal(payload.v, 1);
    assert.equal(payload.size, 3);
    assert.equal(payload.cells[4], "black");
});

test("saveGrid never throws when storage refuses the write", () => {
    const storage = makeStorage(true); // setItem always throws
    const grid = createGrid(3);
    assert.equal(saveGrid(storage, grid), false);
});

test("loadGrid restores a previously saved grid", () => {
    const storage = makeStorage();
    const grid = createGrid(5);
    paintCell(grid, 0, "black");
    paintCell(grid, 24, "hsl(10, 100%, 50%)");
    saveGrid(storage, grid);

    const loaded = loadGrid(storage, 16);
    assert.equal(loaded.size, 5);
    assert.equal(loaded.cells[0], "black");
    assert.equal(loaded.cells[24], "hsl(10, 100%, 50%)");
    assert.equal(loaded.cells[1], null);
    assert.equal(loaded.history.length, 0, "undo history is session-scoped");
});

test("loadGrid returns a fresh fallback grid when storage is empty", () => {
    const storage = makeStorage();
    const loaded = loadGrid(storage, 16);
    assert.equal(loaded.size, 16);
    assert.ok(loaded.cells.every((c) => c === null));
});

test("loadGrid falls back when the payload is corrupted JSON", () => {
    const storage = makeStorage();
    storage.setItem(STORAGE_KEY, "{not json");
    const loaded = loadGrid(storage, 8);
    assert.equal(loaded.size, 8);
});

test("loadGrid falls back on wrong cell count or size mismatch", () => {
    const storage = makeStorage();
    // 3x3 grid claimed, but only 9-1 cells stored.
    storage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, size: 3, cells: [null, null, null, "black"] }));
    assert.equal(loadGrid(storage, 8).size, 8);
});

test("loadGrid falls back when a cell is not a colour string", () => {
    const storage = makeStorage();
    const cells = new Array(9).fill(null);
    cells[0] = 42; // not a string
    storage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, size: 3, cells }));
    assert.equal(loadGrid(storage, 8).size, 8);
});

test("loadGrid falls back on an out-of-range stored size", () => {
    const storage = makeStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, size: 999, cells: [] }));
    assert.equal(loadGrid(storage, 8).size, 8);
});

test("loadGrid works for the largest grid (150x150 = 22,500 cells)", () => {
    const storage = makeStorage();
    const grid = createGrid(MAX_GRID_SIZE);
    paintCell(grid, 0, "black");
    paintCell(grid, 22499, "black");
    saveGrid(storage, grid);

    const loaded = loadGrid(storage, 16);
    assert.equal(loaded.size, 150);
    assert.equal(loaded.cells.length, 22500);
    assert.equal(loaded.cells[0], "black");
    assert.equal(loaded.cells[22499], "black");
});
