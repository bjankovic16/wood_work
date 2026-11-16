import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const output = path.resolve('public');
const server = await createServer({ logLevel: 'error', cacheDir: path.resolve('node_modules', '.vite-kitchen-previews'), server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await mkdir(output, { recursive: true });
  await server.listen();
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('canvas');
  await page.getByLabel('Jezik / Language').selectOption('en');
  await page.addStyleTag({ content: 'main { position: fixed !important; left: 0; top: 0; width: 900px; height: 600px; z-index: 100; } main .absolute { visibility: hidden !important; }' });
  const jobs = await page.evaluate(async () => {
    const { KITCHEN_DESIGNS } = await import('/src/domain/kitchens.ts');
    const { PHOTO_REFERENCES } = await import('/src/domain/photoReferences.ts');
    return [
      ...KITCHEN_DESIGNS.map((kitchen) => ({ kind: 'kitchen', id: kitchen.id, directory: 'kitchens', filename: `${kitchen.id}.jpg` })),
      ...PHOTO_REFERENCES.map((photo) => ({ kind: 'photo', id: photo.id, directory: 'references', filename: `${photo.id}-model.jpg` })),
    ];
  });

  for (const job of jobs) {
    await page.evaluate(async ({ id, kind }) => {
      if (kind === 'photo') {
        const { createPhotoDesign } = await import('/src/domain/photoDesigns.ts');
        window.__kitchen.design.getState().load(createPhotoDesign(id, 'Preview'));
      } else {
        const { KITCHEN_DESIGNS, createKitchenDesign } = await import('/src/domain/kitchens.ts');
        const kitchen = KITCHEN_DESIGNS.find((preset) => preset.id === id);
        if (!kitchen) throw new Error(`Unknown kitchen: ${id}`);
        window.__kitchen.design.getState().load(createKitchenDesign(kitchen, 'Preview'));
      }
      window.__kitchen.ui.getState().setReferenceOpen(false);
      window.__kitchen.ui.getState().setView('3d');
    }, job);
    await page.getByRole('button', { name: 'Reset view', exact: true, includeHidden: true }).waitFor({ state: 'attached' });
    await page.locator('main canvas').waitFor();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.waitForTimeout(300);
    const image = await page.locator('main canvas').screenshot({ type: 'jpeg', quality: 90 });
    if (image.length < 8000) throw new Error(`Preview for ${job.id} appears empty (${image.length} bytes).`);
    const directory = path.join(output, job.directory);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, job.filename), image);
    console.log(`Rendered ${job.id} (${Math.round(image.length / 1024)} KB)`);
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`Rendered all ${jobs.length} kitchen and photo-studio previews from the editor's 3D scene.`);
} finally {
  await browser?.close();
  await server.close();
}
