import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const server = await createServer({ logLevel: 'error', cacheDir: path.resolve('test-results/element-renders/.vite'),
  server: { host: '127.0.0.1', port: 0, watch: null, hmr: false } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, reducedMotion: 'reduce', locale: 'en-US' });
  await page.goto(server.resolvedUrls.local[0]);
  const sections = await page.evaluate(async () => {
    const { LIBRARY } = await import('/src/domain/catalog.ts');
    const { createDesign } = await import('/src/domain/designOps.ts');
    const design = createDesign('Catalogue');
    design.style = { front: 'sage', frontProfile: 'shaker', worktop: 'oak', handles: 'black', appliances: 'steel' };
    window.__kitchen.design.getState().load(design);
    window.__kitchen.ui.getState().finishRoom();
    return LIBRARY;
  });
  await page.addStyleTag({ content: '[data-element-model] { width: 240px !important; height: 180px !important; }' });
  await page.getByLabel('Preview before adding').check();
  const dir = path.resolve('public/elements');
  await mkdir(dir, { recursive: true });
  for (const section of sections) {
    await page.getByLabel('Part category').selectOption(section.id);
    for (const { id } of section.presets) {
      await page.locator(`[data-preset="${id}"]`).click();
      const canvas = page.locator(`[data-element-model="${id}"] canvas`);
      // Wait for the framed model, not an empty first WebGL frame.
      let previous, image;
      for (let frame = 0; frame < 20; frame++) {
        image = await canvas.screenshot({ type: 'jpeg', quality: 90 });
        if (image.length > 1000 && previous?.equals(image)) break;
        previous = image; image = null;
      }
      assert.ok(image, `Could not capture ${id}.`);
      await writeFile(path.join(dir, `${id}.jpg`), image);
      await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
    }
  }
  console.log(`Rendered ${sections.reduce((n, section) => n + section.presets.length, 0)} catalogue pictures from the finished element viewer.`);
} finally {
  await browser?.close();
  await server.close();
}
