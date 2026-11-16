import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { assertScenePlacement, movementHandle } from './three-test-helpers.mjs';

const output = process.argv[2] ?? path.join('test-results', 'rooms');
await mkdir(output, { recursive: true });
const server = await createServer({ logLevel: 'error', cacheDir: path.resolve(output, '.vite'), server: { host: '127.0.0.1', port: 0 } });
let browser;
const problems = [];
let expectedImageError = false;
let imageErrors = 0;
const noise = /THREE.Clock: This module has been deprecated/;
function observe(page) {
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    if (!['error', 'warning'].includes(message.type()) || noise.test(message.text())) return;
    if (expectedImageError && message.text().startsWith('Reference photo could not be prepared')) imageErrors++;
    else problems.push(message.text());
  });
}
const design = (page) => page.evaluate(() => window.__kitchen.design.getState().design);
const shot = (page, name) => page.screenshot({ path: path.join(output, name) });
const pass = (name) => console.log(`  PASS ${name}`);

async function ready3D(page) {
  await page.getByRole('button', { name: 'Reset view', exact: true }).waitFor();
  await page.waitForFunction(() => Boolean(window.__kitchen3D));
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function holdReferenceDecode(page) {
  await page.evaluate(() => {
    const decode = window.createImageBitmap.bind(window);
    window.createImageBitmap = async (...args) => {
      window.createImageBitmap = decode;
      const bitmap = await decode(...args);
      await new Promise((resolve) => { window.__finishReferenceDecode = resolve; });
      return bitmap;
    };
  });
}

async function finishReferenceDecode(page) {
  await page.evaluate(async () => {
    window.__finishReferenceDecode();
    delete window.__finishReferenceDecode;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function selectCabinetInScene(page, id, touch = false) {
  const point = await page.evaluate(async (id) => {
    const { localToRoom } = await import('/src/domain/geometry.ts');
    const item = window.__kitchen.design.getState().design.items.find((candidate) => candidate.id === id);
    const { camera } = window.__kitchen3D;
    camera.updateMatrixWorld(true);
    const canvas = document.querySelector('main canvas').getBoundingClientRect();
    const surface = localToRoom(item, item.width / 2, item.depth * 0.88);
    const position = camera.position.clone().set(surface.x / 1000, (item.elevation + item.height + 38) / 1000, surface.y / 1000).project(camera);
    const x = canvas.x + (position.x + 1) * canvas.width / 2;
    const y = canvas.y + (1 - position.y) * canvas.height / 2;
    const hit = document.elementFromPoint(x, y);
    return { x, y, hit: hit?.tagName, text: hit?.textContent?.slice(0, 100) };
  }, id);
  assert.equal(point.hit, 'CANVAS', `The cabinet is blocked by a control: ${JSON.stringify(point)}`);
  if (touch) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
  await page.waitForFunction((id) => window.__kitchen.ui.getState().selectedId === id, id);
}

try {
  await server.listen();
  const url = server.resolvedUrls.local[0];
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  observe(page);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('canvas');
  await page.getByLabel('Jezik / Language').selectOption('en');

  console.log('Room geometry and structures');
  await page.getByRole('button', { name: 'Start with my room', exact: true }).click();
  const setup = page.getByRole('dialog', { name: 'Set up your room' });
  await setup.getByLabel('Floor shape').selectOption('notch');
  await setup.getByLabel('Cut-out width').fill('1000');
  await setup.getByLabel('Cut-out width').press('Enter');
  await setup.getByText('Chimneys, columns & wall projections', { exact: true }).click();
  await setup.getByRole('button', { name: 'Chimney', exact: true }).click();
  const feature = setup.locator('[data-room-feature]').first();
  await feature.getByLabel('Structure width').fill('450');
  await feature.getByLabel('Structure width').press('Enter');
  await feature.getByLabel('From left wall', { exact: true }).fill('0');
  await feature.getByLabel('From left wall', { exact: true }).press('Enter');
  await setup.getByRole('button', { name: 'Add kitchen parts', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search kitchen parts' }).fill('base-600');
  await page.locator('[data-preset="base-600"]').click();
  let state = await design(page);
  assert.equal(state.room.cutout.kind, 'notch');
  assert.equal(state.room.features.length, 1);
  assert.ok(state.items[0].x >= 450);
  const checks = await page.evaluate(async () => {
    const { checkDesign } = await import('/src/engine/checks.ts');
    return checkDesign(window.__kitchen.design.getState().design).filter((issue) => issue.severity === 'error');
  });
  assert.deepEqual(checks, []);
  await shot(page, '01-shaped-room-plan.png');
  const storedRoom = state.room;
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForSelector('canvas');
  assert.deepEqual((await design(page)).room, storedRoom);
  pass('shape and chimney persist, and newly added cabinets avoid the structure');

  const firstProject = await page.evaluate(async () => (await import('/src/store/projects.ts')).useProjectsStore.getState().activeId);
  await page.getByText('Try an example room', { exact: true }).click();
  await page.getByRole('button', { name: 'L-shaped room + chimney', exact: true }).click();
  state = await design(page);
  assert.equal(state.name, 'L-shaped room + chimney');
  assert.equal(state.room.cutout.kind, 'notch');
  assert.equal(state.room.features[0].kind, 'chimney');
  assert.notEqual(await page.evaluate(async () => (await import('/src/store/projects.ts')).useProjectsStore.getState().activeId), firstProject);
  assert.equal(await page.evaluate(async () => (await import('/src/store/projects.ts')).useProjectsStore.getState().projects.length), 2);
  await shot(page, '02-l-room-example-plan.png');
  pass('examples create separate projects without overwriting the existing kitchen');

  console.log('Direct 3D editing');
  await page.getByRole('radio', { name: '3D', exact: true }).click();
  await ready3D(page);
  const camera = page.getByRole('group', { name: '3D camera' });
  await camera.getByRole('button', { name: 'Top', exact: true }).click();
  await page.waitForTimeout(600);
  const idleFrame = await page.evaluate(() => window.__kitchen3D.renderer.info.render.frame);
  await page.waitForTimeout(400);
  const idleAfter = await page.evaluate(() => window.__kitchen3D.renderer.info.render.frame);
  assert.ok(idleAfter - idleFrame <= 1, `The idle 3D view kept rendering: ${idleAfter - idleFrame} frames.`);
  pass('the idle 3D canvas stops rendering instead of consuming continuous CPU/GPU');
  await shot(page, '03-l-room-example-3d-top.png');
  const cabinet = (await design(page)).items.find((item) => item.kind === 'base');
  assert.ok(cabinet);
  await selectCabinetInScene(page, cabinet.id);
  const actions = page.getByRole('group', { name: 'Selected cabinet actions' });
  await actions.getByRole('button', { name: 'Move cabinet', exact: true }).click();
  const { from: handle } = await movementHandle(page, 'X');
  const beforeMove = await design(page);
  const history = await page.evaluate(() => window.__kitchen.design.getState().past.length);
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(handle.x + 80, handle.y, { steps: 16 });
  await page.mouse.up();
  state = await design(page);
  const moved = state.items.find((item) => item.id === cabinet.id);
  assert.ok(Math.abs(moved.x - cabinet.x) >= 10, `Expected direct 3D movement; x remained ${moved.x}.`);
  await assertScenePlacement(page, cabinet.id);
  assert.equal(await page.evaluate(() => window.__kitchen.design.getState().past.length), history + 1);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  assert.deepEqual(await design(page), beforeMove);
  pass('dragging a real rendered X handle moves the cabinet and records one complete Undo step');

  await actions.getByRole('button', { name: 'Focus selected cabinet', exact: true }).click();
  await page.getByLabel('From left wall', { exact: true }).fill(String(state.room.features[0].x));
  await page.getByLabel('From left wall', { exact: true }).press('Enter');
  await page.getByLabel('From top wall', { exact: true }).fill('0');
  await page.getByLabel('From top wall', { exact: true }).press('Enter');
  await page.getByText('This cabinet has errors. Check its position and the design checks before cutting.', { exact: true }).waitFor();
  const redOutline = await page.evaluate((id) => {
    let red = false;
    window.__kitchen3D.scene.getObjectByName(id).traverse((object) => {
      if (object.material?.color?.getHexString() === 'dc2626') red = true;
    });
    return red;
  }, cabinet.id);
  assert.equal(redOutline, true);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  pass('structural collisions are visible in 3D, not hidden behind a successful-looking placement');
  await actions.getByRole('button', { name: 'Rotate selected cabinet', exact: true }).click();
  assert.equal((await design(page)).items.find((item) => item.id === cabinet.id).rotation, (cabinet.rotation + 90) % 360);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();

  await page.getByRole('radio', { name: 'Plan', exact: true }).click();
  await page.getByRole('button', { name: 'Deselect', exact: true }).click();
  await page.getByText('Try an example room', { exact: true }).click();
  await page.getByRole('button', { name: 'Diagonal corner + column', exact: true }).click();
  assert.equal((await design(page)).room.cutout.kind, 'diagonal');
  await shot(page, '04-diagonal-example-plan.png');
  await page.getByRole('radio', { name: '3D', exact: true }).click();
  await ready3D(page);
  await camera.getByRole('button', { name: 'Top', exact: true }).click();
  await page.waitForTimeout(150);
  await shot(page, '05-diagonal-example-3d.png');
  pass('diagonal room boundaries and fixed columns are rendered in both views');

  console.log('Original-photo studio');
  await page.getByRole('button', { name: 'Kitchen designs', exact: true }).first().click();
  const gallery = page.getByRole('dialog', { name: 'Kitchen designs' });
  await gallery.getByRole('radio', { name: 'Photo studio', exact: true }).click();
  assert.equal(await gallery.locator('[data-photo-design]').count(), 2);
  await gallery.locator('img').evaluateAll((images) => Promise.all(images.map((image) => image.decode())));
  await shot(page, '06-photo-gallery.png');
  await gallery.locator('[data-photo-design="ivory-island"]').click();
  await ready3D(page);
  const original = page.getByRole('complementary', { name: 'Original photo' });
  await original.waitFor();
  await original.getByText('Photo: Mark McCammon / Pexels', { exact: true }).waitFor();
  assert.equal((await design(page)).referencePhoto.id, 'ivory-island');
  await shot(page, '07-original-and-editable-3d-desktop.png');
  await original.getByRole('button', { name: 'View full reference photo' }).click();
  await page.getByRole('dialog', { name: 'White island room' }).getByRole('button', { name: 'Close', exact: true }).click();
  await original.getByText('Use my own photo', { exact: true }).click();
  await original.getByLabel('Source / Pinterest link (optional)').fill('https://www.pexels.com/photo/white-wooden-cupboards-2724749/');
  await original.getByLabel('Choose reference photo', { exact: true }).setInputFiles(path.resolve('public', 'references', 'ivory-island.jpg'));
  await page.waitForFunction(() => window.__kitchen.design.getState().design.referencePhoto?.kind === 'upload');
  state = await design(page);
  assert.ok(state.referencePhoto.dataUrl.startsWith('data:image/jpeg;base64,'));
  assert.ok(state.referencePhoto.dataUrl.length <= 240000);
  const withPhoto = state;
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForSelector('canvas');
  assert.deepEqual(await design(page), withPhoto);
  await page.getByRole('radio', { name: '3D', exact: true }).click();
  await ready3D(page);
  await original.waitFor();
  pass('original photos, upload resizing and source credit survive project save/reload');
  await original.getByText('Use my own photo', { exact: true }).click();
  expectedImageError = true;
  await original.getByLabel('Choose reference photo', { exact: true }).setInputFiles({ name: 'not-an-image.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') });
  await original.getByRole('alert').getByText('Choose a JPEG, PNG or WebP image.', { exact: true }).waitFor();
  expectedImageError = false;
  assert.equal(imageErrors, 1);
  assert.deepEqual((await design(page)).referencePhoto, withPhoto.referencePhoto);
  pass('invalid uploads surface an explicit error and keep the previous reference intact');

  const photoProject = await page.evaluate(async () => (await import('/src/store/projects.ts')).useProjectsStore.getState().activeId);
  const copyProject = await page.evaluate(async (id) => (await import('/src/store/projects.ts')).duplicateProject(id), photoProject);
  assert.ok(copyProject);
  await holdReferenceDecode(page);
  await original.getByLabel('Choose reference photo', { exact: true }).setInputFiles(path.resolve('public', 'references', 'warm-island.jpg'));
  await page.waitForFunction(() => Boolean(window.__finishReferenceDecode));
  assert.equal(await original.getByLabel('Source / Pinterest link (optional)').isDisabled(), true);
  await page.evaluate(async (id) => (await import('/src/store/projects.ts')).openProject(id), copyProject);
  const untouchedProject = await design(page);
  await finishReferenceDecode(page);
  assert.ok(JSON.stringify(await design(page)) === JSON.stringify(untouchedProject), 'A late photo upload must not change another project, even when it has the same reference filename.');
  assert.equal(await original.getByRole('status').count(), 0);
  await page.evaluate(async (id) => (await import('/src/store/projects.ts')).openProject(id), photoProject);
  assert.deepEqual((await design(page)).referencePhoto, withPhoto.referencePhoto);
  pass('switching projects cancels pending photo changes and resets upload state');

  if (!await original.getByLabel('Choose reference photo', { exact: true }).isVisible()) {
    await original.getByText('Use my own photo', { exact: true }).click();
  }
  await holdReferenceDecode(page);
  await original.getByLabel('Choose reference photo', { exact: true }).setInputFiles(path.resolve('public', 'references', 'warm-island.jpg'));
  await page.waitForFunction(() => Boolean(window.__finishReferenceDecode));
  await original.getByRole('button', { name: 'Close original photo', exact: true }).click();
  await finishReferenceDecode(page);
  assert.deepEqual((await design(page)).referencePhoto, withPhoto.referencePhoto);
  await page.getByRole('button', { name: 'Photo', exact: true }).click();
  await original.waitFor();
  assert.equal(await original.getByRole('status').count(), 0);
  pass('closing the photo panel cancels a pending photo change');

  await original.getByText('Use my own photo', { exact: true }).click();
  await holdReferenceDecode(page);
  await original.getByLabel('Choose reference photo', { exact: true }).setInputFiles(path.resolve('public', 'references', 'warm-island.jpg'));
  await page.waitForFunction(() => Boolean(window.__finishReferenceDecode));
  await original.getByRole('button', { name: 'Remove reference photo', exact: true }).click();
  await finishReferenceDecode(page);
  assert.equal((await design(page)).referencePhoto, undefined, 'A removed reference must not reappear when an older upload finishes.');
  assert.equal(await original.getByLabel('Choose reference photo', { exact: true }).isDisabled(), false);
  assert.equal(await original.getByRole('alert').count(), 0);
  pass('removing a reference cancels an upload that is still being prepared');
  await page.close();

  console.log('Phone comparison and controls');
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const mobile = await phone.newPage();
  observe(mobile);
  await mobile.goto(url, { waitUntil: 'domcontentloaded' });
  await mobile.waitForSelector('canvas');
  await mobile.getByRole('button', { name: 'Više', exact: true }).tap();
  await mobile.getByRole('radio', { name: 'English', exact: true }).tap();
  await mobile.getByRole('button', { name: 'More', exact: true }).tap();
  await mobile.getByRole('button', { name: 'Choose a kitchen', exact: true }).tap();
  await mobile.getByRole('dialog', { name: 'Kitchen designs' }).getByRole('radio', { name: 'Photo studio', exact: true }).tap();
  await mobile.locator('[data-photo-design="warm-island"]').tap();
  await ready3D(mobile);
  await mobile.getByRole('complementary', { name: 'Original photo' }).waitFor();
  await shot(mobile, '08-photo-studio-phone.png');
  await mobile.getByRole('group', { name: '3D camera' }).getByRole('button', { name: 'Top', exact: true }).tap();
  await mobile.waitForTimeout(150);
  const phoneCabinet = (await design(mobile)).items.find((item) => item.kind === 'base');
  await selectCabinetInScene(mobile, phoneCabinet.id, true);
  const phoneActions = mobile.getByRole('group', { name: 'Selected cabinet actions' });
  const count = (await design(mobile)).items.length;
  await phoneActions.getByRole('button', { name: 'Duplicate selected cabinet', exact: true }).tap();
  assert.equal((await design(mobile)).items.length, count + 1);
  await mobile.getByRole('button', { name: 'Undo', exact: true }).tap();
  assert.equal((await design(mobile)).items.length, count);
  await selectCabinetInScene(mobile, phoneCabinet.id, true);
  await shot(mobile, '09-selected-tools-phone.png');
  await mobile.setViewportSize({ width: 320, height: 568 });
  const overflows = await mobile.locator('main').evaluate((main) => main.scrollWidth > main.clientWidth + 1);
  assert.equal(overflows, false);
  await shot(mobile, '10-photo-studio-phone-narrow.png');
  pass('phone photo comparison, camera presets and selected-unit actions work at narrow widths');
  await phone.close();
  assert.deepEqual(problems, []);
  console.log('\nAll room, photo and direct-3D browser checks passed.');
} finally {
  await browser?.close();
  await server.close();
}
