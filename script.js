const container = document.getElementById("container");
const modifyGrid = document.getElementById("modifyGrid");

function makeRows(rows, cols) {
    container.style.setProperty('--grid-rows', rows);
    container.style.setProperty('--grid-cols', cols);

    for (i = 0; i < (rows * cols); i++) {
        let cell = document.createElement("div");
        container.appendChild(cell).className = "grid-item";
        cell.addEventListener("mouseover", function(){
            cell.style.backgroundColor = "black";
        });
    }
}

makeRows(16, 16);

modifyGrid.addEventListener("click", function() {
    let rows = prompt("Enter the amount of rows: ");
    let cols = prompt("Enter the amount of columns: ");

    const elements = document.getElementsByClassName("grid-item");
    while(elements.length > 0) {
        elements[0].parentNode.removeChild(elements[0]);
    }

    makeRows(rows, cols);
})