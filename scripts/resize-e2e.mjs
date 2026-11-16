import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { assertScenePlacement } from './three-test-helpers.mjs';

const output = path.join('test-results', 'resize');
await mkdir(output, { recursive: true });
const server = await createServer({ logLevel: 'error', cacheDir: path.resolve(output, '.vite'), server: { host: '127.0.0.1', port: 0 } });
let browser;
const errors = [];
function observe(page) {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type()) && !/THREE.Clock: This module has been deprecated|GL Driver Message .*GPU stall due to ReadPixels/.test(message.text())) errors.push(message.text());
  });
}
const design = (page) => page.evaluate(() => window.__kitchen.design.getState().design);
const history = (page) => page.evaluate(() => window.__kitchen.design.getState().past.length);
const tools = (page) => page.getByRole('group', { name: 'Selected cabinet actions' });
const dimensions = (page) => page.getByRole('group', { name: 'Choose a dimension to resize' });

async function fixture(page, kind = 'base', rotation = 0) {
  await page.evaluate(async ({ kind, rotation }) => {
    const { createDesign } = await import('/src/domain/designOps.ts');
    const { createItem } = await import('/src/domain/catalog.ts');
    const value = createDesign('Cabinet resize');
    value.room = { width: 4000, depth: 3200, height: 2700 };
    value.items = [
      { ...createItem(kind, [], { x: 1800, y: 1700 }), id: 'resize-cabinet', rotation },
      { ...createItem('base', [], { x: 0, y: 0 }), id: 'untouched' },
    ];
    window.__kitchen.design.getState().load(value);
    const ui = window.__kitchen.ui.getState();
    ui.setLanguage('en'); ui.setView('3d'); ui.setReferenceOpen(false); ui.setRoomOpen(false);
    ui.setSnapEnabled(true); ui.setGridSize(50); ui.requestCamera('perspective');
    ui.select('resize-cabinet');
  }, { kind, rotation });
  await page.waitForFunction(() => Boolean(window.__kitchen3D?.scene.getObjectByName('resize-cabinet')));
  await page.waitForTimeout(300);
  const resize = tools(page).getByRole('button', { name: 'Resize cabinet', exact: true });
  if (await resize.getAttribute('aria-pressed') !== 'true') await resize.click();
  await dimensions(page).waitFor();
}

async function handle(page, distance) {
  await page.waitForFunction(() => Boolean(window.__kitchen3D?.scene.getObjectByName('kitchen-resize-tool')));
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return page.evaluate((distance) => {
    const { scene, camera } = window.__kitchen3D;
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const tool = scene.getObjectByName('kitchen-resize-tool');
    const axis = tool.showX ? 'X' : tool.showY ? 'Y' : 'Z';
    const direction = camera.position.clone().set(axis === 'X' ? 1 : 0, axis === 'Y' ? 1 : 0, axis === 'Z' ? 1 : 0)
      .applyQuaternion(tool.object.getWorldQuaternion(camera.quaternion.clone()));
    const points = [];
    tool.traverse((object) => {
      if (!object.isMesh || object.name !== axis) return;
      for (let parent = object; parent; parent = parent.parent) if (!parent.visible) return;
      object.geometry.computeBoundingBox();
      points.push(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld).getCenter(camera.position.clone()));
    });
    points.sort((a, b) => b.dot(direction) - a.dot(direction));
    if (!points.length) throw new Error('No visible resize handle');
    const from = points[0];
    const to = from.clone().addScaledVector(direction, distance);
    const box = document.querySelector('main canvas').getBoundingClientRect();
    const screen = (value) => {
      value.project(camera);
      return { x: box.x + (value.x + 1) * box.width / 2, y: box.y + (1 - value.y) * box.height / 2 };
    };
    const projected = { from: screen(from), to: screen(to) };
    if (document.elementFromPoint(projected.from.x, projected.from.y)?.tagName !== 'CANVAS') throw new Error('The resize handle is covered by a control.');
    return projected;
  }, distance);
}

async function drag(page, distance, touch = false) {
  const points = await handle(page, distance);
  if (touch) {
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [points.from] });
    for (let step = 1; step <= 12; step++) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{
        x: points.from.x + (points.to.x - points.from.x) * step / 12,
        y: points.from.y + (points.to.y - points.from.y) * step / 12,
      }] });
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
  } else {
    await page.mouse.move(points.from.x, points.from.y);
    await page.mouse.down();
    await page.mouse.move(points.to.x, points.to.y, { steps: 12 });
    await page.mouse.up();
  }
}

try {
  await server.listen();
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  observe(page);
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('canvas');
  await fixture(page);
  console.log('Friendly 3D cabinet resizing');
  for (const [label, field, delta] of [['Width', 'width', 0.2], ['Width', 'width', -0.15], ['Height', 'height', 0.1], ['Depth', 'depth', 0.1]]) {
    await dimensions(page).getByRole('button', { name: new RegExp(`^${label}`) }).click();
    const before = await design(page);
    const count = await history(page);
    await drag(page, delta);
    const after = await design(page);
    assert.ok(delta > 0 ? after.items[0][field] > before.items[0][field] : after.items[0][field] < before.items[0][field], `${label} must ${delta > 0 ? 'expand' : 'shrink'}`);
    for (const other of ['width', 'height', 'depth', 'elevation', 'x', 'y']) if (other !== field) assert.equal(after.items[0][other], before.items[0][other]);
    assert.deepEqual(after.items[1], before.items[1]);
    assert.equal(await history(page), count + 1);
    assert.ok((await dimensions(page).innerText()).includes(`${after.items[0][field]}`), await dimensions(page).innerText());
    await assertScenePlacement(page, 'resize-cabinet');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    assert.deepEqual(await design(page), before);
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    assert.deepEqual(await design(page), after);
  }
  console.log('  PASS width grows/shrinks, height/depth resize, live dimensions match, and each drag is one Undo step');
  await page.screenshot({ path: path.join(output, 'desktop-resize.png') });

  for (const interruption of ['pointercancel', 'blur', 'Escape']) {
    const before = await design(page);
    const count = await history(page);
    const points = await handle(page, -0.1);
    await page.mouse.move(points.from.x, points.from.y);
    await page.mouse.down();
    await page.mouse.move(points.to.x, points.to.y, { steps: 10 });
    assert.notDeepEqual(await design(page), before);
    if (interruption === 'Escape') await page.keyboard.press('Escape');
    else await page.evaluate((type) => window.dispatchEvent(new Event(type)), interruption);
    await page.mouse.up();
    assert.deepEqual(await design(page), before);
    assert.equal(await history(page), count);
    await assertScenePlacement(page, 'resize-cabinet');
    await page.evaluate(() => window.__kitchen.ui.getState().select('resize-cabinet'));
    await tools(page).getByRole('button', { name: 'Resize cabinet', exact: true }).click();
  }
  console.log('  PASS interrupted gestures restore dimensions, geometry and history');

  for (const [kind, rotation, label, field] of [['base', 45, 'Width', 'width'], ['corner', 90, 'Width, wall B', 'width2']]) {
    await fixture(page, kind, rotation);
    await dimensions(page).getByRole('button', { name: new RegExp(`^${label}`) }).click();
    const before = await design(page);
    await drag(page, 0.15);
    assert.ok((await design(page)).items[0][field] > (before.items[0][field] ?? before.items[0].width));
    await assertScenePlacement(page, 'resize-cabinet');
  }
  console.log('  PASS local handles resize angled cabinets and the second corner arm');

  await fixture(page);
  await dimensions(page).getByRole('button', { name: /^Width/ }).click();
  await page.evaluate(async () => {
    const { setItemSize } = await import('/src/store/actions.ts');
    setItemSize('resize-cabinet', 'width', 1200);
  });
  const maxed = await design(page);
  const count = await history(page);
  await drag(page, 0.2);
  assert.deepEqual(await design(page), maxed);
  assert.equal(await history(page), count);
  await drag(page, -0.2);
  assert.ok((await design(page)).items[0].width < 1200, 'A clamped handle must remain usable');
  await tools(page).getByRole('button', { name: 'Move cabinet', exact: true }).click();
  assert.equal(await dimensions(page).count(), 0);
  await page.waitForFunction(() => !window.__kitchen3D.scene.getObjectByName('kitchen-resize-tool') && Boolean(window.__kitchen3D.scene.getObjectByName('kitchen-move-tool')));
  console.log('  PASS size-limit no-ops do not add history, and Move/Resize modes are mutually exclusive');

  await fixture(page);
  await page.evaluate(async () => {
    const { setItemPosition } = await import('/src/store/actions.ts');
    setItemPosition('resize-cabinet', 3400, 1700);
  });
  const boundary = await design(page);
  await drag(page, 0.3);
  await page.getByText('The cabinet must fit inside the room and below the ceiling. This size was not applied.', { exact: true }).waitFor();
  assert.deepEqual(await design(page), boundary);
  await drag(page, -0.15);
  assert.ok((await design(page)).items[0].width < boundary.items[0].width);
  console.log('  PASS room-boundary rejection is explained and the constrained handle remains usable');

  const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phone = await phoneContext.newPage();
  observe(phone);
  await phone.goto(server.resolvedUrls.local[0], { waitUntil: 'domcontentloaded' });
  await phone.waitForSelector('canvas');
  await fixture(phone);
  await phone.getByRole('group', { name: '3D camera' }).getByRole('button', { name: 'Top', exact: true }).tap();
  await phone.waitForTimeout(300);
  const phoneBefore = await design(phone);
  await drag(phone, 0.2, true);
  assert.ok((await design(phone)).items[0].width > phoneBefore.items[0].width);
  await phone.getByRole('button', { name: 'Undo', exact: true }).tap();
  assert.deepEqual(await design(phone), phoneBefore);
  const touchPoints = await handle(phone, 0.2);
  const touch = await phoneContext.newCDPSession(phone);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touchPoints.from] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touchPoints.to] });
  assert.notDeepEqual(await design(phone), phoneBefore);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await touch.detach();
  assert.deepEqual(await design(phone), phoneBefore);
  await tools(phone).getByRole('button', { name: 'Resize cabinet', exact: true }).tap();
  assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await phone.screenshot({ path: path.join(output, 'phone-resize.png') });
  await dimensions(phone).getByRole('button', { name: /^Width/ }).tap();
  await dimensions(phone).getByRole('button', { name: /^Width/ }).tap();
  assert.equal(await phone.getByText('Loading movement handles…', { exact: true }).count(), 0);
  await phone.setViewportSize({ width: 320, height: 844 });
  await phone.evaluate(() => window.__kitchen.ui.getState().setLanguage('sr'));
  assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  const narrowBefore = await design(phone);
  await drag(phone, 0.1, true);
  assert.ok((await design(phone)).items[0].width > narrowBefore.items[0].width);
  await phone.screenshot({ path: path.join(output, 'phone-resize-sr.png') });
  await phone.evaluate(() => window.__kitchen.ui.getState().setLanguage('en'));
  await phone.getByRole('button', { name: 'Done', exact: true }).tap();
  await phone.waitForTimeout(600);
  const idle = await phone.evaluate(() => window.__kitchen3D.renderer.info.render.frame);
  await phone.waitForTimeout(300);
  assert.ok(await phone.evaluate(() => window.__kitchen3D.renderer.info.render.frame) - idle <= 1);
  await phoneContext.close();
  console.log('  PASS phone touch resizes with Undo/cancellation, controls fit 320px in both languages, and rendering stops at idle');
  const persisted = await design(page);
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForSelector('canvas');
  assert.deepEqual(await design(page), persisted);
  console.log('  PASS resized cabinet dimensions survive reload');
  assert.deepEqual(errors, []);
  console.log('All 3D resize browser checks passed.');
} finally {
  await browser?.close();
  await server.close();
}
