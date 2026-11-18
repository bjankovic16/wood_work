import assert from 'node:assert/strict';
import path from 'node:path';
import { waitForIdleRendering } from './three-test-helpers.mjs';

const design = (page) => page.evaluate(() => window.__kitchen.design.getState().design);
const history = (page) => page.evaluate(() => window.__kitchen.design.getState().past.length);
const tapOrClick = (locator, touch) => touch ? locator.tap() : locator.click();

// Hit the actual wall at a known point, not the bounding-box centre of a rotated SVG group.
async function faceWall(page, plan, id, touch, normal = 0) {
  const point = await plan.locator(`[data-wall-id="${id}"] line`).evaluate((line, normal) => {
    const x = line.x1.baseVal.value, y = line.y1.baseVal.value;
    const dx = line.x2.baseVal.value - x, dy = line.y2.baseVal.value - y;
    const at = new DOMPoint(x + dx * .32, y + dy * .32).matrixTransform(line.getScreenCTM());
    const length = Math.hypot(dx, dy);
    return { x: at.x - normal * dy / length, y: at.y + normal * dx / length };
  }, normal);
  assert.equal(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-wall-id]')?.getAttribute('data-wall-id'), point), id);
  if (touch) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
}

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
  const picker = workspace.getByRole('combobox', { name: 'Drawing view' });
  const addButton = workspace.getByRole('button', { name: 'Add an object', exact: true });
  const add = async (label) => {
    await tapOrClick(addButton, touch);
    await tapOrClick(workspace.getByRole('button', { name: label, exact: true }), touch);
    assert.equal(await addButton.getAttribute('aria-expanded'), 'false');
  };
  await faceWall(page, plan, 'east', touch);
  assert.equal(await picker.inputValue(), 'east');
  const beforeNavigation = await design(page), beforeHistory = await history(page);
  await tapOrClick(elevation.getByRole('button', { name: 'Height to ceiling: 2700 mm' }), touch);
  const measures = workspace.getByRole('dialog', { name: 'Wall 2' });
  assert.ok(await measures.getByLabel('Height to ceiling').evaluate((input) => input === document.activeElement));
  await setField(measures, 'Height to ceiling', 2800);
  await measures.getByRole('button', { name: 'Done' }).click();
  await elevation.getByRole('button', { name: 'Height to ceiling: 2800 mm' }).waitFor();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await picker.selectOption('south');
  await elevation.getByRole('button', { name: 'Window 1', exact: true }).waitFor();
  await picker.selectOption('east');
  await addButton.press('Enter');
  await workspace.getByRole('button', { name: 'Door', exact: true }).press('Escape');
  assert.equal(await workspace.getByRole('button', { name: 'Door', exact: true }).count(), 0);
  assert.ok(await addButton.evaluate((b) => b === document.activeElement));
  assert.deepEqual(await design(page), beforeNavigation);
  assert.equal(await history(page), beforeHistory, 'Browsing walls or dismissing Add is not a design edit');
  await add('Window');
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
  await add('Door');
  const door = (await design(page)).openings.at(-1);
  assert.equal(door.kind, 'door');
  await dragDrawing(page, elevation.locator(`[data-elevation-opening="${door.id}"]`), -80, -200, touch);
  assert.equal((await design(page)).openings.at(-1).sill, 0);

  await workspace.getByRole('button', { name: 'Back to plan' }).click();
  await faceWall(page, plan, 'sloping', touch, -12);
  await workspace.getByRole('region', { name: 'Inside wall view: Wall 1', exact: true }).waitFor();
  await add('Chimney');
  const feature = () => design(page).then((d) => d.room.features[0]);
  const f = await feature();
  assert.equal(f.wallId, 'sloping');
  await setField(card, 'Length along wall', 550);
  await setField(card, 'Projection into room', 350);
  await setField(card, 'From wall start', 1100);
  await elevation.locator(`[data-elevation-feature="${f.id}"]`).waitFor();
  await workspace.getByRole('button', { name: 'Back to plan' }).click();
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
  for (const [id, offset, wall] of [['legacy-window', 2800, 'south'], ['legacy-door', 1500, 'west']]) {
    await inspector.getByRole('combobox', { name: 'Objects in this room' }).selectOption(`opening:${id}`);
    assert.equal(await picker.inputValue(), wall);
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

export async function furnishedWallChecks(page, compact, output) {
  await page.evaluate(async () => {
    const { createPhotoDesign } = await import('/src/domain/photoDesigns.ts');
    const { sr } = await import('/src/i18n/sr.ts');
    const d = createPhotoDesign('ivory-island', 'Bela kuhinja sa ostrvom', sr.labelPrefix);
    window.__kitchen.design.getState().load(d);
    const ui = window.__kitchen.ui.getState();
    ui.setLanguage('sr'); ui.setRoomOpen(true); ui.setSelectedWallId(null);
  });
  const workspace = page.getByTestId('room-workspace'), plan = workspace.getByTestId('room-plan');
  const picker = workspace.getByRole('combobox', { name: 'Izaberi pogled' }), elevation = workspace.getByTestId('wall-elevation');
  await workspace.getByRole('tab', { name: 'Boje i pločice' }).click();
  await workspace.getByRole('button', { name: 'Boja zidova: Maslina' }).click();
  await workspace.getByRole('tab', { name: 'Mere' }).click();
  if (compact) await page.screenshot({ path: path.join(output, 'phone-floor-plan-sr.png') });
  await faceWall(page, plan, 'right', compact);
  assert.equal(await picker.inputValue(), 'right');
  assert.equal(await elevation.locator('[data-elevation-paint]').getAttribute('fill'), '#777c64');
  const d = await design(page);
  const attached = d.items.find((i) => i.kind === 'sink'), island = d.items.find((i) => i.kind === 'bar');
  assert.ok(await elevation.locator(`[data-elevation-cabinet="${attached.id}"]`).isVisible());
  assert.equal(await elevation.locator(`[data-elevation-cabinet="${island.id}"]`).count(), 0);
  await elevation.getByRole('button', { name: 'Prozor 1' }).waitFor();
  if (compact) await page.screenshot({ path: path.join(output, 'phone-inside-wall-sr.png') });
  await workspace.getByRole('button', { name: 'Nazad na osnovu' }).click();
  await plan.getByRole('button', { name: 'Zid 3', exact: true }).press('Enter');
  assert.ok(await picker.evaluate((s) => s === document.activeElement));
  await picker.selectOption('');
  const trigger = workspace.getByRole('button', { name: 'Dodaj objekat', exact: true });
  await tapOrClick(trigger, compact);
  await tapOrClick(workspace.getByRole('button', { name: 'Vrata', exact: true }), compact);
  assert.equal(await picker.inputValue(), 'bottom', 'Add from the floor plan opens the new door on the selected wall');
  await elevation.getByRole('button', { name: 'Vrata 1' }).waitFor();
  const undo = page.getByRole('button', { name: 'Korak unazad', exact: true });
  await undo.click();
  assert.deepEqual(await design(page), d);
  await page.evaluate(() => {
    const store = window.__kitchen.design.getState();
    const partition = { id: 'divider', start: { x: 1600, y: 3100 }, end: { x: 3500, y: 3100 }, thickness: 120, height: 1700 };
    const opening = { id: 'through', kind: 'window', wall: 'top', wallId: 'divider:1', offset: 200, width: 600, height: 800, sill: 600 };
    store.load({ ...store.design, room: { ...store.design.room, partitions: [partition] }, openings: [opening] });
  });
  await picker.selectOption('divider:-1');
  assert.equal(await elevation.getByRole('button', { name: 'Visina do plafona: 2700 mm' }).count(), 0);
  await elevation.getByText('1700 mm', { exact: true }).waitFor();
  const beforeFace = await design(page);
  await tapOrClick(elevation.getByRole('button', { name: 'Prozor 1' }), compact);
  assert.equal(await picker.inputValue(), 'divider:1');
  assert.equal(await workspace.getByTestId('selected-room-card').getByLabel('Od početka zida').inputValue(), '200');
  assert.deepEqual(await design(page), beforeFace, 'Inspecting the opposite face does not rewrite the opening');
  await page.evaluate(() => window.__kitchen.ui.getState().setLanguage('en'));
}

export async function roomObjectChecks(page, output) {
  await workspaceObjectChecks(page);
  await page.screenshot({ path: path.join(output, 'room-object-workspace.png') });
}
