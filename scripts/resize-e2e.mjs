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
  const panel = page.getByTestId('three-tools');
  if (page.viewportSize().width < 1024) {
    if (await panel.evaluate((element) => element.open)) await panel.locator(':scope > summary').click();
    await page.waitForTimeout(300);
    return;
  }
  if (!await panel.evaluate((element) => element.open)) await panel.locator(':scope > summary').click();
  await page.waitForTimeout(300);
  const resize = tools(page).getByRole('button', { name: 'Resize cabinet', exact: true });
  if (await resize.getAttribute('aria-pressed') !== 'true') await resize.click();
  await dimensions(page).waitFor();
}

async function handle(page, distance, requestedAxis) {
  await page.waitForFunction(() => Boolean(window.__kitchen3D?.scene.getObjectByName('kitchen-resize-tool')));
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return page.evaluate(({ distance, requestedAxis }) => {
    const { scene, camera } = window.__kitchen3D;
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const tool = scene.getObjectByName('kitchen-resize-tool');
    const axis = requestedAxis ?? (tool.showX ? 'X' : tool.showY ? 'Y' : 'Z');
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
  }, { distance, requestedAxis });
}

async function drag(page, distance, touch = false, axis) {
  const points = await handle(page, distance, axis);
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

async function cabinetPoints(page, top = false) {
  await page.waitForFunction(() => {
    const box = document.querySelector('main canvas').getBoundingClientRect();
    return Math.abs(window.__kitchen3D.camera.aspect - box.width / box.height) < 0.001;
  });
  return page.evaluate(async (top) => {
    const { localToRoom } = await import('/src/domain/geometry.ts');
    const item = window.__kitchen.design.getState().design.items[0];
    const { camera } = window.__kitchen3D;
    camera.updateMatrixWorld(true);
    const p = localToRoom(item, item.width / 2, top ? item.depth / 2 : item.depth + 25);
    const box = document.querySelector('main canvas').getBoundingClientRect();
    const screen = (x) => {
      const point = camera.position.clone().set(x / 1000, (item.elevation + (top ? item.height + 35 : item.height / 2)) / 1000, p.y / 1000).project(camera);
      return { x: box.x + (point.x + 1) * box.width / 2, y: box.y + (1 - point.y) * box.height / 2 };
    };
    return { from: screen(p.x), to: screen(p.x + 350) };
  }, top);
}

try {
  await server.listen();
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  observe(page);
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('canvas');
  await fixture(page);
  const cleanPanel = page.getByTestId('three-tools');
  await cleanPanel.locator(':scope > summary').click();
  await page.evaluate(() => window.__kitchen.ui.getState().select(null));
  const clickPoint = await cabinetPoints(page);
  const selectionHistory = await history(page);
  const firstGrab = await design(page);
  await page.mouse.move(clickPoint.from.x, clickPoint.from.y);
  await page.mouse.down();
  await page.mouse.move(clickPoint.to.x, clickPoint.to.y, { steps: 12 });
  assert.notDeepEqual((await design(page)).items[0], firstGrab.items[0], 'The very first grab must move an unselected cabinet without using the hand.');
  await page.mouse.up();
  assert.equal(await history(page), selectionHistory + 1);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  assert.deepEqual(await design(page), firstGrab);
  await page.evaluate(() => window.__kitchen.ui.getState().select(null));
  await page.mouse.click(clickPoint.from.x, clickPoint.from.y);
  await page.waitForFunction(() => window.__kitchen.ui.getState().selectedId === 'resize-cabinet');
  assert.equal(await history(page), selectionHistory, 'Clicking must select without moving or adding history.');
  await page.waitForFunction(() => {
    const tool = window.__kitchen3D.scene.getObjectByName('kitchen-resize-tool');
    return tool?.showX && tool?.showY && tool?.showZ;
  });
  assert.equal(await tools(page).isVisible(), false);
  assert.equal(await page.getByRole('group', { name: '3D camera' }).isVisible(), false);
  assert.equal(await page.getByText('Click a cabinet, door, window or structure to edit it. Drag the background to orbit; scroll or pinch to zoom.', { exact: true }).isVisible(), false);
  await page.screenshot({ path: path.join(output, 'clean-desktop.png') });
  const directBefore = await design(page);
  const directCount = await history(page);
  const direct = await cabinetPoints(page);
  await page.mouse.move(direct.from.x, direct.from.y);
  await page.mouse.down();
  await page.mouse.move(direct.to.x, direct.to.y, { steps: 12 });
  assert.notDeepEqual((await design(page)).items[0], directBefore.items[0], 'Holding and dragging the cabinet must move it before release.');
  await page.mouse.up();
  assert.equal(await history(page), directCount + 1);
  assert.deepEqual((await design(page)).items[1], directBefore.items[1]);
  assert.equal((await design(page)).items[0].elevation, directBefore.items[0].elevation);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  assert.deepEqual(await design(page), directBefore);
  const hand = page.getByRole('button', { name: 'Hold and drag to move cabinet', exact: true });
  const handBox = await hand.boundingBox();
  assert.ok(handBox.width >= 44 && handBox.height >= 44);
  await hand.click();
  assert.deepEqual(await design(page), directBefore, 'Clicking the hand must not move or open a cabinet.');
  await page.mouse.move(handBox.x + handBox.width / 2, handBox.y + handBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handBox.x + handBox.width / 2 + direct.to.x - direct.from.x, handBox.y + handBox.height / 2 + direct.to.y - direct.from.y, { steps: 12 });
  assert.notDeepEqual((await design(page)).items[0], directBefore.items[0], 'Dragging the hand must move the cabinet before release.');
  await page.mouse.up();
  assert.equal(await history(page), directCount + 1);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  assert.deepEqual(await design(page), directBefore);
  await page.mouse.dblclick(clickPoint.from.x, clickPoint.from.y);
  await page.getByRole('button', { name: 'Close cabinet', exact: true }).waitFor();
  await page.waitForFunction(() => Math.abs(window.__kitchen3D.scene.getObjectByName('resize-cabinet').getObjectByName('cabinet-opening').rotation.y) > 1.7);
  await page.screenshot({ path: path.join(output, 'desktop-open-cabinet.png') });
  assert.deepEqual(await design(page), directBefore, 'Opening a cabinet must be view-only.');
  assert.equal(await history(page), directCount);
  await page.getByRole('button', { name: 'Close cabinet', exact: true }).click();
  await page.waitForFunction(() => window.__kitchen3D.scene.getObjectByName('resize-cabinet').getObjectByName('cabinet-opening').rotation.y === 0);
  const settled = await page.evaluate(() => window.__kitchen3D.renderer.info.render.frame);
  await page.waitForTimeout(300);
  assert.ok(await page.evaluate(() => window.__kitchen3D.renderer.info.render.frame) - settled <= 1, 'Opening animations must stop rendering when settled.');
  for (const interruption of ['pointercancel', 'blur', 'Escape']) {
    const points = await cabinetPoints(page);
    await page.mouse.move(points.from.x, points.from.y);
    await page.mouse.down();
    await page.mouse.move(points.to.x, points.to.y, { steps: 10 });
    assert.notDeepEqual(await design(page), directBefore);
    if (interruption === 'Escape') await page.keyboard.press('Escape');
    else await page.evaluate((type) => window.dispatchEvent(new Event(type)), interruption);
    await page.mouse.up();
    assert.deepEqual(await design(page), directBefore);
    assert.equal(await history(page), directCount);
    await page.evaluate(() => window.__kitchen.ui.getState().select('resize-cabinet'));
  }
  for (const [axis, field, delta] of [['X', 'width', 0.1], ['Y', 'height', 0.1], ['Z', 'depth', 0.1]]) {
    const before = await design(page);
    await drag(page, delta, false, axis);
    const after = await design(page);
    if (after.items[0][field] <= before.items[0][field]) await page.screenshot({ path: path.join(output, 'direct-arrow-failure.png') });
    assert.ok(after.items[0][field] > before.items[0][field], `Click-selected ${axis} arrow must resize ${field} without opening tools: ${JSON.stringify({ before: before.items[0], after: after.items[0], axis: await page.evaluate(() => window.__kitchen3D.scene.getObjectByName('kitchen-resize-tool')?.axis) })}`);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    assert.deepEqual(await design(page), before);
  }
  console.log('  PASS direct hold-drag moves the cabinet; selection exposes width/height/depth arrows without tools');
  await cleanPanel.locator(':scope > summary').click();
  if (await tools(page).getByRole('button', { name: 'Resize cabinet', exact: true }).getAttribute('aria-pressed') !== 'true') await tools(page).getByRole('button', { name: 'Resize cabinet', exact: true }).click();
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

  for (const kind of ['drawer', 'corner']) {
    await fixture(page, kind);
    await cleanPanel.locator(':scope > summary').click();
    const beforeOpening = await design(page);
    await page.getByRole('button', { name: 'Open cabinet', exact: true }).click();
    await page.waitForFunction((kind) => {
      const object = window.__kitchen3D.scene.getObjectByName('resize-cabinet');
      const parts = [];
      object.traverse((child) => { if (child.name === 'cabinet-opening') parts.push(child); });
      return kind === 'drawer' ? parts.length === 6 && parts.every((part) => part.position.z > 0.3) : parts.length === 2 && parts.every((part) => Math.abs(part.rotation.y) > 1.7);
    }, kind);
    assert.deepEqual(await design(page), beforeOpening);
    await page.getByRole('button', { name: 'Close cabinet', exact: true }).click();
    await page.waitForFunction(() => {
      const parts = [];
      window.__kitchen3D.scene.getObjectByName('resize-cabinet').traverse((child) => { if (child.name === 'cabinet-opening') parts.push(child); });
      return parts.every((part) => part.rotation.y === 0 && part.position.z === 0);
    });
  }
  console.log('  PASS hand handle moves cabinets; double-click and door icon animate doors, drawers and corners without editing the project');

  const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phone = await phoneContext.newPage();
  observe(phone);
  await phone.goto(server.resolvedUrls.local[0], { waitUntil: 'domcontentloaded' });
  await phone.waitForSelector('canvas');
  await phone.evaluate(() => { window.__kitchen.ui.getState().setView('3d'); window.__kitchen.ui.getState().setLanguage('en'); });
  const phonePanel = phone.getByTestId('three-tools');
  assert.equal(await phonePanel.evaluate((element) => element.open), false);
  await fixture(phone);
  const viewport = await phone.getByTestId('three-viewport').boundingBox();
  const panelBox = await phonePanel.boundingBox();
  assert.ok(panelBox.y + panelBox.height <= viewport.y + 1, 'Tools must be docked outside the 3D viewport.');
  await phonePanel.locator(':scope > summary').tap();
  assert.equal(await tools(phone).count(), 0, 'Phone cabinet actions must appear only in the bottom sheet.');
  await phone.getByRole('group', { name: '3D camera' }).getByRole('button', { name: 'Top', exact: true }).tap();
  await phonePanel.locator(':scope > summary').tap();
  await phone.waitForTimeout(300);
  const phoneBefore = await design(phone);
  await phone.evaluate(() => window.__kitchen.ui.getState().select(null));
  const firstTouchPoints = await cabinetPoints(phone, true);
  const firstTouch = await phoneContext.newCDPSession(phone);
  await firstTouch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [firstTouchPoints.from] });
  for (let step = 1; step <= 12; step++) {
    await firstTouch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{
      x: firstTouchPoints.from.x + (firstTouchPoints.to.x - firstTouchPoints.from.x) * step / 12,
      y: firstTouchPoints.from.y + (firstTouchPoints.to.y - firstTouchPoints.from.y) * step / 12,
    }] });
  }
  assert.notDeepEqual((await design(phone)).items[0], phoneBefore.items[0], 'The first touch grab must move a cabinet without activating its hand.');
  await firstTouch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await firstTouch.detach();
  await phone.getByRole('button', { name: 'Undo', exact: true }).tap();
  assert.deepEqual(await design(phone), phoneBefore);
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
  assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await phone.screenshot({ path: path.join(output, 'phone-resize.png') });
  await phone.getByTestId('item-sheet').getByRole('button', { name: 'Edit', exact: true }).tap();
  await phone.getByLabel('Width', { exact: true }).waitFor();
  await phone.getByTestId('item-sheet').getByRole('button', { name: 'Less', exact: true }).tap();
  assert.equal(await phone.getByText('Loading movement handles…', { exact: true }).count(), 0);
  await phone.setViewportSize({ width: 320, height: 844 });
  await phone.evaluate(() => window.__kitchen.ui.getState().setLanguage('sr'));
  assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  const narrowBefore = await design(phone);
  await drag(phone, 0.1, true);
  assert.ok((await design(phone)).items[0].width > narrowBefore.items[0].width);
  await phone.screenshot({ path: path.join(output, 'phone-resize-sr.png') });
  await phone.evaluate(() => window.__kitchen.ui.getState().setLanguage('en'));
  assert.equal(await tools(phone).isVisible(), false);
  assert.equal(await phone.getByRole('group', { name: '3D camera' }).isVisible(), false);
  await phone.screenshot({ path: path.join(output, 'clean-phone.png') });
  await phone.evaluate(() => window.__kitchen.ui.getState().select(null));
  const tapPoint = await cabinetPoints(phone, true);
  await phone.touchscreen.tap(tapPoint.from.x, tapPoint.from.y);
  await phone.waitForFunction(() => window.__kitchen.ui.getState().selectedId === 'resize-cabinet');
  const directTouchBefore = await design(phone);
  const touchPosition = await cabinetPoints(phone, true);
  const directTouch = await phoneContext.newCDPSession(phone);
  await directTouch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touchPosition.from] });
  for (let step = 1; step <= 12; step++) {
    await directTouch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{
      x: touchPosition.from.x + (touchPosition.to.x - touchPosition.from.x) * step / 12,
      y: touchPosition.from.y + (touchPosition.to.y - touchPosition.from.y) * step / 12,
    }] });
  }
  assert.notDeepEqual((await design(phone)).items[0], directTouchBefore.items[0], 'Touch hold-drag must move the cabinet before release.');
  await directTouch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await directTouch.detach();
  await phone.getByRole('button', { name: 'Undo', exact: true }).tap();
  assert.deepEqual(await design(phone), directTouchBefore);
  const phoneHand = await phone.getByRole('button', { name: 'Hold and drag to move cabinet', exact: true }).boundingBox();
  const handTouch = await phoneContext.newCDPSession(phone);
  const handPoint = { x: phoneHand.x + phoneHand.width / 2, y: phoneHand.y + phoneHand.height / 2 };
  await handTouch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [handPoint] });
  for (let step = 1; step <= 12; step++) {
    await handTouch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: handPoint.x + 55 * step / 12, y: handPoint.y }] });
  }
  assert.notDeepEqual((await design(phone)).items[0], directTouchBefore.items[0], 'The hand handle must support real touch movement.');
  await handTouch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await phone.getByRole('button', { name: 'Undo', exact: true }).tap();
  assert.deepEqual(await design(phone), directTouchBefore);
  await handTouch.detach();
  await phone.getByRole('button', { name: 'Open cabinet', exact: true }).tap();
  await phone.waitForFunction(() => Math.abs(window.__kitchen3D.scene.getObjectByName('resize-cabinet').getObjectByName('cabinet-opening').rotation.y) > 1.7);
  await phone.getByRole('button', { name: 'Close cabinet', exact: true }).tap();
  await phone.waitForFunction(() => window.__kitchen3D.scene.getObjectByName('resize-cabinet').getObjectByName('cabinet-opening').rotation.y === 0);
  const autoWidth = (await design(phone)).items[0].width;
  await drag(phone, 0.1, true, 'X');
  assert.ok((await design(phone)).items[0].width > autoWidth, 'Tap-selected arrows must resize on a phone without opening tools.');
  console.log('  PASS direct touch hold-drag movement and automatic resize arrows work with the tools closed');
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
