// Rendering layer for the Etch-a-Sketch.
//
// The drawing state is a pure grid model from lib.js; this file owns the
// canvas and all user input. One <canvas> replaces the old grid of up to
// 22,500 divs, which is what makes 150x150 snappy (issue #7) and makes
// persistence trivial (issue #9).

import {
    resolveGridSize,
    pickRandomColor,
    TOOLS,
    isToolId,
    paintCell,
    lineCells,
    commitStroke,
    undo,
    clearGrid,
    resizeGrid,
    canUndo,
    loadGrid,
    saveGrid,
} from "./lib.js";

const DEFAULT_SIZE = 16;
const DISPLAY_SIZE = 600; // CSS px, matching the old .grid box

const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
const undoButton = document.getElementById("undo");

let grid = loadGrid(window.localStorage, DEFAULT_SIZE);
let chosenColor = "black";
let cursorIndex = 0; // keyboard cursor position within the grid
let dragging = false;
let strokeChanges = []; // cells changed so far this drag (first-touched order)
let strokeTouched = new Set(); // indices in strokeChanges (O(1) retracing check)
let strokeIndex = 0;    // last cell the drag has reached

function cellSize() {
    return DISPLAY_SIZE / grid.size;
}

function setupCanvas() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = DISPLAY_SIZE * dpr;
    canvas.height = DISPLAY_SIZE * dpr;
    canvas.style.width = `${DISPLAY_SIZE}px`;
    canvas.style.height = `${DISPLAY_SIZE}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function render() {
    const cs = cellSize();
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, DISPLAY_SIZE, DISPLAY_SIZE);
    for (let i = 0; i < grid.cells.length; i++) {
        const color = grid.cells[i];
        if (color === null) continue;
        ctx.fillStyle = color;
        const col = i % grid.size;
        const row = Math.floor(i / grid.size);
        ctx.fillRect(col * cs, row * cs, cs, cs);
    }
    if (canvas === document.activeElement) drawCursor();
}

function drawCursor() {
    const cs = cellSize();
    const col = cursorIndex % grid.size;
    const row = Math.floor(cursorIndex / grid.size);
    ctx.strokeStyle = "#40c4ff";
    ctx.lineWidth = 2;
    ctx.strokeRect(col * cs + 1, row * cs + 1, cs - 2, cs - 2);
}

function afterChange() {
    render();
    saveGrid(window.localStorage, grid);
    undoButton.disabled = !canUndo(grid);
}

function commitGrid(next) {
    grid = next;
    cursorIndex = 0;
    setupCanvas();
    afterChange();
}

// --- pointer drawing ---
//
// A drag paints cells live but only commits ONE undo level, on release:
// every cell records its colour from before the drag began (the model only
// sees the final grid, so the first touch of a cell during the drag is the
// original). That makes "undo" mean "undo the whole stroke".

function eventCell(e) {
    const rect = canvas.getBoundingClientRect();
    const col = Math.floor(((e.clientX - rect.left) / rect.width) * grid.size);
    const row = Math.floor(((e.clientY - rect.top) / rect.height) * grid.size);
    const clampedCol = Math.min(grid.size - 1, Math.max(0, col));
    const clampedRow = Math.min(grid.size - 1, Math.max(0, row));
    return clampedRow * grid.size + clampedCol;
}

function extendStroke(cell) {
    for (const index of lineCells(grid.size, strokeIndex, cell)) {
        const prev = grid.cells[index];
        if (prev !== chosenColor && !strokeTouched.has(index)) {
            grid.cells[index] = chosenColor;
            strokeChanges.push({ index, prev });
            strokeTouched.add(index);
        }
    }
    strokeIndex = cell;
    render();
}

canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    dragging = true;
    const cell = eventCell(e);
    strokeChanges = [];
    strokeTouched = new Set();
    if (grid.cells[cell] !== chosenColor) {
        strokeChanges.push({ index: cell, prev: grid.cells[cell] });
        strokeTouched.add(cell);
        grid.cells[cell] = chosenColor;
    }
    strokeIndex = cell;
    afterChange();
});

canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const cell = eventCell(e);
    if (cell === strokeIndex) return;
    extendStroke(cell);
});

function endStroke() {
    if (!dragging) return;
    dragging = false;
    // Commit the whole stroke as ONE undo level, then persist.
    commitStroke(grid, strokeChanges);
    strokeChanges = [];
    strokeTouched = new Set();
    saveGrid(window.localStorage, grid);
    undoButton.disabled = !canUndo(grid);
}

for (const stop of ["pointerup", "pointercancel", "pointerleave"]) {
    canvas.addEventListener(stop, endStroke);
}

// --- keyboard drawing (unchanged contract: arrows + Space/Enter) ---

function paintCursor() {
    paintCell(grid, cursorIndex, chosenColor);
    afterChange();
}

function showCursor() {
    if (!dragging) drawCursor();
}

canvas.addEventListener("focus", showCursor);
canvas.addEventListener("blur", render);

canvas.addEventListener("keydown", function (event) {
    const cols = grid.size;
    let row = Math.floor(cursorIndex / cols);
    let col = cursorIndex % cols;
    switch (event.key) {
        case "ArrowUp": row = (row - 1 + grid.size) % grid.size; break;
        case "ArrowDown": row = (row + 1) % grid.size; break;
        case "ArrowLeft": col = (col - 1 + cols) % cols; break;
        case "ArrowRight": col = (col + 1) % cols; break;
        case " ":
        case "Enter":
            paintCursor();
            event.preventDefault();
            return;
        case "z":
        case "Z":
            if (event.ctrlKey || event.metaKey) {
                event.preventDefault();
                doUndo();
                return;
            }
            break;
        default:
            return;
    }
    event.preventDefault();
    cursorIndex = row * cols + col;
    showCursor();
});

// --- toolbar ---

function selectTool(id, button) {
    if (!isToolId(id)) return;
    if (id === TOOLS.random.id) {
        chosenColor = pickRandomColor();
    } else {
        chosenColor = id; // "black" / "white" double as CSS colours
    }
    for (const b of document.querySelectorAll(".tool-button")) {
        b.setAttribute("aria-pressed", String(b === button));
    }
}

const toolButtons = document.querySelectorAll(".tool-button");
// Initial state: black pen selected (chosenColor is already "black").
for (const button of toolButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.tool === TOOLS.black.id));
    const id = button.dataset.tool;
    button.addEventListener("click", () => selectTool(id, button));
}

// --- Clear / Undo (issue #8) ---

function doClear() {
    clearGrid(grid);
    afterChange();
}

function doUndo() {
    undo(grid);
    afterChange();
}

// --- Save as PNG (issue #9) ---
//
// Rasterise the model to an offscreen canvas (one fillRect per cell, scaled
// up) and download it. Independent of the on-screen canvas, so the export
// is always crisp regardless of devicePixelRatio.
const EXPORT_PX_PER_CELL = 12;

function exportPng() {
    const size = grid.size;
    const off = document.createElement("canvas");
    off.width = size * EXPORT_PX_PER_CELL;
    off.height = size * EXPORT_PX_PER_CELL;
    const octx = off.getContext("2d");
    octx.fillStyle = "white";
    octx.fillRect(0, 0, off.width, off.height);
    for (let i = 0; i < size * size; i++) {
        const color = grid.cells[i];
        if (color === null) continue;
        octx.fillStyle = color;
        octx.fillRect((i % size) * EXPORT_PX_PER_CELL,
            Math.floor(i / size) * EXPORT_PX_PER_CELL,
            EXPORT_PX_PER_CELL, EXPORT_PX_PER_CELL);
    }
    off.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `etch-a-sketch-${size}x${size}.png`;
        a.click();
        URL.revokeObjectURL(url);
    }, "image/png");
}

document.getElementById("clear").addEventListener("click", doClear);
undoButton.addEventListener("click", doUndo);
document.getElementById("export").addEventListener("click", exportPng);

// --- grid size ---

const modifyGrid = document.getElementById("modify-grid");
const gridSizeText = document.getElementById("grid-size-text");

modifyGrid.value = String(grid.size);
gridSizeText.textContent = `${grid.size}x${grid.size}`;

// `change` rather than `click`: a range slider fires `change` on EVERY
// interaction mode (keyboard arrows, track clicks, and thumb-drag release),
// but a keyboard-only interaction fires NO `click` at all, which left the
// board stuck at 16x16 for keyboard users. `change` also avoids the
// per-pixel `input` churn while dragging. (Issue #14)
modifyGrid.addEventListener("change", function () {
    const { ok, size, message } = resolveGridSize(modifyGrid.value);
    if (ok) {
        if (size === grid.size) return;
        commitGrid(resizeGrid(grid, size)); // keeps the overlapping drawing
        gridSizeText.textContent = `${size}x${size}`;
    } else {
        alert(message);
    }
});

// --- start ---

setupCanvas();
render();
undoButton.disabled = !canUndo(grid);
