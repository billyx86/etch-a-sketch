import { resolveGridSize, cellCount, pickRandomColor } from "./lib.js";

const container = document.querySelector(".grid");
const modifyGrid = document.getElementById("modify-grid");
const gridSizeText = document.getElementById("grid-size-text");
let chosenColor = "black";

function clearGrid() {
    container.replaceChildren();
}

function makeGrid(gridSize) {
    container.style.setProperty("--grid-rows", gridSize);
    container.style.setProperty("--grid-cols", gridSize);
    updateGridSizeText();

    clearGrid();
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < cellCount(gridSize); i++) {
        const cell = document.createElement("div");
        cell.style.backgroundColor = "white";
        cell.addEventListener("mouseover", function () {
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

modifyGrid.addEventListener("click", function () {
    const { ok, size, message } = resolveGridSize(modifyGrid.value);
    if (ok) {
        makeGrid(size);
    } else {
        alert(message);
    }
});

// The toolbar buttons used inline onclick='chosenColor = ...' attributes,
// which this module no longer exposes to the global scope; wire them here.
const blackButton = document.querySelector(".tool-button.black");
const whiteButton = document.querySelector(".tool-button.white");
const randomButton = document.querySelector(".tool-button.random");
blackButton?.addEventListener("click", () => setChosenColor("black"));
whiteButton?.addEventListener("click", () => setChosenColor("white"));
randomButton?.addEventListener("click", () => setChosenColor(pickRandomColor()));

makeGrid(16);
