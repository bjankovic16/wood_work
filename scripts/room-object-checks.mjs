import assert from 'node:assert/strict';
import path from 'node:path';
import { movementHandle, open3DTools } from './three-test-helpers.mjs';

const toolName = 'kitchen-room-move-tool';
const design = (page) => page.evaluate(() => window.__kitchen.design.getState().design);
const history = (page) => page.evaluate(() => window.__kitchen.design.getState().past.length);

async function clickObject(page, name, touch = false) {
  const point = await page.evaluate((name) => {
    const { scene, camera } = window.__kitchen3D;
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const object = scene.getObjectByName(name);
    if (!object) throw new Error(`Missing room object ${name}`);
    const point = object.getWorldPosition(camera.position.clone()).project(camera);
    const rect = document.querySelector('main canvas').getBoundingClientRect();
    return { x: rect.x + (point.x + 1) * rect.width / 2, y: rect.y + (1 - point.y) * rect.height / 2 };
  }, name);
  if (touch) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
  await page.getByRole('group', { name: 'Selected room object actions' }).waitFor();
}

async function assertRoomObject(page, type, id) {
  const actual = await page.evaluate(async ({ type, id }) => {
    const { scene } = window.__kitchen3D;
    const value = window.__kitchen.design.getState().design;
    const object = scene.getObjectByName(`room-${type}-${id}`);
    let expected;
    if (type === 'feature') {
      const feature = value.room.features.find((entry) => entry.id === id);
      expected = [(feature.x + feature.width / 2) / 1000, value.room.height / 2000, (feature.y + feature.depth / 2) / 1000];
    } else {
      const { openingFrame, wallPoint } = await import('/src/domain/walls.ts');
      const opening = value.openings.find((entry) => entry.id === id);
      const centre = wallPoint(openingFrame(value.room, opening), opening.offset + opening.width / 2);
      expected = [centre.x / 1000, (opening.sill + opening.height / 2) / 1000, centre.y / 1000];
    }
    return { position: object.position.toArray(), expected };
  }, { type, id });
  assert.ok(actual.position.every((number, index) => Math.abs(number - actual.expected[index]) < 0.000001), JSON.stringify(actual));
}

/**
 * Puts the mouse on a room-object arrow and returns where the arrow is once the pointer rests there. Hovering
 * highlights the arrow and draws a frame, and that frame lets the camera finish its last fraction of a pan. Seen
 * exactly from above, that can flip an arrow to the other side of the object, so aim again where it now is.
 */
async function aimHandle(page, axis, distance) {
  let target = await movementHandle(page, axis, distance, toolName);
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.mouse.move(target.from.x, target.from.y);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const next = await movementHandle(page, axis, distance, toolName);
    const settled = Math.hypot(next.from.x - target.from.x, next.from.y - target.from.y) < 0.5;
    target = next;
    if (settled) break;
  }
  await page.mouse.move(target.from.x, target.from.y);
  return target;
}

async function dragHandle(page, axis, distance, touch = false) {
  if (touch) {
    const handle = await movementHandle(page, axis, distance, toolName);
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: handle.from.x, y: handle.from.y }] });
    for (let step = 1; step <= 12; step++) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: handle.from.x + (handle.to.x - handle.from.x) * step / 12, y: handle.from.y + (handle.to.y - handle.from.y) * step / 12 }] });
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
  } else {
    const handle = await aimHandle(page, axis, distance);
    await page.mouse.down();
    await page.mouse.move(handle.to.x, handle.to.y, { steps: 12 });
    await page.mouse.up();
  }
}

export async function roomObjectChecks(page, output, observe) {
  console.log('Direct 3D doors, windows and structures');
  await page.evaluate(async () => {
    const { createDesign } = await import('/src/domain/designOps.ts');
    const { createItem } = await import('/src/domain/catalog.ts');
    const fixture = createDesign('Room object movement');
    fixture.room = { width: 5000, depth: 4000, height: 2700, features: [
      { id: 'moving-chimney', kind: 'chimney', x: 2000, y: 1200, width: 450, depth: 450 },
      { id: 'moving-column', kind: 'column', x: 3800, y: 2600, width: 350, depth: 350 },
      { id: 'moving-projection', kind: 'projection', x: 0, y: 2700, width: 400, depth: 700 },
    ] };
    fixture.openings = [
      { id: 'moving-window', kind: 'window', wall: 'top', offset: 700, width: 1000, height: 900, sill: 1000 },
      { id: 'moving-door', kind: 'door', wall: 'top', offset: 3200, width: 900, height: 2050, sill: 0 },
    ];
    fixture.items = [createItem('base', [], { x: 0, y: 0 })];
    window.__kitchen.design.getState().load(fixture);
    const ui = window.__kitchen.ui.getState();
    ui.select(null); ui.setView('3d'); ui.setReferenceOpen(false); ui.setRoomOpen(false); ui.setSnapEnabled(true); ui.setGridSize(50); ui.requestCamera('front');
  });
  await page.waitForFunction(() => Boolean(window.__kitchen3D?.scene.getObjectByName('room-opening-moving-window')));
  await open3DTools(page);
  await page.waitForTimeout(500);
  const tools = page.getByRole('group', { name: 'Selected room object actions' });
  await clickObject(page, 'room-opening-moving-window');
  await tools.getByText('Window 1', { exact: true }).waitFor();
  assert.equal(await page.getByRole('dialog').count(), 0);
  await tools.getByRole('button', { name: 'Move room object', exact: true }).click();
  for (const [axis, distance] of [['X', 0.45], ['Y', 0.3]]) {
    assert.equal(await tools.getByRole('button', { name: 'Move room object', exact: true }).getAttribute('aria-pressed'), 'true', `Room movement must remain active before the ${axis} drag.`);
    const before = await design(page);
    const count = await history(page);
    await dragHandle(page, axis, distance);
    assert.equal(await tools.getByRole('button', { name: 'Move room object', exact: true }).getAttribute('aria-pressed'), 'true', 'Room movement must remain active after releasing a handle.');
    const after = await design(page);
    assert.ok(after.openings[0][axis === 'X' ? 'offset' : 'sill'] > before.openings[0][axis === 'X' ? 'offset' : 'sill']);
    assert.deepEqual(after.items, before.items);
    assert.deepEqual(after.room, before.room);
    assert.equal(await history(page), count + 1);
    await assertRoomObject(page, 'opening', 'moving-window');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    assert.deepEqual(await design(page), before);
    await assertRoomObject(page, 'opening', 'moving-window');
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    assert.deepEqual(await design(page), after);
  }
  await tools.getByRole('button', { name: 'Move room object', exact: true }).click();
  await clickObject(page, 'room-opening-moving-door');
  await tools.getByText('Door 1', { exact: true }).waitFor();
  await tools.getByRole('button', { name: 'Move room object', exact: true }).click();
  const doorBefore = await design(page);
  await dragHandle(page, 'X', -0.5);
  assert.ok((await design(page)).openings[1].offset < doorBefore.openings[1].offset);
  assert.equal((await design(page)).openings[1].sill, 0);
  await assertRoomObject(page, 'opening', 'moving-door');
  console.log('  PASS physical window/door picking and real handle drags update wall offsets and window height with one-step Undo/Redo');

  await tools.getByRole('button', { name: 'Move room object', exact: true }).click();
  await page.getByRole('group', { name: '3D camera' }).getByRole('button', { name: 'Top', exact: true }).click();
  await page.waitForTimeout(400);
  await clickObject(page, 'room-feature-moving-chimney');
  await tools.getByRole('button', { name: 'Move room object', exact: true }).click();
  const canvas = await page.locator('main canvas').boundingBox();
  await page.mouse.move(canvas.x + canvas.width * 0.8, canvas.y + canvas.height * 0.8);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(canvas.x + canvas.width * 0.8 + 30, canvas.y + canvas.height * 0.8 - 20, { steps: 8 });
  await page.mouse.up({ button: 'right' });
  let previousCamera = await page.evaluate(() => window.__kitchen3D.camera.position.toArray());
  let settled = 0;
  for (let attempt = 0; attempt < 150 && settled < 3; attempt++) {
    await page.waitForTimeout(100);
    const position = await page.evaluate(() => window.__kitchen3D.camera.position.toArray());
    settled = position.every((value, index) => Math.abs(value - previousCamera[index]) < 0.000001) ? settled + 1 : 0;
    previousCamera = position;
  }
  assert.equal(settled, 3, 'Camera pan damping must settle before checking that object movement preserves the view.');
  for (const axis of ['X', 'Z']) {
    const before = await design(page);
    const count = await history(page);
    const cameraBefore = await page.evaluate(() => window.__kitchen3D.camera.position.toArray());
    await dragHandle(page, axis, 0.4);
    const after = await design(page);
    assert.ok(after.room.features[0][axis === 'X' ? 'x' : 'y'] > before.room.features[0][axis === 'X' ? 'x' : 'y']);
    assert.deepEqual(after.items, before.items);
    assert.deepEqual(after.openings, before.openings);
    assert.equal(await history(page), count + 1);
    const cameraAfter = await page.evaluate(() => window.__kitchen3D.camera.position.toArray());
    assert.ok(cameraAfter.every((value, index) => Math.abs(value - cameraBefore[index]) < 0.01), `Moving a structure must preserve the viewer’s camera position: ${JSON.stringify({ cameraBefore, cameraAfter })}`);
    await assertRoomObject(page, 'feature', 'moving-chimney');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    assert.deepEqual(await design(page), before);
    await assertRoomObject(page, 'feature', 'moving-chimney');
  }
  for (const interruption of ['pointercancel', 'blur', 'Escape']) {
    const before = await design(page);
    const count = await history(page);
    const handle = await aimHandle(page, 'X', 0.4);
    await page.mouse.down();
    await page.mouse.move(handle.to.x, handle.to.y, { steps: 12 });
    assert.notDeepEqual(await design(page), before);
    if (interruption === 'Escape') await page.keyboard.press('Escape');
    else await page.evaluate((type) => window.dispatchEvent(new Event(type)), interruption);
    await page.mouse.up();
    assert.deepEqual(await design(page), before);
    assert.equal(await history(page), count);
    assert.equal(await page.evaluate(() => window.__kitchen3D.scene.getObjectByName('room-feature-moving-chimney').position.x), (before.room.features[0].x + 225) / 1000);
    await page.getByLabel('Doors, windows & structures', { exact: true }).selectOption('feature:moving-chimney');
    await tools.getByRole('button', { name: 'Move room object', exact: true }).click();
  }
  console.log('  PASS structures move independently in X/Z, and interrupted gestures restore data, geometry and history');

  await tools.getByRole('button', { name: 'Move room object', exact: true }).click();
  for (const [id, name] of [['moving-column', 'Column 2'], ['moving-projection', 'Wall projection 3']]) {
    await clickObject(page, `room-feature-${id}`);
    await tools.getByText(name, { exact: true }).waitFor();
    await tools.getByRole('button', { name: 'Move room object', exact: true }).click();
    const before = await design(page);
    await dragHandle(page, 'X', 0.25);
    assert.notDeepEqual((await design(page)).room.features, before.room.features);
    await assertRoomObject(page, 'feature', id);
    await tools.getByRole('button', { name: 'Move room object', exact: true }).click();
  }
  await tools.getByRole('button', { name: 'Edit room object measurements', exact: true }).click();
  const editor = page.getByRole('dialog');
  await editor.getByLabel('From left wall', { exact: true }).fill('650');
  await editor.getByLabel('From left wall', { exact: true }).press('Enter');
  await editor.getByRole('button', { name: 'Done', exact: true }).click();
  assert.equal((await design(page)).room.features[2].x, 650);
  await page.screenshot({ path: path.join(output, 'room-object-3d-tools.png') });
  const saved = await design(page);
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForSelector('canvas');
  assert.deepEqual(await design(page), saved);
  console.log('  PASS columns/projections use the same controls, exact measurements apply, and all placements survive reload');

  const phoneContext = await page.context().browser().newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  try {
    const phone = await phoneContext.newPage();
    observe(phone);
    await phone.goto(page.url(), { waitUntil: 'domcontentloaded' });
    await phone.waitForSelector('canvas');
    await phone.evaluate((fixture) => {
      window.__kitchen.design.getState().load(fixture);
      window.__kitchen.ui.getState().setLanguage('en');
      window.__kitchen.ui.getState().setView('3d');
      window.__kitchen.ui.getState().requestCamera('top');
    }, saved);
    await phone.waitForFunction(() => Boolean(window.__kitchen3D?.scene.getObjectByName('room-feature-moving-chimney')));
    await touchRoomObjectChecks(phone, output);
  } finally {
    await phoneContext.close();
  }

  await page.evaluate(async () => {
    const { createDesign } = await import('/src/domain/designOps.ts');
    const value = createDesign('Angled opening');
    value.room = { width: 4000, depth: 3200, height: 2700, vertices: [
      { id: 'diagonal', x: 0, y: 0 }, { id: 'east', x: 4000, y: 1000 }, { id: 'south', x: 4000, y: 3200 }, { id: 'west', x: 0, y: 3200 },
    ] };
    value.openings = [{ id: 'angled-window', kind: 'window', wall: 'top', wallId: 'diagonal', offset: 1000, width: 1000, height: 900, sill: 1000 }];
    window.__kitchen.design.getState().load(value);
    window.__kitchen.ui.getState().setView('3d');
    window.__kitchen.ui.getState().requestCamera('front');
  });
  await page.waitForFunction(() => Boolean(window.__kitchen3D?.scene.getObjectByName('room-opening-angled-window')));
  await open3DTools(page);
  await page.waitForTimeout(300);
  await page.getByLabel('Doors, windows & structures', { exact: true }).selectOption('opening:angled-window');
  await tools.getByRole('button', { name: 'Move room object', exact: true }).click();
  const angledBefore = await design(page);
  await dragHandle(page, 'X', 0.4);
  assert.ok((await design(page)).openings[0].offset > angledBefore.openings[0].offset);
  assert.equal((await design(page)).openings[0].wallId, 'diagonal');
  await assertRoomObject(page, 'opening', 'angled-window');
  await tools.getByRole('button', { name: 'Edit room object measurements', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Along wall', { exact: true }).fill('0');
  await page.getByRole('dialog').getByLabel('Along wall', { exact: true }).press('Enter');
  await page.getByRole('dialog').getByRole('button', { name: 'Done', exact: true }).click();
  const noOpBefore = await design(page);
  const noOpHistory = await history(page);
  await dragHandle(page, 'X', -0.4);
  assert.deepEqual(await design(page), noOpBefore);
  assert.equal(await history(page), noOpHistory);
  await assertRoomObject(page, 'opening', 'angled-window');
  console.log('  PASS local-axis drags preserve diagonal wall attachments and clamped no-op moves leave geometry/history unchanged');

  await page.evaluate(async () => {
    const { createDesign } = await import('/src/domain/designOps.ts');
    const value = createDesign('Blocked structure movement');
    value.room = { width: 5000, depth: 4000, height: 2700, cutout: { kind: 'notch', corner: 'bottomRight', width: 1000, depth: 1000 },
      features: [{ id: 'blocked-chimney', kind: 'chimney', x: 3000, y: 2800, width: 450, depth: 450 }] };
    window.__kitchen.design.getState().load(value);
    window.__kitchen.ui.getState().requestCamera('top');
  });
  await page.waitForTimeout(400);
  await page.getByLabel('Doors, windows & structures', { exact: true }).selectOption('feature:blocked-chimney');
  await tools.getByRole('button', { name: 'Move room object', exact: true }).click();
  const blockedBefore = await design(page);
  await dragHandle(page, 'X', 1.1);
  await page.getByText('The structure must fit inside the room outline. This position was not applied.', { exact: true }).waitFor();
  assert.ok((await design(page)).room.features[0].x + 450 <= 4000);
  await assertRoomObject(page, 'feature', 'blocked-chimney');
  await tools.getByRole('button', { name: 'Deselect room object', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  assert.deepEqual(await design(page), blockedBefore);
  await page.waitForTimeout(600);
  const idle = await page.evaluate(() => window.__kitchen3D.renderer.info.render.frame);
  await page.waitForTimeout(300);
  assert.ok(await page.evaluate(() => window.__kitchen3D.renderer.info.render.frame) - idle <= 1);
  console.log('  PASS rejected cut-out positions are explained, partial valid movement undoes atomically, and idle rendering stops');
}

export async function touchRoomObjectChecks(page, output) {
  await open3DTools(page);
  await page.getByLabel('Doors, windows & structures', { exact: true }).selectOption('feature:moving-chimney');
  const tools = page.getByRole('group', { name: 'Selected room object actions' });
  await page.getByRole('group', { name: '3D camera' }).getByRole('button', { name: 'Top', exact: true }).tap();
  await tools.getByRole('button', { name: 'Move room object', exact: true }).tap();
  const before = await design(page);
  await dragHandle(page, 'X', 0.35, true);
  assert.notDeepEqual((await design(page)).room.features[0], before.room.features[0]);
  await assertRoomObject(page, 'feature', 'moving-chimney');
  await page.getByRole('button', { name: 'Undo', exact: true }).tap();
  assert.deepEqual(await design(page), before);
  const cancelHandle = await movementHandle(page, 'X', 0.35, toolName);
  const touch = await page.context().newCDPSession(page);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cancelHandle.from.x, y: cancelHandle.from.y }] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cancelHandle.to.x, y: cancelHandle.to.y }] });
  assert.notDeepEqual(await design(page), before);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await touch.detach();
  assert.deepEqual(await design(page), before);
  await assertRoomObject(page, 'feature', 'moving-chimney');
  await page.screenshot({ path: path.join(output, 'room-object-touch.png') });
  console.log('  PASS touch handles move a structure; Undo and touch cancellation restore its full placement on a phone');
}
