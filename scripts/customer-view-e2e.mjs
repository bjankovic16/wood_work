import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer, preview } from 'vite';

const output = path.resolve('test-results', 'customer-view');
await mkdir(output, { recursive: true });
const server = await createServer({ logLevel: 'error', cacheDir: path.join(output, '.vite'), server: { middlewareMode: true } });
let editor;
let browser;
try {
  // Build fixture data on the test side. The browser only uses normal app controls, also in production.
  const { createPhotoDesign } = await server.ssrLoadModule('/src/domain/photoDesigns.ts');
  const fixture = createPhotoDesign('warm-island', 'Kitchen & <oak>');
  const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ttd8AAAAASUVORK5CYII=';
  fixture.referencePhoto = { kind: 'upload', name: 'PRIVATE-REFERENCE-photo.jpg', dataUrl: pixel };
  if (process.env.KITCHEN_E2E_PRODUCTION === '1') {
    editor = await preview({ logLevel: 'error', preview: { host: '127.0.0.1', port: 0 } });
  } else {
    editor = await createServer({ logLevel: 'error', cacheDir: path.join(output, '.app-vite'), optimizeDeps: { entries: ['index.html'] }, server: { host: '127.0.0.1', port: 0, watch: null, hmr: false } });
    await editor.listen();
  }
  browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 }, locale: 'en-US' });
  page.on('pageerror', (err) => console.error(err));
  page.on('console', (m) => { if (m.type() === 'error') console.error(m.text()); });
  await page.addInitScript((design) => localStorage.setItem('kitchen-designer:design', JSON.stringify({ state: { design }, version: 1 })), fixture);
  await page.goto(editor.resolvedUrls.local[0], { waitUntil: 'domcontentloaded' });
  await page.getByRole('radio', { name: '3. 3D', exact: true }).click();
  await page.getByRole('group', { name: '3D camera' }).getByRole('button', { name: 'Studio', exact: true }).click();
  await page.getByTestId('three-tools-toggle').click();
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByTestId('customer-export').click()]);
  assert.equal(download.suggestedFilename(), 'Kitchen & oak.html');
  const file = path.join(output, 'customer.html');
  await download.saveAs(file);
  const html = await readFile(file, 'utf8');
  assert.ok(html.includes('Kitchen &amp; &lt;oak&gt;'));
  assert.ok(!html.includes('PRIVATE-REFERENCE') && !html.includes(pixel));
  assert.equal(JSON.parse(html.match(/id="pose">([^<]+)<\/script>/)[1]).studio, true);
  const model = Buffer.from(html.match(/id="model">([^<]+)<\/script>/)[1], 'base64');
  assert.equal(model.toString('ascii', 0, 4), 'glTF');
  const json = JSON.parse(model.toString('utf8', 20, 20 + model.readUInt32LE(12)));
  assert.ok(json.meshes.length > 10 && json.materials.length > 5 && json.textures.length > 0);
  assert.ok(json.nodes.some((node) => node.name === 'arched-mixer') && json.materials.some((mat) => mat.extras?.studioFinish));
  assert.equal(json.nodes.filter((n) => n.extras?.cutaway).length, 5, 'All four walls and the door travel with the model, regardless of editor camera.');
  assert.ok(!json.nodes.some((n) => /selection|gizmo|kitchen-resize-tool/i.test(n.name ?? '')));
  const floor = json.nodes.find((n) => n.name === 'room-floor');
  const bounds = json.accessors[json.meshes[floor.mesh].primitives[0].attributes.POSITION];
  assert.ok(Math.abs(bounds.max[0] - bounds.min[0] - 4.2) < 0.001, 'The 4200 mm floor is 4.2 metres wide.');

  const offline = await browser.newContext({ offline: true });
  const client = await offline.newPage();
  const calls = [];
  client.on('request', (req) => { if (/^https?:/.test(req.url())) calls.push(req.url()); });
  await client.goto(pathToFileURL(file).href);
  await client.waitForFunction(() => document.getElementById('poster').hidden && !document.getElementById('reset').disabled);
  const canvas = client.locator('canvas');
  const baseline = await canvas.screenshot();
  await canvas.hover();
  const box = await canvas.boundingBox();
  await client.mouse.down();
  await client.mouse.move(box.x + box.width * .7, box.y + box.height * .6, { steps: 6 });
  await client.mouse.up();
  assert.ok(!baseline.equals(await canvas.screenshot()), 'Orbit changes the offline picture.');
  await client.getByRole('button', { name: 'Reset view' }).click();
  const reset = await canvas.screenshot();
  await canvas.hover();
  await client.mouse.wheel(0, -180);
  assert.ok(!reset.equals(await canvas.screenshot()), 'Zoom changes the offline picture.');
  assert.deepEqual(calls, []);
  await offline.close();
  const fallback = await browser.newPage();
  await fallback.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...rest) {
      return type.includes('webgl') ? null : getContext.call(this, type, ...rest);
    };
  });
  await fallback.goto(pathToFileURL(file).href);
  await fallback.locator('#failure').waitFor();
  assert.ok(await fallback.locator('#poster').evaluate((img) => !img.hidden && img.naturalWidth > 0));
  console.log('Offline customer HTML contains the complete textured model at scale; orbit, zoom and image fallback work without a network.');
} finally {
  await browser?.close();
  await editor?.close();
  await server.close();
}
