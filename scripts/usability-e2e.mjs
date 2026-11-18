import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { close3DTools, open3DTools, waitForIdleRendering } from './three-test-helpers.mjs';
import { checkPlanUX } from './plan-ux-checks.mjs';
import { checkPhoneThreeUX } from './phone-three-ux-checks.mjs';
import { checkWorkshopPanels } from './workshop-panels-checks.mjs';

const output = path.resolve('test-results/usability');
await mkdir(output, { recursive: true });
const server = await createServer({ logLevel: 'error', cacheDir: path.join(output, '.vite'), optimizeDeps: { entries: ['index.html'] }, server: { host: '127.0.0.1', port: 0, watch: null, hmr: false } });
let browser;
const errors = [];
const checkButtonNames = async (screen, context) =>
  assert.equal(await screen.getByRole('button', { name: '', exact: true }).count(), 0, `${context}: every visible button needs an accessible name.`);
const roomShowsColours = ({ floorColor, wallColor }) => {
  const scene = window.__kitchen3D?.scene;
  const floor = scene?.getObjectByName('room-floor')?.material;
  const wall = scene?.getObjectByName('room-wall-top-0')?.material;
  if (!floor || !wall) return false;
  const pixel = floor.map?.image.getContext('2d').getImageData(256, 256, 1, 1).data;
  const renderedFloor = pixel ? Array.from(pixel).slice(0, 3).map((value) => value.toString(16).padStart(2, '0')).join('') : floor.color.getHexString();
  return renderedFloor === floorColor && wall.color.getHexString() === wallColor;
};
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'domcontentloaded' });
  const workspace = page.getByTestId('room-workspace');
  await workspace.getByRole('heading', { name: 'My room', exact: true }).waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  await page.getByLabel('Jezik / Language').selectOption('sr');
  await page.reload();
  await workspace.getByRole('heading', { name: 'Moja prostorija', exact: true }).waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'), 'sr-Latn', 'An explicit language preference must survive reload.');
  await page.getByLabel('Jezik / Language').selectOption('en');
  assert.equal(await page.getByRole('button', { name: 'Ideas', exact: true }).count(), 1);
  await page.getByRole('button', { name: 'Ideas', exact: true }).click();
  const gallery = page.getByRole('dialog', { name: 'Ideas', exact: true });
  assert.equal(await gallery.getByRole('checkbox', { name: 'No larger than my room' }).isChecked(), true);
  await gallery.getByRole('checkbox', { name: 'No larger than my room' }).uncheck();
  const firstPhoto = await gallery.locator('[data-kitchen-design] img').first().boundingBox();
  await checkButtonNames(gallery, 'Ideas gallery');
  assert.ok(firstPhoto.y < 380, 'Kitchen photos must appear near the top, without a hero or duplicate filter rows.');
  assert.equal(await gallery.locator('[data-kitchen-design]').count(), 61);
  const filters = await Promise.all(['Design collection', 'Kitchen layout'].map((name) => gallery.getByLabel(name, { exact: true }).boundingBox()));
  assert.ok(Math.abs(filters[0].y - filters[1].y) < 2, 'Desktop filters must share one row.');
  await page.screenshot({ path: path.join(output, 'desktop-gallery.png') });
  await gallery.locator('[data-kitchen-design="olive-oak-vitrine"]').locator('..').getByRole('button', { name: /^More options for / }).click();
  await gallery.locator('[data-kitchen-original="olive-oak-vitrine"]').click();
  await page.getByTestId('three-toolbar').waitFor();
  const nextKitchen = page.getByRole('button', { name: 'Next kitchen', exact: true });
  await nextKitchen.hover();
  await page.getByRole('tooltip').getByText(/Your cabinets stay where they are/).waitFor();
  assert.equal(await nextKitchen.getAttribute('title'), null, 'Custom tooltips must not be duplicated by native titles.');
  await page.keyboard.press('Escape');
  const beforeColours = await page.evaluate(() => JSON.stringify(window.__kitchen.design.getState().design));
  await page.getByRole('radio', { name: 'Room design', exact: true }).click();
  await workspace.getByRole('button', { name: '3D preview' }).click();
  await workspace.getByRole('tab', { name: 'Paint & tiles' }).click();
  await page.getByRole('button', { name: 'Wall colour: Olive', exact: true }).click();
  await page.getByRole('button', { name: 'Floor colour: Clay', exact: true }).click();
  await page.getByLabel('Floor colour: Custom colour', { exact: true }).fill('#123456');
  await page.waitForFunction(roomShowsColours, { floorColor: '123456', wallColor: '777c64' });
  assert.equal(await page.getByRole('checkbox', { name: 'Floor tiles', exact: true }).isChecked(), true);
  const tileSize = page.getByLabel('Square tile size', { exact: true });
  await tileSize.fill('300');
  await tileSize.press('Enter');
  await page.getByLabel('Grout colour: Custom colour', { exact: true }).fill('#eeeeee');
  await page.waitForFunction(() => {
    const map = window.__kitchen3D.scene.getObjectByName('room-floor').material.map;
    const grout = map.image.getContext('2d').getImageData(0, 0, 1, 1).data;
    return Math.abs(map.repeat.x - 1000 / 300) < 0.0001 && map.repeat.x === map.repeat.y
      && grout[0] === 238 && grout[1] === 238 && grout[2] === 238;
  });
  await page.getByRole('checkbox', { name: 'Floor tiles', exact: true }).uncheck();
  await page.waitForFunction(() => window.__kitchen3D.scene.getObjectByName('room-floor').material.map === null);
  await page.getByRole('checkbox', { name: 'Floor tiles', exact: true }).check();
  assert.equal(await page.evaluate(() => window.__kitchen.design.getState().design.galleryPresetId), 'olive-oak-vitrine');
  await page.screenshot({ path: path.join(output, 'desktop-reference-room-colours.png') });
  for (let step = 0; step < 7; step++) await page.getByRole('button', { name: 'Undo', exact: true }).click();
  assert.equal(await page.evaluate(() => JSON.stringify(window.__kitchen.design.getState().design)), beforeColours, 'Room colours must be undoable without changing cabinets or other finishes.');
  await page.getByRole('radio', { name: '3D', exact: true }).click();
  await page.getByRole('tooltip').waitFor({ state: 'detached' });
  await page.keyboard.press('Tab');
  await page.getByRole('group', { name: '3D camera', exact: true }).getByRole('button', { name: 'Top', exact: true }).focus();
  await page.getByRole('tooltip').getByText(/Look down from above/).waitFor();
  const tooltipBox = await page.getByRole('tooltip').boundingBox();
  assert.ok(tooltipBox.x >= 8 && tooltipBox.x + tooltipBox.width <= page.viewportSize().width - 8);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[data-preset]').count(), 0, 'The library must not occupy the 3D viewport.');
  await page.getByRole('button', { name: 'Add element', exact: true }).click();
  const add = page.getByRole('dialog', { name: 'Add element', exact: true });
  assert.equal(await add.locator('[data-preset]').count(), 8);
  await add.getByRole('button', { name: 'Browse all parts', exact: true }).click();
  assert.ok(await add.locator('[data-preset]').count() > 8);
  await page.keyboard.press('Escape');

  const counts = await page.evaluate(async () => {
    const { checkDesign } = await import('/src/engine/checks.ts');
    const issues = checkDesign(window.__kitchen.design.getState().design);
    return { problems: issues.filter((issue) => issue.category !== 'precut').length, checklist: issues.filter((issue) => issue.category === 'precut').length };
  });
  assert.ok(counts.checklist > 0);
  const checks = page.getByRole('button', { name: /^Checks:/ });
  assert.equal(await checks.locator('span[aria-hidden]').count(), counts.problems ? 1 : 0);
  if (counts.problems) assert.equal(await checks.locator('span[aria-hidden]').innerText(), String(counts.problems));
  await checks.click();
  await page.getByRole('dialog', { name: 'Checks', exact: true }).getByText(/Before cutting: supplier checklist/).click();
  await page.getByText('Confirm these details with your supplier or installer. These are reminders, not design problems.', { exact: true }).waitFor();
  await checks.click();
  await page.getByRole('radio', { name: 'Plan', exact: true }).click();
  await page.waitForSelector('.konvajs-content');
  assert.equal(await page.getByRole('button', { name: 'All', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', { name: 'Floor units', exact: true }).click();
  const verifyRow = async () => {
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const layers = await page.evaluate(async () => {
      const { inUpperRow, upperCabinetRows } = await import('/src/domain/upperCabinets.ts');
      const { isWallMounted } = await import('/src/domain/geometry.ts');
      const items = window.__kitchen.design.getState().design.items;
      const ui = window.__kitchen.ui.getState();
      const rows = upperCabinetRows(items);
      const row = rows.find((row) => row.elevation === ui.wallElevation) ?? rows[0];
      const expected = items.filter((item) => ui.viewFilter === 'floor' ? !isWallMounted(item) : inUpperRow(item, row)).map((item) => item.id).sort();
      const nodes = window.Konva.stages[0].find('.item');
      return {
        expected,
        actual: nodes.filter((node) => node.opacity() === 1).map((node) => node.id()).sort(),
        ghosts: nodes.filter((node) => node.opacity() < 1).map((node) => ({ labels: node.find('Text').length, children: node.getChildren().length })),
      };
    });
    assert.deepEqual(layers.actual, layers.expected, 'Only the chosen cabinet row may have labels and dimensions.');
    assert.ok(layers.ghosts.length > 0);
    assert.ok(layers.ghosts.every((ghost) => ghost.labels === 0 && ghost.children === 1), 'Inactive rows must be outlines only.');
  };
  await verifyRow();
  await page.screenshot({ path: path.join(output, 'desktop-plan.png') });
  await page.getByRole('button', { name: 'Wall units', exact: true }).click();
  const row = page.getByLabel('Upper cabinet row', { exact: true });
  for (const elevation of await row.locator('option').evaluateAll((options) => options.map((option) => option.value))) {
    await row.selectOption(elevation);
    await verifyRow();
  }
  const addCorner = page.getByRole('button', { name: 'Add corner', exact: true });
  assert.equal(await addCorner.isVisible(), false);
  assert.equal(await page.getByText('Advanced room', { exact: true }).count(), 0);
  await page.getByRole('radio', { name: 'Room design', exact: true }).click();
  await page.getByText('Advanced room', { exact: true }).click();
  await addCorner.waitFor();
  await page.getByText('Advanced room', { exact: true }).click();
  assert.equal(await addCorner.isVisible(), false);
  await page.getByRole('radio', { name: 'Plan', exact: true }).click();
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page.getByRole('button', { name: 'Snap to walls and units', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Wall dimensions', exact: true }).waitFor();
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page.getByRole('radio', { name: 'Cutting list', exact: true }).click();
  const totals = page.getByTestId('material-totals');
  assert.ok((await totals.boundingBox()).y < (await page.locator('table').first().boundingBox()).y);
  assert.equal(await page.getByTestId('cutting-overview').isVisible(), false);
  await page.getByRole('button', { name: 'Export the cutting list', exact: true }).waitFor();
  await page.getByTestId('precut-checklist').waitFor();
  await page.screenshot({ path: path.join(output, 'desktop-cut-list.png') });
  const original = await page.evaluate(() => window.__kitchen.design.getState().design);
  await page.evaluate(async () => {
    const { createDesign } = await import('/src/domain/designOps.ts');
    const { createItem } = await import('/src/domain/catalog.ts');
    const fixture = createDesign('Cabinet interiors');
    fixture.room = { width: 5000, depth: 3600, height: 2700 };
    fixture.items = ['wall', 'drawer', 'corner', 'sink', 'oven', 'dishwasher', 'integratedFridge', 'glassWall', 'base'].map((kind, index) => ({
      ...createItem(kind, [], { x: index % 5 * 1000, y: index < 5 ? 0 : 1400 }), id: `interior-${kind}`,
    }));
    fixture.items[0].shelves = 3;
    Object.assign(fixture.items[8], { drawers: 1, shelves: 4 });
    window.__kitchen.design.getState().load(fixture);
    window.__kitchen.ui.getState().select(null);
    window.__kitchen.ui.getState().setView('3d');
  });
  await page.waitForFunction(() => window.__kitchen3D?.scene.getObjectByName('interior-wall'));
  const fabricationSnapshot = () => page.evaluate(async () => {
    const { buildCuttingList } = await import('/src/engine/cuttingList.ts');
    const { design, past, future } = window.__kitchen.design.getState();
    return JSON.stringify({ design, past, future, list: buildCuttingList(design) });
  });
  const fabricationBefore = await fabricationSnapshot();
  await page.getByTestId('three-tools-toggle').click();
  const interiorToggle = page.getByRole('button', { name: 'Interior view', exact: true });
  assert.equal(await interiorToggle.getAttribute('aria-pressed'), 'false');
  await interiorToggle.click();
  await page.waitForFunction(() => window.__kitchen3D.scene.getObjectByName('interior-wall').getObjectByName('cabinet-interior'));
  const interiors = await page.evaluate(async () => {
    const { buildContext, resolveConfig } = await import('/src/engine/config.ts');
    const { design } = window.__kitchen.design.getState();
    const ctx = buildContext(design);
    return design.items.map((item) => {
      const object = window.__kitchen3D.scene.getObjectByName(item.id);
      const shell = object.getObjectByName('cabinet-interior');
      const config = resolveConfig(item, ctx);
      const drawers = [];
      object.traverse((child) => { if (child.name === 'cabinet-drawer') drawers.push(child); });
      return {
        kind: item.kind, shelves: config.shelves, drawers: drawers.length,
        shell: Boolean(shell), panels: shell?.children.filter((child) => child.isMesh).length,
        fronts: object.getObjectByName('cabinet-fronts')?.children.length,
        shelvesClear: !drawers.length || !config.shelves || shell.children.filter((child) => child.isMesh && child.geometry.parameters.height === config.carcass.thickness / 1000)
          .slice(2).every((shelf) => shelf.position.y < drawers[0].parent.parent.position.y),
      };
    });
  });
  assert.equal(interiors.find((item) => item.kind === 'wall').panels, 5 + 3, 'The hollow wall cabinet must show the configured shelves, not a solid block.');
  assert.ok(interiors.find((item) => item.kind === 'corner').shell, 'Corner arms must be hollow too.');
  assert.equal(interiors.find((item) => item.kind === 'drawer').drawers, 3);
  assert.ok(interiors.find((item) => item.kind === 'base').shelvesClear, 'Shelves must stay below top drawers in mixed cabinets.');
  assert.equal(interiors.find((item) => item.kind === 'dishwasher').shell, false, 'Do not invent appliance interiors.');
  assert.ok(interiors.filter((item) => item.fronts !== undefined).every((item) => item.fronts === 0));
  assert.equal(await fabricationSnapshot(), fabricationBefore, 'Viewing interiors must not edit the project, history or cutting list.');
  await page.screenshot({ path: path.join(output, 'desktop-interiors.png') });
  const idleFrame = await page.evaluate(() => window.__kitchen3D.renderer.info.render.frame);
  await page.waitForTimeout(400);
  assert.ok(await page.evaluate(() => window.__kitchen3D.renderer.info.render.frame) - idleFrame <= 1, 'Interior view must keep demand-based idle rendering.');
  await interiorToggle.click();
  await page.waitForFunction(() => !window.__kitchen3D.scene.getObjectByName('interior-wall').getObjectByName('cabinet-interior'));
  assert.ok(await page.evaluate(() => window.__kitchen3D.scene.getObjectByName('interior-wall').getObjectByName('cabinet-fronts').children.length > 0));
  assert.equal(await fabricationSnapshot(), fabricationBefore);
  await page.evaluate(() => window.__kitchen.design.getState().apply((design) => ({
    ...design, construction: { ...design.construction, drawerSystem: 'metal' },
  })));
  const metalBefore = await fabricationSnapshot();
  await interiorToggle.click();
  await page.waitForFunction(() => window.__kitchen3D.scene.getObjectByName('interior-drawer').getObjectByName('cabinet-drawer')?.children.length === 2);
  assert.ok(await page.evaluate(async () => {
    const { buildContext } = await import('/src/engine/config.ts');
    const { unitParts } = await import('/src/engine/parts.ts');
    const design = window.__kitchen.design.getState().design;
    const item = design.items.find((item) => item.id === 'interior-drawer');
    const parts = unitParts(item, buildContext(design));
    const bottom = parts.find((part) => part.name === 'Drawer bottom');
    const box = window.__kitchen3D.scene.getObjectByName(item.id).getObjectByName('cabinet-drawer').children[0].geometry.parameters;
    const rendered = [box.width, box.depth].sort((a, b) => b - a);
    return Math.abs(rendered[0] - bottom.length / 1000) < 0.000001 && Math.abs(rendered[1] - bottom.width / 1000) < 0.000001 && box.height === bottom.thickness / 1000;
  }), 'Metal drawer panels must use the construction engine dimensions, without invented hardware.');
  await interiorToggle.click();
  assert.equal(await fabricationSnapshot(), metalBefore);
  await page.getByTestId('three-tools-toggle').click();
  await page.evaluate((design) => window.__kitchen.design.getState().load(design), original);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.evaluate(() => {
    const ui = window.__kitchen.ui.getState();
    ui.setView('3d');
    ui.select(window.__kitchen.design.getState().design.items[0].id);
  });
  await page.getByTestId('item-sheet').waitFor();
  await page.getByTestId('three-toolbar').waitFor();
  await page.waitForFunction(() => window.__kitchen3D?.scene.getObjectByName(window.__kitchen.ui.getState().selectedId));
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.getByRole('group', { name: 'Selected cabinet actions' }).count(), 0);
  await checkButtonNames(page, 'Selected cabinet on phone');
  const smallTargets = await page.locator('button:visible').evaluateAll((buttons) => buttons.filter((button) => {
    const box = button.getBoundingClientRect();
    return box.height < 44 || box.width < 44;
  }).map((button) => button.getAttribute('aria-label') ?? button.textContent));
  assert.deepEqual(smallTargets, [], 'Phone buttons must have 44px touch targets.');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: path.join(output, 'phone-selected.png') });
  await open3DTools(page);
  await interiorToggle.click();
  await open3DTools(page);
  assert.equal(await interiorToggle.getAttribute('aria-pressed'), 'true');
  await close3DTools(page);
  assert.equal(await page.getByRole('group', { name: 'Selected cabinet actions' }).count(), 0);
  await page.evaluate(() => window.__kitchen.ui.getState().select(null));
  await page.getByRole('button', { name: 'Add element', exact: true }).waitFor();
  await page.getByRole('radio', { name: 'Room design', exact: true }).waitFor();
  await page.evaluate(() => localStorage.setItem('kitchen-designer:preferences', JSON.stringify({ version: 1, state: { language: 'sr', viewFilter: 'all' } })));
  await page.reload();
  await page.waitForFunction(() => window.__kitchen?.ui.getState().language === 'sr');
  assert.equal(await page.evaluate(() => window.__kitchen.ui.getState().viewFilter), 'all', 'Existing all-layer preferences must not be changed to floor.');
  await page.evaluate(() => localStorage.setItem('kitchen-designer:preferences', JSON.stringify({ version: 1, state: { language: 'en' } })));
  await page.reload();
  await page.waitForFunction(() => window.__kitchen?.ui.getState().language === 'en');
  assert.equal(await page.evaluate(() => window.__kitchen.ui.getState().viewFilter), 'all', 'Older partial preferences must retain the new All default.');
  assert.deepEqual(errors, []);
  await context.close();
  const phoneContext = await browser.newContext({ viewport: { width: 320, height: 568 }, locale: 'sr-Latn-RS', isMobile: true, hasTouch: true });
  const phone = await phoneContext.newPage();
  await phone.goto(server.resolvedUrls.local[0], { waitUntil: 'domcontentloaded' });
  const phoneRoom = phone.getByTestId('room-workspace');
  await phoneRoom.getByRole('heading', { name: 'Moja prostorija', exact: true }).waitFor();
  await checkButtonNames(phone, 'Phone room workspace');
  const [ideas, proceed] = await Promise.all(['room-ideas', 'room-done'].map((id) => phoneRoom.getByTestId(id).boundingBox()));
  assert.ok([ideas, proceed].every((box) => box && box.x >= 0 && box.x + box.width <= 320 && box.y + box.height <= 568 && box.height >= 44 && box.width >= 44), 'Room actions must fit the first screen and be tappable at 320px.');
  assert.ok(ideas.x + ideas.width <= proceed.x || ideas.y + ideas.height <= proceed.y, 'Room actions must not overlap.');
  await phone.screenshot({ path: path.join(output, 'phone-start-320.png') });
  await phoneRoom.getByTestId('room-done').tap();
  assert.equal(await phone.getByRole('dialog').count(), 0, 'Continue must go straight to the empty plan.');
  const card = await phone.getByTestId('empty-plan-hint').boundingBox();
  const zoom = await phone.getByRole('group', { name: 'Uvećanje osnove', exact: true }).boundingBox();
  const filtersBox = await phone.getByRole('group', { name: 'Prikaz elemenata', exact: true }).boundingBox();
  assert.ok(zoom.y + zoom.height <= card.y && filtersBox.x + filtersBox.width < zoom.x, '44px plan controls must not cover the post-room suggestions or each other.');
  const zoomBefore = await phone.evaluate(() => window.__kitchen.ui.getState().zoom);
  await phone.getByRole('button', { name: 'Uvećaj', exact: true }).tap();
  assert.ok(await phone.evaluate(() => window.__kitchen.ui.getState().zoom) > zoomBefore);
  await phone.evaluate(async () => {
    const { createDesign } = await import('/src/domain/designOps.ts');
    const { createItem } = await import('/src/domain/catalog.ts');
    const fixture = createDesign('Phone interiors');
    fixture.items.push({ ...createItem('wall', []), id: 'phone-interior' });
    window.__kitchen.design.getState().load(fixture);
    window.__kitchen.ui.getState().setView('3d');
  });
  await open3DTools(phone);
  const phoneInterior = phone.getByRole('button', { name: 'Unutrašnjost elemenata', exact: true });
  await phoneInterior.tap();
  await phone.waitForFunction(() => window.__kitchen3D?.scene.getObjectByName('phone-interior')?.getObjectByName('cabinet-interior'));
  await open3DTools(phone);
  await phoneInterior.tap();
  await phone.waitForFunction(() => !window.__kitchen3D.scene.getObjectByName('phone-interior').getObjectByName('cabinet-interior'));
  await open3DTools(phone);
  const nextPhone = phone.getByRole('button', { name: 'Sledeća kuhinja', exact: true });
  await nextPhone.scrollIntoViewIfNeeded();
  const nextBox = await nextPhone.boundingBox();
  const openBox = await phone.getByRole('button', { name: 'Otvori sve', exact: true }).boundingBox();
  assert.ok(nextBox && openBox && nextBox.y >= openBox.y + openBox.height, 'Next kitchen is a project action, separate from cabinet previews.');
  const beforeHold = await phone.evaluate(() => JSON.stringify(window.__kitchen.design.getState().design));
  const cdp = await phoneContext.newCDPSession(phone);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: nextBox.x + nextBox.width / 2, y: nextBox.y + nextBox.height / 2 }] });
  await phone.getByRole('tooltip').getByText(/elementi ostaju na mestu/).waitFor();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  assert.equal(await phone.evaluate(() => JSON.stringify(window.__kitchen.design.getState().design)), beforeHold, 'Long-press help must not apply a look.');
  const phoneTooltip = await phone.getByRole('tooltip').boundingBox();
  assert.ok(phoneTooltip.x >= 8 && phoneTooltip.x + phoneTooltip.width <= 312);
  await phone.screenshot({ path: path.join(output, 'phone-toolbar-tooltip-sr.png') });
  await phone.getByTestId('phone-view-sheet').getByRole('heading', { name: 'Projekat' }).tap();
  await phone.getByRole('tooltip').waitFor({ state: 'detached' });
  await nextPhone.tap();
  await phone.getByTestId('shuffle-feedback').getByText(/primenjen je na vaše elemente/).waitFor();
  assert.equal(await phone.evaluate(() => window.__kitchen.design.getState().design.galleryPresetId), 'walnut-frame');
  await phone.getByRole('button', { name: 'Korak unazad', exact: true }).tap();
  assert.equal(await phone.evaluate(() => JSON.stringify(window.__kitchen.design.getState().design)), beforeHold, 'Undo must restore the entire kitchen before the new look.');
  assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await phone.screenshot({ path: path.join(output, 'phone-toolbar-gallery-sr.png') });
  await phone.getByRole('radio', { name: 'Dizajn prostorije', exact: true }).tap();
  await phoneRoom.getByRole('tab', { name: 'Boje i pločice' }).tap();
  const styleSheet = phoneRoom.getByRole('tabpanel', { name: 'Boje i pločice' });
  await styleSheet.getByRole('button', { name: 'Boja zidova: Maslina', exact: true }).tap();
  await styleSheet.getByRole('button', { name: 'Boja poda: Pesak', exact: true }).tap();
  await styleSheet.getByLabel('Boja zidova: Prilagođena boja', { exact: true }).fill('#334455');
  await styleSheet.getByRole('checkbox', { name: 'Podne pločice', exact: true }).check();
  const phoneTileSize = styleSheet.getByLabel('Stranica pločice', { exact: true });
  await phoneTileSize.fill('450');
  await phoneTileSize.press('Enter');
  await styleSheet.getByRole('button', { name: 'Boja fuga: Antracit', exact: true }).tap();
  assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await phone.screenshot({ path: path.join(output, 'phone-room-colours-sr.png') });
  await phone.getByRole('radio', { name: '3D', exact: true }).tap();
  await phone.waitForTimeout(500);
  await phone.reload();
  await phone.getByRole('radio', { name: '3D', exact: true }).tap();
  assert.equal(await phone.getByTestId('three-tip').count(), 0, 'The first-drag hint does not return on a later visit.');
  await phone.waitForFunction(() => window.__kitchen3D?.scene.getObjectByName('room-floor'));
  assert.deepEqual(await phone.evaluate(() => {
    const { wallColor, floorColor, floorPattern, floorTileSize, floorGroutColor } = window.__kitchen.design.getState().design.style;
    return { wallColor, floorColor, floorPattern, floorTileSize, floorGroutColor };
  }), { wallColor: '#334455', floorColor: '#d8d0c4', floorPattern: 'tiles', floorTileSize: 450, floorGroutColor: '#494c48' }, 'Room colours, tile size and grout must survive project reload.');
  await phone.waitForFunction(roomShowsColours, { floorColor: 'd8d0c4', wallColor: '334455' });
  const tileRepeat = await phone.evaluate(() => window.__kitchen3D.scene.getObjectByName('room-floor').material.map.repeat.x);
  assert.ok(Math.abs(tileRepeat - 1000 / 450) < 0.0001, 'Tiles must render at the saved physical size, not stretch to fit the room.');
  await waitForIdleRendering(phone);
  const frame = await phone.evaluate(() => window.__kitchen3D.renderer.info.render.frame);
  await phone.waitForTimeout(400);
  assert.ok(await phone.evaluate(() => window.__kitchen3D.renderer.info.render.frame) - frame <= 1, 'Floor tiles must not animate an idle scene.');
  await phone.screenshot({ path: path.join(output, 'phone-floor-tiles-sr.png') });
  await phoneContext.close();
  const planContext = await browser.newContext({ hasTouch: true, locale: 'en-US', reducedMotion: 'reduce' });
  try {
    const plan = await planContext.newPage();
    await plan.goto(server.resolvedUrls.local[0]);
    await checkPlanUX(plan);
  } finally { await planContext.close(); }
  await checkWorkshopPanels(browser, server.resolvedUrls.local[0]);
  await checkPhoneThreeUX(browser, server.resolvedUrls.local[0]);
  console.log('All desktop/phone usability checks passed: rows, checklist, advanced room, Add, gallery, View, cut list, interiors, language and 44px controls.');
} finally {
  await browser?.close();
  await server.close();
}
