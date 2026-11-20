import assert from 'node:assert/strict';
import path from 'node:path';
import { showRoomModel, waitForIdleRendering } from './three-test-helpers.mjs';

const design = (page) => page.evaluate(() => window.__kitchen.design.getState().design);
const history = (page) => page.evaluate(() => window.__kitchen.design.getState().past.length);
const tapOrClick = (locator, touch) => touch ? locator.tap() : locator.click();
const dimension = (elevation, kind) => elevation.locator(`[data-elevation-dimension="${kind}"] text`);

// Hit the actual wall at a known point, not the bounding-box centre of a rotated SVG group.
async function selectWall(page, plan, id, touch, normal = 0) {
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

async function faceWall(page, plan, id, touch, normal = 0) {
  await selectWall(page, plan, id, touch, normal);
  await tapOrClick(plan.locator(`[data-wall-view="${id}"]`), touch);
}

async function drag(page, from, to, touch, cancel = false, held) {
  if (touch) {
    const cdp = await page.context().newCDPSession(page);
    try {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...from, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...to, id: 1 }] });
      if (held) await held(to);
      await cdp.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
    } finally { await cdp.detach(); }
  } else {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 6 });
    if (held) await held(to);
    if (cancel) await page.keyboard.press('Escape');
    await page.mouse.up();
  }
}

async function dragDrawing(page, target, dx, dy, touch, cancel = false, held) {
  const { from, to } = await target.evaluate((node, delta) => {
    const rect = node.getBoundingClientRect();
    const matrix = (node.closest('[data-room-space]') ?? node.ownerSVGElement).getScreenCTM();
    const from = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    return { from, to: { x: from.x + delta.dx * matrix.a + delta.dy * matrix.c,
      y: from.y + delta.dx * matrix.b + delta.dy * matrix.d } };
  }, { dx, dy });
  await drag(page, from, to, touch, cancel, held);
}

export async function roomViewAndAddChecks(page, touch, review3D) {
  const workspace = page.getByTestId('room-workspace'), plan = workspace.getByTestId('room-plan');
  const snapshot = () => page.evaluate(async () => {
    const { committedDesign } = await import('/src/store/designStore.ts');
    const state = window.__kitchen.design.getState();
    return { design: state.design, past: state.past, future: state.future, backup: JSON.stringify(committedDesign(state)) };
  });
  const originalViewport = page.viewportSize();
  const original = await page.evaluate(async () => {
    const { createProject } = await import('/src/store/projects.ts');
    const { createDesign } = await import('/src/domain/designOps.ts');
    createProject('Room drawing controls');
    const d = createDesign('Room drawing controls');
    d.room = { width: 4100, depth: 3100, height: 2600,
      features: [{ id: 'view-column', kind: 'column', x: 1500, y: 1100, width: 300, depth: 400 }] };
    window.__kitchen.design.getState().load(d);
    const ui = window.__kitchen.ui.getState();
    ui.setLanguage('en'); ui.openRoomPlan(); ui.setSnapEnabled(true); ui.setGridSize(10);
    ui.setRoomAngleSnapEnabled(false);
    return d;
  });
  if (touch) await page.setViewportSize({ width: 320, height: 568 });
  await page.evaluate(() => document.fonts.ready);
  const rotate = workspace.locator('[data-room-rotate-view]');
  const undo = page.getByRole('button', { name: 'Undo', exact: true });
  const originalSnapshot = await snapshot();
  for (const angle of [90, 180, 270, 0]) {
    await tapOrClick(rotate, touch);
    assert.equal(await plan.locator('svg[data-room-plan-angle]').getAttribute('data-room-plan-angle'), String(angle));
    assert.deepEqual(await snapshot(), originalSnapshot, 'A view turn cannot change the Design, history or project backup.');
    if (angle === 90) await selectWall(page, plan, 'top', touch);
    await plan.getByRole('button', { name: 'View wall 1', exact: true }).waitFor();
    const padding = await plan.locator('[data-wall-view="top"]').evaluate((node) =>
      node.querySelector('.room-wall-view-chip').getBoundingClientRect().right - node.querySelector('text').getBoundingClientRect().right);
    assert.ok(padding >= 7.9, 'The named wall action retains readable padding instead of ending on its border.');
    const foreground = await plan.evaluate((root) => {
      const labels = [...root.querySelectorAll('[data-wall-dimension],[data-wall-view]')];
      const strokes = [...root.querySelectorAll('[data-plan-dimension-line],[data-room-space] > line,[data-plan-feature]')];
      return strokes.length >= 8 && labels.every((label) => strokes.every((stroke) =>
        !!(stroke.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING)));
    });
    assert.ok(foreground, 'Drawing strokes and connectors remain underneath every opaque measurement and wall action.');
    const targets = await plan.locator('[data-wall-dimension],[data-wall-view],[data-wall-move]').evaluateAll((nodes) => nodes.map((node) => {
      const box = node.getBoundingClientRect(), matrix = node.getScreenCTM();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return { width: box.width, height: box.height, reachable: node.contains(hit), upright: Math.abs(matrix.b) < 1e-8 && Math.abs(matrix.c) < 1e-8 };
    }));
    assert.equal(targets.length, 9);
    assert.ok(targets.every((t) => t.width >= 43.9 && t.height >= 43.9 && t.reachable && t.upright),
      `Measurements, names and grips remain upright and reachable at ${angle} degrees.`);
    assert.equal(await plan.locator('[data-plan-dimension-line="top"] path').count(), 3);
    const witnessGap = await plan.evaluate((root) => {
      const witness = root.querySelector('[data-plan-dimension-line="top"] path');
      const wall = root.querySelector('[data-wall-id="top"] line');
      const start = witness.getPointAtLength(0).matrixTransform(witness.getScreenCTM());
      const end = new DOMPoint(wall.x1.baseVal.value, wall.y1.baseVal.value).matrixTransform(wall.getScreenCTM());
      return Math.hypot(start.x - end.x, start.y - end.y);
    });
    assert.ok(Math.abs(witnessGap - 2) < .01, 'Witness lines originate at the actual wall endpoints, not their midpoint.');
  }
  await tapOrClick(rotate, touch);
  const grip = plan.locator('[data-wall-move="top"]'), column = plan.locator('[data-plan-feature="view-column"]');
  await grip.press('ArrowRight');
  assert.equal((await design(page)).room.depth, original.room.depth + 10, 'At 90 degrees, screen-right moves the top wall outward.');
  assert.equal(await history(page), 1);
  await undo.click();
  const fixedBox = await column.boundingBox();
  await dragDrawing(page, grip, 0, -1200, touch, false, async () => {
    await page.waitForFunction(() => window.__kitchen.design.getState().gestureBase !== null);
    await plan.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const heldBox = await column.boundingBox();
    assert.ok(Math.hypot(heldBox.x - fixedBox.x, heldBox.y - fixedBox.y) < .01, 'The rebased rotated frame keeps fixed objects at the same screen position throughout the gesture.');
    assert.ok(await rotate.isDisabled(), 'Do not rotate a committed gesture beneath a captured pointer.');
  });
  assert.equal((await design(page)).room.depth, original.room.depth + 1200);
  assert.equal((await design(page)).room.features[0].y, original.room.features[0].y + 1200, 'Rebasing keeps the fixed column physically in place.');
  assert.equal(await history(page), 1, 'A rotated wall drag is one Undo step.');
  await undo.click();
  const beforeCancel = await snapshot();
  await dragDrawing(page, grip, 0, -1200, touch, true);
  assert.deepEqual(await snapshot(), beforeCancel, 'Cancelling a rotated gesture restores the complete saved state.');
  await column.press('Enter');
  const widthGrip = plan.getByRole('slider', { name: 'Structure width', exact: true }).first();
  assert.equal(await widthGrip.getAttribute('aria-orientation'), 'vertical');
  assert.equal(await widthGrip.evaluate((node) => getComputedStyle(node).cursor), 'ns-resize');
  await widthGrip.press('ArrowUp');
  assert.equal((await design(page)).room.features[0].width, original.room.features[0].width + 10, 'Resize arrows still increase the physical dimension after rotating the view.');
  await undo.click();
  await column.press('Enter');
  await column.press('ArrowRight');
  assert.equal((await design(page)).room.features[0].y, original.room.features[0].y - 10);
  await undo.click();
  await dragDrawing(page, column, 1200, 0, touch);
  assert.equal((await design(page)).room.features[0].x, original.room.features[0].x + 1200, 'World-space dragging is retained after rotating the screen.');
  await undo.click();
  const cornerTarget = plan.locator('[data-corner-target="top"]');
  if (await cornerTarget.count()) await tapOrClick(cornerTarget, touch);
  const corner = plan.locator('[data-room-corner="top"]');
  await corner.press('ArrowRight');
  assert.equal((await design(page)).room.depth, original.room.depth + 10);
  assert.equal((await design(page)).room.vertices[1].y, 10, 'Only the selected corner moves; screen directions are inverse-mapped.');
  await undo.click();
  if (review3D) {
    const beforePreview = await snapshot();
    await tapOrClick(workspace.getByRole('button', { name: '3D preview', exact: true }), touch);
    await workspace.getByTestId('three-viewport').locator('canvas').waitFor();
    if (!touch) await showRoomModel(page);
    await tapOrClick(workspace.getByRole('button', { name: 'Back to 2D drawing', exact: true }), touch);
    await plan.waitFor();
    assert.equal(await plan.locator('svg[data-room-plan-angle]').getAttribute('data-room-plan-angle'), '90');
    assert.deepEqual(await snapshot(), beforePreview, 'The cube round trip retains orientation without editing the room.');
  }
  await page.evaluate(() => {
    const ui = window.__kitchen.ui.getState();
    ui.setRoomPlanAngle(0); ui.setRoomAngleSnapEnabled(true); ui.setSelectedWallId(null);
  });
  const beforeAdd = await snapshot(), add = workspace.getByRole('button', { name: 'Add an object', exact: true });
  const chooser = page.getByRole('dialog', { name: 'Choose a wall before adding', exact: true });
  await tapOrClick(add, touch);
  await chooser.waitFor();
  assert.equal(await workspace.locator('.room-add-choices').count(), 0, 'A wall is chosen before the object menu opens.');
  assert.deepEqual(await snapshot(), beforeAdd);
  await chooser.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.deepEqual(await snapshot(), beforeAdd, 'Cancelling the prerequisite adds nothing.');
  assert.ok(await add.evaluate((button) => button === document.activeElement));
  await tapOrClick(add, touch);
  await chooser.locator('[data-room-wall-choice="right"]').click();
  await workspace.locator('.room-add-choices').waitFor();
  assert.equal(await page.evaluate(() => window.__kitchen.ui.getState().selectedWallId), 'right');
  assert.deepEqual(await snapshot(), beforeAdd, 'Selecting a wall alone is not an Undo step.');
  await tapOrClick(workspace.getByRole('button', { name: 'Window', exact: true }), touch);
  assert.equal((await design(page)).openings.at(-1).wallId, 'right');
  assert.equal(await history(page), 1);
  await undo.click();
  await page.evaluate(() => {
    const ui = window.__kitchen.ui.getState();
    ui.setRoomElevationOpen(true); ui.setSelectedWallId('removed-wall');
  });
  await tapOrClick(add, touch);
  await chooser.waitFor();
  await chooser.locator('[data-room-wall-choice="left"]').click();
  await tapOrClick(workspace.getByRole('button', { name: 'Column', exact: true }), touch);
  assert.equal((await design(page)).room.features.length, 2);
  assert.equal((await design(page)).room.features.at(-1).wallId, undefined, 'The prerequisite must not attach a free column to the chosen wall.');
  await undo.click();
  await page.evaluate(() => window.__kitchen.ui.getState().setSelectedWallId(null));
  await tapOrClick(add, touch);
  await chooser.waitFor();
  await page.evaluate(async () => (await import('/src/store/projects.ts')).createProject('No pending wall choice'));
  assert.equal(await chooser.count(), 0, 'Switching projects discards the old Add continuation.');
  assert.equal(await page.evaluate(() => window.__kitchen.ui.getState().roomPlanAngle), 0);
  await page.evaluate(() => {
    const state = window.__kitchen.design.getState();
    state.load({ ...state.design, room: { width: 12000, depth: 4000, height: 2600 } });
  });
  await page.waitForFunction(() => document.querySelector('[data-wall-dimension="top"] text:last-of-type')?.textContent === '12000 mm');
  const valueFits = await plan.locator('[data-wall-dimension="top"]').evaluate((node) =>
    node.querySelectorAll('text')[1].getBoundingClientRect().width <= node.querySelectorAll('rect')[1].getBoundingClientRect().width + .01);
  assert.ok(valueFits, 'A five-digit professional measurement must fit its drawing label.');
  await tapOrClick(add, touch);
  await chooser.waitFor();
  const choiceFits = await chooser.locator('[data-room-wall-choice]').evaluateAll((nodes) => nodes.every((node) => {
    const value = node.querySelector('small'), range = document.createRange();
    range.selectNodeContents(value);
    const glyphs = [...range.getClientRects()];
    return glyphs.length > 0 && glyphs.every((glyph) => Math.abs(glyph.top - glyphs[0].top) < .1) &&
      range.getBoundingClientRect().right <= node.querySelector('svg:last-child').getBoundingClientRect().left - 4 &&
      node.getBoundingClientRect().height >= 63.9;
  }));
  assert.ok(choiceFits, 'Wall-choice measurements stay on one line, clear of the arrow, inside a full touch target.');
  await chooser.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('radio', { name: '2. Layout', exact: true }).click();
  if (touch) await page.locator('[data-add-trigger]').tap();
  await tapOrClick(page.locator('[data-preset="base-600"]'), touch);
  assert.equal((await design(page)).items.length, 1, 'The Layout catalogue does not require a room wall.');
  assert.equal(await chooser.count(), 0);
  if (touch) await page.keyboard.press('Escape');
  if (touch) await page.setViewportSize(originalViewport);
}

export async function wallEditorChecks(page, touch, review3D) {
  const workspace = page.getByTestId('room-workspace'), plan = workspace.getByTestId('room-plan');
  const original = await page.evaluate(async () => {
    const { createProject, flushSave } = await import('/src/store/projects.ts');
    const { createDesign } = await import('/src/domain/designOps.ts');
    const { createItem } = await import('/src/domain/catalog.ts');
    createProject('Wall controls');
    const d = createDesign('Wall controls');
    d.room = { width: 4000, depth: 3000, height: 2600 };
    d.items = [createItem('base', [], { x: 1200, y: 1400, width: 600, depth: 560 })];
    d.openings = [{ id: 'wall-window', wall: 'top', kind: 'window', offset: 200, width: 600, height: 800, sill: 1100 }];
    const { design, ui } = window.__kitchen;
    design.getState().load(d);
    ui.getState().setLanguage('en');
    ui.getState().openRoomPlan();
    ui.getState().setRoomAngleSnapEnabled(true);
    flushSave();
    return d;
  });
  await selectWall(page, plan, 'top', touch);
  assert.ok(await plan.isVisible(), 'Selecting a wall must leave the outline available for dragging.');
  assert.equal(await history(page), 0);
  const grip = plan.locator('[data-wall-move="top"]');
  const hit = await grip.boundingBox();
  assert.ok(hit.width >= 43.9 && hit.height >= 43.9, 'The selected-wall grip is a complete touch target.');
  await dragDrawing(page, grip, 0, -200, touch, false, async () => {
    await page.waitForFunction(() => window.__kitchen.design.getState().design.room.depth === 3200);
    assert.equal(await history(page), 0);
    const saved = await page.evaluate(async () => {
      const { flushSave, useProjectsStore } = await import('/src/store/projects.ts');
      flushSave();
      return JSON.parse(localStorage.getItem(`kitchen-designer:project:${useProjectsStore.getState().activeId}`));
    });
    assert.deepEqual(saved, original, 'Autosave must never write a partly moved wall.');
  });
  const moved = await design(page);
  assert.deepEqual(moved.room.vertices, [{ id: 'top', x: 0, y: 0 }, { id: 'right', x: 4000, y: 0 },
    { id: 'bottom', x: 4000, y: 3200 }, { id: 'left', x: 0, y: 3200 }]);
  assert.deepEqual(moved.items, [{ ...original.items[0], y: original.items[0].y + 200 }]);
  assert.deepEqual(moved.openings, [{ ...original.openings[0], wallId: 'top' }]);
  assert.equal(await history(page), 1);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  assert.deepEqual(await design(page), original);
  await dragDrawing(page, grip, 200, 0, touch);
  assert.deepEqual(await design(page), original, 'Tangential pointer travel does not move a wall.');
  assert.equal(await history(page), 0);
  await dragDrawing(page, grip, 0, -100, touch, true);
  assert.deepEqual(await design(page), original, 'A cancelled wall drag restores the exact baseline.');
  await plan.locator('[data-wall-id="top"]').press('ArrowUp');
  assert.equal((await design(page)).room.depth, 3010);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await dragDrawing(page, grip, 0, 2200, touch);
  await plan.getByRole('status').filter({ hasText: 'cabinet would no longer fit' }).waitFor();
  const stopped = await design(page);
  assert.equal(stopped.room.depth, 1600);
  assert.equal(stopped.items[0].y, 0, 'The cabinet stays at its physical position; only the drawing origin changes.');
  await page.evaluate((d) => window.__kitchen.design.getState().load(d), original);
  await dragDrawing(page, plan.getByRole('button', { name: 'Move corner 2', exact: true }), 50, 50, touch);
  assert.equal(await plan.locator('[data-corner-angle="right"]').textContent(), '90°');
  const angle = await page.evaluate(async () => {
    const { roomSegments } = await import('/src/domain/walls.ts');
    const { normalizeAngle } = await import('/src/domain/polygons.ts');
    const walls = roomSegments(window.__kitchen.design.getState().design.room, false);
    return normalizeAngle(walls[0].angle + 180 - walls[1].angle);
  });
  assert.ok(Math.abs(angle - 90) < 1e-8, 'Snapping must make the actual corner square, not just round its label.');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await tapOrClick(plan.locator('[data-wall-view="right"]'), touch);
  const inspector = workspace.getByTestId('room-inspector'), field = inspector.getByLabel('Angle', { exact: true });
  const snap = inspector.getByRole('checkbox', { name: 'Snap to right angles (within 5°)', exact: true });
  await field.fill('85'); await field.press('Enter');
  assert.equal(await field.inputValue(), '90', 'The field must display the committed snap, not the unsnapped draft.');
  assert.deepEqual(await design(page), original);
  await snap.uncheck();
  await field.fill('88'); await field.press('Enter');
  assert.equal(await field.inputValue(), '88', 'Exact free angles remain available.');
  await tapOrClick(inspector.getByRole('button', { name: 'Angle: 90 °', exact: true }), touch);
  const right = await page.evaluate(async () => {
    const { roomSegments } = await import('/src/domain/walls.ts');
    return roomSegments(window.__kitchen.design.getState().design.room, false)[1].angle;
  });
  assert.equal(right, 90);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await snap.check();
  const safe = await design(page), revisions = await history(page);
  await tapOrClick(inspector.getByRole('button', { name: 'Angle: 270 °', exact: true }), touch);
  await inspector.getByRole('alert').filter({ hasText: 'This edit cannot be applied' }).waitFor();
  assert.deepEqual(await design(page), safe, 'An impossible preset is rejected atomically.');
  assert.equal(await history(page), revisions);
  await workspace.getByRole('button', { name: 'Back to room outline', exact: true }).click();
  await tapOrClick(plan.locator('[data-wall-view="right"]'), touch);
  const cube = workspace.locator('[data-room-preview-toggle]');
  assert.equal(await cube.locator('[data-room-preview-cube]').count(), 1);
  assert.equal(await workspace.locator('canvas').count(), 0, 'The collapsed cube must not start a WebGL scene.');
  if (touch) {
    const viewport = page.viewportSize();
    for (const width of [320, 360, 390]) {
      await page.setViewportSize({ width, height: viewport.height });
      for (const language of ['en', 'sr']) {
        await page.evaluate((language) => window.__kitchen.ui.getState().setLanguage(language), language);
        await page.waitForFunction((language) => document.querySelector('.room-view-picker strong').textContent
          .startsWith(language === 'sr' ? 'Zid' : 'Wall'), language);
        assert.ok(await workspace.locator('.room-drawing-tools').evaluate((tools) => {
          const picker = tools.querySelector('.room-view-picker');
          const name = document.createRange();
          name.selectNodeContents(picker.querySelector('strong'));
          const text = name.getBoundingClientRect(), bounds = picker.getBoundingClientRect();
          const add = tools.querySelector('.room-add-menu button[aria-expanded]').getBoundingClientRect();
          const controls = [...tools.querySelectorAll('button[aria-label], .room-view-picker')];
          return text.x >= bounds.x && text.right <= bounds.right + .5 && text.right <= add.x
            && controls.every((control) => {
              const r = control.getBoundingClientRect();
              return r.width >= 44 && r.height >= 44
                && control.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
            });
        }), `The wall name and 44px controls must not overlap at ${width}px in ${language}.`);
        assert.ok(await cube.evaluate((button) => {
          const r = button.getBoundingClientRect();
          return r.x >= 0 && r.right <= innerWidth && r.width >= 44 && r.height >= 44
            && button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
        }), `The preview cube must stay reachable at ${width}px in ${language}.`);
      }
    }
    await page.setViewportSize(viewport);
    await page.evaluate(() => window.__kitchen.ui.getState().setLanguage('en'));
  }
  if (review3D) {
    const before = await page.evaluate(() => {
      const s = window.__kitchen.design.getState();
      return { design: s.design, past: s.past, future: s.future };
    });
    await tapOrClick(cube, touch);
    const canvas = workspace.getByTestId('three-viewport').locator('canvas');
    await canvas.waitFor();
    await waitForIdleRendering(page);
    if (!touch) {
      assert.equal(await workspace.locator('[data-room-inset]').count(), 1);
      await workspace.getByRole('button', { name: 'Expand room preview', exact: true }).click();
      assert.equal(await workspace.locator('[data-room-inset]').count(), 0);
    }
    await waitForIdleRendering(page);
    await canvas.click({ position: { x: 5, y: 5 } });
    await page.waitForFunction(() => window.__kitchen.ui.getState().selectedWallId === null);
    await workspace.getByRole('button', { name: 'Back to 2D drawing', exact: true }).click();
    await workspace.getByTestId('wall-elevation').waitFor();
    assert.equal(await workspace.getByRole('combobox', { name: 'Drawing view', exact: true }).inputValue(), 'right');
    assert.equal(await workspace.locator('canvas').count(), 0);
    assert.deepEqual(await page.evaluate(() => {
      const s = window.__kitchen.design.getState();
      return { design: s.design, past: s.past, future: s.future };
    }), before, 'Expanding and collapsing the cube preserves the entire design and Undo history.');
  }
  await page.evaluate((id) => {
    const ui = window.__kitchen.ui.getState();
    ui.setView('plan'); ui.select(id);
  }, original.items[0].id);
  const rotate = page.locator('[data-rotate-element]');
  const box = await rotate.boundingBox();
  assert.ok(box && box.width >= 44 && box.height >= 44 && await rotate.isVisible());
  assert.ok(await rotate.evaluate((b) => {
    const rect = b.getBoundingClientRect(), panel = b.closest('[data-testid="item-sheet"], aside').getBoundingClientRect();
    return rect.y < panel.y + 150 && b.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
  }), 'Rotation must be visible and reachable beside the selected element, not buried in position fields.');
  if (touch) {
    const sheet = page.getByTestId('item-sheet');
    for (const key of ['ArrowUp', 'End', 'Home']) {
      await sheet.getByTestId('sheet-handle').press(key);
      assert.ok(await rotate.isVisible(), 'Rotation stays visible at every sheet size.');
    }
  }
  await tapOrClick(rotate, touch);
  assert.equal((await design(page)).items[0].rotation, 90);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  assert.deepEqual(await design(page), original);
  await page.evaluate(() => window.__kitchen.ui.getState().openRoomPlan());
}

export async function planCornerChecks(page, touch) {
  const workspace = page.getByTestId('room-workspace');
  const plan = workspace.getByTestId('room-plan');
  if (touch) {
    const viewport = page.viewportSize();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(async () => {
      const { createProject } = await import('/src/store/projects.ts');
      createProject('Caption regression');
      const { design, ui } = window.__kitchen;
      ui.getState().setLanguage('sr');
      design.getState().apply((d) => ({ ...d, room: { ...d.room, width: 3000, depth: 3000 } }));
    });
    await plan.getByRole('button', { name: 'Pomeri ugao 2' }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    const area = workspace.locator('.room-area'), caption = workspace.locator('.room-plan-caption');
    const initial = await plan.boundingBox(), captionBox = await caption.boundingBox();
    assert.equal(await area.innerText(), '9 m²');
    await dragDrawing(page, plan.getByRole('button', { name: 'Pomeri ugao 2' }), 660, 0, true, false, async () => {
      await page.waitForFunction(() => document.querySelector('.room-area').innerText !== '9 m²');
      assert.match(await plan.locator('[data-corner-angle="right"]').textContent(), /\d+,\d°/);
      assert.deepEqual(await plan.boundingBox(), initial, 'A longer live area must not resize the drawing under a finger.');
      assert.deepEqual(await caption.boundingBox(), captionBox, 'Prostorija must stay still as its area gains digits.');
    });
    await page.setViewportSize(viewport);
  }
  await page.evaluate(async () => {
    const { createProject } = await import('/src/store/projects.ts');
    const { design, ui } = window.__kitchen;
    ui.getState().setLanguage('en');
    createProject('Corner measurements');
    design.getState().load({ ...design.getState().design, room: { width: 6404, depth: 8885, height: 2600, vertices: [
      { id: 'north', x: 0, y: 0 }, { id: 'slope', x: 4000, y: 0 },
      { id: 'east', x: 6404, y: 2404 }, { id: 'diagonal', x: 6404, y: 8885 },
    ] } });
  });
  const grip = plan.getByRole('button', { name: 'Move corner 3', exact: true });
  await grip.waitFor();
  const start = await design(page);
  const area = await workspace.locator('.room-area').innerText();
  const halo = plan.locator('[data-corner-target="east"]');
  const hit = await halo.boundingBox();
  assert.ok(hit.width >= 43.9 && hit.height >= 43.9, 'A finger should not need to land exactly on the small dot.');
  await tapOrClick(grip, touch);
  assert.equal(await plan.locator('[data-corner-angle="east"]').textContent(), '135°');
  assert.deepEqual(await design(page), start, 'Tapping a corner must not open the inside wall or change the room.');
  await dragDrawing(page, grip, 750, -420, touch, false, async (finger) => {
    await page.waitForFunction(() => window.__kitchen.design.getState().design.room.width > 7000);
    const box = await grip.boundingBox();
    assert.ok(Math.hypot(box.x + box.width / 2 - finger.x, box.y + box.height / 2 - finger.y) < 2, 'The grip must stay under the pointer while the room bounds change.');
    const { room } = await design(page);
    const [a, b, c] = room.vertices.slice(1);
    const degrees = 180 - (Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x)) * 180 / Math.PI;
    assert.equal(await plan.locator('[data-corner-angle="east"]').textContent(), `${Math.round(degrees * 10) / 10}°`);
    for (const i of [1, 2]) {
      const a = room.vertices[i], b = room.vertices[i + 1];
      assert.match(await plan.locator(`[data-wall-dimension="${a.id}"]`).textContent(), new RegExp(String(Math.round(Math.hypot(b.x - a.x, b.y - a.y)))));
    }
    assert.notEqual(await workspace.locator('.room-area').innerText(), area);
    assert.equal(await history(page), 0);
  });
  const moved = await design(page);
  assert.deepEqual(moved.room.vertices.filter((v) => v.id !== 'east'), start.room.vertices.filter((v) => v.id !== 'east'));
  assert.equal(await history(page), 1);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  assert.deepEqual(await design(page), start);
  const topLeft = plan.getByRole('button', { name: 'Move corner 1', exact: true });
  const fixed = await grip.boundingBox();
  await dragDrawing(page, topLeft, -600, -300, touch, true, async () => {
    await page.waitForFunction(() => window.__kitchen.design.getState().design.room.width > 6800);
    const box = await grip.boundingBox();
    assert.ok(Math.hypot(box.x - fixed.x, box.y - fixed.y) < 1, 'Rebasing top/left coordinates must not move any other corner on screen.');
  });
  assert.deepEqual(await design(page), start, 'Cancelling a drag restores its starting shape.');
  assert.equal(await history(page), 0);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await page.reload();
  await grip.waitFor();
  assert.deepEqual(await design(page), moved, 'The saved project must reopen with the new outline.');

  await page.evaluate(async () => {
    const { createDesign } = await import('/src/domain/designOps.ts');
    const d = createDesign('Window constraint');
    d.openings = [{ id: 'window', wall: 'top', wallId: 'top', kind: 'window', width: 900, height: 1000, sill: 900, offset: 2300 }];
    window.__kitchen.design.getState().load(d);
  });
  const savedWindow = (await design(page)).openings[0];
  const topRight = plan.getByRole('button', { name: 'Move corner 2', exact: true });
  await dragDrawing(page, plan.locator('[data-corner-target="right"]'), -1200, 0, touch);
  const limited = await design(page);
  assert.ok(Math.abs(limited.room.vertices[1].x - 3200) <= 1, 'Stop where the window still fits, even if a pointer sample went much further.');
  assert.deepEqual(limited.openings[0], savedWindow);
  await plan.getByRole('status').filter({ hasText: /window/ }).waitFor();
  await topRight.press('Shift+ArrowDown');
  assert.equal((await design(page)).room.vertices[1].y, limited.room.vertices[1].y + 100);
  assert.notEqual(await plan.locator('[data-corner-angle="right"]').textContent(), '90°');
  assert.ok(await plan.isVisible());
}

async function setField(root, name, value) {
  const field = root.getByLabel(name, { exact: true });
  await field.fill(String(value));
  await field.press('Enter');
}

/** Uses only public controls, so the same 320px regression can run against the production build. */
export async function draftedWindowCheck(page) {
  const room = page.getByTestId('room-workspace'), paper = room.getByTestId('wall-elevation');
  await room.getByRole('button', { name: 'Pogledaj zid 1' }).tap();
  const add = async (name) => {
    await room.getByRole('button', { name: 'Dodaj objekat' }).tap();
    await room.getByRole('button', { name, exact: true }).tap();
  };
  const fields = room.getByTestId('selected-room-card');
  await add('Vrata');
  await setField(fields, 'Od početka zida', 2000);
  await add('Prozor');
  for (const [label, value] of [['Širina', 1200], ['Visina', 1200], ['Visina parapeta', 800], ['Od početka zida', 450]]) await setField(fields, label, value);
  await paper.getByRole('button', { name: 'Vrata 1' }).tap();
  await paper.getByRole('button', { name: 'Prozor 1' }).tap();
  assert.deepEqual(await paper.locator('[data-elevation-dimension] text').allTextContents(), ['3600 mm', '2600 mm', '450', '1200', '800', '1200']);
  const readable = await paper.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const labels = [...el.querySelectorAll('[data-elevation-dimension] text')].map((n) => n.getBoundingClientRect());
    const openings = [...el.querySelectorAll('[data-elevation-opening]')];
    const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    return labels.every((r, i) => r.left >= box.left && r.right <= box.right && r.top >= box.top && r.bottom <= box.bottom
      && ![...labels.slice(i + 1), ...openings.map((n) => n.getBoundingClientRect())].some((other) => overlaps(r, other)))
      && openings.every((n) => {
        const r = n.getBoundingClientRect();
        return r.width >= 44 && n.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
      });
  });
  assert.ok(readable, 'All six dimensions must be separate, and both openings must remain visible and tappable after selection.');
  await room.getByRole('button', { name: 'Levo: Zid 4' }).tap();
  assert.equal(await room.getByRole('combobox', { name: 'Izaberi pogled' }).inputValue(), 'left');
}

async function check3DOrbitAndSize(page, id, type, touch) {
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
  const scene = page.getByTestId('room-3d');
  const resize = scene.getByRole('button', { name: 'Resize', exact: true });
  await tapOrClick(resize, touch);
  const label = type === 'feature' ? 'Length along wall' : 'Width';
  const field = scene.getByLabel(label, { exact: true });
  const width = Number(await field.inputValue()) + 100;
  await setField(scene, label, width);
  const updated = await design(page);
  assert.equal((type === 'feature' ? updated.room.features : updated.openings).find((o) => o.id === id).width, width);
  assert.match(await scene.getByTestId('room-readout-3d').innerText(), new RegExp(`${width} ×`));
  assert.equal(await history(page), count + 1);
  await tapOrClick(resize, touch);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  assert.deepEqual(await design(page), before);
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
  const ends = workspace.getByRole('navigation', { name: 'Adjoining walls' });
  await tapOrClick(ends.getByRole('button', { name: 'Left: Wall 1' }), touch);
  assert.equal(await picker.inputValue(), 'sloping');
  await tapOrClick(ends.getByRole('button', { name: 'Right: Wall 2' }), touch);
  assert.equal(await picker.inputValue(), 'east');
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
  assert.equal(await dimension(elevation, 'width').textContent(), '900');
  assert.equal(await dimension(elevation, 'sill').textContent(), '650');
  assert.equal(await elevation.getByTestId('room-readout-2d').count(), 0);
  const opening = elevation.locator(`[data-elevation-opening="${windowId}"]`);
  await opening.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowUp');
  assert.equal((await design(page)).openings.at(-1).offset, 260);
  assert.equal((await design(page)).openings.at(-1).sill, 750);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  const before = await design(page), baseHistory = await history(page);
  await dragDrawing(page, opening, 200, -100, touch, false, async () => {
    await page.waitForFunction(() => window.__kitchen.design.getState().design.openings.at(-1).offset > 250);
    const live = (await design(page)).openings.at(-1);
    assert.equal(await dimension(elevation, 'offset').textContent(), String(live.offset));
    assert.equal(await dimension(elevation, 'sill').textContent(), String(live.sill));
    assert.equal(await history(page), baseHistory);
  });
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
  assert.equal(await dimension(elevation, 'sill').count(), 0);

  // Capture the first rendered position, before ResizeObserver delivers its first size.
  const [initialWall] = await Promise.all([
    workspace.evaluate((root) => new Promise((resolve) => {
      const observer = new MutationObserver(sample);
      function sample() {
        const wall = root.querySelector('[data-wall-id="sloping"] line');
        if (!wall) return;
        observer.disconnect();
        const { x, y } = wall.getBoundingClientRect();
        resolve({ x, y });
      }
      observer.observe(root, { subtree: true, childList: true });
      sample();
    })),
    workspace.getByRole('button', { name: 'Back to room outline' }).click(),
  ]);
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  const fittedWall = await plan.locator('[data-wall-id="sloping"] line').evaluate((wall) => {
    const { x, y } = wall.getBoundingClientRect();
    return { x, y };
  });
  assert.ok(Math.hypot(initialWall.x - fittedWall.x, initialWall.y - fittedWall.y) < 1,
    `Returning to the outline must not move the wall underneath the first click: ${JSON.stringify({ initialWall, fittedWall })}`);
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
  assert.equal(await dimension(elevation, 'width').textContent(), '550');
  await workspace.getByRole('button', { name: 'Back to room outline' }).click();
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
      await check3DOrbitAndSize(page, f.id, 'feature', false);
      assert.equal(await workspace.getByTestId('room-readout-3d').innerText(), readout);
      await workspace.getByTestId('room-edit-position-2d').click();
      await page.waitForFunction((id) => document.activeElement?.getAttribute('data-plan-feature') === id, f.id);
      assert.equal(await workspace.getByTestId('room-3d').count(), 0, 'Return to 2D must uncover the object being edited.');
    }
    await showRoomModel(page);
    await check3DOrbitAndSize(page, f.id, 'feature', touch);
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
    assert.equal(await dimension(elevation, 'offset').textContent(), String(offset));
  }
  assert.equal((await design(page)).openings[0].wallId, undefined, 'inspecting the legacy opening does not rewrite it');
  if (three) {
    await showRoomModel(page);
    assert.match(await workspace.locator('[data-measure="opening:legacy-door"]').innerText(), /From wall start: 1500 mm/);
    assert.match(await workspace.locator('[data-measure="opening:legacy-window"]').innerText(), /From wall start: 2800 mm/);
    await check3DOrbitAndSize(page, 'legacy-door', 'opening', touch);
    await page.getByTestId('room-edit-position-2d').click();
    await elevation.waitFor();
    assert.equal(await card.getByLabel('Wall', { exact: true }).inputValue(), 'west');
  }
  const saved = await design(page);
  await page.evaluate(async () => (await import('/src/store/projects.ts')).flushSave());
  await page.reload();
  await workspace.waitFor();
  assert.deepEqual(await design(page), saved);
  console.log(`  PASS ${touch ? 'touch' : 'mouse'} wall elevation, floor-level door, 10/100 mm nudges, sloped/free chimney, legacy offsets, reload${three ? ', 3D orbit, resize and 2D hand-off' : ''}`);
}

export async function chimneyCornerCheck(page, touch) {
  await page.evaluate(async () => {
    const { createDesign } = await import('/src/domain/designOps.ts');
    const { createItem } = await import('/src/domain/catalog.ts');
    const d = createDesign('Corner beside a chimney');
    d.room = { width: 3671, depth: 3000, height: 2600, features: [
      { id: 'flue', kind: 'chimney', wallId: 'top', x: 3171, y: 0, offset: 3171, width: 500, depth: 500 },
    ] };
    d.items = [[0, 0], [0, 2440], [3071, 2440]].map(([x, y]) => createItem('base', [], { x, y }));
    window.__kitchen.design.getState().load(d);
    const ui = window.__kitchen.ui.getState();
    ui.setLanguage('sr'); ui.openRoomPlan(); ui.setSnapEnabled(true); ui.setGridSize(10);
  });
  const room = page.getByTestId('room-workspace'), plan = room.getByTestId('room-plan');
  const feature = plan.locator('[data-plan-feature="flue"]');
  await tapOrClick(feature, touch);
  const original = await design(page), f = async () => (await design(page)).room.features[0];
  const widthGrip = plan.locator('[data-feature-grip="width:-1"] circle');
  await dragDrawing(page, widthGrip, -300, 0, touch, false, async () => {
    await page.waitForFunction(() => window.__kitchen.design.getState().design.room.features[0].width > 750);
    assert.equal(await history(page), 0);
    assert.equal((await f()).offset + (await f()).width, 3671);
  });
  assert.ok(Math.abs((await f()).width - 800) <= 10);
  assert.equal(await history(page), 1);
  const undo = page.getByRole('button', { name: 'Korak unazad', exact: true });
  await undo.click();
  assert.deepEqual(await design(page), original);
  await dragDrawing(page, plan.locator('[data-feature-grip="depth:1"] circle'), 0, 200, touch, true, async () => {
    await page.waitForFunction(() => window.__kitchen.design.getState().design.room.features[0].depth > 650);
  });
  assert.deepEqual(await design(page), original);
  assert.equal(await history(page), 0);
  await setField(room.getByTestId('selected-room-card'), 'Dužina uz zid', 800);
  assert.equal((await f()).offset, 2871);
  await undo.click();
  await page.getByRole('radio', { name: '2. Raspored', exact: true }).click();
  if (touch) await page.locator('[data-add-trigger]').tap();
  await page.getByRole('searchbox').fill('ugaoni');
  await tapOrClick(page.locator('[data-preset="corner"]'), touch);
  if (touch) await page.keyboard.press('Escape');
  const added = await design(page), corner = added.items.at(-1);
  assert.deepEqual([corner.kind, corner.x, corner.y, corner.rotation], ['corner', 2271, 0, 90]);
  assert.equal(await page.evaluate(() => window.__kitchen.ui.getState().selectedId), corner.id);
  assert.deepEqual(added.room, original.room);
  await undo.click();
  assert.deepEqual(await design(page), original);
  if (!touch) {
    const tile = page.locator('[data-preset="corner"]'), stage = page.locator('.konvajs-content');
    const drop = async (x, y) => {
      const targetPosition = await page.evaluate(([x, y]) => {
        const { pan, zoom } = window.__kitchen.ui.getState();
        return { x: pan.x + x * zoom, y: pan.y + y * zoom };
      }, [x, y]);
      await tile.dragTo(stage, { targetPosition });
    };
    await drop(3620, 575);
    const next = (await design(page)).items.at(-1);
    assert.deepEqual([next.kind, next.x, next.y, next.rotation], ['corner', 2771, 500, 90], 'A library drag can choose the other chimney face.');
    await undo.click();
    await drop(70, 80);
    await page.getByText(/^Ugaoni element ovde ne staje/).waitFor();
    assert.deepEqual(await design(page), original, 'A drop on the occupied side must not insert a colliding cabinet.');
    assert.equal(await history(page), 0);
  }
  await page.getByRole('radio', { name: '1. Prostorija', exact: true }).click();
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
  await workspace.getByRole(compact ? 'button' : 'tab', { name: 'Boje i pločice' }).click();
  await workspace.getByRole('button', { name: 'Boja zidova: Maslina' }).click();
  await workspace.getByRole(compact ? 'button' : 'tab', { name: 'Mere', exact: true }).click();
  assert.equal(await plan.locator('[data-plan-cabinet]').count(), 0, 'The room drawing starts without kitchen outlines.');
  await workspace.getByLabel('Prikaži obrise kuhinje kao orijentir').check();
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
  assert.ok(await plan.isVisible(), 'Keyboard wall selection leaves the outline open.');
  await plan.locator('[data-wall-view="bottom"]').press('Enter');
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
  await picker.selectOption('');
  await tapOrClick(plan.getByRole('button', { name: 'Pogledaj zid 6', exact: true }), compact);
  assert.equal(await picker.inputValue(), 'divider:-1');
  const ends = workspace.getByRole('navigation', { name: 'Susedni zidovi' });
  assert.equal(await ends.getByText('Slobodan kraj', { exact: true }).count(), 2);
  assert.equal(await ends.getByRole('button').count(), 0);
  assert.equal(await elevation.getByRole('button', { name: 'Visina do plafona: 2700 mm' }).count(), 0);
  await elevation.getByText('1700 mm', { exact: true }).waitFor();
  const beforeFace = await design(page);
  await tapOrClick(elevation.getByRole('button', { name: 'Prozor 1' }), compact);
  assert.equal(await picker.inputValue(), 'divider:1');
  assert.equal(await workspace.getByTestId('selected-room-card').getByLabel('Od početka zida').inputValue(), '200');
  assert.equal(await dimension(elevation, 'offset').textContent(), '200');
  assert.deepEqual(await design(page), beforeFace, 'Inspecting the opposite face does not rewrite the opening');
  await page.evaluate(() => window.__kitchen.ui.getState().setLanguage('en'));
}

export async function roomObjectChecks(page, output) {
  await workspaceObjectChecks(page);
  await page.screenshot({ path: path.join(output, 'room-object-workspace.png') });
}
