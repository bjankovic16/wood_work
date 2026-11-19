import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

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
    add('base', 'plan-under', { label: 'B2', x: 750, y: 0 });
    add('wall', 'plan-lower', { x: 750, y: 0, elevation: 1450, height: 720 });
    add('wall', 'plan-upper', { x: 750, y: 0, elevation: 2170, height: 400, width: 900 });
    add('hood', 'plan-hood', { x: 750, y: 0, elevation: 1200, height: 200 });
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

async function swipePlan(page, x, y, dx, dy) {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let n = 1; n <= 4; n++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + n * dx / 4, y: y + n * dy / 4 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally { await cdp.detach(); }
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
  const name = page.locator('[data-plan-cabinet-name]');
  const selected = () => page.evaluate(() => window.__kitchen.ui.getState().selectedId);
  await pressed('Sve');
  assert.equal(await page.evaluate(() => window.__kitchen.ui.getState().gridSize), 100, 'Migration must keep other preferences.');
  const stack = await canvasPoint(page, 1050, 160);
  await page.mouse.move(...stack);
  assert.equal(await name.textContent(), 'Donji element · B2');
  assert.equal(await selected(), null, 'Hover identifies without selecting.');
  await page.evaluate(() => window.__kitchen.ui.getState().setLanguage('en'));
  await pressed('All');
  assert.equal(await name.textContent(), 'Base cabinet · B2');
  const ink = await page.evaluate(() => {
    const stage = window.Konva.stages[0], outlines = stage.findOne('.upper-outlines');
    const floor = stage.findOne('#plan-under');
    return {
      outlines: outlines.find('Line').filter((n) => n.isVisible() && n.stroke() && !n.hasFill() && n.getAbsoluteOpacity() < 1
        && !n.isListening() && n.getAbsoluteZIndex() > floor.getAbsoluteZIndex()).length,
      upperLabels: stage.findOne('#plan-upper').find('Text').length,
      floorLabels: floor.find('Text').map((n) => n.text()),
    };
  });
  assert.equal(ink.outlines, 5, 'All five overhead footprints have faint, unfilled ink above the floor.');
  assert.equal(ink.upperLabels, 0);
  assert.ok(ink.floorLabels.includes('B2'));
  // An explicit add/3D edit selection must never steal the floor unit's hit in All.
  await page.evaluate(() => window.__kitchen.ui.getState().select('plan-upper'));
  await drawn(page);
  await page.mouse.click(...stack);
  assert.equal(await selected(), 'plan-under');

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

  // Its uncovered overhang still has the real upper footprint as a drag target.
  const upper = await canvasPoint(page, 1500, 160);
  await page.mouse.move(...upper);
  await page.mouse.down();
  await page.mouse.move(upper[0] + 40, upper[1], { steps: 4 });
  await pressed('Wall units');
  assert.equal(await row.inputValue(), '2170');
  await page.mouse.up();
  await pressed('All');
  assert.equal(await page.evaluate(() => window.__kitchen.ui.getState().selectedId), 'plan-upper');

  await button(page, 'Wall units').click();
  const firstHit = await row.evaluate(async (select) => {
    select.value = '1200';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve(); // Read the committed selection before the next animation frame.
    const stage = window.Konva.stages[0];
    return stage.getIntersection(stage.getAbsoluteTransform().point({ x: 1050, y: 160 }))?.findAncestor('.item')?.id();
  });
  assert.equal(firstHit, 'plan-hood', 'The newly visible row must be pickable from its first frame.');
  await page.mouse.click(...await canvasPoint(page, 1050, 160));
  assert.equal(await selected(), 'plan-hood', 'An accessory outside every cupboard row is still reachable above a floor unit.');
  await row.selectOption('2170');
  await drawn(page);
  await page.mouse.click(...await canvasPoint(page, 1050, 160));
  assert.equal(await selected(), 'plan-upper', 'Row controls make the same point editable as an upper.');
  assert.match(await name.textContent(), /^Wall cabinet · /);
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

  await button(page, 'Move').click();
  await page.getByText(`Choose where the centre of ${added.label} should go.`).waitFor();
  const spot = await canvasPoint(page, 1800, 1700);
  await page.mouse.click(...spot);
  const repositioned = await page.evaluate(() => window.__kitchen.design.getState().design.items.at(-1));
  const box = await planGeometry(page, added.id);
  assert.ok(Math.hypot(box.x + box.width / 2 - spot[0], box.y + box.height / 2 - spot[1]) < 2,
    `The rendered centre should follow the click: ${JSON.stringify({ spot, box, repositioned })}`);
  assert.deepEqual(repositioned, { ...added, x: repositioned.x, y: repositioned.y });
  await button(page, 'Undo').click();
  assert.deepEqual(await page.evaluate(() => window.__kitchen.design.getState().design.items.at(-1)), added);

  // Pick well away from the little midpoint grip: the side itself must resize, not move the unit.
  const [side, out] = await page.evaluate(async (item) => {
    const { localToRoom } = await import('/src/domain/geometry.ts');
    return [0, 200].map((delta) => localToRoom(item, item.width + delta, item.depth * 0.18));
  }, added);
  await page.mouse.move(...await canvasPoint(page, side.x, side.y)); await page.mouse.down();
  await page.mouse.move(...await canvasPoint(page, out.x, out.y), { steps: 4 }); await page.mouse.up();
  const stretched = await page.evaluate(() => window.__kitchen.design.getState().design.items.at(-1));
  assert.ok(stretched.width > added.width && stretched.depth === added.depth && stretched.rotation === added.rotation);
  assert.ok(await page.evaluate(async ([a, b]) => {
    const { localToRoom } = await import('/src/domain/geometry.ts');
    const p = localToRoom(a, 0, 0), q = localToRoom(b, 0, 0);
    return Math.hypot(p.x - q.x, p.y - q.y) < 1;
  }, [added, stretched]), 'Dragging a side leaves the opposite end anchored, including when rotated.');
  await button(page, 'Undo').click();
  assert.deepEqual(await page.evaluate(() => window.__kitchen.design.getState().design.items.at(-1)), added);
}

async function assertInkFits(page, step, margin = 16) {
  await drawn(page);
  const stats = await page.evaluate(() => {
    const stage = window.Konva.stages[0];
    const dims = stage.findOne('.plan-dimensions');
    const shapes = [stage.findOne('.room-perimeter'), ...dims.find('Shape')].filter((n) => n.isVisible());
    const bounds = shapes.map((n) => n.getClientRect());
    const left = Math.min(...bounds.map((b) => b.x)), right = Math.max(...bounds.map((b) => b.x + b.width));
    const top = Math.min(...bounds.map((b) => b.y)), bottom = Math.max(...bounds.map((b) => b.y + b.height));
    const gaps = [left, stage.width() - right, top, stage.height() - bottom];
    const origin = stage.container().getBoundingClientRect();
    for (const control of document.querySelectorAll('main [data-plan-controls], main [data-plan-overlay]')) {
      const box = control.getBoundingClientRect();
      if (!box.width || !box.height) continue;
      gaps.push(Math.max(box.left - origin.left - right, left - (box.right - origin.left),
        box.top - origin.top - bottom, top - (box.bottom - origin.top)));
    }
    return { clearance: Math.min(...gaps), labels: dims.find('Text').length, lines: dims.find('Line').length, gaps };
  });
  assert.ok(stats.labels > 0 && stats.lines > 4, `${step}: expected actual dimension labels and lines`);
  assert.ok(Math.abs(stats.clearance - margin) <= 2, `${step}: expected a snug ${margin}px fit, got ${JSON.stringify(stats)}`);
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

async function openPhonePlan(page) {
  await page.evaluate(async () => {
    const { createDesign } = await import('/src/domain/designOps.ts');
    const { createItem } = await import('/src/domain/catalog.ts');
    const fixture = createDesign('3600 × 3000');
    const add = (kind, id, fields) => fixture.items.push(createItem(kind, fixture.items, { id, ...fields }));
    add('base', 'phone-base', { label: 'B1', x: 2250, y: 2440, rotation: 180 });
    add('sink', 'phone-sink', { label: 'S1', x: 600, y: 0, width: 600 });
    add('wall', 'phone-wall1', { label: 'W1', x: 600, y: 0, elevation: 1450 });
    add('wall', 'phone-wall2', { label: 'W2', x: 600, y: 0, elevation: 2170, height: 400, depth: 560 });
    const ui = window.__kitchen.ui.getState();
    ui.select(null); ui.setViewFilter('all'); ui.setView('list');
    window.__kitchen.design.getState().load(fixture);
  });
  await page.setViewportSize({ width: 360, height: 640 });
  await page.evaluate(() => window.__kitchen.ui.getState().setView('plan'));
  await page.locator('.konvajs-content').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await assertInkFits(page, '360px open', 8);
}

const view = (page) => page.evaluate(() => {
  const { zoom, pan } = window.__kitchen.ui.getState();
  return { zoom, pan };
});

async function planGeometry(page, id = 'phone-base') {
  await drawn(page);
  return page.evaluate((id) => {
    const stage = window.Konva.stages[0];
    const canvas = stage.content.getBoundingClientRect();
    const node = stage.findOne(`#${id}`);
    const box = node.findOne('Line').getClientRect({ skipStroke: true });
    const x = canvas.x + box.x, y = canvas.y + box.y;
    const sheet = document.querySelector('[data-testid="item-sheet"][data-plan-overlay]')?.getBoundingClientRect();
    const screenRect = (r) => ({ x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom, right: r.right });
    const targetAt = (dx, dy) => {
      const p = { x: box.x + box.width / 2 + dx, y: box.y + box.height / 2 + dy };
      return document.elementFromPoint(canvas.x + p.x, canvas.y + p.y)?.tagName === 'CANVAS'
        && stage.getIntersection(p)?.findAncestor('.item')?.id() === id;
    };
    return {
      x, y, width: box.width, height: box.height, bottom: y + box.height, right: x + box.width,
      sheet: sheet && screenRect(sheet), canvas: screenRect(canvas), centreHit: targetAt(0, 0),
      hit44: [-21.5, 21.5].every((dx) => [-21.5, 21.5].every((dy) => targetAt(dx, dy))),
    };
  }, id);
}

const annotations = (page) => page.evaluate(() => {
  const stage = window.Konva.stages[0];
  const texts = (name) => (stage.findOne(`.${name}`)?.find('Text') ?? []).map((text) => text.text());
  const rects = stage.findOne('.plan-codes').find('Text').map((code) => code.getClientRect());
  const overlap = rects.some((a, i) => rects.slice(i + 1).some((b) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height));
  const minFontPx = Math.min(...stage.find('Text').filter((n) => n.isVisible()).map((n) => n.fontSize() * Math.abs(n.getAbsoluteScale().x)));
  return { codes: texts('plan-codes'), overlap, room: texts('plan-dimensions'), unit: texts('selected-unit-dimensions'), minFontPx };
});

async function phoneLayers(page) {
  const initial = await annotations(page);
  assert.deepEqual(initial.room, ['3600', '3000']);
  assert.deepEqual(initial.unit, []);
  assert.ok(initial.minFontPx >= 12 - 1e-6, 'Draw room/cabinet labels at 12 CSS pixels or larger.');
  assert.ok(!initial.overlap && initial.codes.includes('S1') && !initial.codes.some((code) => code.startsWith('W')),
    `Only floor codes should be shown even when an upper completely covers the sink: ${JSON.stringify(initial)}`);
  const sink = await planGeometry(page, 'phone-sink');
  assert.ok(sink.hit44, 'The covered sink keeps its 44px target.');
  await button(page, 'Wall units').tap();
  await page.getByLabel('Upper cabinet row', { exact: true }).selectOption('2170');
  await page.touchscreen.tap(...await canvasPoint(page, 900, 160));
  assert.deepEqual((await annotations(page)).unit, ['600', '560'], 'The chosen upper has editable dimensions in its row.');
  assert.equal(await page.locator('[data-plan-cabinet-name]').textContent(), 'Wall cabinet · W2');
  await button(page, 'All').tap();
  const returned = await annotations(page);
  assert.ok(returned.codes.includes('S1') && !returned.codes.includes('W2'));
  assert.deepEqual(returned.unit, [], 'A selected upper must not leave rulers over the sink in All.');
  await page.touchscreen.tap(...await canvasPoint(page, 900, 160));
  assert.equal(await page.evaluate(() => window.__kitchen.ui.getState().selectedId), 'phone-sink');
  assert.equal(await page.locator('[data-plan-cabinet-name]').textContent(), 'Sink cabinet · S1');
  await page.evaluate(() => window.__kitchen.ui.getState().setLanguage('sr'));
  assert.equal(await page.locator('[data-plan-cabinet-name]').textContent(), 'Element za sudoperu · S1');
  await page.evaluate(() => window.__kitchen.ui.getState().setLanguage('en'));
  await button(page, 'Deselect').tap();
  await button(page, 'Floor units').tap();
  const floor = await annotations(page);
  assert.ok(floor.codes.includes('S1') && !floor.codes.some((code) => code.startsWith('W')), 'Ghosted tiers have no labels.');
  await button(page, 'All').tap();
  const all = button(page, 'Show all plan dimensions');
  await all.tap();
  assert.equal(await all.getAttribute('aria-pressed'), 'true');
  await assertInkFits(page, 'Opt-in dimension chains', 8);
  const detailed = await annotations(page);
  assert.ok(detailed.room.length > 2 && detailed.minFontPx >= 12 - 1e-6);
  await button(page, 'Floor units').tap();
  assert.deepEqual((await annotations(page)).room, detailed.room, 'Even opt-in All measurements exclude upper chains.');
  await button(page, 'All').tap();
  await all.tap();
  await assertInkFits(page, 'Restored room totals', 8);
  assert.deepEqual((await annotations(page)).room, initial.room);
}

async function pinchAndCancel(page) {
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: points.map(([x, y], id) => ({ x, y, id })),
  });
  const history = () => page.evaluate(() => {
    const { design, past, future } = window.__kitchen.design.getState();
    return JSON.stringify([design, past, future]);
  });
  // Keep a real redo branch: a viewport gesture must not clear either history stack.
  await page.evaluate(() => {
    const store = window.__kitchen.design.getState();
    store.apply((d) => ({ ...d, name: 'Undo me' })); store.undo();
  });
  const before = await history();
  const fit = button(page, 'Fit the room in view');
  const initial = await view(page);
  const [x, y] = (await canvasPoint(page, 1200, 1500)).map(Math.round);
  // The midpoint translates as well as spreads, deliberately off centre.
  await touch('touchStart', [[x - 30, y], [x + 30, y]]);
  await touch('touchMove', [[x - 38, y - 16], [x + 82, y - 16]]);
  await touch('touchEnd', []);
  const pinched = await view(page), canvas = await page.locator('.konvajs-content').boundingBox();
  const anchored = (axis, original) => canvas[axis] + pinched.pan[axis]
    + ((original - canvas[axis] - initial.pan[axis]) / initial.zoom) * pinched.zoom;
  assert.ok(Math.abs(pinched.zoom / initial.zoom - 2) < 0.03);
  assert.ok(Math.abs(anchored('x', x) - (x + 22)) < 1 && Math.abs(anchored('y', y) - (y - 16)) < 1, 'Pinch follows its midpoint, not the canvas centre.');
  assert.equal(await history(), before);
  await fit.tap();
  await assertInkFits(page, 'Fit after pinch', 8);
  assert.ok(Math.abs((await zoom(page)) - initial.zoom) < 0.0001);

  // Take over a live unit drag (not just a press) and then interrupt the pinch.
  const [ux, uy] = (await canvasPoint(page, 2550, 2720)).map(Math.round);
  await touch('touchStart', [[ux, uy]]);
  await touch('touchMove', [[ux - 32, uy - 10]]);
  await page.waitForFunction(() => window.__kitchen.design.getState().gestureBase !== null);
  assert.notEqual(await history(), before, 'The first finger really moved the cabinet.');
  const beforeCancel = await view(page);
  await touch('touchStart', [[ux - 32, uy - 10], [ux - 82, uy - 45]]);
  await touch('touchMove', [[ux - 12, uy - 10], [ux - 106, uy - 55]]);
  await drawn(page);
  assert.ok((await zoom(page)) > beforeCancel.zoom * 1.4);
  assert.equal(await history(), before, 'The second finger rolled back the live edit without recording it.');
  await touch('touchCancel', []);
  await drawn(page);
  assert.deepEqual(await view(page), beforeCancel, 'Pointer cancellation restores the pre-pinch viewport.');
  assert.equal(await history(), before, 'Cancel must preserve design, Undo and Redo.');
  // A wall's tap action must not fire just because a pinch finishes on that wall.
  const [wx, wy] = (await canvasPoint(page, 1800, 0)).map(Math.round);
  await touch('touchStart', [[wx, wy], [wx + 35, wy + 24]]);
  await touch('touchEnd', []);
  assert.equal(await page.getByTestId('room-workspace').count(), 0);
  await cdp.detach();
}

async function phoneFit(page) {
  await openPhonePlan(page);
  assert.equal(await button(page, 'Zoom out').count() + await button(page, 'Zoom in').count(), 0);
  assert.equal(await button(page, 'Fit the room in view').innerText(), 'Fit');
  await phoneLayers(page);
  const cabinet = await planGeometry(page);
  assert.ok(cabinet.width >= 44 && cabinet.height >= 44 && cabinet.hit44, `3600mm room: the 600mm base needs a usable 44px target: ${JSON.stringify(cabinet)}`);

  await pinchAndCancel(page);
  await button(page, 'Deselect').tap();
  await button(page, 'Fit the room in view').tap();
  const target = await planGeometry(page);
  await page.touchscreen.tap(target.x + target.width / 2 + 21, target.y + target.height / 2 + 21);
  const sheet = page.getByTestId('item-sheet');
  const handle = sheet.getByTestId('sheet-handle');
  const unitId = () => page.evaluate(() => window.__kitchen.ui.getState().selectedId);
  assert.equal(await unitId(), 'phone-base');
  const selected = await annotations(page);
  assert.deepEqual(selected.unit, ['600', '560']);
  assert.ok(selected.minFontPx >= 12 - 1e-6);
  const before = await planGeometry(page);
  await swipePlan(page, before.x, before.y + before.height / 2, -18, 0);
  assert.ok(await page.evaluate(() => window.__kitchen.design.getState().design.items[0].width > 600), 'The width handle must work on a 50px-wide cabinet without zooming in.');
  await button(page, 'Undo').tap();
  const snaps = [];
  for (const [name, key] of [['small', 'Home'], ['half', 'ArrowUp'], ['full', 'End'], ['small', 'Home']]) {
    await handle.press(key);
    await sheet.locator(`:scope[data-snap="${name}"]`).waitFor();
    const r = await planGeometry(page);
    assert.ok(r.sheet && r.centreHit && r.bottom <= r.sheet.y - 4 && r.y >= r.canvas.y && r.x >= r.canvas.x && r.right <= r.canvas.right,
      `${name}: selected footprint must be on the exposed drawing, not behind the actual sheet: ${JSON.stringify(r)}`);
    snaps.push(r);
  }
  assert.ok(snaps[0].sheet.y > snaps[1].sheet.y && snaps[1].sheet.y > snaps[2].sheet.y);
  assert.ok(snaps[0].bottom > snaps[1].sheet.y && snaps[1].bottom > snaps[2].sheet.y, 'Each taller snap really would have covered the old cabinet location.');
  assert.equal(snaps[3].y, snaps[2].y, 'Making room again must not yank a visible cabinet.');
  console.log(`  360px: 600mm base ${cabinet.width.toFixed(1)} × ${cabinet.height.toFixed(1)} CSS px; cabinet bottom / sheet top: ${
    snaps.slice(0, 3).map((r) => `${r.bottom.toFixed(1)} / ${r.sheet.y.toFixed(1)}`).join(', ')}`);
  await button(page, 'Deselect').tap();
  await page.evaluate(async () => (await import('/src/store/actions.ts')).setRoomSize({ width: 20000, depth: 20000 }));
  await assertInkFits(page, '20000mm phone room', 8);
  const large = await planGeometry(page);
  assert.ok(large.width < 12 && large.width < cabinet.width / 4, 'A large room scales honestly; the cabinet itself is not enlarged.');
  // A tap in otherwise empty space inside its 44px aperture can still pick it.
  await page.touchscreen.tap(large.x + large.width / 2, large.y + large.height / 2 - 18);
  assert.equal(await unitId(), 'phone-base', 'Near-target assistance must be a real pick, not visual inflation.');
  const tiny = await planGeometry(page);
  const previous = await view(page);
  await swipePlan(page, tiny.x + tiny.width / 2, tiny.y + tiny.height / 2 - 18, 32, 0);
  assert.notEqual(await page.evaluate(() => window.__kitchen.design.getState().design.items[0].x), 2250,
    'Grabbing within the selected tiny cabinet’s touch target moves the cabinet, not the paper.');
  assert.deepEqual(await view(page), previous);
  await button(page, 'Undo').tap();
  await button(page, 'Deselect').tap();
  const portraitZoom = await zoom(page);
  await page.setViewportSize({ width: 568, height: 320 });
  await assertInkFits(page, 'Phone landscape', 8);
  assert.notEqual(await zoom(page), portraitZoom);

  // An inset outline does not fill the nominal box (the clipped grid still does).
  await page.setViewportSize({ width: 360, height: 640 });
  await page.evaluate(() => {
    const store = window.__kitchen.design.getState();
    const vertices = [[6000, 3000], [9600, 3100], [9500, 6000], [6000, 6000]].map(([x, y], i) => ({ id: `wall-${i}`, x, y }));
    store.load({ ...store.design, items: [], room: { ...store.design.room, vertices } });
  });
  await page.getByTestId('empty-plan-hint').waitFor();
  await assertInkFits(page, 'Actual polygon + empty-plan hint', 8);
  assert.deepEqual((await annotations(page)).room, ['3600', '3000']);
  assert.ok((await zoom(page)) * 600 >= 44, 'Fit the drawn outline, not the invisible 20m grid.');
}

async function cabinetActions(page) {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.evaluate(() => window.__kitchen.ui.getState().select('phone-base'));
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
  assert.equal(await page.evaluate(() => window.__kitchen.design.getState().design.items[0].rotation), 270);
  await button(page, 'Undo').tap();
  assert.equal(await page.evaluate(() => window.__kitchen.design.getState().design.items[0].rotation), 180);
}

async function phonePlacement(page) {
  await page.evaluate(() => window.__kitchen.ui.getState().setLanguage('sr'));
  const sheet = page.getByTestId('item-sheet'), picker = page.getByRole('dialog', { name: 'Dodaj element' });
  const last = () => page.evaluate(() => window.__kitchen.design.getState().design.items.at(-1));
  const history = () => page.evaluate(() => window.__kitchen.design.getState().past.length);
  await button(sheet, 'Dodaj element').tap();
  await picker.locator('[data-preset="base-600"]').tap();
  const added = await last();
  await button(picker, 'Promeni mere').tap();
  const width = sheet.getByLabel('Širina', { exact: true });
  await width.fill('650'); await width.press('Enter');
  assert.deepEqual(await last(), { ...added, width: 650 });
  await button(sheet, 'Pomeri').tap();
  await sheet.waitFor({ state: 'hidden' });
  await button(page, 'Prikaži celu prostoriju').tap();
  await drawn(page);
  const prior = await history();
  await page.touchscreen.tap(...await canvasPoint(page, 900, 280)); // The sink already occupies this spot.
  await page.getByText('Element ne može da stane tu. Izaberite drugo mesto u prostoriji.').waitFor();
  assert.equal(await history(), prior);
  await page.touchscreen.tap(...await canvasPoint(page, 1800, 1500));
  await sheet.waitFor();
  const placed = await last();
  assert.equal(placed.id, added.id);
  assert.ok(Math.abs(placed.x + placed.width / 2 - 1800) < 15 && Math.abs(placed.y + placed.depth / 2 - 1500) < 15);
  assert.equal(await history(), prior + 1);
  await button(page, 'Korak unazad').tap();
  assert.deepEqual(await last(), { ...added, width: 650 });
  for (const control of [button(sheet, 'Pomeri'), button(sheet, 'Promeni mere'), button(sheet, 'Dodaj element')]) {
    assert.ok(await control.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.height >= 44 && r.width >= 44 && r.right <= innerWidth && el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    }), 'Move, Resize and Add must fit the collapsed 320px toolbar.');
  }
  await button(sheet, 'Dodaj element').tap();
  await picker.locator('[data-preset="wall-600"]').tap();
  const upper = await last();
  await button(picker, 'Pomeri').tap();
  await button(page, 'Otkaži').tap();
  assert.deepEqual(await last(), upper, 'Cancel keeps the newly added cabinet where it was.');
  await button(sheet, 'Promeni mere').tap();
  assert.equal(await width.inputValue(), '600');
}

async function directPhoneEditing(page) {
  const sheet = page.getByTestId('item-sheet'), picker = page.getByRole('dialog', { name: 'Dodaj element' });
  const last = () => page.evaluate(() => window.__kitchen.design.getState().design.items.at(-1));
  const history = () => page.evaluate(() => window.__kitchen.design.getState().past.length);
  await page.evaluate(() => window.__kitchen.ui.getState().setSnapEnabled(false));
  await button(sheet, 'Dodaj element').tap();
  await picker.getByRole('searchbox').fill('300');
  await picker.locator('[data-preset="base-300"]').tap();
  const added = await last(), initial = await history();
  await button(picker, 'Na crtež').tap();
  await picker.waitFor({ state: 'detached' });
  assert.equal(await sheet.getAttribute('data-snap'), 'small');
  const body = await planGeometry(page, added.id), z = await zoom(page);
  assert.ok(body.centreHit && body.width < 44, 'Test the actual narrow footprint at phone fit, not a zoomed-in unit.');
  const [x, y] = [body.x + body.width / 2, body.y + body.height / 2];
  const [toX, toY] = await canvasPoint(page, 1730, 1570);
  await swipePlan(page, x, y, toX - x, toY - y);
  const moved = await last();
  assert.ok(Math.hypot(moved.x + moved.width / 2 - 1730, moved.y + moved.depth / 2 - 1570) * z < 2);
  assert.deepEqual(moved, { ...added, x: moved.x, y: moved.y });
  assert.equal(await history(), initial + 1);
  const middle = await planGeometry(page, added.id);
  await swipePlan(page, middle.x + middle.width / 2, middle.y + middle.height / 2, 20, -14);
  const movedAgain = await last();
  assert.ok(Math.hypot((movedAgain.x - moved.x) * z - 20, (movedAgain.y - moved.y) * z + 14) < 2,
    'A free-standing unit can be grabbed again in the middle of the room.');
  await button(page, 'Korak unazad').tap();
  assert.deepEqual(await last(), moved);
  for (const [grip, field, dx, dy] of [['right', 'width', 24, 0], ['front', 'depth', 0, 16]]) {
    await drawn(page);
    const point = await page.evaluate((grip) => {
      const stage = window.Konva.stages[0], node = stage.findOne(`.grip-${grip}`);
      if (!node) return null;
      const r = node.getClientRect(), p = { x: r.x + r.width / 2 - 3, y: r.y + r.height / 2 - 2 };
      const c = stage.content.getBoundingClientRect();
      return stage.getIntersection(p) === node && document.elementFromPoint(p.x + c.x, p.y + c.y)?.tagName === 'CANVAS'
        ? [p.x + c.x, p.y + c.y] : null;
    }, grip);
    assert.ok(point, `The ${field} grip must be visible and pickable without opening the size form.`);
    await swipePlan(page, ...point, dx, dy);
    const next = await last();
    assert.ok(Math.abs((next[field] - moved[field]) * z - (dx || dy)) < 2, `${field} follows finger travel, not the offset grip's absolute position.`);
    assert.deepEqual(next, { ...moved, [field]: next[field] });
    assert.equal(await history(), initial + 2);
    await button(page, 'Korak unazad').tap();
    assert.deepEqual(await last(), moved);
  }
  await button(page, 'Korak unazad').tap();
  assert.deepEqual(await last(), added);
  await button(sheet, 'Dodaj element').tap();
  await picker.locator('[data-preset="wall-600"]').tap();
  const upper = await last();
  await button(picker, 'Na crtež').tap();
  await drawn(page);
  assert.ok(await page.evaluate((id) => {
    const ui = window.__kitchen.ui.getState();
    return ui.viewFilter === 'wall' && ui.selectedId === id && !!window.Konva.stages[0].findOne('.grip-front');
  }, upper.id), 'An explicitly edited upper must have real grips, not just its dashed All-layer outline.');
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
  await openPhonePlan(page);
  await cabinetActions(page);
  await phonePlacement(page);
  await directPhoneEditing(page);
}

// Also runnable without the unrelated 3D/workshop suites.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { createServer } = await import('vite');
  const { chromium } = await import('playwright-core');
  const server = await createServer({ logLevel: 'error', cacheDir: 'test-results/plan-ux/.vite',
    optimizeDeps: { entries: ['index.html'] }, server: { host: '127.0.0.1', port: 0, watch: null, hmr: false } });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({ channel: 'chrome' });
    const page = await browser.newPage({ locale: 'en-US', hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(server.resolvedUrls.local[0]);
    await checkPlanUX(page);
    assert.deepEqual(errors, []);
    console.log('  PASS desktop and touch plan drawing checks');
  } finally { await browser?.close(); await server.close(); }
}
