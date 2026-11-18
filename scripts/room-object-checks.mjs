import assert from 'node:assert/strict';
import path from 'node:path';
import { waitForIdleRendering } from './three-test-helpers.mjs';

const design = (page) => page.evaluate(() => window.__kitchen.design.getState().design);
const history = (page) => page.evaluate(() => window.__kitchen.design.getState().past.length);
const tapOrClick = (locator, touch) => touch ? locator.tap() : locator.click();

async function drag(page, from, to, touch, cancel = false) {
  if (touch) {
    const cdp = await page.context().newCDPSession(page);
    try {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...from, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...to, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
    } finally { await cdp.detach(); }
  } else {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 6 });
    if (cancel) await page.keyboard.press('Escape');
    await page.mouse.up();
  }
}

async function dragDrawing(page, target, dx, dy, touch, cancel = false) {
  const { from, to } = await target.evaluate((node, delta) => {
    const rect = node.getBoundingClientRect();
    const matrix = node.ownerSVGElement.getScreenCTM();
    const from = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    return { from, to: { x: from.x + delta.dx * matrix.a, y: from.y + delta.dy * matrix.d } };
  }, { dx, dy });
  await drag(page, from, to, touch, cancel);
}

async function setField(root, name, value) {
  const field = root.getByLabel(name, { exact: true });
  await field.fill(String(value));
  await field.press('Enter');
}

async function assert3DIsReadOnly(page, id, type, touch) {
  const before = await design(page), count = await history(page);
  const viewport = page.getByTestId('three-viewport');
  await page.waitForFunction(({ type, id }) => Boolean(window.__kitchen3D?.scene.getObjectByName(`room-${type}-${id}`)), { id, type });
  await page.getByTestId('room-readout-3d').waitFor();
  assert.equal(await page.getByTestId('room-3d').locator('input').count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Move room object', exact: true }).count(), 0);
  assert.equal(await page.evaluate(() => Boolean(window.__kitchen3D.scene.getObjectByName('kitchen-room-move-tool'))), false);
  const projectSurface = () => viewport.evaluate((view, { type, id }) => {
    const { camera, scene } = window.__kitchen3D;
    camera.updateMatrixWorld(true);
    const at = scene.getObjectByName(`room-${type}-${id}`).getWorldPosition(camera.position.clone());
    // The lower half of the rear door is seen through the foreground window in this fixture.
    const door = type === 'opening' && window.__kitchen.design.getState().design.openings.find((o) => o.id === id && o.kind === 'door');
    if (door) at.y += 0.35 * door.height / 1000;
    at.project(camera);
    const rect = view.querySelector('canvas').getBoundingClientRect();
    return { x: rect.left + rect.width * (1 + at.x) / 2, y: rect.top + rect.height * (1 - at.y) / 2 };
  }, { id, type });
  await page.getByRole('button', { name: 'Deselect room object' }).click();
  await page.getByTestId('room-readout-3d').waitFor({ state: 'detached' });
  await waitForIdleRendering(page);
  const point = await projectSurface();
  if (touch) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
  await page.waitForFunction(({ id, type }) => {
    const selection = window.__kitchen.ui.getState().roomSelection;
    return selection?.id === id && selection?.type === type;
  }, { id, type }, { timeout: 5000 }).catch(async (error) => {
    console.error('3D pick missed', { id, type, point }, await page.evaluate(({ x, y }) => {
      const { roomSelection, selectedWallId } = window.__kitchen.ui.getState();
      return { roomSelection, selectedWallId, hit: document.elementFromPoint(x, y)?.tagName, camera: window.__kitchen3D.camera.position.toArray() };
    }, point));
    throw error;
  });
  await page.getByTestId('room-readout-3d').waitFor();
  await waitForIdleRendering(page);
  const from = await projectSurface();
  const camera = await page.evaluate(() => window.__kitchen3D.camera.position.toArray());
  await drag(page, from, { x: from.x + 36, y: from.y - 12 }, touch);
  await page.waitForFunction((initial) => window.__kitchen3D.camera.position.toArray().some((n, i) => Math.abs(n - initial[i]) > 0.001), camera);
  await page.keyboard.press('Shift+ArrowRight');
  assert.deepEqual(await design(page), before);
  assert.equal(await history(page), count, '3D gestures and keys must not change room geometry or history');
}

export async function workspaceObjectChecks(page, touch = false, three = true) {
  await page.evaluate(async () => {
    const { createDesign } = await import('/src/domain/designOps.ts');
    const d = createDesign('Measured room');
    d.room = { width: 4000, depth: 3200, height: 2700, vertices: [
      { id: 'sloping', x: 0, y: 0 }, { id: 'east', x: 4000, y: 1000 }, { id: 'south', x: 4000, y: 3200 }, { id: 'west', x: 0, y: 3200 },
    ] };
    d.openings = [
      { id: 'legacy-window', kind: 'window', wall: 'bottom', offset: 300, width: 900, height: 800, sill: 900 },
      { id: 'legacy-door', kind: 'door', wall: 'left', offset: 900, width: 800, height: 2050, sill: 0 },
    ];
    window.__kitchen.design.getState().load(d);
    const ui = window.__kitchen.ui.getState();
    ui.setLanguage('en'); ui.setSelectedWallId(null); ui.setRoomOpen(true); ui.setSnapEnabled(true); ui.setGridSize(10);
  });
  const workspace = page.getByTestId('room-workspace'), plan = workspace.getByTestId('room-plan');
  const inspector = workspace.getByTestId('room-inspector'), card = inspector.getByTestId('selected-room-card');
  const elevation = workspace.getByTestId('wall-elevation');
  await tapOrClick(plan.getByRole('button', { name: 'Wall 2', exact: true }), touch);
  await tapOrClick(elevation.getByRole('button', { name: 'Window', exact: true }), touch);
  assert.ok(await card.evaluate((el) => el.previousElementSibling.textContent.includes('Room size')));
  const windowId = (await design(page)).openings.at(-1).id;
  assert.equal((await design(page)).openings.at(-1).wallId, 'east');
  await setField(card, 'Width', 900);
  await setField(card, 'From wall start', 250);
  await setField(card, 'Sill height', 650);
  const opening = elevation.locator(`[data-elevation-opening="${windowId}"]`);
  await opening.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowUp');
  assert.equal((await design(page)).openings.at(-1).offset, 260);
  assert.equal((await design(page)).openings.at(-1).sill, 750);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  const before = await design(page), baseHistory = await history(page);
  await dragDrawing(page, opening, 200, -100, touch);
  const moved = await design(page);
  assert.ok(Math.abs(moved.openings.at(-1).offset - 450) <= 10);
  assert.ok(Math.abs(moved.openings.at(-1).sill - 750) <= 10);
  assert.equal(await history(page), baseHistory + 1);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  assert.deepEqual(await design(page), before);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  assert.deepEqual(await design(page), moved);
  await dragDrawing(page, opening, -100, 120, touch, true);
  assert.deepEqual(await design(page), moved, 'cancel restores the last completed elevation gesture');
  await tapOrClick(elevation.getByRole('button', { name: 'Door', exact: true }), touch);
  const door = (await design(page)).openings.at(-1);
  assert.equal(door.kind, 'door');
  await dragDrawing(page, elevation.locator(`[data-elevation-opening="${door.id}"]`), -80, -200, touch);
  assert.equal((await design(page)).openings.at(-1).sill, 0);

  await elevation.getByRole('button', { name: 'Back to plan' }).click();
  await tapOrClick(plan.getByRole('button', { name: 'Wall 1', exact: true }), touch);
  await inspector.getByRole('button', { name: 'Chimney', exact: true }).click();
  const feature = () => design(page).then((d) => d.room.features[0]);
  const f = await feature();
  assert.equal(f.wallId, 'sloping');
  await setField(card, 'Length along wall', 550);
  await setField(card, 'Projection into room', 350);
  await setField(card, 'From wall start', 1100);
  const featureShape = plan.locator(`[data-plan-feature="${f.id}"]`);
  await featureShape.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  assert.equal((await feature()).offset, 1210);
  const readout = await plan.getByTestId('room-readout-2d').innerText();
  assert.ok(readout.includes('550 × 350 × 2700 mm') && readout.includes('1210 mm'));

  if (three) {
    if (!touch) {
      await workspace.getByRole('button', { name: '3D preview' }).click();
      await assert3DIsReadOnly(page, f.id, 'feature', false);
      assert.equal(await workspace.getByTestId('room-readout-3d').innerText(), readout);
      await workspace.getByTestId('room-edit-position-2d').click();
      await page.waitForFunction((id) => document.activeElement?.getAttribute('data-plan-feature') === id, f.id);
      await workspace.getByRole('button', { name: '3D preview' }).click();
    }
    await page.getByRole('radio', { name: '3D', exact: true }).click();
    await assert3DIsReadOnly(page, f.id, 'feature', touch);
    assert.equal(await inspector.locator('input,select').count(), 0);
    assert.equal(await inspector.getByRole('button', { name: 'Chimney', exact: true }).count(), 0);
    await workspace.getByTestId('room-edit-position-2d').click();
  }
  await card.getByLabel('Against wall').selectOption('');
  assert.equal((await feature()).wallId, undefined);
  await setField(card, 'From top wall', 1000);
  await setField(card, 'From left wall', 1500);
  assert.equal((await feature()).x, 1500);
  assert.equal((await feature()).y, 1000);
  await dragDrawing(page, featureShape, 150, 100, touch);
  assert.ok(Math.abs((await feature()).x - 1650) <= 10);
  assert.ok(Math.abs((await feature()).y - 1100) <= 10);
  await card.getByLabel('Against wall').selectOption('sloping');
  for (const [label, offset] of [['Window 1', 2800], ['Door 1', 1500]]) {
    await inspector.getByRole('button', { name: label, exact: true }).click();
    assert.equal(await card.getByLabel('From wall start').inputValue(), String(offset));
  }
  assert.equal((await design(page)).openings[0].wallId, undefined, 'inspecting the legacy opening does not rewrite it');
  if (three) {
    await page.getByRole('radio', { name: '3D', exact: true }).click();
    await assert3DIsReadOnly(page, 'legacy-door', 'opening', touch);
    await page.getByTestId('room-edit-position-2d').click();
    await elevation.waitFor();
    assert.equal(await card.getByLabel('Wall', { exact: true }).inputValue(), 'west');
  }
  const saved = await design(page);
  await page.evaluate(async () => (await import('/src/store/projects.ts')).flushSave());
  await page.reload();
  await workspace.waitFor();
  assert.deepEqual(await design(page), saved);
  console.log(`  PASS ${touch ? 'touch' : 'mouse'} wall elevation, floor-level door, 10/100 mm nudges, sloped/free chimney, legacy offsets, reload${three ? ', read-only 3D and 2D hand-off' : ''}`);
}

export async function roomObjectChecks(page, output) {
  await workspaceObjectChecks(page);
  await page.screenshot({ path: path.join(output, 'room-object-workspace.png') });
}
