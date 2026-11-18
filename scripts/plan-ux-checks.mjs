import assert from 'node:assert/strict';

const button = (page, name) => page.getByRole('button', { name, exact: true });
const drawn = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const zoom = (page) => page.evaluate(() => window.__kitchen.ui.getState().zoom);

async function seed(page) {
  await page.waitForFunction(() => window.__kitchen);
  await page.evaluate(async () => {
    const { createDesign } = await import('/src/domain/designOps.ts');
    const { createItem } = await import('/src/domain/catalog.ts');
    const { flushSave } = await import('/src/store/projects.ts');
    const fixture = createDesign('Plan checks');
    fixture.room = { width: 4000, depth: 3200, height: 2700 };
    const add = (kind, id, fields) => fixture.items.push({ ...createItem(kind, fixture.items, fields), id });
    add('base', 'plan-base', { x: 700, y: 1200 });
    add('base', 'plan-under', { x: 750, y: 0 });
    add('wall', 'plan-lower', { x: 750, y: 0, elevation: 1450, height: 720 });
    add('wall', 'plan-upper', { x: 750, y: 0, elevation: 2170, height: 400 });
    // Both near and far sides have real dimension chains, not just the two room labels.
    add('wall', 'plan-right', { rotation: 90, depth: 320, x: 3680, y: 1000 });
    add('wall', 'plan-bottom', { rotation: 180, depth: 320, x: 1200, y: 2880 });
    window.__kitchen.design.getState().load(fixture);
    flushSave();
    localStorage.setItem('kitchen-designer:preferences', JSON.stringify({
      version: 2, state: { viewFilter: 'wall', language: 'sr', gridSize: 100, showDimensions: true },
    }));
  });
  await page.reload();
  await page.locator('.konvajs-content').waitFor();
}

async function canvasPoint(page, x, y) {
  return page.evaluate(({ x, y }) => {
    const r = document.querySelector('.konvajs-content').getBoundingClientRect();
    const { zoom, pan } = window.__kitchen.ui.getState();
    return [r.left + pan.x + x * zoom, r.top + pan.y + y * zoom];
  }, { x, y });
}

async function dragPreset(page, id, destination) {
  const tile = page.locator(`[data-preset="${id}"]`);
  await tile.scrollIntoViewIfNeeded();
  const box = await tile.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(...destination, { steps: 6 });
  await drawn(page);
}

async function layers(page) {
  const row = page.getByLabel('Upper cabinet row', { exact: true });
  const pressed = async (label) => assert.equal(await button(page, label).getAttribute('aria-pressed'), 'true', `${label} layer`);
  const nodeState = (id) => page.evaluate((id) => {
    const node = window.Konva.stages[0].findOne(`#${id}`);
    return { full: node.opacity() === 1, interactive: node.isListening() };
  }, id);
  await pressed('Sve');
  assert.equal(await page.evaluate(() => window.__kitchen.ui.getState().gridSize), 100, 'Migration must keep other preferences.');
  await page.evaluate(() => window.__kitchen.ui.getState().setLanguage('en'));
  await pressed('All');
  for (const id of ['plan-base', 'plan-lower', 'plan-upper']) {
    assert.deepEqual(await nodeState(id), { full: true, interactive: true });
  }
  // Picking the exposed front of a base must not then cover the upper cabinet.
  await page.mouse.click(...await canvasPoint(page, 1050, 480));
  assert.equal(await page.evaluate(() => window.__kitchen.ui.getState().selectedId), 'plan-under');
  await page.mouse.click(...await canvasPoint(page, 1050, 160));
  assert.equal(await page.evaluate(() => window.__kitchen.ui.getState().selectedId), 'plan-upper');

  const base = await canvasPoint(page, 1000, 1440);
  await page.mouse.move(...base);
  await page.mouse.down();
  await pressed('All'); // Selection is not a drag.
  await page.mouse.move(base[0] + 45, base[1] + 10, { steps: 4 });
  await page.getByText('Wall units dimmed', { exact: true }).waitFor();
  await pressed('Floor units');
  assert.deepEqual(await nodeState('plan-upper'), { full: false, interactive: false });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await pressed('All');
  assert.deepEqual(await page.evaluate(() => {
    const state = window.__kitchen.design.getState();
    return [state.design.items[0].x, state.design.items[0].y, state.past.length, window.__kitchen.ui.getState().selectedId];
  }), [700, 1200, 0, 'plan-base']);

  const upper = await canvasPoint(page, 1050, 160);
  await page.mouse.move(...upper);
  await page.mouse.down();
  await page.mouse.move(upper[0] + 40, upper[1], { steps: 4 });
  await pressed('Wall units');
  assert.equal(await row.inputValue(), '2170');
  await page.mouse.up();
  await pressed('All');
  assert.equal(await page.evaluate(() => window.__kitchen.ui.getState().selectedId), 'plan-upper');

  await button(page, 'Wall units').click();
  await row.selectOption('2170');
  const destination = await canvasPoint(page, 2400, 1800);
  await dragPreset(page, 'base-600', destination);
  await pressed('Floor units');
  await page.mouse.up();
  await pressed('Wall units');
  assert.equal(await row.inputValue(), '2170');
  const added = await page.evaluate(() => window.__kitchen.design.getState().design.items.at(-1));
  assert.equal(added.kind, 'base');
  assert.equal(await page.evaluate(() => window.__kitchen.ui.getState().selectedId), added.id);
  assert.deepEqual(await nodeState(added.id), { full: true, interactive: true }, 'The dropped cabinet must remain editable.');
  await dragPreset(page, 'wall-600', destination);
  assert.equal(await row.inputValue(), '1450');
  await page.mouse.move(100, 250); // Leaving the drawing removes the ghost, not the live drag.
  assert.equal(await row.inputValue(), '1450');
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await pressed('Wall units');
  assert.equal(await row.inputValue(), '2170');
  assert.equal(await page.evaluate(() => window.__kitchen.design.getState().design.items.at(-1).id), added.id);
}

async function assertInkFits(page, step) {
  await drawn(page);
  const stats = await page.evaluate(() => {
    const stage = window.Konva.stages[0];
    const dims = stage.findOne('.plan-dimensions');
    const shapes = [...stage.findOne('.plan-room').find('Shape'), ...dims.find('Shape')].filter((n) => n.isVisible());
    const bounds = shapes.map((n) => n.getClientRect());
    const left = Math.min(...bounds.map((b) => b.x)), right = Math.max(...bounds.map((b) => b.x + b.width));
    const top = Math.min(...bounds.map((b) => b.y)), bottom = Math.max(...bounds.map((b) => b.y + b.height));
    const gaps = [left, stage.width() - right, top, stage.height() - bottom];
    const origin = stage.container().getBoundingClientRect();
    for (const control of document.querySelectorAll('main [data-plan-controls], main [data-plan-overlay]')) {
      const box = control.getBoundingClientRect();
      gaps.push(Math.max(box.left - origin.left - right, left - (box.right - origin.left),
        box.top - origin.top - bottom, top - (box.bottom - origin.top)));
    }
    return { clearance: Math.min(...gaps), labels: dims.find('Text').length, lines: dims.find('Line').length, gaps };
  });
  assert.ok(stats.labels > 0 && stats.lines > 4, `${step}: expected actual dimension labels and lines`);
  assert.ok(stats.clearance >= 14 && stats.clearance <= 18, `${step}: expected a snug 16px fit, got ${JSON.stringify(stats)}`);
}

async function desktopFit(page) {
  const viewport = () => page.evaluate(() => {
    const { zoom, pan } = window.__kitchen.ui.getState();
    return { zoom, pan };
  });
  await button(page, 'Zoom in').click();
  const manual = await viewport();
  await button(page, 'All').click();
  await drawn(page);
  assert.deepEqual(await viewport(), manual, 'Changing the layer must not reset a manual viewport.');
  await page.evaluate(async () => (await import('/src/store/actions.ts')).setRoomSize({ width: 20000, depth: 20000 }));
  await assertInkFits(page, 'Largest desktop room');
  await button(page, 'Zoom in').click();
  await page.setViewportSize({ width: 1152, height: 900 });
  await assertInkFits(page, 'Desktop resize');
  await page.evaluate(async () => (await import('/src/store/actions.ts')).setRoomSize({ width: 4000, depth: 3200 }));
}

async function phoneFit(page) {
  await page.evaluate(() => {
    const ui = window.__kitchen.ui.getState();
    ui.select(null); ui.setViewFilter('all'); ui.setView('list');
  });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.evaluate(() => window.__kitchen.ui.getState().setView('plan'));
  await page.locator('.konvajs-content').waitFor();
  await assertInkFits(page, 'Phone open');
  const initial = await zoom(page);
  await button(page, 'Zoom out').tap();
  assert.ok(await zoom(page) < initial);
  await button(page, 'Zoom in').tap();
  await button(page, 'Zoom in').tap();
  assert.ok(await zoom(page) > initial);
  const fit = button(page, 'Fit the room in view');
  assert.match(await fit.innerText(), /^\d+%$/);
  await fit.tap();
  await assertInkFits(page, 'Tap percentage');
  assert.ok(Math.abs((await zoom(page)) - initial) < 0.0001);
  await button(page, 'Zoom in').tap();
  await page.evaluate(async () => (await import('/src/store/actions.ts')).setRoomSize({ width: 14000 }));
  await assertInkFits(page, 'Changed room');
  const portraitZoom = await zoom(page);
  await page.setViewportSize({ width: 568, height: 320 });
  await assertInkFits(page, 'Landscape');
  assert.notEqual(await zoom(page), portraitZoom);
}

async function cabinetActions(page) {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.evaluate(() => window.__kitchen.ui.getState().select('plan-base'));
  const sheet = page.getByTestId('item-sheet');
  const turn = button(sheet, 'Rotate cabinet 90° clockwise');
  assert.equal(await turn.innerText(), '90°', 'Rotation needs a visible cue that Undo does not have.');
  for (const name of ['Rotate cabinet 90° clockwise', 'Deselect', 'Duplicate', 'Delete']) {
    const action = button(sheet, name);
    await action.hover();
    const tooltip = page.getByRole('tooltip');
    await tooltip.waitFor();
    assert.equal(await action.getAttribute('aria-describedby'), await tooltip.getAttribute('id'), name);
    await page.mouse.move(0, 0);
    await tooltip.waitFor({ state: 'detached' });
  }
  await turn.tap();
  assert.equal(await page.evaluate(() => window.__kitchen.design.getState().design.items[0].rotation), 90);
  await button(page, 'Undo').tap();
  assert.equal(await page.evaluate(() => window.__kitchen.design.getState().design.items[0].rotation), 0);
}

/** Pass a fresh touch-enabled Playwright Page already on the Vite app. Owns the fixture,
 * preferences, language and viewport; close its isolated context after this returns. */
export async function checkPlanUX(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page);
  await assertInkFits(page, 'Desktop open');
  await layers(page);
  await desktopFit(page);
  await phoneFit(page);
  await cabinetActions(page);
}
