import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { assertNeutralScene, waitForIdleRendering } from './three-test-helpers.mjs';

const output = path.resolve('public');
const server = await createServer({ logLevel: 'error', cacheDir: path.resolve('node_modules', '.vite-kitchen-previews'), server: { host: '127.0.0.1', port: 0, watch: null, hmr: false } });
let browser;
try {
  await mkdir(output, { recursive: true });
  await server.listen();
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  // Every view must be in place for its picture: no camera glides.
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__kitchen);
  // Capture the same camera aspect regardless of toolbar language, wrapping or room setup.
  await page.addStyleTag({ content: '[data-testid="three-viewport"] { position: fixed !important; left: 0; top: 0; width: 900px; height: 537px; z-index: 100; } main .absolute { visibility: hidden !important; }' });
  const jobs = await page.evaluate(async () => {
    const { KITCHEN_DESIGNS, originalView } = await import('/src/domain/kitchens.ts');
    const { PAIRED_PHOTOS } = await import('/src/domain/photoReferences.ts');
    return [
      ...KITCHEN_DESIGNS.map((kitchen) => ({ kind: 'kitchen', id: kitchen.id, directory: 'kitchens', filename: `${kitchen.id}.jpg`, view: originalView(kitchen) })),
      ...PAIRED_PHOTOS.map((photo) => ({ kind: 'photo', id: photo.id, directory: 'references', filename: photo.modelPreview, view: 'perspective' })),
    ];
  });

  const requested = new Set(process.argv.slice(2));
  const unknown = [...requested].filter((id) => !jobs.some((job) => job.id === id));
  if (unknown.length) throw new Error(`Unknown preview IDs: ${unknown.join(', ')}`);
  const selected = jobs.filter((job) => requested.size === 0 || requested.has(job.id));
  for (const job of selected) {
    const firstUnitId = await page.evaluate(async ({ id, kind, view }) => {
      if (kind === 'photo') {
        const { createPhotoDesign } = await import('/src/domain/photoDesigns.ts');
        window.__kitchen.design.getState().load(createPhotoDesign(id, 'Preview'));
      } else {
        const { KITCHEN_DESIGNS, createKitchenDesign } = await import('/src/domain/kitchens.ts');
        const kitchen = KITCHEN_DESIGNS.find((preset) => preset.id === id);
        if (!kitchen) throw new Error(`Unknown kitchen: ${id}`);
        window.__kitchen.design.getState().load(createKitchenDesign(kitchen, 'Preview'));
      }
      const ui = window.__kitchen.ui.getState();
      ui.setRoomOpen(false);
      ui.setReferenceOpen(false);
      ui.setView('3d');
      ui.requestCamera(view);
      return window.__kitchen.design.getState().design.items[0].id;
    }, job);
    await page.waitForFunction((id) => !!window.__kitchen3D?.scene.getObjectByName(id), firstUnitId);
    await waitForIdleRendering(page);
    await assertNeutralScene(page);
    const image = await page.getByTestId('three-viewport').locator('canvas').screenshot({ type: 'jpeg', quality: 90, scale: 'css' });
    if (image.length < 8000) throw new Error(`Preview for ${job.id} appears empty (${image.length} bytes).`);
    const directory = path.join(output, job.directory);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, job.filename), image);
    console.log(`Rendered ${job.id} (${Math.round(image.length / 1024)} KB)`);
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`Rendered ${selected.length} kitchen and photo-studio previews from the editor's 3D scene.`);
} finally {
  await browser?.close();
  await server.close();
}
