const container = document.querySelector(".grid");
const modifyGrid = document.getElementById("modifyGrid");
let chosenColor = "black";

function makeRows(gridSize) {
    container.style.setProperty('--grid-rows', gridSize);
    container.style.setProperty('--grid-cols', gridSize);

    for (i = 0; i < (gridSize * gridSize); i++) {
        let cell = document.createElement("div");
        cell.style.backgroundColor = "white";
        container.insertAdjacentElement("beforeend", cell);
        cell.addEventListener("mouseover", function(){
            cell.style.backgroundColor = `${chosenColor}`;
        });
    }
}

modifyGrid.addEventListener("click", function() {
    let gridSize = prompt("Enter the amount of rows: ");
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

function randomColor() {
    chosenColor = `hsl(${Math.random() * 360}, 100%, 50%)`
}

makeRows(16, 16);
