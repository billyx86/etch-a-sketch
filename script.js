import { resolveGridSize, cellCount, pickRandomColor, TOOLS, isToolId } from "./lib.js";

const container = document.querySelector(".grid");
const modifyGrid = document.getElementById("modify-grid");
const gridSizeText = document.getElementById("grid-size-text");
let chosenColor = "black";
let currentSize = 16;
let cursorIndex = 0; // keyboard cursor position within the grid

function clearGrid() {
    container.replaceChildren();
}

function makeGrid(gridSize) {
    currentSize = gridSize;
    cursorIndex = 0;
    container.style.setProperty("--grid-rows", gridSize);
    container.style.setProperty("--grid-cols", gridSize);
    updateGridSizeText();

    clearGrid();
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < cellCount(gridSize); i++) {
        const cell = document.createElement("div");
        cell.style.backgroundColor = "white";
        cell.setAttribute("aria-hidden", "true");
        // pointerenter covers mouse, touch and pen; mouseover is mouse-only.
        cell.addEventListener("pointerenter", function () {
            cell.style.backgroundColor = chosenColor;
        });
        fragment.appendChild(cell);
    }
    container.appendChild(fragment);
}

function updateGridSizeText() {
    gridSizeText.textContent = `${modifyGrid.value}x${modifyGrid.value}`;
}

function setChosenColor(color) {
    chosenColor = color;
}

// Keyboard drawing: the grid is one focusable surface; arrows move a
// cursor through the cells, Space/Enter paints the current cell.
function paintCursor() {
    const cells = container.children;
    const cell = cells[cursorIndex];
    if (cell) cell.style.backgroundColor = chosenColor;
}

function showCursor() {
    const cells = container.children;
    for (const cell of cells) cell.style.outline = "";
    cells[cursorIndex].style.outline = "2px solid #40c4ff";
    cells[cursorIndex].style.outlineOffset = "-2px";
}

container.addEventListener("focus", showCursor);

container.addEventListener("keydown", function (event) {
    const cols = currentSize;
    let row = Math.floor(cursorIndex / cols);
    let col = cursorIndex % cols;
    switch (event.key) {
        case "ArrowUp": row = (row - 1 + currentSize) % currentSize; break;
        case "ArrowDown": row = (row + 1) % currentSize; break;
        case "ArrowLeft": col = (col - 1 + cols) % cols; break;
        case "ArrowRight": col = (col + 1) % cols; break;
        case " ":
        case "Enter":
            paintCursor();
            event.preventDefault();
            return;
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
        setChosenColor(pickRandomColor());
    } else {
        setChosenColor(id); // "black" / "white" double as CSS colours
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

modifyGrid.addEventListener("click", function () {
    const { ok, size, message } = resolveGridSize(modifyGrid.value);
    if (ok) {
        makeGrid(size);
    } else {
        alert(message);
    }
});

makeGrid(16);
