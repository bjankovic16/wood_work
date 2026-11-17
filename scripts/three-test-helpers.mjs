import assert from 'node:assert/strict';

/** Opens the "Tools" panel of the 3D toolbar, where the advanced and selected-cabinet tools live. */
export async function open3DTools(page) {
  const toggle = page.getByTestId('three-tools-toggle');
  await toggle.waitFor();
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await page.getByTestId('three-tools').waitFor();
}

export async function close3DTools(page) {
  const toggle = page.getByTestId('three-tools-toggle');
  await toggle.waitFor();
  if (await toggle.getAttribute('aria-expanded') === 'true') await toggle.click();
  await page.getByTestId('three-tools').waitFor({ state: 'detached' });
}

/**
 * Waits until the 3D view has drawn nothing for `quietMs`, so a check of idle rendering does not count frames
 * from textures or lighting that are still arriving. A view that never stops drawing returns after `timeoutMs`
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

export async function movementHandle(page, axis, distance = 0, toolName = 'kitchen-move-tool') {
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
