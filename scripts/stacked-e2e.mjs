import { chooseLanguage } from './settings-language.mjs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { assertBodyOrbits, open3DTools, waitForIdleRendering } from './three-test-helpers.mjs';

const args = process.argv.slice(2);
const planOnly = args.includes('--plan-only');
const output = args.find((arg) => arg !== '--plan-only') ?? path.join('test-results', planOnly ? 'stacked-plan' : 'stacked');
await mkdir(output, { recursive: true });
const server = await createServer({ logLevel: 'error', cacheDir: path.resolve(output, '.vite'), optimizeDeps: { entries: ['index.html'] }, server: { host: '127.0.0.1', port: 0, watch: null, hmr: false } });
let browser;
const problems = [];
const observe = (page) => {
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type()) && !/THREE.Clock: This module has been deprecated|GL Driver Message .*GPU stall due to ReadPixels/.test(message.text())) problems.push(message.text());
  });
};
const design = (page) => page.evaluate(() => window.__kitchen.design.getState().design);
const pass = (message) => console.log(`  PASS ${message}`);
const shot = (page, name) => page.screenshot({ path: path.join(output, name) });
const snapshot = (value) => ({ ...value, name: '', items: value.items.map(({ id, ...item }) => item) });

async function stackingAction(page) {
  const size = page.getByRole('tabpanel', { name: 'Size', exact: true });
  const button = size.getByRole('button', { name: 'Add cabinet above', exact: true });
  const code = await size.getByRole('textbox', { name: 'Code', exact: true }).boundingBox();
  assert.ok((await button.boundingBox()).y >= code.y + code.height, 'Put stacking below the everyday cabinet fields.');
  return button;
}

async function clickPlanUnit(page, item, touch = false) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const point = await page.evaluate(async (item) => {
    const { localToRoom } = await import('/src/domain/geometry.ts');
    const position = localToRoom(item, item.width / 2, item.depth * 0.6);
    const { zoom, pan } = window.__kitchen.ui.getState();
    const box = document.querySelector('.konvajs-content').getBoundingClientRect();
    return { x: box.x + pan.x + position.x * zoom, y: box.y + pan.y + position.y * zoom };
  }, item);
  if (touch) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
  await page.waitForFunction((id) => window.__kitchen.ui.getState().selectedId === id, item.id);
}

async function ready3D(page) {
  await open3DTools(page);
  await page.getByRole('button', { name: 'Reset view', exact: true }).waitFor();
  await page.waitForFunction(() => Boolean(window.__kitchen3D));
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(300);
}

async function clickSceneUnit(page, item) {
  const point = await page.evaluate(async (item) => {
    const { localToRoom } = await import('/src/domain/geometry.ts');
    const { camera } = window.__kitchen3D;
    camera.updateMatrixWorld(true);
    const box = document.querySelector('main canvas').getBoundingClientRect();
    const front = localToRoom(item, item.width / 2, item.depth + 20);
    const projected = camera.position.clone().set(front.x / 1000, (item.elevation + item.height / 2) / 1000, front.y / 1000).project(camera);
    const x = box.x + (projected.x + 1) * box.width / 2;
    const y = box.y + (1 - projected.y) * box.height / 2;
    return { x, y, hit: document.elementFromPoint(x, y)?.tagName };
  }, item);
  assert.equal(point.hit, 'CANVAS', 'The cabinet face must not be hidden behind a floating toolbar.');
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction((id) => window.__kitchen.ui.getState().selectedId === id, item.id);
}

async function run() {
  await server.listen();
  const url = server.resolvedUrls.local[0];
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  // Camera glides and door animations are covered by the resize checks; here every view appears at once.
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  observe(page);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('room-done').click();
  await chooseLanguage(page, 'en');

  console.log('Guided three-tier base run');
  await page.locator('[data-preset="base-600"]').click();
  await page.getByText('Set up base + two upper rows', { exact: true }).click();
  await page.getByLabel('Middle height', { exact: true }).fill('650');
  await page.getByLabel('Middle height', { exact: true }).press('Enter');
  const guidedBefore = await design(page);
  const guidedHistory = await page.evaluate(() => window.__kitchen.design.getState().past.length);
  await page.getByRole('button', { name: 'Add two upper rows', exact: true }).click();
  const guided = await design(page);
  assert.equal(guided.items.length, 3);
  assert.equal(guided.items[1].height, 650);
  assert.equal(guided.items[2].elevation + guided.items[2].height, guided.room.height - 30);
  // The newly added, selected top tier covers the base, but cannot take its click in All.
  await clickPlanUnit(page, guided.items[0]);
  assert.equal(await page.evaluate(() => window.__kitchen.design.getState().past.length), guidedHistory + 1);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  assert.deepEqual(await design(page), guidedBefore);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  assert.deepEqual(await design(page), guided);
  await shot(page, '00-guided-three-tier.png');
  await page.evaluate(async () => {
    const { createDesign } = await import('/src/domain/designOps.ts');
    window.__kitchen.design.getState().load(createDesign());
    window.__kitchen.ui.getState().select(null);
    window.__kitchen.ui.getState().setViewFilter('all');
  });
  pass('the guided setup previews editable row sizes and inserts the complete three-tier run in one undo step');

  console.log('Stacking and individual row selection');
  await page.locator('[data-preset="wall-600"]').click();
  const lower = (await design(page)).items[0];
  await (await stackingAction(page)).click();
  let state = await design(page);
  assert.equal(state.items.length, 2);
  const upper = state.items[1];
  assert.equal(upper.elevation, lower.elevation + lower.height);
  assert.equal(upper.elevation + upper.height, state.room.height - 30);
  assert.equal(await page.getByRole('button', { name: 'All', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.evaluate(() => window.__kitchen.ui.getState().selectedId), upper.id);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  assert.equal((await design(page)).items.length, 1);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  assert.equal((await design(page)).items.length, 2);
  pass('one click adds an aligned cabinet with a ceiling gap and one complete Undo step');

  await page.getByRole('button', { name: 'Wall units', exact: true }).click();
  await page.getByLabel('Upper cabinet row', { exact: true }).selectOption(String(lower.elevation));
  await clickPlanUnit(page, lower);
  assert.equal(await page.getByRole('button', { name: 'Add cabinet above', exact: true }).isDisabled(), true);
  await page.getByText('The space above is not clear. Check cabinets, room boundaries, structures and openings before stacking.', { exact: true }).waitFor();
  await shot(page, '01-lower-row-selected.png');
  await page.getByLabel('Upper cabinet row', { exact: true }).selectOption(String(upper.elevation));
  await clickPlanUnit(page, upper);
  await shot(page, '02-upper-row-selected.png');
  pass('real clicks can select each cabinet at the same footprint; occupied stack space is explained');
  if (planOnly) {
    assert.deepEqual(problems, []);
    return;
  }

  await page.evaluate(async () => (await import('/src/store/actions.ts')).setRoomSize({ height: 3100 }));
  await page.getByRole('radio', { name: '3. 3D', exact: true }).click();
  await ready3D(page);
  const tools = page.getByRole('group', { name: 'Selected cabinet actions' });
  await tools.getByRole('button', { name: 'Add cabinet above', exact: true }).click();
  state = await design(page);
  assert.equal(state.items.length, 3);
  assert.equal(state.items[2].elevation, upper.elevation + upper.height);
  await page.getByRole('group', { name: '3D camera' }).getByRole('button', { name: 'Front', exact: true }).click();
  await clickSceneUnit(page, lower);
  await clickSceneUnit(page, state.items[2]);
  await shot(page, '03-three-rows-in-3d.png');
  pass('the 3D toolbar can add a third tier, and physical cabinet faces remain independently selectable');

  console.log('Orbiting a selected stacked tier in 3D');
  const camera = page.getByRole('group', { name: '3D camera' });
  await camera.getByRole('button', { name: 'Top', exact: true }).click();
  await assertBodyOrbits(page, state.items[2].id);
  pass('dragging the selected tier with the mouse orbits without moving an object or adding history');

  await page.waitForTimeout(500);
  const saved = await design(page);
  await page.reload();
  await page.waitForSelector('.konvajs-content');
  assert.deepEqual(await design(page), saved);
  assert.equal(await page.getByRole('button', { name: 'All', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', { name: 'Wall units', exact: true }).click();
  assert.equal(await page.getByLabel('Upper cabinet row', { exact: true }).locator('option').count(), 3);
  await page.getByRole('button', { name: 'Browse all parts', exact: true }).click();
  await page.locator('[data-preset="ceiling-600"]').click();
  const ceiling = (await design(page)).items.at(-1);
  assert.equal(ceiling.depth, 560);
  assert.equal(ceiling.elevation + ceiling.height, saved.room.height - 30);
  pass('three rows survive reload, and ceiling-library cupboards follow the actual room height');

  console.log('Four premium layered kitchens');
  const expected = await page.evaluate(async () => {
    const { KITCHEN_DESIGNS, createKitchenDesign } = await import('/src/domain/kitchens.ts');
    return KITCHEN_DESIGNS.filter((preset) => preset.layered).map((preset) => ({ id: preset.id, design: createKitchenDesign(preset, 'Preview') }));
  });
  assert.equal(expected.length, 4);
  for (const [index, preset] of expected.entries()) {
    await page.getByRole('button', { name: 'Ideas', exact: true }).click();
    const gallery = page.getByRole('dialog', { name: 'Ideas' });
    await gallery.getByRole('checkbox', { name: 'No larger than my room' }).uncheck();
    await gallery.getByLabel('Kitchen layout', { exact: true }).selectOption('layered');
    assert.equal(await gallery.locator('[data-kitchen-design]').count(), 40);
    await gallery.locator('img').evaluateAll((images) => {
      for (const image of images) image.loading = 'eager';
      return Promise.all(images.map((image) => image.decode()));
    });
    if (index === 0) await shot(page, '04-premium-gallery.png');
    const card = gallery.getByRole('article').filter({ has: page.locator(`[data-kitchen-design="${preset.id}"]`) });
    await card.getByRole('button', { name: /^More options for / }).click();
    await card.locator(`[data-kitchen-original="${preset.id}"]`).click();
    await ready3D(page);
    assert.deepEqual(snapshot(await design(page)), snapshot(preset.design));
    const issues = await page.evaluate(async () => {
      const { checkDesign } = await import('/src/engine/checks.ts');
      return checkDesign(window.__kitchen.design.getState().design).filter((issue) => issue.severity === 'error');
    });
    assert.deepEqual(issues, []);
    const cladding = await page.evaluate(() => {
      const { scene, camera } = window.__kitchen3D;
      const tops = [];
      scene.updateMatrixWorld(true);
      scene.traverse((object) => {
        if (object.name.startsWith('kitchen-backsplash-')) {
          tops.push(object.localToWorld(camera.position.clone().set(0, object.geometry.parameters.height / 2, 0)).y);
        }
      });
      return tops;
    });
    assert.ok(cladding.length > 0 && cladding.every((top) => Math.abs(top - 1.69) < 0.0001), `The backsplash must reach the actual lower cupboard row, not an upper corner's top: ${JSON.stringify(cladding)}`);
    await shot(page, `05-${preset.id}.png`);
    if (index === 0) {
      const display = (await design(page)).items.find((item) => item.kind === 'glassWall');
      assert.ok(display);
      await page.getByRole('radio', { name: '2. Layout', exact: true }).click();
      await page.getByRole('button', { name: 'Wall units', exact: true }).click();
      const rowSelect = page.getByLabel('Upper cabinet row', { exact: true });
      const upperElevation = await rowSelect.locator('option').last().getAttribute('value');
      await rowSelect.selectOption(upperElevation);
      await page.getByRole('radio', { name: '3. 3D', exact: true }).click();
      await ready3D(page);
      await camera.getByRole('button', { name: 'Front', exact: true }).click();
      await clickSceneUnit(page, display);
      assert.equal(String(await page.evaluate(() => window.__kitchen.ui.getState().wallElevation)), upperElevation,
        'Selecting a display cupboard spanning both rows must preserve the active upper row.');
      await page.getByRole('radio', { name: '2. Layout', exact: true }).click();
      assert.equal(await rowSelect.inputValue(), upperElevation);
      await page.getByRole('radio', { name: '3. 3D', exact: true }).click();
      await ready3D(page);
      pass('3D selection preserves the active upper row for a full-height display cupboard');
    }
    await waitForIdleRendering(page);
    const idle = await page.evaluate(() => window.__kitchen3D.renderer.info.render.frame);
    await page.waitForTimeout(400);
    assert.ok(await page.evaluate(() => window.__kitchen3D.renderer.info.render.frame) - idle <= 1, 'The finished kitchen must not render continuously while idle.');
    pass(`${preset.id}: opening the original shows the same editable two-row kitchen, with no geometry errors or idle rendering`);
  }
  await page.waitForTimeout(500);
  const storageState = await context.storageState();
  await context.close();

  console.log('Phone row selection and stacking');
  const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, storageState, reducedMotion: 'reduce' });
  const phone = await phoneContext.newPage();
  observe(phone);
  await phone.goto(url, { waitUntil: 'domcontentloaded' });
  await phone.waitForSelector('.konvajs-content');
  await phone.getByRole('button', { name: 'Wall units', exact: true }).tap();
  const current = await design(phone);
  const phoneRows = await phone.getByLabel('Upper cabinet row', { exact: true }).locator('option').evaluateAll((opts) => opts.map((o) => Number(o.value)));
  const tiers = current.items.filter((item) => item.kind === 'wall' || item.kind === 'hood').map((item) => item.elevation);
  assert.deepEqual(phoneRows, [...new Set(tiers)].sort((a, b) => a - b), 'Both cupboard tiers and the separate hood in this layout must be selectable.');
  const phoneLower = current.items.find((item) => item.kind === 'wall' && item.rotation === 0);
  assert.ok(phoneLower);
  await phone.getByLabel('Upper cabinet row', { exact: true }).selectOption(String(phoneLower.elevation));
  await clickPlanUnit(phone, phoneLower, true);
  await shot(phone, '06-phone-row-selection.png');
  await phone.getByTestId('item-sheet').getByRole('slider').press('End');
  await phone.getByRole('button', { name: 'Add cabinet above', exact: true }).scrollIntoViewIfNeeded();
  assert.equal(await phone.getByRole('button', { name: 'Add cabinet above', exact: true }).isDisabled(), true);
  await shot(phone, '07-phone-stacking-settings.png');

  await phone.evaluate(async () => {
    const { createDesign } = await import('/src/domain/designOps.ts');
    const { createItem } = await import('/src/domain/catalog.ts');
    const fixture = createDesign('Phone stacking');
    fixture.room.height = 3100;
    fixture.items.push(createItem('wall', []));
    window.__kitchen.ui.getState().select(null);
    window.__kitchen.ui.getState().setViewFilter('all');
    window.__kitchen.design.getState().load(fixture);
  });
  await clickPlanUnit(phone, (await design(phone)).items[0], true);
  await phone.getByTestId('item-sheet').getByRole('slider').press('End');
  await (await stackingAction(phone)).tap();
  assert.equal((await design(phone)).items.length, 2);
  await phone.setViewportSize({ width: 320, height: 740 });
  assert.equal(await phone.getByRole('button', { name: 'All', exact: true }).getAttribute('aria-pressed'), 'true');
  await phone.getByRole('button', { name: 'Wall units', exact: true }).tap();
  const phoneUpper = (await design(phone)).items[1];
  await phone.getByLabel('Upper cabinet row', { exact: true }).selectOption(String(phoneUpper.elevation));
  await clickPlanUnit(phone, phoneUpper, true);
  const bounds = await phone.getByLabel('Upper cabinet row', { exact: true }).boundingBox();
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 320);
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  await shot(phone, '08-phone-320-stacked.png');
  await phone.evaluate(() => window.__kitchen.ui.getState().setLanguage('sr'));
  await phone.getByLabel('Red gornjih elemenata', { exact: true }).waitFor();
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  const narrowUndo = phone.getByRole('button', { name: 'Korak unazad', exact: true });
  assert.equal(await narrowUndo.innerText(), '', 'The phone Undo control is a labelled icon, including at the narrowest width.');
  const undoBox = await narrowUndo.boundingBox();
  assert.ok(undoBox?.width === 44 && undoBox.height === 44 && undoBox.x >= 0 && undoBox.x + undoBox.width <= 320);
  await shot(phone, '09-phone-320-sr.png');
  pass('phone users can choose rows, see blocked stacking, add a cabinet, and use the controls at 320px in both languages');

  console.log('Touch orbit over a selected stacked cabinet');
  await phone.evaluate(() => window.__kitchen.ui.getState().setLanguage('en'));
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.getByRole('radio', { name: '3. 3D', exact: true }).tap();
  await ready3D(phone);
  await phone.getByRole('group', { name: '3D camera' }).getByRole('button', { name: 'Top', exact: true }).tap();
  assert.equal(await phone.getByRole('group', { name: 'Selected cabinet actions' }).count(), 0);
  await phone.getByTestId('phone-view-sheet').waitFor({ state: 'detached' });
  await phone.getByTestId('item-sheet').getByRole('slider').press('Home');
  await phone.waitForTimeout(300);
  await assertBodyOrbits(phone, (await design(phone)).items[1].id, true);
  pass('dragging the selected upper on touch orbits the camera while the model and history remain unchanged');
  await phoneContext.close();
  assert.deepEqual(problems, []);
  console.log('All stacked-cabinet and premium-kitchen browser checks passed.');
}

try {
  await run();
} finally {
  await browser?.close();
  await server.close();
}
