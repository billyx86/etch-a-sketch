// Pure grid + colour logic for the Etch-a-Sketch.
// No DOM access in here, so everything is unit-testable with node --test.

// Slider bounds for the grid-size control.
export const MIN_GRID_SIZE = 1;
export const MAX_GRID_SIZE = 150;

/**
 * Validate a requested grid size (as it arrives from the slider, i.e. a string).
 *
 * @param {string|number} requested raw value from the control
 * @returns {{ok: boolean, size: number|null, message: string}}
 *   ok=true  -> size is a usable integer grid size
 *   ok=false -> message is user-presentable, size is null
 */
export function resolveGridSize(requested) {
    const size = Number(requested);
    if (!Number.isInteger(size) || size < MIN_GRID_SIZE || size > MAX_GRID_SIZE) {
        return {
            ok: false,
            size: null,
            message: `Input specified must be an integer between ${MIN_GRID_SIZE}-${MAX_GRID_SIZE}.`,
        };
    }
    return { ok: true, size, message: "" };
}

/** Total number of cells a square grid of the given size holds. */
export function cellCount(size) {
    return size * size;
}

/**
 * Pick a random colour for the Random Colour tool: full-saturation HSL
 * with a random hue, matching the original implementation's format.
 *
 * @returns {string} e.g. "hsl(123, 100%, 50%)"
 */
export function pickRandomColor() {
    const hue = Math.floor(Math.random() * 360);
    return `hsl(${hue}, 100%, 50%)`;
}

/** The three drawing tools, in the order they appear in the toolbar. */
export const TOOLS = Object.freeze({
    black: Object.freeze({ id: "black", label: "Black" }),
    white: Object.freeze({ id: "white", label: "Eraser" }),
    random: Object.freeze({ id: "random", label: "Random Colour" }),
});

/** @param {string} id @returns {boolean} whether id names a known tool */
export function isToolId(id) {
    return Object.prototype.hasOwnProperty.call(TOOLS, id);
}

// --- Grid model -----------------------------------------------------------
//
// The grid is a plain object { size, cells, history } where cells is a flat
// array of size*size entries. A null entry is a blank (white) cell; painted
// cells hold a CSS colour string ("black", "white", "hsl(...)"). Keeping the
// model pure (no DOM, no canvas) makes every rule unit-testable and lets the
// renderer be swapped (the canvas renderer in script.js is that renderer).

/** Maximum number of undo levels kept per grid. */
export const MAX_HISTORY = 50;

/**
 * Create a fresh blank grid.
 *
 * @param {number} size integer 1..150
 * @returns {{size: number, cells: (string|null)[], history: object[]}}
 */
export function createGrid(size) {
    const { ok, size: resolved } = resolveGridSize(size);
    if (!ok) throw new RangeError(`Grid size must be an integer between ${MIN_GRID_SIZE}-${MAX_GRID_SIZE}.`);
    return {
        size: resolved,
        cells: new Array(resolved * resolved).fill(null),
        history: [],
    };
}

/**
 * Paint one cell, recording the change for undo.
 *
 * The undo log stores single-cell inverse actions ({index, prev}) so 50 levels
 * cost a handful of records no matter the grid size; a clear stores the whole
 * previous array (a reference, not a copy — the array is never mutated in
 * place after a clear).
 *
 * @returns {boolean} true if the cell actually changed (painting a cell the
 *   same colour is a no-op, so scrubbing the mouse doesn't eat undo history)
 */
export function paintCell(grid, index, color) {
    const prev = grid.cells[index];
    if (prev === color) return false;
    grid.history.push({ type: "paint", index, prev });
    if (grid.history.length > MAX_HISTORY) grid.history.shift();
    grid.cells[index] = color;
    return true;
}

/**
 * Paint the cells of a straight run (Bresenham line) between two cells in
 * ONE undo step — a mouse/touch drag counts as a single undo, not one level
 * per cell. Cells already holding `color` are skipped, so scrubbing a stroke
 * over itself doesn't churn history.
 *
 * @param {object} grid
 * @param {number} from start cell index
 * @param {number} to end cell index
 * @param {string} color CSS colour to paint
 * @returns {number} how many cells changed
 */
export function paintLine(grid, from, to, color) {
    const size = grid.size;
    const x0 = from % size;
    const y0 = Math.floor(from / size);
    const x1 = to % size;
    const y1 = Math.floor(to / size);
    // Integer Bresenham: every step moves one axis one cell toward the
    // target, so this always terminates in dx + dy + 1 steps.
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;

    const changed = [];
    let x = x0;
    let y = y0;
    for (;;) {
        const index = y * size + x;
        if (grid.cells[index] !== color) {
            changed.push({ index, prev: grid.cells[index] });
            grid.cells[index] = color;
        }
        if (x === x1 && y === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) {
            err += dy;
            x += sx;
        }
        if (e2 <= dx) {
            err += dx;
            y += sy;
        }
    }
    if (changed.length > 0) {
        grid.history.push({ type: "line", cells: changed });
        if (grid.history.length > MAX_HISTORY) grid.history.shift();
    }
    return changed.length;
}

/**
 * Undo the last change (paint, drag or clear).
 * @returns {boolean} false when the history is empty
 */
export function undo(grid) {
    const action = grid.history.pop();
    if (!action) return false;
    if (action.type === "clear") {
        grid.cells = action.cells;
    } else if (action.type === "line") {
        for (const c of action.cells) grid.cells[c.index] = c.prev;
    } else {
        grid.cells[action.index] = action.prev;
    }
    return true;
}

/**
 * Blank the whole grid (one undo level).
 * @returns {number} how many cells were actually blanked
 */
export function clearGrid(grid) {
    const painted = grid.cells.reduce((n, c) => n + (c === null ? 0 : 1), 0);
    if (painted === 0) return 0;
    grid.history.push({ type: "clear", cells: grid.cells });
    if (grid.history.length > MAX_HISTORY) grid.history.shift();
    grid.cells = new Array(grid.cells.length).fill(null);
    return painted;
}

/**
 * Resize, keeping whatever drawing lives in the overlapping top-left area.
 * Returns a NEW grid (the old one is left untouched).
 */
export function resizeGrid(grid, newSize) {
    const { ok, size } = resolveGridSize(newSize);
    if (!ok) throw new RangeError(`Grid size must be an integer between ${MIN_GRID_SIZE}-${MAX_GRID_SIZE}.`);
    const next = createGrid(size);
    const old = grid;
    const copyW = Math.min(old.size, size);
    const copyH = Math.min(old.size, size);
    for (let r = 0; r < copyH; r++) {
        for (let c = 0; c < copyW; c++) {
            next.cells[r * size + c] = old.cells[r * old.size + c];
        }
    }
    return next;
}

/** @returns {boolean} whether there is at least one undo level available */
export function canUndo(grid) {
    return grid.history.length > 0;
}
