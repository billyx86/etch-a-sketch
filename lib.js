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
 * Format a full-saturation HSL colour for a given hue (0-359). Pure and
 * deterministic, so the Random Colour tool's output is unit-testable without
 * mocking Math.random.
 *
 * @param {number} hue integer 0-359
 * @returns {string} e.g. "hsl(123, 100%, 50%)"
 */
export function randomColorFor(hue) {
    if (!Number.isInteger(hue) || hue < 0 || hue > 359) {
        throw new RangeError(`Hue must be an integer between 0-359, got ${hue}.`);
    }
    return `hsl(${hue}, 100%, 50%)`;
}

/**
 * Pick a random colour for the Random Colour tool: full-saturation HSL
 * with a random hue, matching the original implementation's format.
 *
 * @returns {string} e.g. "hsl(123, 100%, 50%)"
 */
export function pickRandomColor() {
    return randomColorFor(Math.floor(Math.random() * 360));
}

/** The four drawing tools, in the order they appear in the toolbar. */
export const TOOLS = Object.freeze({
    black: Object.freeze({ id: "black", label: "Black" }),
    white: Object.freeze({ id: "white", label: "Eraser" }),
    random: Object.freeze({ id: "random", label: "Random Colour" }),
    custom: Object.freeze({ id: "custom", label: "Colour" }),
});

/** @param {string} id @returns {boolean} whether id names a known tool */
export function isToolId(id) {
    return Object.prototype.hasOwnProperty.call(TOOLS, id);
}

/**
 * Resolve the colour a tool paints with (issue #12).
 *
 * @param {string} id tool id ("black" | "white" | "random" | "custom")
 * @param {string} customColor the colour input's current value (#rrggbb),
 *   only used when id === "custom"
 * @returns {string} the CSS colour to paint with
 * @throws {Error} unknown tool id, or a malformed custom colour
 */
export function toolColor(id, customColor) {
    switch (id) {
        case "black":
            return "black";
        case "white":
            return "white";
        case "random":
            return pickRandomColor();
        case "custom":
            if (typeof customColor !== "string" || !/^#[0-9a-fA-F]{6}$/.test(customColor)) {
                throw new Error(`Invalid custom colour: ${String(customColor)}`);
            }
            return customColor.toLowerCase();
        default:
            throw new Error(`Unknown tool: ${String(id)}`);
    }
}

// --- Grid model -----------------------------------------------------------
//
// The grid is a plain object { size, cells, history, redoStack } where cells
// is a flat array of size*size entries. A null entry is a blank (white)
// cell; painted cells hold a CSS colour string ("black", "white",
// "hsl(...)"). Keeping the model pure (no DOM, no canvas) makes every rule
// unit-testable and lets the renderer be swapped (the canvas renderer in
// script.js is that renderer).
//
// Undo AND redo (issue #21) live in the model: `history` holds the actions
// not yet undone, `redoStack` the ones undone (newest last). Each action
// stores BOTH its inverse and forward data so the same record serves both
// directions:
//
//   { type: "paint",  index, prev, next }
//   { type: "line",   cells: [{ index, prev, next }, ...] }
//   { type: "clear",  cells: [...old array...], newSize }
//   { type: "resize", size, cells: [...old...], newSize, newCells: [...new...] }
//
// Any NEW action clears the redo stack (standard editor behaviour): the
// abandoned branch is gone for good, and it also keeps redo safe after a
// resize (the redone action's indices would be in the OLD size's index
// space).

/** Maximum number of undo levels kept per grid. */
export const MAX_HISTORY = 50;

/**
 * Create a fresh blank grid.
 *
 * @param {number} size integer 1..150
 * @returns {{size: number, cells: (string|null)[], history: object[], redoStack: object[]}}
 */
export function createGrid(size) {
    const { ok, size: resolved } = resolveGridSize(size);
    if (!ok) throw new RangeError(`Grid size must be an integer between ${MIN_GRID_SIZE}-${MAX_GRID_SIZE}.`);
    return {
        size: resolved,
        cells: new Array(resolved * resolved).fill(null),
        history: [],
        redoStack: [],
    };
}

/**
 * Record a new action on the undo stack, dropping the redo stack (a new
 * action abandons the undone branch, and it may also leave a resized grid's
 * old index space — see the model notes above). Evicts the oldest undo level
 * past MAX_HISTORY.
 *
 * @returns {object} the same action object, so callers can use the return
 *   value as the record they just made.
 */
function recordAction(grid, action) {
    grid.redoStack.length = 0;
    grid.history.push(action);
    if (grid.history.length > MAX_HISTORY) grid.history.shift();
    return action;
}

/**
 * Paint one cell, recording the change for undo and redo.
 *
 * The undo log stores single-cell inverse actions ({index, prev, next}) so 50
 * levels cost a handful of records no matter the grid size; a clear stores
 * the whole previous array (a reference, not a copy — the array is never
 * mutated in place after a clear).
 *
 * @returns {boolean} true if the cell actually changed (painting a cell the
 *   same colour is a no-op, so scrubbing the mouse doesn't eat undo history)
 */
export function paintCell(grid, index, color) {
    const prev = grid.cells[index];
    if (prev === color) return false;
    recordAction(grid, { type: "paint", index, prev, next: color });
    grid.cells[index] = color;
    return true;
}

/**
 * Indices of the cells a straight line covers, from `from` to `to`
 * inclusive (integer Bresenham). Pure: no grid state is touched, so
 * callers can preview a run or collect a whole stroke.
 *
 * @param {number} size grid dimension
 * @param {number} from start cell index (row * size + col)
 * @param {number} to   end cell index
 * @returns {number[]} cell indices along the line
 */
export function lineCells(size, from, to) {
    const x0 = from % size;
    const y0 = Math.floor(from / size);
    const x1 = to % size;
    const y1 = Math.floor(to / size);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    const cells = [];
    let x = x0;
    let y = y0;
    for (;;) {
        cells.push(y * size + x);
        if (x === x1 && y === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x += sx; }
        if (e2 <= dx) { err += dx; y += sy; }
    }
    return cells;
}

/**
 * Set `indices` on the grid to `color`, touching each cell at most once
 * (later occurrences overwrite earlier ones).
 *
 * @returns {Array<{index: number, prev: string|null, next: string}>} only the
 *   cells that actually changed — painting a cell the same colour records
 *   nothing. `next` is always `color`; storing it keeps every action record
 *   bidirectional (undo AND redo, issue #21).
 */
export function applyPaint(grid, indices, color) {
    const touched = new Map();
    for (const index of indices) {
        if (!touched.has(index)) touched.set(index, grid.cells[index]);
    }
    const changed = [];
    for (const [index, prev] of touched) {
        if (prev !== color) {
            grid.cells[index] = color;
            changed.push({ index, prev, next: color });
        }
    }
    return changed;
}

/**
 * Commit the changes collected while a pointer was down as ONE undo level.
 * A mouse/touch drag is therefore a single undo, not one level per cell
 * touched along the way.
 *
 * @param {object} grid
 * @param {Array<{index: number, prev: string|null, next: string}>} changes
 * @returns {number} how many cells the stroke covers (0 when nothing to do)
 */
export function commitStroke(grid, changes) {
    if (changes.length === 0) return 0;
    recordAction(grid, { type: "line", cells: changes });
    return changes.length;
}

/**
 * Paint the cells of a straight run between two cells in ONE undo step.
 * Cells already holding `color` are skipped, so scrubbing a stroke over
 * itself doesn't churn history.
 *
 * @param {object} grid
 * @param {number} from start cell index
 * @param {number} to end cell index
 * @param {string} color CSS colour to paint
 * @returns {number} how many cells changed
 */
export function paintLine(grid, from, to, color) {
    return commitStroke(grid, applyPaint(grid, lineCells(grid.size, from, to), color));
}

/**
 * Apply one bidirectional action record to the grid (no stack bookkeeping).
 *
 * Whole-array actions (clear, resize) are copied on apply: the stored array
 * may be the SAME array the grid is currently using (undoing a clear hands
 * the grid the array the clear action recorded), so sharing it with the
 * record would let a later undo/redo mutate the other stack's data.
 *
 * @param {object} grid
 * @param {object} action one of the record shapes in the model notes above
 * @param {"inverse"|"forward"} dir
 */
function applyAction(grid, action, dir) {
    if (action.type === "clear") {
        grid.cells = dir === "inverse" ? action.cells.slice() : new Array(action.newSize).fill(null);
    } else if (action.type === "line") {
        for (const c of action.cells) grid.cells[c.index] = dir === "inverse" ? c.prev : c.next;
    } else if (action.type === "resize") {
        grid.size = dir === "inverse" ? action.size : action.newSize;
        grid.cells = dir === "inverse" ? action.cells.slice() : action.newCells.slice();
    } else { // "paint"
        grid.cells[action.index] = dir === "inverse" ? action.prev : action.next;
    }
}

/**
 * Undo the last change (paint, drag, clear or resize).
 *
 * A resize restores BOTH the previous size and the previous cells, because a
 * resampled grid has a different dimension than the one it undoes (issue #11).
 * The undone action moves to the redo stack (issue #21), so it can be
 * redone; any newer action clears that stack.
 *
 * @returns {boolean} false when the history is empty
 */
export function undo(grid) {
    const action = grid.history.pop();
    if (!action) return false;
    applyAction(grid, action, "inverse");
    grid.redoStack.push(action);
    return true;
}

/**
 * Redo the most recently undone change (issue #21).
 *
 * The redone action moves back onto the undo stack, so it can be undone
 * again; undoing again afterwards clears the (now shorter) redo stack.
 *
 * @returns {boolean} false when the redo stack is empty
 */
export function redo(grid) {
    const action = grid.redoStack.pop();
    if (!action) return false;
    applyAction(grid, action, "forward");
    grid.history.push(action);
    return true;
}

/** @returns {boolean} whether there is at least one redo level available */
export function canRedo(grid) {
    return grid.redoStack.length > 0;
}

/**
 * Blank the whole grid (one undo level, redoable).
 * @returns {number} how many cells were actually blanked
 */
export function clearGrid(grid) {
    const painted = grid.cells.reduce((n, c) => n + (c === null ? 0 : 1), 0);
    if (painted === 0) return 0;
    recordAction(grid, {
        type: "clear",
        cells: grid.cells,
        newSize: grid.cells.length,
    });
    grid.cells = new Array(grid.cells.length).fill(null);
    return painted;
}

/**
 * Resize, keeping whatever drawing lives in the overlapping top-left area.
 * Returns a NEW grid (the old one is left untouched).
 *
 * A resize is a state change, so the pre-resize grid is recorded as ONE undo
 * level (issue #11): the caller can undo back to the previous size AND the
 * previous drawing — including cells a shrink dropped. The old grid's existing
 * undo history is carried over, so a resize never wipes undo levels. Resizing
 * to the same size is a pure no-op (same cells, same history, no new level).
 *
 * The record is bidirectional (issue #21): it stores the pre-resize grid
 * (`size` + `cells`) AND the post-resize grid (`newSize` + `newCells`), so
 * the resize can be undone and redone.
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
    if (size !== old.size) {
        // Carry the old undo levels over (a fresh redo stack — the branch is
        // abandoned, which also keeps redo's index space consistent), then
        // record the resize as a bidirectional level.
        next.history = old.history.slice();
        next.redoStack = [];
        next.history.push({
            type: "resize",
            size: old.size,
            cells: old.cells,
            newSize: size,
            newCells: next.cells,
        });
        if (next.history.length > MAX_HISTORY) next.history.shift();
    }
    return next;
}

/** @returns {boolean} whether there is at least one undo level available */
export function canUndo(grid) {
    return grid.history.length > 0;
}

// --- Persistence (issue #9) ------------------------------------------------

/** localStorage key; the "v" field in the payload is a format version. */
export const STORAGE_KEY = "etch-a-sketch:grid";

/**
 * Restore a grid from storage, or return a fresh one.
 *
 * The payload is validated, not trusted: a wrong shape, a size/cell mismatch
 * or a non-string cell silently falls back to a new grid rather than
 * crashing the app. History is always restored empty — undo only applies
 * within a session.
 *
 * @param {Storage} storage
 * @param {number} fallbackSize used when nothing valid is stored
 * @returns {{size: number, cells: (string|null)[], history: object[]}}
 */
export function loadGrid(storage, fallbackSize) {
    try {
        const raw = storage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            const { ok, size } = resolveGridSize(parsed && parsed.size);
            const cells = parsed && parsed.cells;
            if (ok && Array.isArray(cells) && cells.length === size * size &&
                cells.every((c) => c === null || (typeof c === "string" && c.length > 0))) {
                return { size, cells, history: [], redoStack: [] };
            }
        }
    } catch {
        // corrupted payload or blocked storage: fall through to a fresh grid
    }
    return createGrid(fallbackSize);
}

/**
 * Persist a grid. Never throws — storage may be full or blocked (private
 * browsing, quota) and drawing must keep working in-session either way.
 *
 * @param {Storage} storage
 * @param {object} grid
 * @returns {boolean} true when the grid was stored
 */
export function saveGrid(storage, grid) {
    try {
        const payload = JSON.stringify({ v: 1, size: grid.size, cells: grid.cells });
        storage.setItem(STORAGE_KEY, payload);
        return true;
    } catch {
        return false;
    }
}
