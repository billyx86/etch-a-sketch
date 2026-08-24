# etch-a-sketch

A browser version of an [etch-a-sketch](https://en.wikipedia.org/wiki/Etch_A_Sketch):
hover (or tap, or keyboard-paint) over a grid of cells to colour them in, switch
between a black pen, an eraser and a random-colour pen, and resize the board
from 1×1 up to 150×150.

No build step, no dependencies — it's plain HTML/CSS/JS.

## Run it

Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

## How to use

| Control | What it does |
| --- | --- |
| Hover over the grid | Paints the cell under the pointer |
| Touch / drag on the grid | Same, on touch devices (`pointerenter`) |
| Click the grid, then **← ↑ → ↓** | Move the keyboard cursor |
| **Space** / **Enter** | Paint the cell the cursor is on |
| Black pen button | Black strokes |
| Eraser button | White (erase) strokes |
| Rainbow disc button | Every click picks a fresh random HSL colour |
| Grid size slider | Rebuilds the board at 1×1 – 150×150 (resets the drawing) |

## File map

| File | Purpose |
| --- | --- |
| `index.html` | Page structure and toolbar |
| `style.css` | Styling; `--grid-rows`/`--grid-cols` custom properties size the grid |
| `reset.css` | CSS reset |
| `lib.js` | Pure logic: grid-size validation, cell math, HSL colour picker, tool table. No DOM. |
| `script.js` | UI wiring: builds the grid, paints cells, handles the toolbar and keyboard input. Imports `lib.js`. |
| `lib.test.js` | Unit tests for `lib.js` (Node's built-in test runner) |

## Tests

```sh
npm test
```

Runs `node --test lib.test.js` — the pure logic in `lib.js` (size validation,
cell counts, colour format, tool ids). The DOM layer in `script.js` is thin
wiring on top of the tested logic.

## Design notes

- `lib.js` deliberately has no DOM access so the grid maths and colour rules
  are testable without a browser.
- The grid is rebuilt with a `DocumentFragment` (one reflow per resize) and
  cleared with `replaceChildren()` — earlier versions accumulated orphan
  cells on every resize.
- Cells paint on `pointerenter`, which covers mouse, touch and pen input.
  `mouseover` is mouse-only, which is why touch drawing used to do nothing.
- The toolbar is driven by `data-tool` attributes + `aria-pressed`, not inline
  `onclick` handlers, so the markup doesn't depend on script-internal names.
