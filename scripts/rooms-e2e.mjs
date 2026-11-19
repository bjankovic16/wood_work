import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { assertBodyOrbits, assertScenePlacement, close3DTools, open3DTools } from './three-test-helpers.mjs';
import { roomObjectChecks } from './room-object-checks.mjs';

const output = process.argv[2] ?? path.join('test-results', 'rooms');
await mkdir(output, { recursive: true });
const server = await createServer({ logLevel: 'error', cacheDir: path.resolve(output, '.vite'), server: { host: '127.0.0.1', port: 0 } });
let browser;
const problems = [];
let expectedImageError = false;
let imageErrors = 0;
const noise = /THREE.Clock: This module has been deprecated|GL Driver Message .*GPU stall due to ReadPixels/;
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

async function advancedRoomChecks(page) {
  console.log('Editable diagonal walls, partitions and finishes');
  await page.evaluate(async () => {
    const { createDesign } = await import('/src/domain/designOps.ts');
    const { createItem } = await import('/src/domain/catalog.ts');
    const value = createDesign('Angled cabinet');
    value.room = { width: 4000, depth: 3000, height: 2700, vertices: [
      { id: 'diagonal', x: 1000, y: 0 }, { id: 'east', x: 4000, y: 3000 },
      { id: 'south', x: 0, y: 3000 }, { id: 'west', x: 0, y: 0 },
    ] };
    value.items = [createItem('base', [], { x: 1000, y: 1700 })];
    window.__kitchen.design.getState().load(value);
    const ui = window.__kitchen.ui.getState();
    ui.select(null); ui.setView('plan'); ui.setReferenceOpen(false); ui.setViewFilter('all');
  });
  await page.waitForSelector('.konvajs-content');
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const drag = await page.evaluate(async () => {
    const { localToRoom } = await import('/src/domain/geometry.ts');
    const { roomSegments, wallPoint } = await import('/src/domain/walls.ts');
    const { design } = window.__kitchen.design.getState();
    const box = document.querySelector('.konvajs-content').getBoundingClientRect();
    const { zoom, pan } = window.__kitchen.ui.getState();
    const screen = (p) => ({ x: box.x + pan.x + p.x * zoom, y: box.y + pan.y + p.y * zoom });
    return { from: screen(localToRoom(design.items[0], 300, 300)), to: screen(wallPoint(roomSegments(design.room)[0], 1600, 200)) };
  });
  await page.mouse.move(drag.from.x, drag.from.y);
  await page.mouse.down();
  await page.mouse.move(drag.to.x, drag.to.y, { steps: 14 });
  await page.mouse.up();
  const placed = (await design(page)).items[0];
  assert.equal(placed.rotation, 45);
  assert.equal(await page.evaluate(async () => {
    const { attachedSegment } = await import('/src/domain/geometry.ts');
    const value = window.__kitchen.design.getState().design;
    return attachedSegment(value.items[0], value.room)?.id;
  }), 'diagonal');
  await page.getByRole('radio', { name: '3D', exact: true }).click();
  await ready3D(page);
  await assertScenePlacement(page, placed.id);
  await shot(page, '11-diagonal-cabinet.png');
  pass('a real cabinet drag turns and snaps to a diagonal wall, and 3D uses the same saved transform');

  await page.evaluate(async () => {
    const { createDesign } = await import('/src/domain/designOps.ts');
    const fixture = createDesign('Wall editing');
    fixture.room = { width: 4000, depth: 3000, height: 2700 };
    window.__kitchen.design.getState().load(fixture);
    const ui = window.__kitchen.ui.getState();
    ui.finishRoom(); ui.setSelectedWallId(null); // This fixture is already measured; go straight to editing.
  });
  await openAdvancedRoom(page);
  await page.getByRole('button', { name: 'Edit wall corners on plan', exact: true }).click();
  const grip = page.getByRole('button', { name: 'Move corner 3', exact: true });
  const corner = await cornerPoint(grip);
  const history = await page.evaluate(() => window.__kitchen.design.getState().past.length);
  await page.mouse.move(corner.x, corner.y);
  await page.mouse.down();
  await page.mouse.move(corner.x - 350 * corner.zoom, corner.y - 150 * corner.zoom, { steps: 12 });
  await page.mouse.up();
  const edited = await design(page);
  assert.ok(edited.room.vertices);
  assert.ok(Math.abs(edited.room.vertices[2].x - 3650) <= 1 / corner.zoom);
  assert.ok(Math.abs(edited.room.vertices[2].y - 2850) <= 1 / corner.zoom);
  assert.equal(await page.evaluate(() => window.__kitchen.design.getState().past.length), history + 1);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  assert.equal((await design(page)).room.vertices, undefined);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  assert.deepEqual((await design(page)).room, edited.room);
  const movedCorner = await cornerPoint(grip);
  await page.mouse.move(movedCorner.x, movedCorner.y);
  await page.mouse.down();
  await page.mouse.move(movedCorner.x - 30, movedCorner.y - 20, { steps: 6 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  assert.deepEqual((await design(page)).room, edited.room);
  pass('shared room corners drag in one undo step; Escape restores an unfinished wall edit');

  await page.getByText('Interior & half-height walls', { exact: true }).click();
  await page.getByRole('button', { name: 'Add partition', exact: true }).click();
  const partition = page.locator('[data-partition]').first();
  await partition.getByLabel('Angle', { exact: true }).fill('45');
  await partition.getByLabel('Angle', { exact: true }).press('Enter');
  await partition.getByLabel('Height', { exact: true }).fill('1000');
  await partition.getByLabel('Height', { exact: true }).press('Enter');
  const savedPartition = (await design(page)).room.partitions[0];
  assert.equal(savedPartition.height, 1000);
  assert.ok(savedPartition.end.y > savedPartition.start.y);
  await page.getByText('Wall panels & backsplash', { exact: true }).click();
  await page.getByRole('button', { name: 'Add wall finish', exact: true }).click();
  const treatment = page.locator('[data-treatment]').first();
  await treatment.getByLabel('Finish', { exact: true }).selectOption('walnut');
  const finished = await design(page);
  assert.equal(finished.room.treatments[0].finish, 'walnut');
  await page.waitForTimeout(500);
  await page.reload();
  await page.getByTestId('room-plan').waitFor();
  assert.deepEqual(await design(page), finished);
  await page.getByRole('radio', { name: '3D', exact: true }).click();
  await page.waitForFunction(() => window.__kitchen3D?.scene.getObjectByName('room-floor'));
  await page.waitForFunction(() => {
    let found = false;
    window.__kitchen3D.scene.traverse((node) => { if (node.name.startsWith('wall-finish-')) found = true; });
    return found;
  });
  await shot(page, '12-partition-and-wall-finish.png');
  pass('angled half-height walls and visual finishes edit through real controls and survive reload');
}

async function ready3D(page) {
  await open3DTools(page);
  await page.getByRole('button', { name: 'Reset view', exact: true }).waitFor();
  await page.waitForFunction(() => Boolean(window.__kitchen3D));
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function openAdvancedRoom(root) {
  const summary = root.getByText('Advanced room', { exact: true });
  if (!await summary.count()) await root.getByRole('radio', { name: 'Room design', exact: true }).click();
  if (!await summary.locator('..').evaluate((element) => element.open)) await summary.click();
}

function cornerPoint(grip) {
  return grip.evaluate((el) => {
    const box = el.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2, zoom: el.getScreenCTM().a };
  });
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
  // Camera glides and door animations are covered by the resize checks; here every view appears at once.
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  observe(page);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('room-workspace').waitFor();
  await page.getByLabel('Jezik / Language').selectOption('en');
  await roomObjectChecks(page, output, observe);
  await advancedRoomChecks(page);
  await page.evaluate(async () => {
    const { createDesign } = await import('/src/domain/designOps.ts');
    window.__kitchen.design.getState().load(createDesign());
    window.__kitchen.ui.getState().select(null);
    window.__kitchen.ui.getState().setView('plan');
  });

  console.log('Room geometry and structures');
  await page.getByRole('radio', { name: 'Room design', exact: true }).click();
  const setup = page.getByTestId('room-workspace');
  await openAdvancedRoom(setup);
  await setup.getByLabel('Floor shape').selectOption('notch');
  await setup.getByLabel('Cut-out width').fill('1000');
  await setup.getByLabel('Cut-out width').press('Enter');
  await setup.getByRole('button', { name: 'Add an object' }).click();
  await setup.getByRole('button', { name: 'Chimney', exact: true }).click();
  const feature = setup.locator('[data-room-feature]').first();
  await feature.getByLabel('Against wall').selectOption('');
  await feature.getByLabel('Structure width').fill('450');
  await feature.getByLabel('Structure width').press('Enter');
  await feature.getByLabel('From left wall', { exact: true }).fill('0');
  await feature.getByLabel('From left wall', { exact: true }).press('Enter');
  await setup.getByTestId('room-done').click();
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
  await openAdvancedRoom(page);
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
  await assertBodyOrbits(page, cabinet.id);
  pass('dragging a cabinet face orbits the shaped room without moving the cabinet or adding history');

  await actions.getByRole('button', { name: 'Focus selected cabinet', exact: true }).click();
  assert.equal(await page.getByLabel('From left wall', { exact: true }).count(), 0);
  const positionInPlan = page.getByTestId('cabinet-tools').getByRole('button', { name: 'Edit position in 2D', exact: true });
  await positionInPlan.click();
  await page.locator('.konvajs-content').waitFor();
  await page.getByLabel('From left wall', { exact: true }).fill(String(state.room.features[0].x));
  await page.getByLabel('From left wall', { exact: true }).press('Enter');
  await page.getByLabel('From top wall', { exact: true }).fill('0');
  await page.getByLabel('From top wall', { exact: true }).press('Enter');
  await page.getByRole('radio', { name: '3D', exact: true }).click();
  await ready3D(page);
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
  assert.equal(await actions.getByRole('button', { name: 'Rotate selected cabinet', exact: true }).count(), 0);
  await positionInPlan.click();
  await page.getByRole('button', { name: 'Rotate cabinet 90° clockwise', exact: true }).click();
  assert.equal((await design(page)).items.find((item) => item.id === cabinet.id).rotation, (cabinet.rotation + 90) % 360);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();

  await page.getByRole('radio', { name: 'Plan', exact: true }).click();
  await page.getByRole('button', { name: 'Deselect', exact: true }).click();
  await openAdvancedRoom(page);
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
  assert.equal(await page.getByRole('button', { name: /^(Photo|Foto)$/ }).count(), 0, 'No standalone photo shortcut in the desktop 3D toolbar or tools.');
  const gallery = page.getByRole('dialog', { name: 'Ideas' });
  const openStudio = async () => {
    await page.getByRole('button', { name: 'Ideas', exact: true }).click();
    await gallery.getByRole('radio', { name: 'Photo studio', exact: true }).click();
  };
  await openStudio();
  assert.equal(await gallery.locator('[data-photo-design]').count(), 2);
  assert.equal(await gallery.locator('[data-photo-reference]').count(), 4);
  assert.equal(await gallery.getByRole('link', { name: 'Pexels License', exact: true }).count(), 6);
  const collections = gallery.getByRole('region', { name: 'Pinterest inspiration collections' });
  assert.deepEqual(await collections.getByRole('link').evaluateAll((links) => links.map((link) => link.href)), [
    'https://www.pinterest.com/ideas/warm-contemporary-kitchen/955209864754/',
    'https://www.pinterest.com/ideas/oak-and-walnut-kitchen/919020592506/',
    'https://www.pinterest.com/ideas/japandi-kitchen-ideas/943645865735/',
  ]);
  for (const image of await gallery.getByRole('img').all()) {
    await image.scrollIntoViewIfNeeded();
    assert.ok(await image.evaluate(async (img) => {
      await img.decode();
      return img.naturalWidth > 0 && new URL(img.currentSrc).origin === location.origin;
    }), 'Only locally bundled images should load in the studio.');
  }
  await gallery.getByRole('heading', { name: 'Photos with editable designs' }).scrollIntoViewIfNeeded();
  await shot(page, '06-photo-gallery.png');
  const beforeReference = await design(page);
  const activeProject = () => page.evaluate(async () => (await import('/src/store/projects.ts')).useProjectsStore.getState().activeId);
  const beforeId = await activeProject();
  await gallery.locator('[data-photo-reference="herb-island"]').click();
  const original = page.getByRole('complementary', { name: 'Original photo' });
  await original.getByText('Reference only — no paired 3D model', { exact: true }).waitFor();
  await original.getByText('Photo: Rene Terp / Pexels', { exact: true }).waitFor();
  assert.equal(await original.getByRole('link', { name: 'Original source' }).getAttribute('href'), 'https://www.pexels.com/photo/green-leafed-plants-on-kitchen-island-1358900/');
  assert.equal(await original.getByRole('link', { name: 'Pexels License' }).getAttribute('href'), 'https://www.pexels.com/license/');
  assert.deepEqual(await design(page), { ...beforeReference, referencePhoto: { kind: 'builtin', id: 'herb-island' } });
  assert.equal(await activeProject(), beforeId);
  pass('link-only collections and reference-only photos are distinct from the two paired models; comparison preserves the project');

  await openStudio();
  await gallery.locator('[data-photo-design="ivory-island"]').click();
  await ready3D(page);
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
  await openStudio();
  await gallery.getByRole('button', { name: 'Open current photo comparison', exact: true }).click();
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
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'sr-Latn-RS', isMobile: true, hasTouch: true, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  const mobile = await phone.newPage();
  observe(mobile);
  await mobile.goto(url, { waitUntil: 'domcontentloaded' });
  await mobile.getByTestId('room-workspace').waitFor();
  await mobile.getByRole('button', { name: 'Više', exact: true }).tap();
  await mobile.getByRole('radio', { name: 'English', exact: true }).tap();
  await mobile.getByTestId('room-ideas').tap();
  await mobile.getByRole('dialog', { name: 'Ideas' }).getByRole('radio', { name: 'Photo studio', exact: true }).tap();
  await mobile.locator('[data-photo-design="warm-island"]').tap();
  await ready3D(mobile);
  await close3DTools(mobile);
  assert.equal(await mobile.getByRole('button', { name: /^(Photo|Foto)$/ }).count(), 0, 'No standalone photo shortcut in the compact 3D tools.');
  await mobile.getByRole('complementary', { name: 'Original photo' }).waitFor();
  await shot(mobile, '08-photo-studio-phone.png');
  await open3DTools(mobile);
  await mobile.getByRole('group', { name: '3D camera' }).getByRole('button', { name: 'Top', exact: true }).tap();
  await mobile.waitForTimeout(150);
  const phoneCabinet = (await design(mobile)).items.find((item) => item.kind === 'base');
  await selectCabinetInScene(mobile, phoneCabinet.id, true);
  assert.equal(await mobile.getByRole('group', { name: 'Selected cabinet actions' }).count(), 0);
  const phoneActions = mobile.getByTestId('item-sheet');
  const count = (await design(mobile)).items.length;
  await phoneActions.getByRole('button', { name: 'Duplicate', exact: true }).tap();
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
  await mobile.evaluate(async () => {
    const { createDesign } = await import('/src/domain/designOps.ts');
    window.__kitchen.design.getState().load(createDesign('Touch walls'));
    const ui = window.__kitchen.ui.getState();
    ui.select(null); ui.setView('plan'); ui.setReferenceOpen(false); ui.setRoomOpen(true);
  });
  const wallSetup = mobile.getByTestId('room-workspace');
  await openAdvancedRoom(wallSetup);
  await wallSetup.getByRole('button', { name: 'Edit wall corners on plan', exact: true }).tap();
  const corner = await cornerPoint(wallSetup.getByRole('button', { name: 'Move corner 3', exact: true }));
  const touch = await phone.newCDPSession(mobile);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: corner.x, y: corner.y }] });
  for (let step = 1; step <= 10; step++) {
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: corner.x - 25 * step / 10, y: corner.y - 15 * step / 10 }] });
  }
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const touchRoom = (await design(mobile)).room;
  assert.ok(touchRoom.vertices?.[2].x < 3500);
  await mobile.getByRole('button', { name: 'Undo', exact: true }).tap();
  assert.equal((await design(mobile)).room.vertices, undefined);
  await mobile.getByRole('button', { name: 'Redo', exact: true }).tap();
  assert.deepEqual((await design(mobile)).room, touchRoom);
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  await shot(mobile, '13-touch-wall-editing.png');
  pass('real touch gestures edit shared wall corners and support Undo/Redo at 320px');
  await phone.close();
  assert.deepEqual(problems, []);
  console.log('\nAll room, photo and direct-3D browser checks passed.');
} finally {
  await browser?.close();
  await server.close();
}
