import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { preview } from 'vite';

// Use a real production build under a project path, not Vite's development worker or origin root.
const server = await preview({ base: '/wood_work/', logLevel: 'error', preview: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  const url = server.resolvedUrls.local[0];
  browser = await chromium.launch({ channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true, locale: 'en-US' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto(url);
  await page.getByTestId('room-plan').waitFor();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const meta = await page.evaluate(async () => {
    const manifest = await (await fetch(document.querySelector('link[rel="manifest"]').href)).json();
    const registration = await navigator.serviceWorker.ready;
    const cache = await caches.open((await caches.keys()).find((k) => k.startsWith(`wood-work:${registration.scope}:`)));
    return {
      scope: registration.scope, start: new URL(manifest.start_url, registration.scope).href,
      resources: await Promise.all([...manifest.icons.map((i) => i.src), document.querySelector('[rel="apple-touch-icon"]').href].map(async (p) => {
        const r = await cache.match(new URL(p, registration.scope));
        return r && r.headers.get('content-type');
      })),
    };
  });
  assert.equal(meta.start, url);
  assert.equal(meta.scope, url);
  assert.deepEqual(meta.resources, ['image/png', 'image/png', 'image/png']);

  const nav = page.getByRole('navigation', { name: 'Design workspace' });
  const name = page.getByRole('textbox', { name: 'Project name' });
  const titles = ['1 Room', '2 Layout', '3 3D', '4 Cut list'];
  assert.deepEqual((await nav.getByRole('radio').allInnerTexts()).map(s => s.replace(/\s+/g, ' ')), titles);
  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 740 });
    const targets = await nav.getByRole('radio').evaluateAll((buttons) => buttons.map((b) => {
      const r = b.getBoundingClientRect();
      return r.width >= 44 && r.height >= 44 && r.bottom <= innerHeight && r.y > innerHeight - 80 &&
        r.x >= 0 && r.right <= innerWidth && parseFloat(getComputedStyle(b).fontSize) >= 14 &&
        b.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    }));
    assert.ok(targets.every(Boolean), `Bottom destinations must be labeled, on-screen and reachable at ${width}px.`);
  }
  await name.fill('Offline kitchen'); await name.press('Enter');
  await context.setOffline(true);
  await page.reload();
  await page.getByTestId('room-plan').waitFor();
  assert.equal(await name.inputValue(), 'Offline kitchen');
  const header = await name.boundingBox();
  await page.getByTestId('room-done').tap();
  await page.getByRole('button', { name: 'Add cabinets yourself', exact: true }).tap();
  const add = page.getByRole('dialog', { name: 'Add element', exact: true });
  await add.locator('[data-preset="base-600"]').tap();
  await add.locator('[data-preset="base-600"]').tap();
  await add.getByRole('button', { name: 'Close', exact: true }).tap();
  await page.getByTestId('step-next').tap();
  await page.getByTestId('three-viewport').locator('canvas').waitFor();
  await page.waitForFunction(() => document.querySelector('[data-testid="customer-share"]:enabled'));
  assert.deepEqual(await name.boundingBox(), header, 'Entering furnished 3D must not shrink or move the project name.');
  await page.getByTestId('step-next').tap();
  const hardware = page.locator('[data-hardware-card]').first();
  assert.equal(await hardware.evaluate((el) => getComputedStyle(el).display), 'grid');
  assert.match(await hardware.locator('td').last().innerText(), /B1/);
  const pieces = page.locator('[data-part-card]');
  assert.ok(await pieces.count() > 0);
  assert.ok(await page.getByTestId('cutting-scroll').evaluate((el) => el.scrollWidth <= el.clientWidth));
  await page.getByRole('button', { name: 'Export the cut list', exact: true }).tap();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Excel workbook', exact: true }).tap()]);
  assert.match(download.suggestedFilename(), /\.xlsx$/);
  await page.emulateMedia({ media: 'print' });
  assert.equal(await pieces.first().evaluate((el) => getComputedStyle(el).display), 'table-row');
  assert.equal(await nav.isVisible(), false);
  assert.deepEqual(errors, []);
  console.log('PASS Pages-path installation, offline reload, repeated adds, lazy 3D, workshop cards, printable rows and Excel export.');
} finally {
  await browser?.close();
  await server.close();
}
