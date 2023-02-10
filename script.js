const container = document.querySelector(".grid");
const modifyGrid = document.getElementById("modify-grid");
const gridSizeText = document.getElementById("grid-size-text");
let chosenColor = "black";

function makeRows(gridSize) {
    container.style.setProperty('--grid-rows', gridSize);
    container.style.setProperty('--grid-cols', gridSize);
    updateGridSizeText();

    for (i = 0; i < (gridSize * gridSize); i++) {
        let cell = document.createElement("div");
        cell.style.backgroundColor = "white";
        container.insertAdjacentElement("beforeend", cell);
        cell.addEventListener("mouseover", function(){
            cell.style.backgroundColor = `${chosenColor}`;
        });
    }
}


function updateGridSizeText() {
    gridSizeText.textContent = `${modifyGrid.value}x${modifyGrid.value}`
}

modifyGrid.addEventListener("click", function() {
    let gridSize = modifyGrid.value;
    if (gridSize > 0 && gridSize <= 150) {
        const elements = document.getElementsByClassName("grid-item");
        while(elements.length > 0) {
            elements[0].parentNode.removeChild(elements[0]);
    }
        makeRows(gridSize);
    } else {
        alert("Input specified must be an integer between 1-150.")
    }
})

makeRows(16);