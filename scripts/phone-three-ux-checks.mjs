import assert from 'node:assert/strict';
import { open3DTools, waitForIdleRendering } from './three-test-helpers.mjs';

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
  assert.deepEqual(await page.getByTestId('three-toolbar').getByRole('button').allInnerTexts(), ['View']);
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
  await page.touchscreen.tap(14, 14); // This was underneath the bar before orbiting.
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
  await page.getByTestId('phone-view-toggle').focus();
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
        await page.route('**/src/components/three/Kitchen3D.tsx*', async (route) => { await gate; await route.continue(); });
        try {
          await page.getByRole('radio', { name: '3D', exact: true }).tap();
          await page.getByRole('button', { name: 'View', exact: true }).tap();
          assert.equal(await page.evaluate(() => Boolean(window.__kitchen3D)), false, 'This tap deliberately precedes the lazy scene mount.');
        } finally { release(); }
        await page.getByTestId('phone-view-sheet').getByRole('button', { name: 'Close', exact: true }).tap();
      } else {
        await page.getByRole('radio', { name: '3D', exact: true }).tap();
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
      await page.getByRole('radio', { name: '3D', exact: true }).tap();
      await ready(page);
      assert.equal(await tip.count(), 0, 'Reloading must not resurrect the first-visit tip.');
      await open3DTools(page);
      await page.getByRole('button', { name: 'Show 3D navigation tip' }).tap();
      await tip.waitFor();
      await waitForIdleRendering(page);
      const frame = await page.evaluate(() => window.__kitchen3D.renderer.info.render.frame);
      await page.waitForTimeout(350);
      assert.equal(await page.evaluate(() => window.__kitchen3D.renderer.info.render.frame), frame, 'Showing help must not animate the renderer.');
      if (mode === 'editor') await checkHistory(page);
      else {
        const before = await state(page);
        await open3DTools(page);
        const [file] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByTestId('customer-export').tap()]);
        assert.match(file.suggestedFilename(), /\.html$/);
        assert.equal(await file.failure(), null);
        assert.deepEqual(await state(page), before, 'Exporting the offline view must not change the design or history.');
      }
    } finally { await context.close(); }
  }
}
