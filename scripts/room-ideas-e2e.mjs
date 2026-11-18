import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const server = await createServer({ logLevel: 'error', cacheDir: path.resolve('test-results/room-ideas/.vite'), optimizeDeps: { entries: ['index.html'] }, server: { host: '127.0.0.1', port: 0, watch: null, hmr: false } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ locale: 'en-US', viewport: { width: 1400, height: 900 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'domcontentloaded' });
  const room = page.getByTestId('room-workspace');
  await room.waitFor();
  const before = await page.evaluate(async () => {
    const { design } = window.__kitchen;
    const d = design.getState().design;
    const target = { ...d, name: 'Measured kitchen', room: { width: 4500, depth: 3500, height: 2600,
      features: [{ id: 'my-chimney', kind: 'chimney', x: 2000, y: 0, width: 450, depth: 400 }] },
      openings: [{ id: 'window', kind: 'window', wall: 'bottom', offset: 1550, width: 1050, sill: 970, height: 950 },
        { id: 'door', kind: 'door', wall: 'left', offset: 1200, width: 850, sill: 0, height: 2100 }] };
    design.getState().load(target);
    return target;
  });
  const design = () => page.evaluate(() => window.__kitchen.design.getState().design);
  for (const [side, expectedWall] of [['Left return', 'right'], ['Right return', 'left']]) {
    await page.getByRole('button', { name: 'Kitchen designs', exact: true }).first().click();
    await page.locator('[data-kitchen-design="warm-minimal"]').click();
    await page.getByLabel('Main wall', { exact: true }).selectOption('bottom');
    await page.getByRole('radio', { name: side, exact: true }).click();
    assert.deepEqual(await design(), before, 'Looking at a proposal never commits it.');
    await page.getByTestId('confirm-idea-fit').click();
    await page.getByTestId('three-toolbar').waitFor();
    const fitted = await design();
    assert.deepEqual(fitted.room, before.room);
    assert.deepEqual(fitted.openings, before.openings);
    const sideWall = await page.evaluate(async () => {
      const { attachedSegment } = await import('/src/domain/geometry.ts');
      const { room, items } = window.__kitchen.design.getState().design;
      return attachedSegment(items.find((i) => i.kind === 'hob'), room)?.id;
    });
    assert.equal(sideWall, expectedWall);
    if (side === 'Left return') {
      await page.getByRole('button', { name: 'Undo', exact: true }).click();
      assert.deepEqual(await design(), before);
    }
  }
  const fitted = await design();
  const transforms = (d) => d.items.map(({ id, kind, x, y, rotation, width, width2, height, depth, elevation }) =>
    [id, kind, x, y, rotation, width, width2, height, depth, elevation]);
  const parts = () => page.evaluate(async () => {
    const { buildCuttingList } = await import('/src/engine/cuttingList.ts');
    return buildCuttingList(window.__kitchen.design.getState().design).units.map((u) => u.parts);
  });
  const priorParts = await parts();
  await page.getByRole('button', { name: 'Kitchen designs', exact: true }).first().click();
  await page.locator('[data-kitchen-design="walnut-frame"]').click();
  const styled = await design();
  assert.deepEqual(transforms(styled), transforms(fitted));
  assert.deepEqual(styled.room, before.room);
  assert.deepEqual(styled.openings, before.openings);
  assert.deepEqual(await parts(), priorParts);
  assert.equal(styled.galleryPresetId, 'walnut-frame');
  assert.notDeepEqual(styled.style, fitted.style);
  assert.equal(styled.style.windowFrame, 'walnut');
  assert.equal(styled.style.doorFrame, 'walnut');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  assert.deepEqual(await design(), fitted);
  assert.deepEqual(errors, []);
  console.log('Both L returns fit around the measured room; a subsequent idea keeps every cabinet, opening, structure and cut part, with one Undo.');
} finally {
  await browser?.close();
  await server.close();
}
