import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { workspaceObjectChecks } from './room-object-checks.mjs';

const server = await createServer({ logLevel: 'error', cacheDir: path.resolve('test-results/room-workspace/.vite'), server: { host: '127.0.0.1', port: 0 } });
const planOnly = process.argv.includes('--plan-only');

async function phoneRoomTools(page, workspace) {
  await page.evaluate(() => window.__kitchen.ui.getState().setLanguage('sr'));
  const plan = workspace.getByTestId('room-plan');
  for (const viewport of [{ width: 320, height: 568 }, { width: 430, height: 778 }]) {
    await page.setViewportSize(viewport);
    await plan.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const badges = await plan.locator('[data-wall-dimension]').evaluateAll((nodes) => nodes.map((node) => {
      const box = node.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return { w: box.width, h: box.height, reachable: node.contains(hit), horizontal: node.getScreenCTM().b === 0 };
    }));
    assert.equal(badges.length, 4);
    assert.ok(badges.every((b) => b.w >= 43.9 && b.h >= 43.9 && b.reachable && b.horizontal), 'Every wall measurement must be readable and tappable without an overlaid ceiling label.');
    const panel = workspace.getByTestId('room-inspector');
    const bounds = await panel.boundingBox();
    for (const control of [panel.getByRole('tab', { name: 'Boje i pločice' }), panel.getByLabel('Visina do plafona')]) {
      const box = await control.boundingBox();
      assert.ok(box && box.y + box.height <= bounds.y + bounds.height + 1, 'Finishes and the ceiling input must fit without scrolling.');
    }
  }
  await workspace.getByRole('tab', { name: 'Boje i pločice' }).tap();
  await workspace.getByRole('checkbox', { name: 'Podne pločice' }).check();
  await workspace.getByRole('button', { name: 'Boja zidova: Maslina' }).tap();
  assert.equal(await plan.locator('[data-wall-paint]').getAttribute('stroke'), '#777c64');
  const tileSize = workspace.getByLabel('Stranica pločice', { exact: true });
  await tileSize.fill('450');
  await tileSize.press('Enter');
  assert.equal(await plan.locator('pattern').getAttribute('width'), '450');
  await page.getByRole('button', { name: 'Korak unazad', exact: true }).tap();
  assert.equal(await plan.locator('pattern').getAttribute('width'), '600');
  await page.reload();
  assert.equal(await plan.locator('[data-wall-paint]').getAttribute('stroke'), '#777c64', 'Finishes chosen in room setup survive reload');
  await workspace.locator('[data-wall-dimension="top"]').tap();
  await workspace.getByRole('dialog', { name: 'Zid 1' }).getByLabel('Dužina zida').waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await workspace.getByRole('dialog').count(), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.__kitchen.ui.getState().setLanguage('en'));
}

let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const url = server.resolvedUrls.local[0];
  for (const compact of [false, true]) {
    const page = await browser.newPage({ locale: 'en-US', hasTouch: compact, viewport: compact ? { width: 390, height: 844 } : { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => { errors.push(error.message); console.error(error); });
    await page.goto(url);
    const workspace = page.getByTestId('room-workspace');
    await workspace.getByRole('heading', { name: 'My room' }).waitFor();
    assert.equal(await page.getByTestId('room-plan').count(), 1);
    assert.equal(await page.locator('[data-kitchen-idea]').count(), 0);
    if (compact) await phoneRoomTools(page, workspace);
    await workspace.locator('[data-wall-dimension="right"]').focus();
    await page.keyboard.press('Enter');
    const drawing = workspace.getByTestId('drawing-measure');
    const length = drawing.getByLabel('Wall length');
    await length.fill('');
    await length.pressSequentially('3500');
    const room = () => page.evaluate(() => window.__kitchen.design.getState().design.room);
    assert.notEqual((await room()).depth, 3500, 'intermediate digits are drafts');
    await length.press('Enter');
    assert.equal((await room()).depth, 3500);
    assert.equal((await room()).vertices, undefined);
    await drawing.getByRole('button', { name: 'Done' }).click();
    if (!compact && !planOnly) {
      await workspace.getByRole('button', { name: '3D preview' }).click();
      await workspace.getByTestId('three-viewport').locator('canvas').waitFor().catch(async (error) => {
        console.error('Preview state:', await page.locator('body').evaluate((el) => ({ text: el.innerText.slice(0, 900),
          canvases: [...el.querySelectorAll('canvas')].map((c) => [c.clientWidth, c.clientHeight]), view: window.__kitchen?.ui.getState().view })));
        throw error;
      });
      assert.equal(await page.getByTestId('room-plan').count(), 1);
      await workspace.getByRole('button', { name: '3D preview' }).click();
    }
    if (!planOnly) {
      await page.getByRole('radio', { name: '3D', exact: true }).click();
      await workspace.getByTestId('three-viewport').locator('canvas').waitFor();
      await page.getByRole('radio', { name: 'Plan', exact: true }).click();
    }
    await workspace.getByTestId('room-plan').waitFor();
    assert.equal(await workspace.locator('[data-wall-id="right"]').getAttribute('aria-pressed'), 'true');
    await workspace.getByText('Advanced room', { exact: true }).click();
    await workspace.getByLabel('Floor shape').selectOption('diagonal');
    await page.evaluate(() => window.__kitchen.ui.getState().setLanguage('sr'));
    await workspace.locator('[data-wall-dimension="edge-2"]').click();
    const angle = drawing.getByLabel('Ugao', { exact: true });
    await angle.fill('145,5');
    await angle.press('Enter');
    const diagonal = await room();
    assert.equal(diagonal.vertices[2].id, 'edge-2');
    assert.equal(await angle.inputValue(), '145,5');
    await angle.fill('270');
    await angle.press('Enter');
    assert.deepEqual(await room(), diagonal, 'a crossed/overlapping outline is rejected');
    await drawing.getByRole('alert').waitFor();
    await page.keyboard.press('Escape');
    await workspaceObjectChecks(page, compact, !planOnly);
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`PASS room-first workspace, ${compact ? 'phone' : 'desktop'}`);
  }
} finally {
  await browser?.close();
  await server.close();
}
