import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createServer, preview } from 'vite';
import { assertScenePlacement, cabinetBodyDrag, close3DTools, open3DTools, resizeArrowDrag, waitForIdleRendering } from './three-test-helpers.mjs';

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
const move = (page) => page.getByRole('button', { name: 'Move cabinet', exact: true });
const resize = (page) => page.getByRole('button', { name: 'Resize cabinet', exact: true });
const done = (page) => page.getByTestId('cabinet-tools').getByRole('button', { name: 'Done', exact: true });
const resizeLabel = (page, field) => page.locator(`[data-resize-field="${field}"]`);
const undo = (page) => page.getByRole('button', { name: 'Undo', exact: true }).click();
const lockMessage = 'Preview only: close this cabinet and exit Interior view to move, resize or rotate it.';

async function fixture(page, kind = 'base', rotation = 0) {
  await page.evaluate(async ({ kind, rotation }) => {
    const { createDesign } = await import('/src/domain/designOps.ts');
    const { createItem } = await import('/src/domain/catalog.ts');
    const value = createDesign('Cabinet tools');
    value.room = { width: 4000, depth: 3200, height: 2700 };
    value.items = [
      { ...createItem(kind, [], { x: 1800, y: 1700 }), id: 'resize-cabinet', rotation },
      { ...createItem('base', [], { x: 0, y: 0 }), id: 'untouched' },
    ];
    window.__kitchen.design.getState().load(value);
    const ui = window.__kitchen.ui.getState();
    ui.setLanguage('en'); ui.setView('3d'); ui.setCabinetTool(null); ui.setReferenceOpen(false); ui.setRoomOpen(false);
    ui.setSnapEnabled(true); ui.setGridSize(50); ui.requestCamera('top'); ui.select('resize-cabinet');
  }, { kind, rotation });
  await page.waitForFunction(() => Boolean(window.__kitchen3D?.scene.getObjectByName('resize-cabinet')));
  await close3DTools(page);
  await waitForIdleRendering(page);
  await move(page).waitFor({ state: 'visible' });
}

async function drag(page, points, { touch = false, finish = true } = {}) {
  if (touch) {
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [points.from] });
    for (let step = 1; step <= 8; step++) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{
        x: points.from.x + (points.to.x - points.from.x) * step / 8,
        y: points.from.y + (points.to.y - points.from.y) * step / 8,
      }] });
    }
    if (finish) await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    return session;
  }
  await page.mouse.move(points.from.x, points.from.y);
  await page.mouse.down();
  await page.mouse.move(points.to.x, points.to.y, { steps: 8 });
  if (finish) await page.mouse.up();
}

async function armResize(page) {
  if (await resize(page).getAttribute('aria-pressed') !== 'true') await resize(page).click();
  await resizeLabel(page, 'width').waitFor({ state: 'visible' });
  await waitForIdleRendering(page);
}

async function assertLocked(page, original) {
  assert.equal(await move(page).isDisabled(), true);
  assert.equal(await resize(page).isDisabled(), true);
  assert.equal(await page.getByTestId('cabinet-mode-hint').innerText(), lockMessage);
  assert.equal(await page.locator('[data-resize-field]').count(), 0);
  assert.equal(await page.evaluate(() => window.__kitchen.ui.getState().cabinetTool), null);
  await page.getByRole('radio', { name: '3D', exact: true }).click();
  assert.equal(await resize(page).isDisabled(), true, 'Clicking the current view must not clear preview locks.');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('r');
  assert.deepEqual(await design(page), original, 'Preview shortcuts must not change the cabinet.');
  await open3DTools(page);
  if (page.viewportSize().width < 1024) await page.getByTestId('item-sheet').getByRole('button', { name: 'Edit', exact: true }).click();
  assert.equal(await page.getByLabel('Width', { exact: true }).isDisabled(), true);
  assert.equal(await page.getByLabel('From left wall', { exact: true }).isDisabled(), true);
  await close3DTools(page);
}

try {
  await server.listen();
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  observe(page);
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('canvas');
  await fixture(page);
  let original = await design(page);
  assert.equal(await page.locator('[data-resize-field]').count(), 0, 'Selecting must not automatically enable resizing.');
  assert.equal(await page.getByRole('region', { name: 'Precise cabinet movement', exact: true }).count(), 0);
  const camera = await page.evaluate(() => window.__kitchen3D.camera.position.toArray());
  await drag(page, await cabinetBodyDrag(page, 'X', 0.35));
  assert.deepEqual(await design(page), original, 'An unarmed body drag must never move a selected cabinet.');
  assert.notDeepEqual(await page.evaluate(() => window.__kitchen3D.camera.position.toArray()), camera, 'An unarmed body drag must orbit.');
  assert.equal(await history(page), 0);
  await page.evaluate(() => window.__kitchen.ui.getState().requestCamera('top'));
  await move(page).click();
  assert.match(await page.getByTestId('cabinet-mode-hint').innerText(), /Hold the selected cabinet/);
  await page.evaluate(() => window.__kitchen.ui.getState().setSnapEnabled(false));
  await drag(page, await cabinetBodyDrag(page, 'X', 0.35));
  let after = await design(page);
  assert.ok(Math.abs(after.items[0].x - original.items[0].x - 350) < 20, 'The grabbed point must track the pointer without jumping.');
  assert.deepEqual(after.items[1], original.items[1]);
  assert.equal(after.items[0].elevation, original.items[0].elevation);
  assert.equal(await history(page), 1);
  await assertScenePlacement(page, 'resize-cabinet');
  await undo(page);
  assert.deepEqual(await design(page), original);
  await page.keyboard.press('ArrowRight');
  assert.deepEqual(await design(page), original, 'Arrow keys must not move cabinets even with Move enabled.');
  await armResize(page);
  assert.equal(await move(page).getAttribute('aria-pressed'), 'false');
  assert.equal(await move(page).isDisabled(), true);
  original = await design(page);
  await drag(page, await cabinetBodyDrag(page, 'X', 0.25));
  assert.ok(Math.abs((await design(page)).items[0].x - original.items[0].x - 250) < 20);
  assert.equal(await history(page), 1);
  assert.equal(await resize(page).getAttribute('aria-pressed'), 'true');
  await assertScenePlacement(page, 'resize-cabinet');
  await undo(page);
  assert.deepEqual(await design(page), original);
  await resize(page).click();
  await page.keyboard.press('Escape');
  assert.equal(await resize(page).getAttribute('aria-pressed'), 'true');
  await page.evaluate(() => window.__kitchen.ui.getState().requestCamera('top'));
  const otherBody = await cabinetBodyDrag(page, 'X', 0, 'untouched');
  await page.mouse.click(otherBody.from.x, otherBody.from.y);
  const emptyCanvas = await page.locator('main canvas').boundingBox();
  await page.mouse.click(emptyCanvas.x + emptyCanvas.width * 0.9, emptyCanvas.y + emptyCanvas.height * 0.85);
  assert.equal(await page.evaluate(() => window.__kitchen.ui.getState().selectedId), 'resize-cabinet');
  assert.equal(await resize(page).getAttribute('aria-pressed'), 'true');
  await drag(page, await resizeArrowDrag(page, 'width', 0.15));
  assert.ok((await design(page)).items[0].width > original.items[0].width);
  await undo(page);
  await done(page).click();
  assert.equal(await page.locator('[data-resize-field]').count(), 0);
  await page.mouse.click(otherBody.from.x, otherBody.from.y);
  assert.equal(await page.evaluate(() => window.__kitchen.ui.getState().selectedId), 'untouched');
  await page.screenshot({ path: path.join(output, 'explicit-desktop.png') });
  console.log('  PASS selection is safe; explicit Move tracks the pointer, preserves elevation and is one Undo step');

  for (const [kind, rotation] of [['base', 0], ['base', 45], ['base', 90], ['wall', 180], ['corner', 270]]) {
    await fixture(page, kind, rotation);
    await armResize(page);
    for (const field of ['width', 'height', 'depth', ...(kind === 'corner' ? ['width2'] : [])]) {
      original = await design(page);
      const count = await history(page);
      await drag(page, await resizeArrowDrag(page, field));
      after = await design(page);
      assert.ok(after.items[0][field] > original.items[0][field], `${kind} at ${rotation} degrees must resize ${field}.`);
      assert.equal(after.items[0][field] % 50, 0);
      assert.equal(after.items[0].elevation, original.items[0].elevation);
      for (const other of ['width', 'height', 'depth', 'width2']) if (other !== field) assert.equal(after.items[0][other], original.items[0][other]);
      assert.deepEqual(after.items[1], original.items[1]);
      const anchors = await page.evaluate(async (before) => {
        const { localToRoom } = await import('/src/domain/geometry.ts');
        return [localToRoom(before, 0, 0), localToRoom(window.__kitchen.design.getState().design.items[0], 0, 0)];
      }, original.items[0]);
      assert.ok(Math.hypot(anchors[0].x - anchors[1].x, anchors[0].y - anchors[1].y) < 0.001);
      assert.equal(await page.evaluate(() => window.__kitchen.ui.getState().selectedId), 'resize-cabinet');
      assert.equal(await history(page), count + 1);
      await undo(page);
      assert.deepEqual(await design(page), original);
    }
  }
  await page.screenshot({ path: path.join(output, 'corner-arrows.png') });
  console.log('  PASS directional arrows resize every dimension at ordinary/diagonal angles, including both corner arms, without shifting anchors');

  await fixture(page);
  await armResize(page);
  await open3DTools(page);
  await drag(page, await resizeArrowDrag(page));
  assert.ok((await design(page)).items[0].width > 600, 'Arrows must work while Tools and numeric properties are visible.');
  await undo(page);
  await page.getByLabel('Width', { exact: true }).fill('650');
  await page.getByLabel('Width', { exact: true }).press('Tab');
  assert.equal((await design(page)).items[0].width, 650, 'Numeric properties remain available.');
  await undo(page);
  await close3DTools(page);
  for (const interruption of ['pointercancel', 'blur', 'Escape']) {
    await armResize(page);
    original = await design(page);
    const count = await history(page);
    await drag(page, await resizeArrowDrag(page), { finish: false });
    assert.notDeepEqual(await design(page), original);
    if (interruption === 'Escape') await page.keyboard.press('Escape');
    else await page.evaluate((type) => window.dispatchEvent(type === 'pointercancel' ? new PointerEvent(type, { pointerId: 1 }) : new Event(type)), interruption);
    await page.mouse.up();
    assert.deepEqual(await design(page), original);
    assert.equal(await history(page), count);
    assert.equal(await page.evaluate(() => window.__kitchen.design.getState().gestureBase), null);
    assert.equal(await resize(page).getAttribute('aria-pressed'), 'true');
  }
  const beforeOrbit = await page.evaluate(() => window.__kitchen3D.camera.position.toArray());
  const canvas = await page.locator('main canvas').boundingBox();
  const background = { x: canvas.x + canvas.width * 0.85, y: canvas.y + canvas.height * 0.8 };
  assert.equal(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, background), 'CANVAS');
  await drag(page, { from: background, to: { x: background.x - 40, y: background.y - 40 } });
  await waitForIdleRendering(page);
  assert.notDeepEqual(await page.evaluate(() => window.__kitchen3D.camera.position.toArray()), beforeOrbit, 'Orbit must recover after cancelling resize.');
  await fixture(page);
  await page.evaluate(async () => (await import('/src/store/actions.ts')).setItemSize('resize-cabinet', 'width', 1200));
  await armResize(page);
  original = await design(page);
  let count = await history(page);
  await drag(page, await resizeArrowDrag(page, 'width', 0.3));
  assert.deepEqual(await design(page), original);
  assert.equal(await history(page), count, 'Catalog-clamped no-ops must not create Undo entries.');
  await fixture(page);
  await page.evaluate(async () => (await import('/src/store/actions.ts')).setItemPosition('resize-cabinet', 3400, 1700));
  await armResize(page);
  original = await design(page);
  await drag(page, await resizeArrowDrag(page, 'width', 0.3));
  await page.getByText('The cabinet must fit inside the room and below the ceiling. This size was not applied.', { exact: true }).waitFor();
  assert.deepEqual(await design(page), original);
  await drag(page, await resizeArrowDrag(page, 'width', -0.15));
  assert.ok((await design(page)).items[0].width < original.items[0].width);
  await fixture(page, 'wall');
  await page.evaluate(async () => (await import('/src/store/actions.ts')).setItemElevation('resize-cabinet', 2000));
  await armResize(page);
  original = await design(page);
  await drag(page, await resizeArrowDrag(page, 'height', 0.4));
  after = await design(page);
  assert.ok(after.items[0].elevation + after.items[0].height <= after.room.height);
  assert.equal(after.items[0].elevation, original.items[0].elevation);
  console.log('  PASS exact properties, interruption rollback, catalog no-ops, room rejection/recovery and ceiling constraints');

  for (const tool of ['move', 'resize']) {
    await fixture(page);
    original = await design(page);
    if (tool === 'move') await move(page).click(); else await armResize(page);
    await drag(page, tool === 'move' ? await cabinetBodyDrag(page, 'X', 0.35) : await resizeArrowDrag(page), { finish: false });
    assert.notDeepEqual(await design(page), original);
    await page.getByRole('button', { name: 'Open cabinet', exact: true }).evaluate((element) => element.click());
    await page.mouse.up();
    assert.deepEqual(await design(page), original, 'Opening during a gesture must cancel it before entering preview.');
    assert.equal(await history(page), 0);
    await assertLocked(page, original);
    await drag(page, await cabinetBodyDrag(page, 'X', 0.2));
    assert.deepEqual(await design(page), original, 'An open cabinet must not move when its body is dragged.');
    await page.getByRole('button', { name: 'Close cabinet', exact: true }).click();
    assert.equal(await move(page).isEnabled(), true);
    assert.equal(await page.evaluate(() => window.__kitchen.ui.getState().cabinetTool), null);
  }
  await page.getByRole('button', { name: 'Open all', exact: true }).click();
  original = await design(page);
  await assertLocked(page, original);
  await page.evaluate(() => window.__kitchen.ui.getState().select('untouched'));
  await assertLocked(page, original);
  await page.getByRole('button', { name: 'Close all', exact: true }).click();
  await move(page).click();
  await page.getByRole('button', { name: 'Interior view', exact: true }).click();
  await assertLocked(page, original);
  await page.getByRole('button', { name: 'Interior view', exact: true }).click();
  assert.equal(await move(page).isEnabled(), true);
  assert.equal(await page.evaluate(() => window.__kitchen.ui.getState().cabinetTool), null);
  await page.evaluate(() => window.__kitchen.ui.getState().requestCamera('top'));
  await drag(page, await cabinetBodyDrag(page, 'X', 0.2));
  assert.deepEqual(await design(page), original, 'Leaving preview must not silently rearm Move.');
  console.log('  PASS open/Open all/Interior preview locks tools, shortcuts and properties; opening cancels active gestures');

  const populatedId = await page.evaluate(async () => {
    const { KITCHEN_DESIGNS, createKitchenDesign } = await import('/src/domain/kitchens.ts');
    const value = createKitchenDesign(KITCHEN_DESIGNS.find((preset) => preset.id === 'oak-frame-island'), 'Populated resize');
    const item = value.items.find((entry) => entry.y > 1000 && entry.kind === 'drawer');
    if (!item) throw new Error('Expected an exposed island cabinet.');
    window.__kitchen.design.getState().load(value);
    window.__kitchen.ui.getState().select(item.id);
    return item.id;
  });
  await armResize(page);
  original = await design(page);
  await drag(page, await resizeArrowDrag(page, 'height', -0.1));
  after = await design(page);
  assert.ok(after.items.find((item) => item.id === populatedId).height < original.items.find((item) => item.id === populatedId).height);
  assert.deepEqual(after.items.filter((item) => item.id !== populatedId), original.items.filter((item) => item.id !== populatedId));
  await undo(page);
  await fixture(page);
  await armResize(page);
  await page.evaluate(() => window.__kitchen.ui.getState().select('untouched'));
  assert.equal(await page.locator('[data-resize-field]').count(), 0);
  await page.evaluate(() => { const ui = window.__kitchen.ui.getState(); ui.setView('plan'); ui.select('untouched'); });
  const planX = (await design(page)).items[1].x;
  await page.keyboard.press('ArrowRight');
  assert.equal((await design(page)).items[1].x, planX + 10, 'Plan keyboard movement must remain available.');
  await page.evaluate(() => window.__kitchen.ui.getState().setView('3d'));
  assert.equal(await page.evaluate(() => window.__kitchen.ui.getState().cabinetTool), null);
  console.log('  PASS populated kitchens resize one cabinet, selection/view changes disarm tools, and plan arrows still work');

  await fixture(page);
  original = await design(page);
  const shuffle = (target) => target.getByRole('button', { name: 'Shuffle kitchen', exact: true });
  await shuffle(page).click();
  await page.getByRole('status').getByText(/Kitchen rearranged/).waitFor();
  after = await design(page);
  assert.notDeepEqual(after.items, original.items);
  assert.equal(await history(page), 1);
  assert.deepEqual({ ...after, items: original.items }, original);
  await undo(page);
  assert.deepEqual(await design(page), original);
  await page.getByRole('status').getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Open cabinet', exact: true }).click();
  assert.equal(await shuffle(page).isDisabled(), true);
  await page.getByRole('button', { name: 'Close cabinet', exact: true }).click();
  await armResize(page);
  assert.equal(await shuffle(page).isDisabled(), true);
  await done(page).click();
  await page.evaluate(() => {
    const store = window.__kitchen.design.getState();
    store.load({ ...store.design, items: [{ ...store.design.items[0], width: 5000 }] });
  });
  original = await design(page);
  await shuffle(page).click();
  await page.getByRole('alert').getByText(/No different complete arrangement was found/).waitFor();
  assert.deepEqual(await design(page), original);
  assert.equal(await history(page), 0);
  await page.getByRole('alert').getByRole('button', { name: 'Close', exact: true }).click();
  console.log('  PASS desktop Shuffle is one Undo step, respects preview/tool locks and reports failure without changing anything');

  const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const phone = await phoneContext.newPage();
  observe(phone);
  await phone.goto(server.resolvedUrls.local[0], { waitUntil: 'domcontentloaded' });
  await phone.waitForSelector('canvas');
  await fixture(phone);
  original = await design(phone);
  let session = await drag(phone, await cabinetBodyDrag(phone, 'X', 0.35), { touch: true });
  await session.detach();
  assert.deepEqual(await design(phone), original, 'A selected but unarmed cabinet must not move under a finger.');
  await phone.evaluate(() => window.__kitchen.ui.getState().requestCamera('top'));
  await move(phone).tap();
  session = await drag(phone, await cabinetBodyDrag(phone, 'X', 0.35), { touch: true });
  await session.detach();
  assert.notDeepEqual((await design(phone)).items[0], original.items[0]);
  assert.deepEqual((await design(phone)).items[1], original.items[1]);
  assert.equal((await design(phone)).items[0].elevation, original.items[0].elevation);
  await undo(phone);
  await armResize(phone);
  session = await drag(phone, await cabinetBodyDrag(phone, 'X', 0.25), { touch: true });
  await session.detach();
  assert.notDeepEqual((await design(phone)).items[0], original.items[0]);
  assert.equal(await resize(phone).getAttribute('aria-pressed'), 'true');
  await undo(phone);
  session = await drag(phone, await resizeArrowDrag(phone), { touch: true });
  await session.detach();
  assert.ok((await design(phone)).items[0].width > original.items[0].width);
  await undo(phone);
  session = await drag(phone, await resizeArrowDrag(phone), { touch: true, finish: false });
  assert.notDeepEqual(await design(phone), original);
  await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await session.detach();
  assert.deepEqual(await design(phone), original);
  await phone.setViewportSize({ width: 320, height: 844 });
  await phone.evaluate(() => window.__kitchen.ui.getState().setLanguage('sr'));
  await waitForIdleRendering(phone);
  assert.match(await resizeLabel(phone, 'width').innerText(), /Širina/);
  for (const field of ['width', 'height', 'depth']) await resizeArrowDrag(phone, field);
  assert.equal(await phone.evaluate(() => {
    const tools = document.querySelector('[data-testid="cabinet-tools"]').getBoundingClientRect();
    const hint = document.querySelector('[data-testid="cabinet-mode-hint"]').getBoundingClientRect();
    return tools.left < hint.right && tools.right > hint.left && tools.top < hint.bottom && tools.bottom > hint.top;
  }), false, 'The mobile tool buttons must not be hidden behind resize instructions.');
  assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await phone.screenshot({ path: path.join(output, 'phone-arrows-sr.png') });
  await phone.evaluate(() => window.__kitchen.ui.getState().setLanguage('en'));
  await phone.getByTestId('item-sheet').getByRole('button', { name: 'Edit', exact: true }).tap();
  for (const field of ['width', 'height', 'depth']) await resizeArrowDrag(phone, field);
  await phone.getByTestId('item-sheet').getByRole('button', { name: 'Less', exact: true }).tap();
  await phone.getByRole('button', { name: 'Open cabinet', exact: true }).tap();
  await assertLocked(phone, original);
  await phone.getByRole('button', { name: 'Close cabinet', exact: true }).tap();
  const less = phone.getByTestId('item-sheet').getByRole('button', { name: 'Less', exact: true });
  if (await less.isVisible()) await less.tap();
  await armResize(phone);
  await waitForIdleRendering(phone);
  const idle = await phone.evaluate(() => window.__kitchen3D.renderer.info.render.frame);
  await phone.waitForTimeout(300);
  assert.ok(await phone.evaluate(() => window.__kitchen3D.renderer.info.render.frame) - idle <= 1);
  await done(phone).tap();
  await phone.getByRole('button', { name: 'More', exact: true }).tap();
  assert.equal(await shuffle(phone).isEnabled(), true);
  original = await design(phone);
  await shuffle(phone).tap();
  await phone.getByRole('status').getByText(/Kitchen rearranged/).waitFor();
  assert.notDeepEqual((await design(phone)).items, original.items);
  assert.equal(await history(phone), 1);
  await undo(phone);
  assert.deepEqual(await design(phone), original);
  assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await phone.getByRole('status').getByRole('button', { name: 'Close', exact: true }).tap();
  await phoneContext.close();
  console.log('  PASS touch Move/Resize, cancellation, preview locks and Shuffle/Undo; arrows fit 320px in Serbian and rendering stops at idle');

  const persisted = await design(page);
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForSelector('canvas');
  assert.deepEqual(await design(page), persisted);
  const loadingPage = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  observe(loadingPage);
  let releaseResize;
  const gate = new Promise((resolve) => { releaseResize = resolve; });
  await loadingPage.route('**/src/components/three/CabinetResize.tsx*', async (route) => { await gate; await route.continue(); });
  await loadingPage.goto(server.resolvedUrls.local[0], { waitUntil: 'domcontentloaded' });
  await fixture(loadingPage);
  await resize(loadingPage).click();
  await loadingPage.getByTestId('resize-status').getByText('Loading resize arrows…', { exact: true }).waitFor();
  releaseResize();
  await resizeLabel(loadingPage, 'width').waitFor({ state: 'visible' });
  await loadingPage.getByTestId('resize-status').waitFor({ state: 'detached' });
  await loadingPage.close();
  const failedPage = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  await failedPage.route('**/src/components/three/CabinetResize.tsx*', (route) => route.abort());
  await failedPage.goto(server.resolvedUrls.local[0], { waitUntil: 'domcontentloaded' });
  await fixture(failedPage);
  await resize(failedPage).click();
  await failedPage.getByRole('alert').getByRole('button', { name: 'Reload page', exact: true }).waitFor();
  await failedPage.getByLabel('Width', { exact: true }).fill('650');
  await failedPage.getByLabel('Width', { exact: true }).press('Tab');
  assert.equal((await design(failedPage)).items[0].width, 650, 'Numeric editing must survive a failed control chunk.');
  await failedPage.waitForTimeout(500);
  await failedPage.unroute('**/src/components/three/CabinetResize.tsx*');
  await failedPage.getByRole('button', { name: 'Reload page', exact: true }).click();
  await failedPage.waitForSelector('canvas');
  assert.equal((await design(failedPage)).items[0].width, 650);
  await failedPage.evaluate(() => { const ui = window.__kitchen.ui.getState(); ui.setView('3d'); ui.select('resize-cabinet'); });
  await armResize(failedPage);
  await failedPage.close();
  console.log('  PASS persistence, explicit lazy loading, recoverable load errors and numeric fallback');

  if (process.env.KITCHEN_E2E_PRODUCTION === '1') {
    await fixture(page);
    await open3DTools(page);
    const value = await design(page);
    const click = await cabinetBodyDrag(page);
    await armResize(page);
    const heightArrow = await resizeArrowDrag(page, 'height', 0.2);
    const production = await preview({ logLevel: 'error', preview: { host: '127.0.0.1', port: 0 } });
    const productionPage = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    observe(productionPage);
    try {
      await productionPage.addInitScript((value) => {
        localStorage.setItem('kitchen-designer:projects', JSON.stringify({ activeId: 'smoke', projects: [{ id: 'smoke', name: value.name, updatedAt: Date.now(), units: value.items.length }] }));
        localStorage.setItem('kitchen-designer:project:smoke', JSON.stringify(value));
        localStorage.setItem('kitchen-designer:preferences', JSON.stringify({ version: 2, state: { language: 'en', moveHintSeen: true } }));
      }, value);
      await productionPage.goto(production.resolvedUrls.local[0], { waitUntil: 'domcontentloaded' });
      await productionPage.getByRole('radio', { name: '3D', exact: true }).click();
      await productionPage.getByRole('group', { name: '3D camera' }).getByRole('button', { name: 'Top', exact: true }).click();
      await open3DTools(productionPage);
      await productionPage.mouse.click(click.from.x, click.from.y);
      await resize(productionPage).click();
      await resizeLabel(productionPage, 'height').waitFor({ state: 'visible' });
      await drag(productionPage, heightArrow);
      assert.ok(Number(await productionPage.getByLabel('Height', { exact: true }).inputValue()) > value.items[0].height);
      await undo(productionPage);
      assert.equal(Number(await productionPage.getByLabel('Height', { exact: true }).inputValue()), value.items[0].height);
      assert.equal(await productionPage.evaluate(() => '__kitchen' in window), false);
    } finally {
      await productionPage.close();
      await new Promise((resolve, reject) => production.httpServer.close((error) => error ? reject(error) : resolve()));
    }
    console.log('  PASS production assets support real Tools-open arrow resizing without development hooks');
  }
  assert.deepEqual(errors, []);
  console.log('All explicit 3D manipulation browser checks passed.');
} finally {
  await browser?.close();
  await server.close();
}
