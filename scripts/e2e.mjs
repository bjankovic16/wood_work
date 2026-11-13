// Browser test: drives the real app in the locally installed Chrome, the way a
// user would (clicks, drags, keyboard), and checks the resulting design.
// Usage: node scripts/e2e.mjs [screenshot-dir]
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const shotsDir = process.argv[2] ?? 'test-results';
await mkdir(shotsDir, { recursive: true });

const server = await createServer({ logLevel: 'error', server: { port: 5199 } });
await server.listen();
const url = server.resolvedUrls.local[0];

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const problems = [];
page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
// Deprecation notice printed by React Three Fiber itself with this three.js version; not caused by the app.
const THIRD_PARTY_NOTICES = [/THREE.Clock: This module has been deprecated/];
const isNoise = (text) => THIRD_PARTY_NOTICES.some((pattern) => pattern.test(text));
page.on('console', (m) => {
  if ((m.type() === 'error' || m.type() === 'warning') && !isNoise(m.text())) problems.push(`${m.type()}: ${m.text()}`);
});

let failures = 0;
function check(name, ok, detail) {
  if (ok) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.log(`  ✗ ${name}\n      ${JSON.stringify(detail)}`);
  }
}

const design = () => page.evaluate(() => window.__kitchen.design.getState().design);
const view = () =>
  page.evaluate(() => {
    const s = window.__kitchen.ui.getState();
    return { zoom: s.zoom, pan: s.pan, selectedId: s.selectedId, focus: document.activeElement?.id ?? null };
  });
const item = async (predicate) => (await design()).items.find(predicate);
const byLabel = (label) => item((i) => i.label === label);
const shot = (name) => page.screenshot({ path: path.join(shotsDir, name) });
/** JSON with object keys sorted, to compare data regardless of key order. */
const sortedJson = (value) =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v,
  );

/** Plan millimetres to page pixels. */
async function screen(x, y) {
  const { zoom, pan } = await view();
  const box = await page.locator('main').boundingBox();
  return { x: box.x + pan.x + x * zoom, y: box.y + pan.y + y * zoom };
}

async function drag(from, to, { steps = 12, beforeRelease } = {}) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 8, from.y + 8, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps });
  if (beforeRelease) await beforeRelease();
  await page.mouse.up();
}

async function dragPreset(presetId, to, options) {
  const box = await page.locator(`[data-preset="${presetId}"]`).boundingBox();
  await drag({ x: box.x + box.width / 2, y: box.y + box.height / 2 }, to, options);
}

try {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('canvas');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  await shot('01-empty.png');

  console.log('Ready-made layouts');
  await page.getByRole('button', { name: 'Or start from a ready-made layout' }).click();
  await page.getByRole('button', { name: /^L-shaped/ }).click();
  const laid = await design();
  check(
    'a ready-made L-shaped kitchen fills the plan',
    laid.items.length > 8 && laid.items.some((i) => i.kind === 'corner' && i.x === 0 && i.y === 0),
    laid.items.map((i) => i.label),
  );
  await page.waitForTimeout(150);
  await shot('01b-l-layout.png');
  await page.keyboard.press('Control+z');
  check('Undo takes the layout away again', (await design()).items.length === 0);

  console.log('Library');
  for (const id of ['base-600', 'base-600', 'sink', 'dishwasher']) await page.click(`[data-preset="${id}"]`);
  let d = await design();
  check(
    'clicking elements lines them up along the top wall',
    JSON.stringify(d.items.map((i) => [i.label, i.x, i.y, i.rotation])) ===
      JSON.stringify([['B1', 0, 0, 0], ['B2', 600, 0, 0], ['S1', 1200, 0, 0], ['DW1', 2000, 0, 0]]),
    d.items.map((i) => [i.label, i.x, i.y, i.rotation]),
  );
  check('the added element is selected', (await view()).selectedId === d.items.at(-1).id);

  await dragPreset('corner', await screen(400, d.room.depth - 400), {
    beforeRelease: () => shot('02-library-drag-preview.png'),
  });
  const corner = await item((i) => i.kind === 'corner');
  check(
    'a corner unit dragged near a room corner drops into it',
    corner?.rotation === 270 && corner.x === 0 && corner.y === d.room.depth - 900,
    corner,
  );

  await dragPreset('base-600', await screen(200, 1300));
  const leftUnit = await byLabel('B3');
  check('a unit dropped near the left wall turns its back to it', leftUnit?.rotation === 270 && leftUnit.x === 0, leftUnit);

  await page.click('[data-preset="wall-600"]');
  await page.click('[data-preset="wall-800"]');
  const [w1, w2] = [await byLabel('W1'), await byLabel('W2')];
  check('wall cabinets line up above the base units', w1.x === 0 && w1.y === 0 && w2.x === 600, [w1, w2]);

  await dragPreset('fridge', { x: 1300, y: 450 });
  check('dropping outside the plan adds nothing', !(await item((i) => i.kind === 'fridge')));

  await page.click('[data-preset="base-custom"]');
  const focus = await view();
  check('a custom cabinet opens its width for typing', focus.focus !== null && (await page.evaluate(() => document.activeElement?.tagName)) === 'INPUT', focus);
  await page.keyboard.type('750');
  await page.keyboard.press('Enter');
  check('typing the custom width applies it', (await byLabel('B4'))?.width === 750, await byLabel('B4'));
  await page.keyboard.press('Escape');
  await shot('03-layout.png');
  await page.keyboard.press('Delete');
  check('Delete removes the selected unit', !(await byLabel('B4')));

  console.log('Plan');
  const b2 = await byLabel('B2');
  const grip = await screen(900, 450);
  await page.mouse.click(grip.x, grip.y);
  check('clicking a unit selects it', (await view()).selectedId === b2.id);
  check('the properties panel shows it', await page.getByText(/^Base cabinet\s*B2$/).isVisible());

  await drag(grip, await screen(2915, 470), { beforeRelease: () => shot('04-moving.png') });
  let moved = await byLabel('B2');
  check('dragging moves the unit and snaps it to its neighbour', moved.x === 2600 && moved.y === 0 && moved.rotation === 0, moved);

  await page.keyboard.press('Control+z');
  check('Ctrl+Z undoes the whole drag', (await byLabel('B2')).x === 600, await byLabel('B2'));
  await page.keyboard.press('Control+y');
  check('Ctrl+Y redoes it', (await byLabel('B2')).x === 2600, await byLabel('B2'));

  await drag(await screen(3200, 280), await screen(3590, 300));
  check('dragging the side handle stretches the unit to the wall', (await byLabel('B2')).width === 1000, await byLabel('B2'));

  const widthField = page.getByLabel('Width', { exact: true });
  await widthField.fill('450+150');
  await widthField.press('Enter');
  check('typing a sum in the width field applies the result', (await byLabel('B2')).width === 600, await byLabel('B2'));
  await widthField.fill('5000');
  await widthField.press('Enter');
  check('widths are limited to what the cabinet type allows', (await byLabel('B2')).width === 1200, await byLabel('B2'));
  await page.keyboard.press('Escape');

  const b2Box = await screen(2900, 450);
  await page.mouse.click(b2Box.x, b2Box.y);
  await page.keyboard.press('r');
  check('R rotates the selected unit', (await byLabel('B2')).rotation === 90, await byLabel('B2'));
  await page.keyboard.press('Shift+R');
  check('Shift+R rotates it back', (await byLabel('B2')).rotation === 0, await byLabel('B2'));

  const before = (await byLabel('B2')).x;
  await page.keyboard.press('ArrowLeft');
  check('arrow keys nudge the unit by 10 mm', (await byLabel('B2')).x === before - 10, await byLabel('B2'));
  await page.keyboard.press('Control+z');

  const countBefore = (await design()).items.length;
  await page.keyboard.press('Control+d');
  d = await design();
  const copy = d.items.at(-1);
  check(
    'Ctrl+D duplicates the unit and selects the copy',
    d.items.length === countBefore + 1 && copy.kind === 'base' && copy.width === 1200 && (await view()).selectedId === copy.id,
    copy,
  );
  await page.keyboard.press('Delete');
  check('Delete removes it', (await design()).items.length === countBefore);
  await page.keyboard.press('Control+z');
  check('undo brings it back', (await design()).items.length === countBefore + 1);
  await page.keyboard.press('Control+z');
  check('undo again removes the duplicate', (await design()).items.length === countBefore);

  const b1 = await byLabel('B1');
  const b1Point = await screen(300, 450);
  await drag(b1Point, await screen(1100, 1500), {
    beforeRelease: async () => {
      await page.keyboard.press('Escape');
    },
  });
  const b1After = await byLabel('B1');
  check('Escape during a drag puts the unit back', b1After.x === b1.x && b1After.y === b1.y, b1After);

  console.log('View');
  const fitZoom = (await view()).zoom;
  const centre = await screen(1800, 1500);
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.wheel(0, -600);
  await page.waitForTimeout(50);
  check('the mouse wheel zooms in', (await view()).zoom > fitZoom * 1.5, await view());
  await shot('05-zoomed.png');
  await page.getByRole('button', { name: 'Fit the room in view' }).click();
  check('Fit returns to the whole room', Math.abs((await view()).zoom - fitZoom) < 1e-9);

  const panBefore = (await view()).pan;
  const emptyPoint = await screen(-600, 1500);
  const empty = { x: Math.round(emptyPoint.x), y: Math.round(emptyPoint.y) };
  await drag(empty, { x: empty.x + 150, y: empty.y + 60 });
  const panAfter = (await view()).pan;
  check('dragging empty space pans the view', Math.round(panAfter.x - panBefore.x) === 150 && Math.round(panAfter.y - panBefore.y) === 60, { panBefore, panAfter });
  await page.getByRole('button', { name: 'Fit the room in view' }).click();

  await page.mouse.click(empty.x, empty.y);
  check('clicking empty space clears the selection', (await view()).selectedId === null);

  await page.getByRole('button', { name: 'Wall units' }).click();
  const underWall = await screen(300, 450);
  await page.mouse.click(underWall.x, underWall.y);
  check('with "Wall units" shown, floor units cannot be picked', (await view()).selectedId === null, await view());
  const wallPoint = await screen(300, 150);
  await page.mouse.click(wallPoint.x, wallPoint.y);
  check('…but wall units can', (await view()).selectedId === w1.id, await view());
  await shot('06-wall-units.png');
  await page.getByRole('button', { name: 'All', exact: true }).click();

  await page.getByRole('button', { name: 'Snap' }).click();
  const s1 = await byLabel('S1');
  await page.mouse.click((await screen(1600, 450)).x, (await screen(1600, 450)).y);
  await drag(await screen(1600, 450), await screen(1633, 1237));
  const s1After = await byLabel('S1');
  check('with Snap off, units move freely', s1After.y > 600 && s1After.x % 50 !== 0 && s1After.rotation === s1.rotation, s1After);
  await page.keyboard.press('Control+z');
  await page.getByRole('button', { name: 'Snap' }).click();

  await page.getByRole('button', { name: 'Dimensions' }).click();
  await shot('07-no-dimensions.png');
  await page.getByRole('button', { name: 'Dimensions' }).click();

  console.log('Room');
  await page.keyboard.press('Escape');
  const roomWidth = page.getByLabel('Width', { exact: true });
  await roomWidth.fill('3000');
  await roomWidth.press('Enter');
  d = await design();
  const b2Clamped = d.items.find((i) => i.label === 'B2');
  check('shrinking the room keeps every unit inside', d.room.width === 3000 && b2Clamped.x + b2Clamped.width <= 3000, b2Clamped);
  await roomWidth.press('Escape');
  await page.keyboard.press('Control+z');
  check('undo restores the room', (await design()).room.width === 3600);

  await page.getByLabel('Project name').fill('Kuhinja Petrović');
  await page.getByLabel('Project name').press('Enter');

  console.log('Persistence');
  const saved = await design();
  await page.reload();
  await page.waitForSelector('canvas');
  const loaded = await design();
  check('the design survives a page reload', sortedJson(saved) === sortedJson(loaded), { saved, loaded });
  check('the project name was kept', loaded.name === 'Kuhinja Petrović', loaded.name);
  await page.waitForTimeout(200);
  await shot('08-reloaded.png');

  console.log('U-shaped kitchen');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Remove all elements' }).click();
  await page.getByRole('button', { name: 'Remove all', exact: true }).click();
  check('"Remove all elements" empties the plan', (await design()).items.length === 0);

  for (const id of ['corner', 'corner', 'base-600', 'sink', 'base-400', 'dishwasher', 'drawer', 'fridge']) {
    await page.click(`[data-preset="${id}"]`);
  }
  const placed = (await design()).items.map((i) => [i.label, i.x, i.y, i.rotation]);
  check(
    'corner units take the two top corners and the runs fill the gaps between them',
    JSON.stringify(placed) ===
      JSON.stringify([
        ['C1', 0, 0, 0],
        ['C2', 2700, 0, 90],
        ['B1', 900, 0, 0],
        ['S1', 1500, 0, 0],
        ['B2', 2300, 0, 0],
        ['DW1', 3040, 900, 90],
        ['D1', 3040, 1500, 90],
        ['F1', 3000, 2100, 90],
      ]),
    placed,
  );

  await dragPreset('base-600', await screen(200, 1220));
  await dragPreset('oven', await screen(200, 1820));
  const [leftBase, oven] = [await byLabel('B3'), await byLabel('O1')];
  check(
    'units dragged to the left wall stack under the corner unit',
    leftBase.rotation === 270 && leftBase.x === 0 && leftBase.y === 900 && oven.rotation === 270 && oven.y === 1500,
    [leftBase, oven],
  );

  for (const id of ['wall-800', 'wall-800', 'wall-600', 'wall-600']) await page.click(`[data-preset="${id}"]`);
  await page.click('[data-preset="endPanel"]');
  await page.click('[data-preset="tall"]');

  await page.getByRole('button', { name: 'Wall units' }).click();
  await page.click('[data-preset="base-300"]');
  check('adding a floor unit while only wall units are shown switches back to "All"', await page.evaluate(() => window.__kitchen.ui.getState().viewFilter === 'all'));
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  await shot('09-u-shaped.png');

  console.log('3D');
  await page.getByRole('radio', { name: /^3D/ }).click();
  await page.locator('main canvas').first().waitFor();
  await page.waitForTimeout(2500); // shader compilation and first frames
  await shot('14-3d.png');
  await page.getByRole('button', { name: 'Fronts: Sage green' }).click();
  await page.getByRole('button', { name: 'Worktop: Oak' }).click();
  await page.getByRole('button', { name: 'Black bar' }).click();
  const style = (await design()).style;
  check('fronts, worktop and handles can be restyled', style.front === 'sage' && style.worktop === 'oak' && style.handles === 'black', style);
  await page.waitForTimeout(800);
  await shot('15-3d-styled.png');
  await page.keyboard.press('Control+z');
  check('a style change can be undone', (await design()).style.handles === 'steel', (await design()).style);
  await page.getByRole('button', { name: 'Reset view' }).click();
  await page.getByRole('radio', { name: /^Plan/ }).click();
  await page.waitForSelector('canvas');

  console.log('Fronts, construction and cutting list');
  const b1Front = await screen(1200, 470);
  await page.mouse.click(b1Front.x, b1Front.y);
  check('clicking B1 selects it', (await view()).selectedId === (await byLabel('B1')).id);
  check('a 600 mm base cabinet has two doors by default', (await page.getByLabel('Doors', { exact: true }).textContent()) === '2');
  await page.getByRole('button', { name: 'More drawers' }).click();
  check('adding a drawer is stored on the unit', (await byLabel('B1')).drawers === 1, await byLabel('B1'));
  check('its parts now include a drawer front', await page.getByText('Drawer front', { exact: true }).first().isVisible());
  await page.getByRole('button', { name: 'Fewer doors' }).click();
  check('removing a door leaves one', (await byLabel('B1')).doors === 1, await byLabel('B1'));
  await shot('10-unit-fronts.png');

  await page.getByRole('radio', { name: 'Right' }).click();
  check('a single door can hang on the right', (await byLabel('B1')).hinge === 'right', await byLabel('B1'));
  await page.getByRole('radio', { name: 'Inset' }).click();
  check('a unit can have inset fronts', (await byLabel('B1')).doorType === 'inset', await byLabel('B1'));
  await shot('10b-inset.png');
  await page.getByRole('radio', { name: 'Full overlay' }).click();
  check('…and go back to full overlay', (await byLabel('B1')).doorType === undefined, await byLabel('B1'));

  await page.getByLabel('Carcass', { exact: true }).selectOption('particleboard-white-16');
  check('one unit can use another board', (await byLabel('B1')).carcassMaterial === 'particleboard-white-16', await byLabel('B1'));
  await page.getByLabel('Carcass', { exact: true }).selectOption('');
  check('…and go back to the kitchen board', (await byLabel('B1')).carcassMaterial === undefined, await byLabel('B1'));

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Kitchen settings' });
  await settings.getByLabel('Fronts', { exact: true }).selectOption('mdf-oak-19');
  await settings.getByLabel('Front edges', { exact: true }).selectOption('abs-2');
  const chosen = (await design()).construction;
  check('fronts and their edge band are chosen for the whole kitchen', chosen.frontMaterial === 'mdf-oak-19' && chosen.frontEdge === 'abs-2', chosen);
  const boardsBefore = (await design()).materials.length;
  await settings.getByRole('button', { name: 'Add board' }).click();
  check('a board can be added to the library', (await design()).materials.length === boardsBefore + 1);
  const price = settings.getByTestId('material-card').first().getByLabel('Price per sheet');
  await price.fill('60');
  await price.press('Enter');
  check('a board can be given a price', (await design()).materials[0].price === 60, (await design()).materials[0]);
  await shot('11-materials.png');
  await settings.getByRole('radio', { name: 'Construction' }).click();
  await settings.getByRole('radio', { name: 'Under the sides' }).click();
  check('the bottom joint changes for the whole kitchen', (await design()).construction.bottomJoint === 'under');
  await settings.getByRole('radio', { name: 'Metal system' }).click();
  check('the drawer system can be switched', (await design()).construction.drawerSystem === 'metal');
  await shot('11b-construction.png');
  await page.getByRole('button', { name: 'Done' }).click();
  check('Done closes the dialog', !(await page.getByRole('dialog').isVisible()));

  await page.getByRole('radio', { name: /Cutting list/ }).click();
  await page.waitForSelector('table');
  const tableText = await page.locator('table').first().innerText();
  check('the cutting list shows sides standing on the bottom (720 − 18 = 702)', /Side\s+\d+\s+702\s+560/.test(tableText), tableText.slice(0, 200));
  check('it shows which edges are banded', tableText.includes('L1 W0'));
  check(
    'fronts are oak-veneered MDF with all four edges banded',
    /Door\s[^\n]*Oak-veneered MDF[^\n]*L2 W2/.test(tableText),
    tableText.split('\n').find((line) => line.startsWith('Door')),
  );
  check('drawers on the metal system only need a bottom and a back', tableText.includes('Drawer back') && !tableText.includes('Drawer side'));
  const totalsText = await page.getByTestId('material-totals').innerText();
  check('board totals give sheets and a price', /sheets? of 2800 × 2070/.test(totalsText) && /\d+\.\d\d/.test(totalsText), totalsText);
  check(
    'the hardware list is shown',
    (await page.getByRole('heading', { name: 'Hardware' }).isVisible()) && (await page.getByText('Concealed hinge, full overlay').first().isVisible()),
  );
  await shot('12-cutting-list.png');

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'CSV' }).click()]);
  const csvPath = path.join(shotsDir, 'cutting-list.csv');
  await download.saveAs(csvPath);
  const csv = await readFile(csvPath, 'utf8');
  check('the CSV download has a header and a row per kind of piece', csv.includes('Piece;Quantity;Length (mm)') && csv.split('\r\n').length > 10, csv.slice(0, 200));

  await page.getByRole('radio', { name: 'By unit' }).click();
  check('the list can be grouped by unit', await page.getByRole('heading', { name: /^B1 / }).isVisible());
  await shot('13-cutting-list-by-unit.png');

  await page.getByRole('button', { name: 'Construction', exact: true }).first().click();
  await page.getByRole('button', { name: 'Reset to defaults' }).click();
  const reset = (await design()).construction;
  check('Reset to defaults restores the construction rules', reset.bottomJoint === 'between' && reset.drawerSystem === 'wooden', reset);
  check('…and keeps the chosen materials', reset.frontMaterial === 'mdf-oak-19', reset);
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('radio', { name: /Plan/ }).click();
  await page.waitForSelector('canvas');

  console.log('Checks');
  const checksButton = page.getByRole('button', { name: /^Checks:/ });
  const b1Unit = await screen(1200, 470);
  await page.mouse.click(b1Unit.x, b1Unit.y);
  const fromLeft = page.getByLabel('From left wall');
  await fromLeft.fill('1200');
  await fromLeft.press('Enter');
  await fromLeft.press('Escape');
  check('the checks count the overlap as an error', /error/.test(await checksButton.getAttribute('aria-label')), await checksButton.getAttribute('aria-label'));
  await checksButton.click();
  const overlap = page.getByRole('button', { name: 'B1 and S1 overlap.' });
  check('the checks list names the units', await overlap.isVisible());
  await shot('14b-checks.png');
  await overlap.click();
  check('opening an issue selects the unit', (await view()).selectedId === (await byLabel('B1')).id);
  await page.keyboard.press('Control+z');
  check('undo clears the error', !/error/.test(await checksButton.getAttribute('aria-label')), await checksButton.getAttribute('aria-label'));

  console.log('Windows and doors');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Window', exact: true }).click();
  const windowCard = page.getByTestId('opening-card').first();
  for (const [label, value] of [
    ['From the left', '1500'],
    ['Width', '800'],
  ]) {
    const field = windowCard.getByLabel(label, { exact: true });
    await field.fill(value);
    await field.press('Enter');
  }
  const windowOpening = (await design()).openings[0];
  check(
    'a window can be added and placed on a wall',
    windowOpening?.kind === 'window' && windowOpening.offset === 1500 && windowOpening.width === 800,
    windowOpening,
  );
  check('the checks notice wall units in front of the window', /warning/.test(await checksButton.getAttribute('aria-label')), await checksButton.getAttribute('aria-label'));
  await page.getByRole('button', { name: 'Door', exact: true }).click();
  const doorCard = page.getByTestId('opening-card').nth(1);
  await doorCard.getByLabel('Wall', { exact: true }).selectOption('bottom');
  const doorFrom = doorCard.getByLabel('From the left', { exact: true });
  await doorFrom.fill('1200');
  await doorFrom.press('Enter');
  const doorOpening = (await design()).openings[1];
  check('a door can go on another wall', doorOpening?.kind === 'door' && doorOpening.wall === 'bottom' && doorOpening.offset === 1200, doorOpening);
  await doorFrom.press('Escape');
  await page.waitForTimeout(150);
  await shot('15b-window-and-door.png');
  await page.getByRole('radio', { name: /^3D/ }).click();
  await page.locator('main canvas').first().waitFor();
  await page.waitForTimeout(2500);
  await shot('16-3d-window.png');
  await page.getByRole('radio', { name: /^Plan/ }).click();
  await page.waitForSelector('canvas');

  console.log('Phone');
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const mobile = await phone.newPage();
  mobile.on('pageerror', (e) => problems.push(`phone page error: ${e.message}`));
  mobile.on('console', (m) => {
    if ((m.type() === 'error' || m.type() === 'warning') && !isNoise(m.text())) problems.push(`phone ${m.type()}: ${m.text()}`);
  });
  const mobileDesign = () => mobile.evaluate(() => window.__kitchen.design.getState().design);
  const mobileView = () =>
    mobile.evaluate(() => {
      const s = window.__kitchen.ui.getState();
      return { zoom: s.zoom, pan: s.pan, selectedId: s.selectedId };
    });
  const mobileScreen = async (x, y) => {
    const { zoom, pan } = await mobileView();
    const box = await mobile.locator('main').boundingBox();
    return { x: Math.round(box.x + pan.x + x * zoom), y: Math.round(box.y + pan.y + y * zoom) };
  };
  const cdp = await phone.newCDPSession(mobile);
  const touch = (type, points) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
  async function touchPath(from, to, steps = 10) {
    await touch('touchStart', from.map((p) => [p.x, p.y]));
    for (let i = 1; i <= steps; i++) {
      await touch('touchMove', from.map((p, k) => [p.x + ((to[k].x - p.x) * i) / steps, p.y + ((to[k].y - p.y) * i) / steps]));
    }
    await touch('touchEnd', []);
  }

  await mobile.goto(url);
  await mobile.evaluate(() => localStorage.clear());
  await mobile.reload();
  await mobile.waitForSelector('canvas');
  await mobile.evaluate(() => document.fonts.ready);
  await mobile.screenshot({ path: path.join(shotsDir, 'phone-01-empty.png') });
  check('the phone layout shows the plan with an "Add element" button', await mobile.getByRole('button', { name: 'Add element' }).isVisible());

  await mobile.getByRole('button', { name: 'Add element' }).tap();
  await mobile.screenshot({ path: path.join(shotsDir, 'phone-02-add.png') });
  await mobile.locator('[data-preset="base-600"]').tap();
  check('tapping an element adds it and closes the panel', (await mobileDesign()).items.length === 1 && !(await mobile.getByRole('dialog').isVisible()));
  check('the new unit is selected and shown at the bottom', await mobile.getByTestId('item-sheet').isVisible());

  check('the "Add element" button makes way for the selected unit', await mobile.getByRole('button', { name: 'Add element' }).isHidden());
  const unitCentre = await mobileScreen(300, 400);
  const target = await mobileScreen(1500, 400);
  await touchPath([unitCentre], [target]);
  const movedOnPhone = (await mobileDesign()).items[0];
  check('dragging with a finger moves the unit along the wall', movedOnPhone.x === 1200 && movedOnPhone.y === 0, movedOnPhone);

  const zoomBefore = (await mobileView()).zoom;
  const pinchCentre = await mobileScreen(1800, 1500);
  await touchPath(
    [{ x: pinchCentre.x - 40, y: pinchCentre.y }, { x: pinchCentre.x + 40, y: pinchCentre.y }],
    [{ x: pinchCentre.x - 120, y: pinchCentre.y }, { x: pinchCentre.x + 120, y: pinchCentre.y }],
  );
  const zoomAfter = (await mobileView()).zoom;
  check('pinching with two fingers zooms in', zoomAfter > zoomBefore * 2.5, { zoomBefore, zoomAfter });
  check('a pinch does not move the unit', (await mobileDesign()).items[0].x === 1200);
  await mobile.getByRole('button', { name: 'Fit the room in view' }).tap();

  await mobile.getByRole('button', { name: 'Edit' }).tap();
  await mobile.getByRole('button', { name: 'More drawers' }).tap();
  check('the unit can be configured on the phone', (await mobileDesign()).items[0].drawers === 1);
  await mobile.screenshot({ path: path.join(shotsDir, 'phone-03-edit.png') });
  await mobile.getByRole('button', { name: 'Less' }).tap();

  await mobile.getByRole('radio', { name: /List/ }).tap();
  check('the cutting list opens on the phone', await mobile.locator('table').first().isVisible());
  await mobile.screenshot({ path: path.join(shotsDir, 'phone-04-list.png') });

  await mobile.getByRole('radio', { name: /^3D/ }).tap();
  await mobile.locator('main canvas').first().waitFor();
  await mobile.waitForTimeout(2500);
  check('the 3D view opens on the phone', await mobile.getByRole('button', { name: 'Style' }).isVisible());
  await mobile.screenshot({ path: path.join(shotsDir, 'phone-05-3d.png') });

  await mobile.getByRole('button', { name: 'Deselect' }).tap();
  await mobile.getByRole('button', { name: 'Room' }).tap();
  await mobile.getByRole('button', { name: 'Ready-made layouts' }).tap();
  await mobile.getByRole('button', { name: /^U-shaped/ }).tap();
  check('a ready-made U-shaped kitchen can be chosen on the phone', (await mobileDesign()).items.filter((i) => i.kind === 'corner').length === 2);
  await mobile.getByRole('button', { name: 'Close' }).tap();
  await mobile.waitForTimeout(2000);
  await mobile.screenshot({ path: path.join(shotsDir, 'phone-06-u-3d.png') });
  await phone.close();
} catch (error) {
  failures++;
  console.error(error);
  await shot('error.png').catch(() => {});
} finally {
  check('no errors or warnings in the browser console', problems.length === 0, problems);
  await browser.close();
  await server.close();
}

console.log(failures === 0 ? '\nAll browser checks passed.' : `\n${failures} browser check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
