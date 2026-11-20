import assert from 'node:assert/strict';
import { close3DTools, open3DTools, showRoomModel, waitForIdleRendering } from './three-test-helpers.mjs';

const ready = (page) => page.waitForFunction(() => window.__kitchen3D?.scene.getObjectByName('room-floor'));
const state = (page) => page.evaluate(() => {
  const { design, gestureBase, past, future } = window.__kitchen.design.getState();
  return { design, gestureBase, past: past.length, future: future.length };
});

/** Include overlaid chrome in the measurement, not just the underlying canvas element's bounding box. */
async function checkChrome(page, mode) {
  const usableTop = await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="three-viewport"] canvas');
    for (let y = Math.max(0, Math.ceil(canvas.getBoundingClientRect().top)); y < innerHeight; y++)
      if ([1, 0.5 * innerWidth, innerWidth - 2].every((x) => document.elementFromPoint(x, y) === canvas)) return y;
    return Infinity;
  });
  assert.ok(usableTop <= 120, `${mode}: ${usableTop} CSS px of chrome above the tappable canvas at 390×844`);
  assert.deepEqual(await page.getByTestId('three-toolbar').getByRole('button').allInnerTexts(), mode === 'editor' ? ['View', 'Share'] : ['View']);
  if (mode === 'editor') {
    const canvas = await page.getByTestId('three-viewport').boundingBox();
    const tabs = await page.getByRole('navigation', { name: 'Design workspace' }).boundingBox();
    assert.ok(Math.abs(canvas.y + canvas.height - tabs.y) < 1, 'No checks/next row should separate kitchen 3D from its bottom tabs.');
  }
  for (const name of ['Undo', 'Redo']) {
    const button = page.getByRole('button', { name, exact: true });
    const bounds = await button.boundingBox();
    assert.deepEqual([bounds.width, bounds.height, await button.innerText()], [44, 44, '']);
    assert.ok(await button.isDisabled());
  }
  console.log(`  ${mode}, 390×844: first fully tappable canvas row y=${usableTop}; Undo/Redo 44×44.`);
}

async function checkOrbit(page) {
  const canvas = page.getByTestId('three-viewport').locator('canvas');
  const bounds = await canvas.boundingBox();
  const tip = page.getByTestId('three-tip');
  const toggle = page.getByTestId('phone-view-toggle');
  const matrix = () => page.evaluate(() => window.__kitchen3D.camera.matrixWorld.toArray());
  const changedSince = (initial) => page.waitForFunction((initial) =>
    window.__kitchen3D.camera.matrixWorld.toArray().some((n, i) => Math.abs(n - initial[i]) > 0.001), initial);
  const before = await state(page);
  const initial = await matrix();
  const from = { x: 90, y: 255 };
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  try {
    await touch('touchStart', [from]);
    await touch('touchMove', [{ x: from.x + 1, y: from.y }]);
    assert.ok(await toggle.isVisible() && await tip.isVisible(), 'A press or finger jitter is not a drag.');
    await touch('touchMove', [{ x: 125, y: 240 }]);
    await toggle.waitFor({ state: 'hidden' });
    await tip.waitFor({ state: 'detached' });
    await changedSince(initial);
    const during = await matrix();
    await touch('touchMove', [{ x: 162, y: 214 }]);
    await changedSince(during);
    assert.deepEqual(await canvas.boundingBox(), bounds, 'Hiding chrome must not resize or shift the active orbit.');
    assert.deepEqual(await state(page), before);
    await touch('touchEnd', []);
  } finally { await cdp.detach(); }
  assert.ok(!await toggle.isVisible(), 'Lifting a drag is not the tap that restores the chrome.');
  await page.evaluate(() => window.__kitchen.ui.getState().select('fixed-cabinet'));
  await canvas.tap({ position: { x: 14, y: 14 } });
  await toggle.waitFor();
  assert.deepEqual(await canvas.boundingBox(), bounds);
  assert.deepEqual(await state(page), before);
  assert.equal(await page.evaluate(() => window.__kitchen.ui.getState().selectedId), 'fixed-cabinet', 'Revealing the bar must not clear the selection.');
  assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('kitchen-designer:preferences')).state.moveHintSeen));
}

async function checkHistory(page) {
  const name = page.getByRole('textbox', { name: 'Project name' });
  const previous = await name.inputValue();
  await name.fill('Workshop test');
  await name.press('Enter');
  const undo = page.getByRole('button', { name: 'Undo', exact: true });
  const redo = page.getByRole('button', { name: 'Redo', exact: true });
  await page.waitForFunction(() => window.__kitchen.design.getState().design.name === 'Workshop test');
  await name.focus();
  await page.keyboard.press('Tab');
  assert.ok(await undo.evaluate((b) => b === document.activeElement));
  await page.getByRole('tooltip').getByText('Undo (Ctrl+Z)', { exact: true }).waitFor();
  assert.equal(await name.inputValue(), 'Workshop test', 'Explaining the history icon must not undo the edit.');
  await undo.tap();
  assert.equal(await name.inputValue(), previous);
  assert.ok(await undo.isDisabled() && await redo.isEnabled());
  await redo.tap();
  assert.equal(await name.inputValue(), 'Workshop test');
  assert.ok(await redo.isDisabled());
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByTestId('phone-view-toggle').waitFor({ state: 'detached' });
  assert.equal(await undo.innerText(), 'Undo', 'The desktop control keeps its visible label.');
}

async function checkWalls(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    const store = window.__kitchen.design.getState(), { design } = store;
    const vertices = [[0, 0], [3000, 0], [3600, 600], [3600, 3000], [0, 3000]].map(([x, y], i) => ({ id: `edge${i}`, x, y }));
    store.load({ ...design, room: { ...design.room, vertices,
      partitions: [{ id: 'half', start: { x: 1200, y: 1700 }, end: { x: 2800, y: 1700 }, thickness: 100, height: 1600 }],
      treatments: [{ id: 'panel', wallId: 'half:-1', offset: 0, width: 200, elevation: 0, height: 400, finish: 'oak' }] },
      items: [{ ...design.items[0], x: 1600, y: 0, rotation: 0 }], style: { ...design.style, backsplash: 'stone' }, openings: [
        { id: 'entry', kind: 'door', wall: 'top', offset: 200, width: 800, sill: 0, height: 2000 },
        { id: 'hatch', kind: 'window', wall: 'top', wallId: 'half:-1', offset: 500, width: 600, sill: 400, height: 600 },
      ] });
    window.__kitchen.ui.getState().setLanguage('sr');
  });
  const before = await state(page);
  const sheet = page.getByTestId('phone-view-sheet');
  const openWalls = async () => { await open3DTools(page); await sheet.getByText('Zidovi', { exact: true }).tap(); };
  const expectMeshes = (present, absent) => page.waitForFunction(({ present, absent }) => {
    const scene = window.__kitchen3D?.scene;
    return scene && present.every((n) => scene.getObjectByName(n)) && absent.every((n) => !scene.getObjectByName(n));
  }, { present, absent });
  const fixed = ['fixed-cabinet', 'room-floor', 'room-wall-edge1-0'];
  const perimeter = ['room-wall-edge0-0', 'room-opening-entry', 'kitchen-backsplash-edge0-0'];
  const partition = ['room-wall-half:1-0', 'room-opening-hatch', 'wall-finish-panel-0'];
  await expectMeshes([...fixed, ...perimeter, ...partition], []);
  await openWalls();
  assert.equal(await sheet.getByRole('checkbox').count(), 6, 'Five perimeter segments and one control for both faces of the partition.');
  await sheet.getByRole('checkbox', { name: /^Zid 1/ }).tap();
  await expectMeshes([...fixed, ...partition], perimeter);
  await sheet.getByRole('checkbox', { name: /^Pregradni zid 1/ }).tap();
  await expectMeshes(fixed, [...perimeter, ...partition]);
  assert.equal(await sheet.getByRole('combobox', { name: 'Vrata, prozori i strukture' }).count(), 0);
  await sheet.getByRole('button', { name: 'Studio', exact: true }).tap();
  await expectMeshes(fixed, [...perimeter, ...partition]);
  await page.getByRole('radio', { name: '4. Krojna lista', exact: true }).tap();
  await page.getByRole('radio', { name: '3. 3D', exact: true }).tap();
  await expectMeshes(fixed, [...perimeter, ...partition]);
  await openWalls();
  await sheet.getByRole('checkbox', { name: /^Zid 1/ }).tap();
  await expectMeshes([...fixed, ...perimeter], partition);
  await sheet.getByRole('button', { name: 'Prikaži sve zidove' }).tap();
  await expectMeshes([...fixed, ...perimeter, ...partition], []);
  assert.deepEqual(await state(page), before, 'Hiding and restoring walls is not a project edit or an undo step.');
}

/** Independent fresh contexts so a previous usability check cannot accidentally mark either first tip seen. */
export async function checkPhoneThreeUX(browser, url) {
  for (const mode of ['room', 'editor']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'en-US', reducedMotion: 'reduce' });
    try {
      const page = await context.newPage();
      await page.goto(url);
      if (mode === 'editor') await page.getByTestId('room-done').tap();
      await page.evaluate(async () => {
        const { createItem } = await import('/src/domain/catalog.ts');
        const store = window.__kitchen.design.getState();
        store.load({ ...store.design, items: [{ ...createItem('base', [], { x: 1200, y: 1200 }), id: 'fixed-cabinet' }] });
      });
      // Start timing at the actual DOM presentation, independent of how fast the GPU initializes.
      await page.evaluate(() => {
        const observer = new MutationObserver(() => {
          if (document.querySelector('[data-testid="three-tip"]')) window.__tipStart ??= performance.now();
          else if (window.__tipStart) { window.__tipDuration = performance.now() - window.__tipStart; observer.disconnect(); }
        });
        observer.observe(document.body, { childList: true, subtree: true });
      });
      if (mode === 'room') {
        let release;
        const gate = new Promise((resolve) => { release = resolve; });
        await page.route('**/src/components/three/RoomReview3D.tsx*', async (route) => { await gate; await route.continue(); });
        try {
          await showRoomModel(page);
          await page.getByRole('button', { name: 'View', exact: true }).tap();
          assert.equal(await page.evaluate(() => Boolean(window.__kitchen3D)), false, 'This tap deliberately precedes the lazy scene mount.');
        } finally { release(); }
        await page.getByTestId('phone-view-sheet').getByRole('button', { name: 'Close', exact: true }).tap();
      } else {
        await page.getByRole('radio', { name: '3. 3D', exact: true }).tap();
      }
      await ready(page);
      await checkChrome(page, mode);
      const tip = page.getByTestId('three-tip');
      await tip.waitFor();
      if (mode === 'editor') {
        await tip.waitFor({ state: 'detached', timeout: 8500 });
        const ms = await page.evaluate(() => window.__tipDuration);
        assert.ok(ms >= 5900 && ms < 8000, `First tip should last six seconds (observed ${ms} ms).`);
        console.log(`  Editor first tip timed out after ${Math.round(ms)} ms.`);
        await open3DTools(page);
        await page.getByRole('button', { name: 'Show 3D navigation tip' }).tap();
        await tip.waitFor();
      }
      await checkOrbit(page);
      await page.reload();
      if (mode === 'room') await page.getByRole('radio', { name: '1. Room', exact: true }).tap();
      if (mode === 'room') await showRoomModel(page);
      else await page.getByRole('radio', { name: '3. 3D', exact: true }).tap();
      await ready(page);
      assert.equal(await tip.count(), 0, 'Reloading must not resurrect the first-visit tip.');
      await open3DTools(page);
      await page.getByRole('button', { name: 'Show 3D navigation tip' }).tap();
      await tip.waitFor();
      await waitForIdleRendering(page);
      const frame = await page.evaluate(() => window.__kitchen3D.renderer.info.render.frame);
      await page.waitForTimeout(350);
      assert.equal(await page.evaluate(() => window.__kitchen3D.renderer.info.render.frame), frame, 'Showing help must not animate the renderer.');
      if (mode === 'editor') {
        const before = await state(page);
        await open3DTools(page);
        assert.equal(await page.getByTestId('phone-view-sheet').getByRole('button', { name: 'Share', exact: true }).count(), 0);
        assert.match(await page.getByTestId('phone-view-sheet').innerText(), /Tap an object.*pinch to zoom/i);
        await close3DTools(page);
        await page.evaluate(() => Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false }));
        const [file] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByRole('button', { name: 'Share', exact: true }).tap()]);
        assert.match(file.suggestedFilename(), /\.html$/);
        assert.equal(await file.failure(), null);
        assert.deepEqual(await state(page), before, 'Exporting the offline view must not change the design or history.');
        await checkHistory(page);
        await checkWalls(page);
      } else assert.equal(await page.getByTestId('customer-share').count(), 0);
    } finally { await context.close(); }
  }
}
