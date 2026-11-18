// The same 2D drag with deterministic pointer bursts. No profiling hooks in the shipped app.
// PROFILE_ROOT can point at an earlier checkout; PROFILE_BASELINE=1 measures without enforcing the new budgets.
// PROFILE_TIMING_ONLY=1 turns off precise JS coverage (itself a performance cost) for frame-time comparisons.
import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const root = path.resolve(process.env.PROFILE_ROOT || '.');
const baseline = process.env.PROFILE_BASELINE === '1';
const timingOnly = process.env.PROFILE_TIMING_ONLY === '1';
const batches = 24;
const burst = 5;
const server = await createServer({ root, cacheDir: path.resolve('test-results/drag', baseline ? 'cache-before' : 'cache-after'),
  logLevel: 'error', server: { host: '127.0.0.1', port: 0, fs: { allow: [root, path.resolve('node_modules')] } } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, hasTouch: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.__kitchen);
  await page.evaluate(async () => {
    const { createKitchenDesign, KITCHEN_DESIGNS } = await import('/src/domain/kitchens.ts');
    const design = createKitchenDesign(KITCHEN_DESIGNS.find((preset) => preset.id === 'chimney-frame'), 'Chimney drag');
    // Keep the entire dense scene, with one accessible cabinet and a reproducible 1150 mm drag path.
    const item = design.items.find((entry) => entry.kind === 'drawer' || entry.kind === 'base');
    Object.assign(item, { x: 1250, y: 1450, rotation: 0 });
    window.fixture = { design, id: item.id };
    const ui = window.__kitchen.ui.getState();
    ui.setRoomOpen(false);
    ui.setLanguage('en');
    ui.setSnapEnabled(true);
    ui.setGridSize(10);
    window.addEventListener('pointerdown', (event) => {
      window.pressed = { id: event.pointerId, target: event.target };
    }, true);
  });
  if (!timingOnly) {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.startPreciseCoverage', { callCount: true, detailed: false });
  }
  const counts = async () => {
    if (timingOnly) return;
    const result = {};
    for (const name of ['checkDesign', 'checkPlacement', 'computeDragPlacement', 'scheduleSave', 'storeDesign', 'DesignCanvas', 'RoomShape']) result[name] = 0;
    for (const script of (await cdp.send('Profiler.takePreciseCoverage')).result.filter((entry) => entry.url.includes('/src/'))) {
      for (const fn of script.functions) if (fn.functionName in result) result[fn.functionName] += fn.ranges[0].count;
    }
    return result;
  };
  const settle = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  for (const pointerType of ['mouse', 'touch']) {
    await page.evaluate(() => {
      const { design, ui } = window.__kitchen;
      design.getState().load(window.fixture.design);
      ui.getState().setView('plan');
      ui.getState().select(window.fixture.id);
    });
    await page.locator('.konvajs-content canvas').first().waitFor();
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await settle();
    const points = await page.evaluate(() => {
      const item = window.fixture.design.items.find((entry) => entry.id === window.fixture.id);
      const { zoom, pan } = window.__kitchen.ui.getState();
      const box = document.querySelector('.konvajs-content').getBoundingClientRect();
      const from = { x: box.x + pan.x + (item.x + item.width / 2) * zoom, y: box.y + pan.y + (item.y + item.depth / 2) * zoom };
      return { from, to: { x: from.x + 1150 * zoom, y: from.y } };
    });
    await page.evaluate(async () => (await import('/src/store/projects.ts')).flushSave());
    const press = () => pointerType === 'mouse'
      ? cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...points.from, button: 'left', buttons: 1, clickCount: 1 })
      : cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...points.from, id: 1 }] });
    const move = (point) => pointerType === 'mouse'
      ? cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point, buttons: 1 })
      : cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...point, id: 1 }] });
    const release = (point) => pointerType === 'mouse'
      ? cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1 })
      : cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await press();
    await counts(); // Discard startup and selection.
    const samples = await page.evaluate(async ({ from, to, batches, burst, pointerType }) => {
      const { id: pointerId, target } = window.pressed;
      const frames = [];
      let updates = 0;
      const stop = window.__kitchen.design.subscribe((state, last) => { if (state.design !== last.design) ++updates; });
      let last = await new Promise(requestAnimationFrame);
      for (let frame = 0; frame < batches; ++frame) {
        for (let event = 1; event <= burst; ++event) {
          const progress = (frame * burst + event) / (batches * burst);
          target.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, buttons: 1, isPrimary: true, pointerId, pointerType,
            clientX: from.x + (to.x - from.x) * progress, clientY: from.y + (to.y - from.y) * progress }));
        }
        const now = await new Promise(requestAnimationFrame);
        frames.push(Math.round((now - last) * 10) / 10);
        last = now;
      }
      stop();
      if (!window.__kitchen.design.getState().gestureBase || !updates) {
        throw Error(`The cabinet did not drag (${pointerType}, ${target.tagName}, updates=${updates}).`);
      }
      return { frames: frames.sort((a, b) => a - b), updates };
    }, { ...points, batches, burst, pointerType });
    const live = await counts();
    if (pointerType === 'touch') await move(points.to);
    await release(points.to);
    await settle();
    const final = await counts();
    const state = await page.evaluate(() => {
      const s = window.__kitchen.design.getState();
      return { units: s.design.items.length, history: s.past.length, active: !!s.gestureBase,
        x: s.design.items.find((item) => item.id === window.fixture.id).x };
    });
    console.log(JSON.stringify({ pointerType, units: state.units, events: batches * burst, frames: batches,
      p95ms: samples.frames[Math.ceil(batches * 0.95) - 1], worstMs: samples.frames.at(-1), updates: samples.updates, live, drop: final }));
    assert.equal(state.history, 1);
    assert.equal(state.active, false);
    if (!baseline && !timingOnly) {
      assert.equal(live.checkDesign, 0, 'full workshop checks during drag');
      assert.equal(live.scheduleSave, 0, 'autosave rearmed during drag');
      assert.equal(live.storeDesign, 0, 'uncommitted placement persisted');
      assert.equal(live.RoomShape, 0, 'the stationary room should not rebuild for a cabinet placement');
      assert.ok(live.computeDragPlacement > 0 && live.computeDragPlacement <= batches, 'one placement calculation per frame');
      assert.ok(samples.updates <= batches, 'one live design update per frame');
      assert.equal(final.checkDesign, 1, 'one shared full check at drop');
      assert.equal(final.scheduleSave, 1, 'one save scheduled at drop');
    }
    if (!baseline) {
      const restored = () => page.evaluate(() => {
        const s = window.__kitchen.design.getState();
        return s.design === window.fixture.design && !s.gestureBase && !s.past.length && s.future.length === 1;
      });
      await page.getByRole('button', { name: 'Undo', exact: true }).click();
      assert.equal(await restored(), true, 'use the visible shared Undo control');
      await settle(); // Konva hit graph must match the restored design before the next physical press.
      await press();
      await move(points.to);
      await page.waitForFunction(() => window.__kitchen.design.getState().gestureBase && window.__kitchen.design.getState().design !== window.fixture.design);
      if (pointerType === 'touch') await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      else { await page.keyboard.press('Escape'); await release(points.to); }
      await settle();
      assert.equal(await restored(), true, `${pointerType}: interrupted drag lost its starting revision or redo`);
      // The final sample arrives before the scheduled preview frame. Reusing the last *processed* move loses it.
      if (pointerType === 'mouse') {
        await press();
        await move(points.to);
        await page.waitForFunction(() => window.__kitchen.design.getState().design !== window.fixture.design);
        await move(points.from);
        await release(points.from);
        assert.equal(await restored(), true, 'drag out and back must create no history step or save');
        await settle();
        await press();
        await page.evaluate(({ from, to }) => {
          const { id: pointerId, target } = window.pressed;
          const send = (type, fraction) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, isPrimary: true, pointerId, pointerType: 'mouse',
            buttons: type === 'pointerup' ? 0 : 1, clientX: from.x + (to.x - from.x) * fraction, clientY: from.y + (to.y - from.y) * fraction }));
          send('pointermove', 0.3);
          send('pointerup', 1);
        }, points);
        await release(points.to);
        await settle();
        const placed = await page.evaluate(() => window.__kitchen.design.getState().design.items.find((i) => i.id === window.fixture.id).x);
        assert.ok(Math.abs(placed - state.x) <= 10, `drop uses release coordinates (${placed} vs ${state.x}), not the queued 30% position`);
      }
    }
    assert.deepEqual(errors, []);
  }
} finally {
  await browser?.close();
  await server.close();
}
