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
