import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { workspaceObjectChecks } from './room-object-checks.mjs';

const server = await createServer({ logLevel: 'error', cacheDir: path.resolve('test-results/room-workspace/.vite'), server: { host: '127.0.0.1', port: 0 } });
const planOnly = process.argv.includes('--plan-only');
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
    await workspaceObjectChecks(page, compact, !planOnly);
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`PASS room-first workspace, ${compact ? 'phone' : 'desktop'}`);
  }
} finally {
  await browser?.close();
  await server.close();
}
