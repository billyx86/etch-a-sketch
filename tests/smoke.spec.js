// Browser smoke tests for the canvas renderer.
// A minimal static server is started in-memory so ES modules work
// (file:// would block them).
import { test, expect } from '@playwright/test';
import http from 'node:http';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

let server;
let base;

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, base).pathname);
    if (p === '/') p = '/index.html';
    const file = path.join(ROOT, p);
    readFile(file)
      .then((buf) => {
        res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(buf);
      })
      .catch(() => res.writeHead(404).end('not found'));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/`;
});

test.afterAll(async () => {
  await new Promise((r) => server.close(r));
});

// Count non-white pixels on the drawing canvas.
async function paintedPixels(page) {
  return page.evaluate(() => {
    const c = document.getElementById('board');
    const ctx = c.getContext('2d');
    const { width, height } = c;
    const d = ctx.getImageData(0, 0, width, height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] < 250 || d[i + 1] < 250 || d[i + 2] < 250) n++;
    }
    return n;
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto(base);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('loads with a blank 600x600 board and a disabled Undo', async ({ page }) => {
  await expect(page.locator('#board')).toBeVisible();
  await expect(page.locator('#undo')).toBeDisabled();
  expect(await paintedPixels(page)).toBe(0);
});

test('paints by dragging, then undoes and clears', async ({ page }) => {
  const board = page.locator('#board');
  const box = await board.boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await page.mouse.move(cx - 60, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 60, cy, { steps: 8 });
  await page.mouse.up();

  expect(await paintedPixels(page)).toBeGreaterThan(1000);
  await expect(page.locator('#undo')).toBeEnabled();

  await page.click('#undo');
  expect(await paintedPixels(page)).toBe(0);
  await expect(page.locator('#undo')).toBeDisabled();

  // Paint again, then clear.
  await page.mouse.move(cx - 40, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 40, cy, { steps: 6 });
  await page.mouse.up();
  expect(await paintedPixels(page)).toBeGreaterThan(1000);

  await page.click('#clear');
  expect(await paintedPixels(page)).toBe(0);
});

test('a drag is ONE undo level: two strokes need two undos', async ({ page }) => {
  const board = page.locator('#board');
  const box = await board.boundingBox();
  const cy = box.y + box.height / 2;

  // Stroke 1: left of centre.
  await page.mouse.move(box.x + box.width * 0.2, cy);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.4, cy, { steps: 5 });
  await page.mouse.up();
  const afterFirst = await paintedPixels(page);
  expect(afterFirst).toBeGreaterThan(500);

  // Stroke 2: right of centre (a separate drag).
  await page.mouse.move(box.x + box.width * 0.6, cy);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, cy, { steps: 5 });
  await page.mouse.up();
  const afterSecond = await paintedPixels(page);
  expect(afterSecond).toBeGreaterThan(afterFirst);

  // One undo removes exactly stroke 2 — stroke 1 remains.
  await page.click('#undo');
  const afterOneUndo = await paintedPixels(page);
  expect(afterOneUndo).toBeGreaterThan(100, 'first stroke survives one undo');
  expect(afterOneUndo).toBeLessThan(afterSecond, 'second stroke is gone');
  expect(Math.abs(afterOneUndo - afterFirst)).toBeLessThan(200, 'only stroke 2 was removed');

  // Second undo removes stroke 1 entirely.
  await page.click('#undo');
  expect(await paintedPixels(page)).toBe(0);
  await expect(page.locator('#undo')).toBeDisabled();
});

test('saves the drawing as a PNG file', async ({ page }) => {
  const box = await page.locator('#board').boundingBox();
  const cy = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.3, cy);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, cy, { steps: 4 });
  await page.mouse.up();
  expect(await paintedPixels(page)).toBeGreaterThan(500);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#export'),
  ]);
  expect(download.suggestedFilename()).toMatch(/^etch-a-sketch-\d+x\d+\.png$/);
  // The file is a real, non-empty PNG.
  const file = await download.path();
  const buf = await readFile(file);
  assert(buf.length > 1000, 'PNG is not empty');
  // PNG magic bytes.
  assert(buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47);
});

test('restores the drawing from localStorage on reload', async ({ page }) => {
  const board = page.locator('#board');
  const box = await board.boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx - 30, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 30, cy, { steps: 5 });
  await page.mouse.up();
  expect(await paintedPixels(page)).toBeGreaterThan(500);

  await page.reload();
  await page.locator('#board').waitFor();
  expect(await paintedPixels(page)).toBeGreaterThan(500);
});

test('renders a 150x150 grid without stalling', async ({ page }) => {
  const start = Date.now();
  // Set the value and fire `change` — the event the handler listens for
  // (a synthetic .click() alone no longer resizes; see #14).
  await page.locator('#modify-grid').evaluate((el) => {
    el.value = '150';
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.locator('#grid-size-text')).toHaveText('150x150');
  const elapsed = Date.now() - start;
  // A canvas render of 22,500 cells is milliseconds; the old DOM grid was the
  // slow path. Fail loudly if it took more than a couple of seconds.
  expect(elapsed).toBeLessThan(2500);
  // Still paintable after the resize.
  const box = await page.locator('#board').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  expect(await paintedPixels(page)).toBeGreaterThan(10);
});

test('grid-size slider resizes via keyboard (no click event fires)', async ({ page }) => {
  // Regression for the click-only wiring (#14): a native <input type=range>
  // operated with the keyboard fires `input` + `change` but NEVER `click`,
  // so the board must resize when the focused slider gets arrow keys.
  await expect(page.locator('#grid-size-text')).toHaveText('16x16');
  const slider = page.locator('#modify-grid');
  await slider.focus();
  await slider.press('ArrowRight');
  await slider.press('ArrowRight');
  await slider.press('ArrowRight');
  await expect(slider).toHaveValue('19');
  await expect(page.locator('#grid-size-text')).toHaveText('19x19');
  // Prove the grid MODEL resized, not just the label: at 1x1 a single paint
  // covers the entire 600x600 canvas.
  await slider.press('Home');
  await expect(page.locator('#grid-size-text')).toHaveText('1x1');
  const box = await page.locator('#board').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  expect(await paintedPixels(page)).toBeGreaterThan(350000, 'a 1x1 paint fills the whole board');
  // End jumps back to the maximum size.
  await slider.press('End');
  await expect(page.locator('#grid-size-text')).toHaveText('150x150');
});

test('grid-size slider still resizes via mouse drag', async ({ page }) => {
  // The fix (click -> change) must not regress the mouse path: dragging the
  // thumb fires `change` on release (probe-verified: drag fires input...change
  // + click, track click fires input + change + click).
  const slider = page.locator('#modify-grid');
  // The slider sits below the default 720px viewport; bring it into view.
  await slider.scrollIntoViewIfNeeded();
  const box = await slider.boundingBox();
  const startValue = Number(await slider.inputValue());
  const thumbX = box.x + box.width * ((startValue - 1) / 149);
  await page.mouse.move(thumbX, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.85, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  const value = await slider.inputValue();
  expect(Number(value)).toBeGreaterThan(startValue);
  await expect(page.locator('#grid-size-text')).toHaveText(`${value}x${value}`);
});

test('resizing keeps an undo level; undoing the resize restores the pre-resize grid (#11)', async ({ page }) => {
  const board = page.locator('#board');
  const box = await board.boundingBox();
  const cy = box.y + box.height / 2;

  // Paint a stroke on the default 16x16 board.
  await page.mouse.move(box.x + box.width * 0.3, cy);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, cy, { steps: 6 });
  await page.mouse.up();
  const original = await paintedPixels(page);
  expect(original).toBeGreaterThan(500);
  await expect(page.locator('#undo')).toBeEnabled();

  // Resize 16 -> 8 via the slider (set value + fire `change`, as the user's
  // drag-release does).
  await page.locator('#modify-grid').evaluate((el) => {
    el.value = '8';
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.locator('#grid-size-text')).toHaveText('8x8');

  // BUG (#11): a resize used to wipe the undo history, so the Undo button went
  // permanently disabled. A resize is a state change and must leave an undo level.
  await expect(page.locator('#undo')).toBeEnabled('a resize must leave an undo level');

  // Undo the resize: restores BOTH the pre-resize size and the drawing, and
  // re-syncs the size label + slider (not just the canvas).
  await page.click('#undo');
  await expect(page.locator('#grid-size-text')).toHaveText('16x16');
  await expect(page.locator('#modify-grid')).toHaveValue('16');
  const restored = await paintedPixels(page);
  expect(restored).toBeGreaterThan(500, 'the drawing survives a resize + undo round-trip');
  expect(Math.abs(restored - original)).toBeLessThan(200, 'the original 16x16 stroke is restored');
});

test('a long drag persists the grid at most twice, not per-cell (#13)', async ({ page }) => {
  // Regression guard: a fast 150x150 drag once serialised the whole grid to
  // localStorage on every pointermove. The render path stays live, but
  // persistence must fire at stroke start and stroke end only.
  await page.evaluate(() => {
    let calls = 0;
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (...args) {
      if (args[0] === 'etch-a-sketch:grid') calls++;
      return orig.apply(this, args);
    };
    window.__storageCalls = () => calls;
  });
  const box = await page.locator('#board').boundingBox();
  const cy = box.y + box.height / 2;
  // One long stroke across ~14 of the 16 columns.
  await page.mouse.move(box.x + box.width * 0.05, cy);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.95, cy, { steps: 24 });
  await page.mouse.up();
  const calls = await page.evaluate(() => window.__storageCalls());
  expect(calls).toBeGreaterThanOrEqual(1, 'the stroke was persisted');
  expect(calls).toBeLessThanOrEqual(2, 'persistence is per-stroke, not per-cell');
});

test('the Colour tool paints with the picked custom colour (#12)', async ({ page }) => {
  const picker = page.locator('#custom-color');
  // The picker is hidden until the Colour tool is selected.
  expect(await picker.isHidden()).toBe(true);
  await page.click('.tool-button.custom');
  expect(await picker.isVisible()).toBe(true);

  // Pick red, then paint a single dot in the centre.
  await picker.evaluate((el) => {
    el.value = '#ff0000';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const box = await page.locator('#board').boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.up();

  // The centre pixel is red — not the default black pen.
  const [r, g, b] = await page.evaluate(() => {
    const c = document.getElementById('board');
    const ctx = c.getContext('2d');
    const { width, height } = c;
    const d = ctx.getImageData(width >> 1, height >> 1, 1, 1).data;
    return [d[0], d[1], d[2]];
  });
  expect(r).toBeGreaterThan(200);
  expect(g).toBeLessThan(60);
  expect(b).toBeLessThan(60);

  // Undo reverts the custom-colour dot (undo works per-cell colour, as before).
  await page.click('#undo');
  expect(await paintedPixels(page)).toBe(0);
});
