import assert from 'node:assert/strict';

export async function showRoomModel(page) {
  const room = page.getByTestId('room-workspace');
  if (page.viewportSize().width < 1024) await room.locator('.room-view-picker select').selectOption({ label: 'Room model' });
  else await room.getByRole('radio', { name: 'Room model', exact: true }).click();
}

/** A real canvas tap restores the overlaid phone bars; it must not change the selection. */
export async function revealPhone3DChrome(page) {
  const toggle = page.getByTestId('phone-view-toggle');
  await toggle.waitFor({ state: 'attached' });
  if (!await toggle.isVisible()) {
    await page.getByTestId('three-viewport').locator('canvas').tap({ position: { x: 16, y: 20 } });
    await toggle.waitFor();
  }
}

/** Desktop Tools stays docked. Phones share a modal View sheet between the room and the editor. */
export async function open3DTools(page) {
  if (page.viewportSize().width < 1024) {
    const sheet = page.getByTestId('phone-view-sheet');
    if (!await sheet.isVisible()) {
      await revealPhone3DChrome(page);
      await page.getByTestId('phone-view-toggle').click();
    }
    await sheet.waitFor();
    return;
  }
  const toggle = page.getByTestId('three-tools-toggle');
  await toggle.waitFor();
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await page.getByTestId('three-tools').waitFor();
}

export async function close3DTools(page) {
  if (page.viewportSize().width < 1024) {
    const sheet = page.getByTestId('phone-view-sheet');
    if (await sheet.isVisible()) await page.keyboard.press('Escape');
    await sheet.waitFor({ state: 'detached' });
    return;
  }
  const toggle = page.getByTestId('three-tools-toggle');
  await toggle.waitFor();
  if (await toggle.getAttribute('aria-expanded') === 'true') await toggle.click();
  await page.getByTestId('three-tools').waitFor({ state: 'detached' });
}

/**
 * Waits until the 3D view has drawn nothing for `quietMs`, so a check of idle rendering does not count frames
 * from textures or camera updates that are still arriving. A view that never stops drawing returns after `timeoutMs`
 * and fails the idle check that follows.
 */
export async function waitForIdleRendering(page, { quietMs = 300, timeoutMs = 5000 } = {}) {
  await page.evaluate(({ quietMs, timeoutMs }) => new Promise((resolve) => {
    const frame = () => window.__kitchen3D.renderer.info.render.frame;
    const start = performance.now();
    let last = frame();
    let since = start;
    const poll = () => {
      const now = performance.now();
      const current = frame();
      if (current !== last) { last = current; since = now; }
      if (now - since >= quietMs || now - start >= timeoutMs) resolve();
      else setTimeout(poll, 50);
    };
    poll();
  }), { quietMs, timeoutMs });
}

/** Check the rendered scene, not just its settings. The count also catches legacy LED/glow meshes. */
export async function assertNeutralScene(page) {
  const { meshes, ambient, effects } = await page.evaluate(() => {
    const { renderer, scene } = window.__kitchen3D;
    const effects = new Set();
    let meshes = 0, ambient = false;
    if (renderer.shadowMap.enabled) effects.add('shadow map');
    if (scene.environment) effects.add('environment lighting rig');
    scene.traverse((node) => {
      if (node.isLight) {
        if (node.isAmbientLight && node.color.getHex() === 0xffffff && node.intensity > 0) ambient = true;
        else effects.add(node.type);
      }
      if (node.castShadow || node.receiveShadow) effects.add('shadow caster/receiver');
      if (!node.isMesh) return;
      meshes++;
      for (const material of [node.material].flat()) {
        if (material.emissive?.getHex() && material.emissiveIntensity > 0) effects.add('emissive surface');
      }
    });
    return { meshes, ambient, effects: [...effects] };
  });
  assert.ok(meshes > 0 && ambient, 'Expected a model with neutral ambient illumination.');
  assert.deepEqual(effects, [], 'The model must not include decorative lights, emissions or shadows.');
  return meshes;
}

export async function cabinetBodyDrag(page, axis = 'X', distance = 0, id) {
  await waitForIdleRendering(page);
  return page.evaluate(async ({ axis, distance, id }) => {
    const { localToRoom } = await import('/src/domain/geometry.ts');
    const item = window.__kitchen.design.getState().design.items.find((entry) => entry.id === (id ?? window.__kitchen.ui.getState().selectedId));
    if (!item) throw new Error('No cabinet is selected for body dragging.');
    const { camera } = window.__kitchen3D;
    camera.updateMatrixWorld(true);
    const point = localToRoom(item, item.width / 2, item.depth * 0.6);
    const from = camera.position.clone().set(point.x / 1000, (item.elevation + item.height + 35) / 1000, point.y / 1000);
    const to = from.clone();
    to[axis.toLowerCase()] += distance;
    const box = document.querySelector('main canvas').getBoundingClientRect();
    const screen = (value) => {
      value.project(camera);
      return { x: box.x + (value.x + 1) * box.width / 2, y: box.y + (1 - value.y) * box.height / 2 };
    };
    const points = { from: screen(from), to: screen(to) };
    if (document.elementFromPoint(points.from.x, points.from.y)?.tagName !== 'CANVAS') throw new Error('The cabinet body is hidden by a control.');
    return points;
  }, { axis, distance, id });
}

export async function resizeArrowDrag(page, field = 'width', distance = 0.15) {
  await page.waitForFunction((field) => Boolean(window.__kitchen3D?.scene.getObjectByName(`resize-arrow-head-${field}`)), field);
  await waitForIdleRendering(page);
  const points = await page.evaluate(({ field, distance }) => {
    const item = window.__kitchen.design.getState().design.items.find((entry) => entry.id === window.__kitchen.ui.getState().selectedId);
    const { camera, scene } = window.__kitchen3D;
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const arrow = scene.getObjectByName(`resize-arrow-${field}`);
    const head = scene.getObjectByName(`resize-arrow-head-${field}`);
    const axis = camera.position.clone().set(0, 1, 0).applyQuaternion(arrow.getWorldQuaternion(camera.quaternion.clone()));
    const angle = item.rotation * Math.PI / 180;
    const expected = field === 'height' ? [0, 1, 0] : field === 'width' ? [Math.cos(angle), 0, Math.sin(angle)] : [-Math.sin(angle), 0, Math.cos(angle)];
    if (!axis.toArray().every((value, index) => Math.abs(value - expected[index]) < 0.000001)) throw new Error(`${field} arrow points in the wrong cabinet-local direction.`);
    const point = head.getWorldPosition(camera.position.clone());
    const end = point.clone().addScaledVector(axis, distance);
    const startScreen = point.clone().project(camera);
    const endScreen = end.project(camera);
    const box = document.querySelector('main canvas').getBoundingClientRect();
    const delta = { x: (endScreen.x - startScreen.x) * box.width / 2, y: -(endScreen.y - startScreen.y) * box.height / 2 };
    const from = { x: box.x + (startScreen.x + 1) * box.width / 2, y: box.y + (1 - startScreen.y) * box.height / 2 };
    const movement = Math.hypot(delta.x, delta.y) < 3
      ? field === 'height' ? { x: 0, y: -distance * 400 } : { x: distance * 400, y: 0 } : delta;
    const picker = scene.getObjectByName(`resize-arrow-picker-${field}`);
    const radius = picker.getWorldScale(camera.position.clone()).x * 26;
    const right = camera.position.clone().setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(radius);
    const left = point.clone().sub(right).project(camera);
    const rightScreen = point.clone().add(right).project(camera);
    return { from, to: { x: from.x + movement.x, y: from.y + movement.y }, targetWidth: Math.abs(rightScreen.x - left.x) * box.width / 2 };
  }, { field, distance });
  assert.ok(points.targetWidth >= 60, `${field} enlarged arrow needs at least a 60px touch target.`);
  assert.equal(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, points.from), 'CANVAS',
    `${field} arrow must not be hidden behind another control.`);
  return points;
}

export async function movementHandle(page, axis, distance, toolName) {
  await page.waitForFunction((name) => Boolean(window.__kitchen3D.scene.getObjectByName(name)), toolName);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return page.evaluate(({ axis, distance, toolName }) => {
    const { scene, camera } = window.__kitchen3D;
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const candidates = [];
    scene.getObjectByName(toolName).traverse((object) => {
      if (!object.isMesh || object.name !== axis) return;
      for (let parent = object; parent; parent = parent.parent) if (!parent.visible) return;
      object.geometry.computeBoundingBox();
      const box = object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld);
      candidates.push(box.getCenter(camera.position.clone()));
    });
    const coordinate = axis.toLowerCase();
    candidates.sort((a, b) => b[coordinate] - a[coordinate]);
    if (!candidates.length) throw new Error(`No visible ${axis} movement handle was rendered.`);
    const start = candidates[0];
    const end = start.clone();
    end[coordinate] += distance;
    const rect = document.querySelector('main canvas').getBoundingClientRect();
    const screen = (point) => {
      point.project(camera);
      return { x: rect.x + (point.x + 1) * rect.width / 2, y: rect.y + (1 - point.y) * rect.height / 2 };
    };
    return { from: screen(start), to: screen(end) };
  }, { axis, distance, toolName });
}

export async function assertScenePlacement(page, id) {
  const placement = await page.evaluate(async (id) => {
    const { localToRoom } = await import('/src/domain/geometry.ts');
    const item = window.__kitchen.design.getState().design.items.find((candidate) => candidate.id === id);
    const object = window.__kitchen3D.scene.getObjectByName(id);
    const anchor = localToRoom(item, 0, 0);
    return {
      actual: [...object.position.toArray(), object.rotation.y],
      expected: [anchor.x / 1000, item.elevation / 1000, anchor.y / 1000, -item.rotation * Math.PI / 180],
    };
  }, id);
  assert.ok(placement.actual.every((value, index) => Math.abs(value - placement.expected[index]) < 0.000001),
    `The rendered cabinet must match its saved placement: ${JSON.stringify(placement)}`);
}

/** A drag starting on the selected cabinet navigates the camera, never previews or commits a translation. */
export async function assertBodyOrbits(page, id, touch = false) {
  const design = () => page.evaluate(() => window.__kitchen.design.getState().design);
  assert.equal(await page.getByRole('button', { name: 'Move cabinet', exact: true }).count(), 0);
  assert.equal(await page.evaluate(() => window.__kitchen.ui.getState().selectedId), id, 'orbit starts on the selected cabinet');
  const { from, to } = await cabinetBodyDrag(page, 'X', 0.65, id);
  // From a straight-down view pure azimuth spins around the pole with almost no position change.
  const box = await page.locator('main canvas').boundingBox();
  to.y = Math.max(box.y + 2, from.y - 36);
  const before = await design();
  const history = await page.evaluate(() => window.__kitchen.design.getState().past.length);
  const camera = await page.evaluate(() => window.__kitchen3D.camera.matrixWorld.toArray());
  const session = touch ? await page.context().newCDPSession(page) : null;
  try {
    if (session) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
      for (let step = 1; step <= 8; ++step) {
        await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{
          x: from.x + (to.x - from.x) * step / 8, y: from.y + (to.y - from.y) * step / 8,
        }] });
      }
    } else {
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps: 8 });
    }
    await page.waitForFunction((initial) => window.__kitchen3D.camera.matrixWorld.toArray().some((v, i) => Math.abs(v - initial[i]) > 0.001), camera);
    assert.deepEqual(await design(), before);
    assert.equal(await page.evaluate(() => window.__kitchen.design.getState().gestureBase), null);
    await assertScenePlacement(page, id);
    if (session) await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    else await page.mouse.up();
    assert.deepEqual(await design(), before);
    assert.equal(await page.evaluate(() => window.__kitchen.design.getState().past.length), history);
    await assertScenePlacement(page, id);
  } finally { await session?.detach(); }
}
