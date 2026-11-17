import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { assertScenePlacement, movementHandle, open3DTools } from './three-test-helpers.mjs';

const output = process.argv[2] ?? path.join('test-results', 'stacked');
await mkdir(output, { recursive: true });
const server = await createServer({ logLevel: 'error', cacheDir: path.resolve(output, '.vite'), server: { host: '127.0.0.1', port: 0 } });
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

try {
  await server.listen();
  const url = server.resolvedUrls.local[0];
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  // Camera glides and door animations are covered by the resize checks; here every view appears at once.
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  observe(page);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('canvas');
  await page.getByLabel('Jezik / Language').selectOption('en');

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
  await page.getByRole('button', { name: 'Add cabinet above', exact: true }).click();
  let state = await design(page);
  assert.equal(state.items.length, 2);
  const upper = state.items[1];
  assert.equal(upper.elevation, lower.elevation + lower.height);
  assert.equal(upper.elevation + upper.height, state.room.height - 30);
  assert.equal(await page.getByLabel('Upper cabinet row', { exact: true }).inputValue(), String(upper.elevation));
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  assert.equal((await design(page)).items.length, 1);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  assert.equal((await design(page)).items.length, 2);
  pass('one click adds an aligned cabinet with a ceiling gap and one complete Undo step');

  await page.getByLabel('Upper cabinet row', { exact: true }).selectOption(String(lower.elevation));
  await clickPlanUnit(page, lower);
  assert.equal(await page.getByRole('button', { name: 'Add cabinet above', exact: true }).isDisabled(), true);
  await page.getByText('The space above is not clear. Check cabinets, room boundaries, structures and openings before stacking.', { exact: true }).waitFor();
  await shot(page, '01-lower-row-selected.png');
  await page.getByLabel('Upper cabinet row', { exact: true }).selectOption(String(upper.elevation));
  await clickPlanUnit(page, upper);
  await shot(page, '02-upper-row-selected.png');
  pass('real clicks can select each cabinet at the same footprint; occupied stack space is explained');

  await page.evaluate(async () => (await import('/src/store/actions.ts')).setRoomSize({ height: 3100 }));
  await page.getByRole('radio', { name: '3D', exact: true }).click();
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

  console.log('Moving a single stacked tier in 3D');
  const top = state.items[2];
  const originalStack = await design(page);
  const originalHistory = await page.evaluate(() => window.__kitchen.design.getState().past.length);
  const camera = page.getByRole('group', { name: '3D camera' });
  await camera.getByRole('button', { name: 'Top', exact: true }).click();
  await tools.getByRole('button', { name: 'Move cabinet', exact: true }).click();
  let handle = await movementHandle(page, 'Z', 0.15);
  await page.mouse.move(handle.from.x, handle.from.y);
  await page.mouse.down();
  await page.mouse.move(handle.to.x, handle.to.y, { steps: 12 });
  await page.mouse.up();
  assert.deepEqual(await design(page), originalStack);
  assert.equal(await page.evaluate(() => window.__kitchen.design.getState().past.length), originalHistory);
  await assertScenePlacement(page, top.id);
  pass('a wall-snapped no-op drag leaves the visible cabinet and undo history unchanged');

  for (const [axis, distance] of [['X', 0.8], ['Z', 1.1]]) {
    const before = await design(page);
    const history = await page.evaluate(() => window.__kitchen.design.getState().past.length);
    handle = await movementHandle(page, axis, distance);
    await page.mouse.move(handle.from.x, handle.from.y);
    await page.mouse.down();
    await page.mouse.move(handle.to.x, handle.to.y, { steps: 16 });
    await page.mouse.up();
    const after = await design(page);
    const moved = after.items.find((item) => item.id === top.id);
    assert.ok(Math.abs(moved[axis === 'X' ? 'x' : 'y'] - before.items[2][axis === 'X' ? 'x' : 'y']) >= 100);
    assert.deepEqual(after.items.filter((item) => item.id !== top.id), originalStack.items.filter((item) => item.id !== top.id));
    assert.equal(moved.elevation, top.elevation);
    assert.equal(await page.evaluate(() => window.__kitchen.design.getState().past.length), history + 1);
    await assertScenePlacement(page, top.id);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    assert.deepEqual(await design(page), before);
    await assertScenePlacement(page, top.id);
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    assert.deepEqual(await design(page), after);
    await assertScenePlacement(page, top.id);
  }
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  assert.deepEqual(await design(page), originalStack);
  await tools.getByRole('button', { name: 'Move cabinet', exact: true }).click();
  pass('X/Z drags move only the selected tier, preserve its height and remain one Undo/Redo step each');

  for (const interruption of ['pointercancel', 'blur', 'Escape']) {
    await tools.getByRole('button', { name: 'Move cabinet', exact: true }).click();
    handle = await movementHandle(page, 'X', 0.8);
    const history = await page.evaluate(() => window.__kitchen.design.getState().past.length);
    await page.mouse.move(handle.from.x, handle.from.y);
    await page.mouse.down();
    await page.mouse.move(handle.to.x, handle.to.y, { steps: 12 });
    assert.ok(await page.evaluate(() => window.__kitchen.design.getState().gestureBase !== null));
    assert.notDeepEqual(await design(page), originalStack);
    if (interruption === 'Escape') await page.keyboard.press('Escape');
    else await page.evaluate((type) => {
      if (type === 'blur') window.dispatchEvent(new Event('blur'));
      else document.querySelector('main canvas').dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1, pointerType: 'mouse' }));
    }, interruption);
    await page.mouse.up();
    assert.deepEqual(await design(page), originalStack, `${interruption} must restore the whole stack rather than leave a half-finished drag.`);
    assert.equal(await page.evaluate(() => window.__kitchen.design.getState().gestureBase), null);
    assert.equal(await page.evaluate(() => window.__kitchen.design.getState().past.length), history);
    await assertScenePlacement(page, top.id);
    const previousCamera = await page.evaluate(() => window.__kitchen3D.camera.position.toArray());
    const box = await page.locator('main canvas').boundingBox();
    await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.7);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.75 + 45, box.y + box.height * 0.7 - 45, { steps: 8 });
    await page.mouse.up();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const nextCamera = await page.evaluate(() => window.__kitchen3D.camera.position.toArray());
    assert.ok(nextCamera.some((value, index) => Math.abs(value - previousCamera[index]) > 0.001), 'Orbit controls must remain usable after cancelling cabinet movement.');
    await camera.getByRole('button', { name: 'Top', exact: true }).click();
    pass(`${interruption} cancels movement without an undo entry or leaving the camera locked`);
  }

  await page.waitForTimeout(500);
  const saved = await design(page);
  await page.reload();
  await page.waitForSelector('.konvajs-content');
  assert.deepEqual(await design(page), saved);
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
    await page.getByRole('button', { name: 'Kitchen designs', exact: true }).first().click();
    const gallery = page.getByRole('dialog', { name: 'Kitchen designs' });
    await gallery.getByLabel('Kitchen layout', { exact: true }).selectOption('layered');
    assert.equal(await gallery.locator('[data-kitchen-design]').count(), 32);
    await gallery.locator('img').evaluateAll((images) => {
      for (const image of images) image.loading = 'eager';
      return Promise.all(images.map((image) => image.decode()));
    });
    if (index === 0) await shot(page, '04-premium-gallery.png');
    await gallery.locator(`[data-kitchen-design="${preset.id}"]`).click();
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
      await page.getByRole('radio', { name: 'Plan', exact: true }).click();
      await page.getByRole('button', { name: 'Wall units', exact: true }).click();
      const rowSelect = page.getByLabel('Upper cabinet row', { exact: true });
      const upperElevation = await rowSelect.locator('option').last().getAttribute('value');
      await rowSelect.selectOption(upperElevation);
      await page.getByRole('radio', { name: '3D', exact: true }).click();
      await ready3D(page);
      await camera.getByRole('button', { name: 'Front', exact: true }).click();
      await clickSceneUnit(page, display);
      assert.equal(String(await page.evaluate(() => window.__kitchen.ui.getState().wallElevation)), upperElevation,
        'Selecting a display cupboard spanning both rows must preserve the active upper row.');
      await page.getByRole('radio', { name: 'Plan', exact: true }).click();
      assert.equal(await rowSelect.inputValue(), upperElevation);
      await page.getByRole('radio', { name: '3D', exact: true }).click();
      await ready3D(page);
      pass('3D selection preserves the active upper row for a full-height display cupboard');
    }
    const idle = await page.evaluate(() => window.__kitchen3D.renderer.info.render.frame);
    await page.waitForTimeout(400);
    assert.ok(await page.evaluate(() => window.__kitchen3D.renderer.info.render.frame) - idle <= 1, 'Premium lighting must not force continuous idle rendering.');
    pass(`${preset.id}: the image opens the same editable two-row kitchen, with no geometry errors or idle rendering`);
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
  const phoneRows = await phone.getByLabel('Upper cabinet row', { exact: true }).locator('option').count();
  assert.equal(phoneRows, 2);
  const current = await design(phone);
  const phoneLower = current.items.find((item) => item.kind === 'wall' && item.rotation === 0);
  assert.ok(phoneLower);
  await phone.getByLabel('Upper cabinet row', { exact: true }).selectOption(String(phoneLower.elevation));
  await clickPlanUnit(phone, phoneLower, true);
  await shot(phone, '06-phone-row-selection.png');
  await phone.getByRole('button', { name: 'Edit', exact: true }).tap();
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
  const expand = phone.getByRole('button', { name: 'Edit', exact: true });
  if (await expand.isVisible()) await expand.tap();
  await phone.getByRole('button', { name: 'Add cabinet above', exact: true }).tap();
  assert.equal((await design(phone)).items.length, 2);
  await phone.setViewportSize({ width: 320, height: 740 });
  const bounds = await phone.getByLabel('Upper cabinet row', { exact: true }).boundingBox();
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 320);
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  await shot(phone, '08-phone-320-stacked.png');
  await phone.evaluate(() => window.__kitchen.ui.getState().setLanguage('sr'));
  await phone.getByLabel('Red gornjih elemenata', { exact: true }).waitFor();
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  await shot(phone, '09-phone-320-sr.png');
  pass('phone users can choose rows, see blocked stacking, add a cabinet, and use the controls at 320px in both languages');

  console.log('Touch movement of a stacked cabinet');
  await phone.evaluate(() => window.__kitchen.ui.getState().setLanguage('en'));
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.getByRole('radio', { name: '3D', exact: true }).tap();
  await ready3D(phone);
  await phone.getByRole('group', { name: '3D camera' }).getByRole('button', { name: 'Top', exact: true }).tap();
  assert.equal(await phone.getByRole('group', { name: 'Selected cabinet actions' }).count(), 0);
  await phone.getByTestId('three-tools-toggle').tap();
  const less = phone.getByRole('button', { name: 'Less', exact: true });
  if (await less.isVisible()) await less.tap();
  await phone.waitForTimeout(300);
  const beforeTouch = await design(phone);
  const phoneUpper = beforeTouch.items[1];
  const touch = await phoneContext.newCDPSession(phone);
  const bodyMovement = async () => {
    await phone.waitForFunction(() => {
      const box = document.querySelector('main canvas').getBoundingClientRect();
      return Math.abs(window.__kitchen3D.camera.aspect - box.width / box.height) < 0.001;
    });
    return phone.evaluate(async (id) => {
      const { localToRoom } = await import('/src/domain/geometry.ts');
      const item = window.__kitchen.design.getState().design.items.find((item) => item.id === id);
      const { camera } = window.__kitchen3D;
      camera.updateMatrixWorld(true);
      const point = localToRoom(item, item.width / 2, item.depth * 0.6);
      const box = document.querySelector('main canvas').getBoundingClientRect();
      const project = (x) => {
        const p = camera.position.clone().set(x / 1000, (item.elevation + item.height + 35) / 1000, point.y / 1000).project(camera);
        return { x: box.x + (p.x + 1) * box.width / 2, y: box.y + (1 - p.y) * box.height / 2 };
      };
      const points = { from: project(point.x), to: project(point.x + 800) };
      if (document.elementFromPoint(points.from.x, points.from.y)?.tagName !== 'CANVAS') throw new Error('The cabinet body is hidden by a phone control.');
      return points;
    }, phoneUpper.id);
  };
  let touchHandle = await bodyMovement();
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touchHandle.from.x, y: touchHandle.from.y }] });
  for (let step = 1; step <= 12; step++) {
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{
      x: touchHandle.from.x + (touchHandle.to.x - touchHandle.from.x) * step / 12,
      y: touchHandle.from.y + (touchHandle.to.y - touchHandle.from.y) * step / 12,
    }] });
  }
  assert.ok(await phone.evaluate(() => window.__kitchen.design.getState().gestureBase !== null));
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await phone.waitForFunction(() => window.__kitchen.design.getState().gestureBase === null);
  const afterTouch = await design(phone);
  assert.ok(Math.abs(afterTouch.items[1].x - phoneUpper.x) >= 100);
  assert.deepEqual(afterTouch.items[0], beforeTouch.items[0]);
  assert.equal(afterTouch.items[1].elevation, phoneUpper.elevation);
  await assertScenePlacement(phone, phoneUpper.id);
  await phone.getByRole('button', { name: 'Undo', exact: true }).tap();
  await phone.waitForFunction(({ id, x }) => window.__kitchen.design.getState().design.items.find((item) => item.id === id)?.x === x, phoneUpper);
  assert.deepEqual(await design(phone), beforeTouch);
  await assertScenePlacement(phone, phoneUpper.id);

  touchHandle = await bodyMovement();
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touchHandle.from.x, y: touchHandle.from.y }] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: touchHandle.to.x, y: touchHandle.to.y }] });
  assert.ok(await phone.evaluate(() => window.__kitchen.design.getState().gestureBase !== null));
  await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await phone.waitForFunction(() => window.__kitchen.design.getState().gestureBase === null);
  assert.deepEqual(await design(phone), beforeTouch);
  assert.equal(await phone.evaluate(() => window.__kitchen.design.getState().gestureBase), null);
  await assertScenePlacement(phone, phoneUpper.id);
  await touch.detach();
  pass('real touch drags move only the selected upper, Undo restores it, and touch cancellation rolls back cleanly');
  await phoneContext.close();
  assert.deepEqual(problems, []);
  console.log('All stacked-cabinet and premium-kitchen browser checks passed.');
} finally {
  await browser?.close();
  await server.close();
}
