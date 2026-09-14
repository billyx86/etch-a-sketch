# etch-a-sketch

A browser version of an [etch-a-sketch](https://en.wikipedia.org/wiki/Etch_A_Sketch):
drag over a board to paint, switch between a black pen, an eraser and a
random-colour pen, resize the board from 1×1 up to 150×150, undo strokes,
clear the board, and save your drawing as a PNG.

No build step — it's plain HTML/CSS/JS with a tiny `@playwright/test`
dev-dependency for the browser smoke tests.

## Run it

Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

> `index.html` is an ES-module app, so serve it over HTTP rather than opening
> the file directly (browsers block module loading from `file://`).

## How to use

| Control | What it does |
| --- | --- |
| Click + drag on the board | Paints a stroke (mouse, touch or pen) |
| Focus the board, then **← ↑ → ↓** | Move the keyboard cursor (wraps at the edges) |
| **Space** / **Enter** | Paint the cell the cursor is on |
| **Ctrl/Cmd+Z** or the **Undo** button | Undo the last stroke (a whole drag is one stroke) |
| **Clear** button | Erase the whole board (one undo level) |
| **Save PNG** button | Download the drawing as `etch-a-sketch-<size>x<size>.png` |
| Black pen button | Black strokes |
| Eraser button | White (erase) strokes |
| Rainbow disc button | Every stroke picks a fresh random HSL colour |
| Grid size slider | Resizes the board 1×1 – 150×150 (keeps the overlapping drawing) |

The drawing is saved to `localStorage` automatically, so it survives a page
reload — at any grid size.

## File map

| File | Purpose |
| --- | --- |
| `index.html` | Page structure, the `<canvas id="board">` and toolbar |
| `style.css` | Styling, including the canvas and action buttons |
| `reset.css` | CSS reset |
| `lib.js` | Pure logic: the undoable grid model, Bresenham line, persistence, grid-size validation, colour picker, tool table. No DOM. |
| `script.js` | Rendering + input: the `<canvas>` renderer, pointer/keyboard drawing, toolbar, Clear/Undo/Save-PNG, resize. Imports `lib.js`. |
| `lib.test.js` | Unit tests for the original `lib.js` helpers |
| `grid.test.js` | Unit tests for the grid model (paint, line, undo, clear, resize, persistence) |
| `persistence.test.js` | Unit tests for `saveGrid`/`loadGrid` |
| `tests/smoke.spec.js` | Playwright browser smoke tests (render, paint, undo, clear, PNG, reload, 150×150 perf) |
| `playwright.config.js` | Playwright configuration |

## Tests

```sh
npm test          # unit tests (node --test, stdlib only)
npm run test:e2e  # browser smoke tests (Playwright + Chromium)
```

`npm test` runs the pure logic in `lib.js` — the undoable grid model,
Bresenham lines, undo/clear/resize, and localStorage persistence.
`npm run test:e2e` drives the real page in headless Chromium: drag painting,
one-drag-one-undo semantics, Save PNG (it checks the downloaded bytes are a
valid PNG), reload persistence, and a 150×150 render-perf check.

Locally, if you already have a Chromium build you can point Playwright at it
instead of downloading one:

```sh
PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome npx playwright test
```

## Design notes

- `lib.js` deliberately has no DOM access, so the grid maths, line drawing
  and persistence rules are testable without a browser.
- The drawing surface is a single `<canvas>`, not a grid of divs. At 150×150
  the old approach built 22,500 elements with 22,500 event listeners; the
  canvas draws 22,500 `fillRect`s in a few milliseconds and takes only a
  handful of listeners.
- Drawing state is a plain object `{ size, cells, history }`. A drag paints
  cells live for responsiveness but commits **one** history entry on release,
  so "undo" means "undo the whole stroke", not "undo one cell".
- Persistence serialises the grid to `localStorage` under a single key
  (`etch-a-sketch-grid`), validated on load. The saved grid is restored at
  its own size (the slider reflects it); `resizeGrid` does the resampling
  when the size changes, so a drawing outlives both reloads and resizes.
- PNG export rasterises the model to an offscreen canvas (one `fillRect` per
  cell, scaled up 12×) and downloads it, independent of the on-screen canvas
  so the file is always crisp.
- The toolbar is driven by `data-tool` attributes + `aria-pressed`, not inline
  `onclick` handlers, so the markup doesn't depend on script-internal names.
