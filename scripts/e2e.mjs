import { chooseLanguage } from './settings-language.mjs';
// Browser test: drives the real app in the locally installed Chrome, the way a
// user would (clicks, drags, keyboard), and checks the resulting design.
// Usage: node scripts/e2e.mjs [screenshot-dir]
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { chromium } from 'playwright-core';
import { assertShuffledLook } from './look-checks.mjs';
import { createServer } from 'vite';
import { assertNeutralScene, cabinetBodyDrag, close3DTools, open3DTools, waitForIdleRendering } from './three-test-helpers.mjs';

const shotsDir = process.argv[2] ?? 'test-results';
await mkdir(shotsDir, { recursive: true });

const server = await createServer({ logLevel: 'error', cacheDir: path.resolve(shotsDir, '.vite'), optimizeDeps: { entries: ['index.html'] }, server: { port: 5199, watch: null, hmr: false } });
await server.listen();
const url = server.resolvedUrls.local[0];

const browser = await chromium.launch({ channel: 'chrome', headless: true });
// Camera glides and door animations are covered by the resize checks; here every view appears at once.
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'sr-Latn-RS', permissions: ['clipboard-read', 'clipboard-write'], reducedMotion: 'reduce' });
const problems = [];
page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
// Deprecation notice printed by React Three Fiber itself with this three.js version; not caused by the app.
const THIRD_PARTY_NOTICES = [/THREE.Clock: This module has been deprecated/, /GL Driver Message .*GPU stall due to ReadPixels/];
const isNoise = (text) => THIRD_PARTY_NOTICES.some((pattern) => pattern.test(text));
page.on('console', (m) => {
  if ((m.type() === 'error' || m.type() === 'warning') && !isNoise(m.text())) problems.push(`${m.type()}: ${m.text()}`);
});

let failures = 0;
function check(name, ok, detail) {
  if (ok) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.log(`  ✗ ${name}\n      ${JSON.stringify(detail)}`);
  }
}

const design = () => page.evaluate(() => window.__kitchen.design.getState().design);
const view = () =>
  page.evaluate(() => {
    const s = window.__kitchen.ui.getState();
    return { zoom: s.zoom, pan: s.pan, selectedId: s.selectedId, focus: document.activeElement?.id ?? null };
  });
const item = async (predicate) => (await design()).items.find(predicate);
const byLabel = (label) => item((i) => i.label === label);
const shot = (name) => page.screenshot({ path: path.join(shotsDir, name) });
/** JSON with object keys sorted, to compare data regardless of key order. */
const sortedJson = (value) =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v,
  );

/** Plan millimetres to page pixels. */
async function screen(x, y) {
  const { zoom, pan } = await view();
  const box = await page.locator('main').boundingBox();
  return { x: box.x + pan.x + x * zoom, y: box.y + pan.y + y * zoom };
}

async function drag(from, to, { steps = 12, beforeRelease } = {}) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 8, from.y + 8, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps });
  if (beforeRelease) await beforeRelease();
  await page.mouse.up();
}

async function dragPreset(presetId, to, options) {
  const preset = page.locator(`[data-preset="${presetId}"]`);
  if (await preset.count() === 0) await page.getByRole('button', { name: 'Browse all parts', exact: true }).click();
  await preset.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
  const box = await preset.boundingBox();
  await drag({ x: box.x + box.width / 2, y: box.y + box.height / 2 }, to, options);
}

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const workspace = page.getByTestId('room-workspace');
  await workspace.getByTestId('room-plan').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  await shot('00-empty-sr.png');

  console.log('Serbian browser-language detection');
  check(
    'a Serbian browser starts in the Serbian room editor',
    (await page.evaluate(() => document.documentElement.lang)) === 'sr-Latn' && await workspace.getByRole('heading', { name: 'Prostorija', exact: true }).isVisible(),
    await page.evaluate(() => document.documentElement.lang),
  );
  check('the first project has a Serbian name', (await design()).name === 'Moja kuhinja', (await design()).name);
  await page.getByRole('button', { name: 'Ideje', exact: true }).click();
  await page.getByRole('radio', { name: 'Početni rasporedi' }).click();
  await page.getByRole('button', { name: /^L-oblik/ }).click();
  check('reviewing the Serbian layout has not added any units', (await design()).items.length === 0);
  await page.getByTestId('confirm-idea-fit').click();
  const serbianCodes = (await design()).items.map((i) => i.label);
  check('new units get Serbian codes', serbianCodes.includes('U1') && serbianCodes.includes('D1') && !serbianCodes.some((code) => /^(B|W|C)\d/.test(code)), serbianCodes);
  await page.getByRole('radio', { name: /Krojna lista/ }).click();
  await page.waitForSelector('table');
  const serbianTable = await page.locator('table').first().innerText();
  check(
    'the cutting list is in Serbian',
    (await page.getByRole('heading', { name: 'Krojna lista' }).isVisible()) && /Bok\s+\d+/.test(serbianTable) && serbianTable.includes('Bela oplemenjena iverica'),
    serbianTable.slice(0, 300),
  );
  await shot('00b-cutting-list-sr.png');
  await page.getByRole('button', { name: 'Izvezi krojnu listu' }).click();
  const [serbianPdf] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'PDF dokument' }).click()]);
  await serbianPdf.saveAs(path.join(shotsDir, 'cutting-list-sr.pdf'));
  check('a Serbian PDF is named in Serbian', serbianPdf.suggestedFilename() === 'Moja kuhinja - krojna lista.pdf', serbianPdf.suggestedFilename());
  await page.getByRole('radio', { name: '2. Raspored' }).click();
  await page.waitForSelector('canvas');
  await page.keyboard.press('Control+z');
  check('Undo takes the Serbian layout away again', (await design()).items.length === 0);
  await chooseLanguage(page, 'en');
  check(
    'the language can be switched to English',
    (await page.evaluate(() => document.documentElement.lang)) === 'en' && await page.locator('header').getByRole('button', { name: 'Ideas', exact: true }).isVisible(),
  );
  await shot('01-empty.png');

  console.log('Kitchen inspiration gallery');
  const openIdeas = () => page.locator('header').getByRole('button', { name: 'Ideas', exact: true }).click();
  await openIdeas();
  const gallery = page.getByRole('dialog', { name: 'Ideas' });
  const kitchenCards = gallery.locator('[data-kitchen-design]');
  const sourceProject = await design();
  const beforeGallerySearch = sortedJson(sourceProject);
  const roomLimit = gallery.getByRole('checkbox', { name: 'No larger than my room', exact: true });
  check('the gallery initially filters by all three room dimensions', await roomLimit.isChecked() && await kitchenCards.count() === 6);
  await roomLimit.uncheck();
  check('the gallery offers all 61 kitchen images', (await kitchenCards.count()) === 61 && (await kitchenCards.locator('img').count()) === 61);
  const collections = gallery.getByRole('combobox', { name: 'Design collection', exact: true });
  for (const [name, count] of [['Warm contemporary', 15], ['Dark luxury', 12], ['Japandi', 10]]) {
    await collections.selectOption({ label: name });
    check(`${name}: collection filtering shows ${count} original kitchens`, (await kitchenCards.count()) === count);
  }
  const designSearch = gallery.getByRole('searchbox', { name: 'Search kitchen designs', exact: true });
  await designSearch.fill('  BIRCH   alcove  ');
  check('search combines words without case or whitespace sensitivity', (await kitchenCards.count()) === 1 && await gallery.locator('[data-kitchen-design="birch-alcove"]').isVisible());
  await designSearch.fill('no-such-kitchen');
  check('empty searches explain how to recover', (await kitchenCards.count()) === 0 && await gallery.getByRole('heading', { name: 'No kitchens match these filters', exact: true }).isVisible());
  await gallery.getByRole('button', { name: 'Reset filters', exact: true }).click();
  check('reset restores every design and keeps search ready for typing', (await kitchenCards.count()) === 61 && (await designSearch.inputValue()) === '' && await designSearch.evaluate((input) => input === document.activeElement));
  await roomLimit.check();
  check('room-size filtering includes compact kitchens and excludes larger rooms', (await kitchenCards.count()) === 6 && (await gallery.locator('[data-kitchen-design="birch-alcove"]').count()) === 1);
  await designSearch.fill('velvet');
  check('room-size filtering also respects the ceiling height', (await kitchenCards.count()) === 0);
  await gallery.getByRole('button', { name: 'Reset filters', exact: true }).click();
  check('reset clears the size limit as well as the query and collection', !(await roomLimit.isChecked()) && (await kitchenCards.count()) === 61);
  await designSearch.fill('walnut, travertine');
  check('search matches materials as well as design names', (await kitchenCards.count()) === 2);
  await gallery.getByRole('button', { name: 'Clear design search', exact: true }).click();
  await designSearch.fill('chimney');
  check('room structures are searchable and identified on the matching card', (await kitchenCards.count()) === 1 && await gallery.locator('[data-kitchen-design="chimney-frame"]').getByText('Chimney', { exact: true }).isVisible());
  await gallery.getByRole('button', { name: 'Clear design search', exact: true }).click();
  await gallery.getByLabel('Kitchen layout', { exact: true }).selectOption('framed');
  check('the framed-kitchen filter exposes ten reference-inspired examples including the chimney layout', (await kitchenCards.count()) === 10 && await gallery.locator('[data-kitchen-design="chimney-frame"]').isVisible());
  await gallery.getByLabel('Kitchen layout', { exact: true }).selectOption('layered');
  check('the stacked filter includes framed, green and layered compositions', (await kitchenCards.count()) === 40);
  await gallery.getByRole('button', { name: 'Reset filters', exact: true }).click();
  check('browsing and resetting filters never changes the saved kitchen', sortedJson(await design()) === beforeGallerySearch);
  await gallery.locator('summary').click();
  check('the gallery explains how ideas affect the room before you choose', await gallery.locator('details p').isVisible() && /room/i.test(await gallery.locator('details p').innerText()));
  await gallery.locator('summary').click();
  await gallery.getByLabel('Kitchen layout', { exact: true }).selectOption('island');
  check('the island filter shows eleven kitchens', (await kitchenCards.count()) === 11);
  await gallery.getByLabel('Kitchen layout', { exact: true }).selectOption('all');
  await gallery.locator('img').first().waitFor();
  await page.waitForFunction(() => document.querySelector('[data-kitchen-design] img')?.naturalWidth === 900);
  const firstPreview = await kitchenCards.first().locator('img').boundingBox();
  const galleryBounds = await gallery.boundingBox();
  check('desktop filters leave a complete kitchen preview visible without scrolling', firstPreview && galleryBounds && firstPreview.y + firstPreview.height <= galleryBounds.y + galleryBounds.height);
  await shot('01c-kitchen-gallery.png');
  const kitchenPresets = await page.evaluate(async () => {
    const { KITCHEN_DESIGNS, createKitchenDesign } = await import('/src/domain/kitchens.ts');
    return KITCHEN_DESIGNS.map((preset) => ({ id: preset.id, framed: !!preset.framed, design: createKitchenDesign(preset, 'Preview') }));
  });
  const kitchenSnapshot = (design) => ({
    ...design,
    name: undefined,
    items: design.items.map(({ id, ...item }) => item),
  });
  const galleryPresets = process.env.KITCHEN_E2E_SMOKE === '1' ? kitchenPresets.slice(0, 1) : kitchenPresets;
  for (const [index, preset] of galleryPresets.entries()) {
    if (index > 0) { await openIdeas(); await roomLimit.uncheck(); }
    const card = gallery.locator(`[data-kitchen-design="${preset.id}"]`);
    await card.scrollIntoViewIfNeeded();
    await page.waitForFunction((id) => document.querySelector(`[data-kitchen-design="${id}"] img`)?.naturalWidth === 900, preset.id);
    await card.locator('..').getByRole('button', { name: /^More options for / }).click();
    const original = gallery.locator(`[data-kitchen-original="${preset.id}"]`);
    if (index === 0) {
      await original.focus();
      await page.keyboard.press('Enter');
    } else {
      await original.click();
    }
    const loaded = await design();
    check(
      `${preset.id}: opening the original loads exactly its room, units, finishes and construction`,
      sortedJson(kitchenSnapshot(loaded)) === sortedJson(kitchenSnapshot(preset.design)),
      { room: loaded.room, style: loaded.style, units: loaded.items.length },
    );
    check(`${preset.id}: the gallery closes and opens 3D`, !(await gallery.isVisible()) && (await page.getByRole('radio', { name: '3. 3D', exact: true }).getAttribute('aria-checked')) === 'true');
    if (preset.framed) {
      await page.waitForFunction((id) => Boolean(window.__kitchen3D?.scene.getObjectByName(id)), loaded.items[0].id);
      check(`${preset.id}: the original opens with the gallery's finished surfaces and Studio camera`, await page.evaluate(() =>
        window.__kitchen.ui.getState().cameraView === 'studio' && !!window.__kitchen3D.scene.getObjectByName('room-floor').material.aoMap));
      await shot(`gallery-${preset.id}.png`);
    }
  }
  await page.locator('main canvas').waitFor();
  await page.waitForTimeout(500);
  await shot('01d-gallery-kitchen-loaded.png');
  const projectsButton = page.getByRole('button', { name: 'Projects', exact: true });
  const projectsDialog = page.getByRole('dialog', { name: 'Projects' });
  const projectRows = projectsDialog.getByTestId('project-row');
  await projectsButton.click();
  const projectsWithOriginals = 1 + galleryPresets.length;
  check('each original is a separate saved project', (await projectRows.count()) === projectsWithOriginals);
  await projectRows.filter({ has: page.getByText(sourceProject.name, { exact: true }) }).getByRole('button', { name: 'Open', exact: true }).click();
  check('opening originals left the source project untouched', sortedJson(await design()) === beforeGallerySearch);
  await page.getByTestId('empty-plan-hint').waitFor();

  console.log('Premium library and finishes');
  const premiumContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const premiumPage = await premiumContext.newPage();
  premiumPage.on('pageerror', (error) => problems.push(`premium page error: ${error.message}`));
  premiumPage.on('console', (message) => {
    if ((message.type() === 'error' || message.type() === 'warning') && !isNoise(message.text())) problems.push(`premium ${message.type()}: ${message.text()}`);
  });
  await premiumPage.goto(url, { waitUntil: 'domcontentloaded' });
  const roomSetup = premiumPage.getByTestId('room-workspace');
  await roomSetup.getByTestId('room-plan').waitFor();
  await chooseLanguage(premiumPage, 'en');
  const premiumDesign = () => premiumPage.evaluate(() => window.__kitchen.design.getState().design);
  check('blank kitchens start with the room, not an inspiration gallery', await roomSetup.getByRole('heading', { name: 'Room', exact: true }).isVisible() && !(await premiumPage.getByRole('dialog', { name: 'Ideas' }).isVisible()));
  await roomSetup.getByLabel('Width', { exact: true }).fill('4200');
  await roomSetup.getByLabel('Width', { exact: true }).press('Enter');
  await roomSetup.getByLabel('Depth', { exact: true }).fill('3200');
  await roomSetup.getByLabel('Depth', { exact: true }).press('Enter');
  await premiumPage.screenshot({ path: path.join(shotsDir, 'usability-room-setup-desktop.png') });
  await roomSetup.getByTestId('room-done').click();
  const partSearch = premiumPage.getByRole('searchbox', { name: 'Search kitchen parts' });
  const optionalStart = premiumPage.getByRole('dialog', { name: 'Start your kitchen', exact: true });
  await partSearch.waitFor();
  check('finishing room setup opens the parts library for the measured room', (await premiumDesign()).room.width === 4200 && (await premiumDesign()).room.depth === 3200 && !(await roomSetup.isVisible()));
  check('the measured room goes directly to the plan', await optionalStart.isHidden() && await premiumPage.getByTestId('empty-plan-hint').isVisible());
  check('the parts library starts with eight most-used parts', await premiumPage.locator('[data-preset]').count() === 8);
  await premiumPage.getByRole('button', { name: 'Browse all parts', exact: true }).click();
  check('specialist modules start collapsed without being removed', (await premiumPage.getByRole('button', { name: 'Storage & display', exact: true }).getAttribute('aria-expanded')) === 'false');
  await partSearch.fill('drawers 900');
  check('parts can be found by a common name and width', (await premiumPage.locator('[data-preset]').count()) === 1 && (await premiumPage.locator('[data-preset="drawer-900"]').isVisible()));
  await premiumPage.screenshot({ path: path.join(shotsDir, 'usability-part-search-desktop.png') });
  await premiumPage.getByLabel('Part category').selectOption('appliances');
  check('empty searches explain how to recover', await premiumPage.getByRole('button', { name: 'Show all parts' }).isVisible());
  await premiumPage.getByRole('button', { name: 'Show all parts' }).click();
  check('resetting the search clears both the query and category', (await partSearch.inputValue()) === '' && (await premiumPage.getByLabel('Part category').inputValue()) === 'all');
  await partSearch.fill('glassWall-600');
  await premiumPage.locator('[data-preset="glassWall-600"]').click();
  await partSearch.fill('');
  await partSearch.press('Backspace');
  check('typing in part search does not delete the selected cabinet', (await premiumDesign()).items.length === 1 && (await premiumDesign()).items[0].kind === 'glassWall');
  await premiumPage.getByRole('button', { name: 'Undo', exact: true }).click();
  check('undoing the last cabinet keeps the measured room open without bringing back dismissed ideas', !(await roomSetup.isVisible()) && !(await optionalStart.isVisible()) && await partSearch.isVisible() && (await premiumDesign()).room.width === 4200);
  const modules = await premiumPage.evaluate(async () => {
    const { LIBRARY, itemFromPreset } = await import('/src/domain/catalog.ts');
    return LIBRARY.filter((section) => ['storage', 'appliances', 'islands'].includes(section.id))
      .flatMap((section) => section.presets.map((preset) => ({ id: preset.id, placement: preset.placement, item: itemFromPreset(preset, []) })));
  });
  check('the library adds 22 premium module choices', modules.length === 22, modules.length);
  for (const module of modules) {
    await partSearch.fill(module.id);
    await premiumPage.locator(`[data-preset="${module.id}"]`).click();
    const current = await premiumDesign();
    const added = current.items[0];
    const fields = ['kind', 'width', 'depth', 'height', 'elevation', 'doors', 'drawers', 'shelves', 'drawerLayout', 'carcassMaterial', 'frontMaterial'];
    const shape = (item) => Object.fromEntries(fields.map((key) => [key, item[key]]));
    check(`${module.id}: the library creates the configured module`, current.items.length === 1 && sortedJson(shape(added)) === sortedJson(shape(module.item)), added);
    if (module.placement === 'centre') {
      check(`${module.id}: starts in the room centre`, added.x === (current.room.width - added.width) / 2 && added.y === (current.room.depth - added.depth) / 2, added);
    }
    await premiumPage.getByRole('button', { name: 'Undo', exact: true }).click();
  }
  await partSearch.fill('');
  await premiumPage.getByRole('button', { name: 'Ideas', exact: true }).click();
  await premiumPage.getByRole('checkbox', { name: 'No larger than my room' }).uncheck();
  await premiumPage.locator('[data-kitchen-design="oak-island"]').locator('..').getByRole('button', { name: /^More options for / }).click();
  await premiumPage.locator('[data-kitchen-original="oak-island"]').click();
  await open3DTools(premiumPage);
  await premiumPage.getByRole('button', { name: 'Style', exact: true }).click();
  const initialStyle = (await premiumDesign()).style;
  await premiumPage.getByRole('button', { name: 'Fronts: Terracotta', exact: true }).click();
  await premiumPage.getByRole('button', { name: 'Worktop: Warm marble', exact: true }).click();
  await premiumPage.getByRole('button', { name: 'Copper bar', exact: true }).click();
  await premiumPage.getByRole('button', { name: 'Backsplash: Warm marble', exact: true }).click();
  check('the style picker does not offer decorative lighting controls', await premiumPage.getByRole('checkbox', { name: /lighting/i }).count() === 0);
  await premiumPage.getByRole('checkbox', { name: 'Style shelves with accessories' }).uncheck();
  check('shelf accessories can be switched off', (await premiumDesign()).style.decor === false);
  await premiumPage.getByRole('checkbox', { name: 'Style shelves with accessories' }).check();
  const styled = await premiumDesign();
  check(
    'all premium finish controls update the real kitchen',
    sortedJson(styled.style) === sortedJson({ ...initialStyle, front: 'clay', worktop: 'marble', handles: 'copper', backsplash: 'marble', decor: true }),
    styled.style,
  );
  await assertShuffledLook(premiumPage);
  await waitForIdleRendering(premiumPage);
  const meshes = await assertNeutralScene(premiumPage);
  const savedPremium = await premiumPage.evaluate(async () => {
    const { parseDesign } = await import('/src/domain/designOps.ts');
    const { design, load } = window.__kitchen.design.getState();
    const legacy = parseDesign({ ...design, style: { ...design.style, lighting: true, plinthLighting: true } });
    if (!legacy) throw new Error('Legacy projects with lighting options must still open.');
    load(legacy);
    return legacy;
  });
  await waitForIdleRendering(premiumPage);
  check('legacy lighting options add no lamps, LED strips, glow or shadows to the model', await assertNeutralScene(premiumPage) === meshes);
  await premiumPage.screenshot({ path: path.join(shotsDir, 'premium-finishes-and-parts.png') });
  await premiumPage.waitForTimeout(500);
  await premiumPage.reload();
  await premiumPage.waitForSelector('canvas');
  check('all new modules, materials and premium finishes survive a reload', sortedJson(await premiumDesign()) === sortedJson(savedPremium));
  await premiumPage.getByRole('button', { name: 'Projects', exact: true }).click();
  await premiumPage.getByRole('dialog', { name: 'Projects' }).getByRole('button', { name: 'Start fresh', exact: true }).click();
  await roomSetup.getByTestId('room-plan').waitFor();
  check('new projects open their own empty room', (await premiumDesign()).items.length === 0 && await roomSetup.getByRole('heading', { name: 'Room', exact: true }).isVisible());
  await roomSetup.getByTestId('room-done').click();
  check('another measured project also goes straight to the blank plan', !(await optionalStart.isVisible()) && await premiumPage.locator('.konvajs-content').isVisible() && (await premiumDesign()).items.length === 0);
  await premiumContext.close();

  console.log('Ready-made layouts');
  await openIdeas();
  await page.getByRole('radio', { name: 'Starter layouts' }).click();
  await page.getByRole('button', { name: /^L-shaped/ }).click();
  await gallery.getByRole('combobox', { name: 'Main wall' }).selectOption('top');
  await gallery.getByRole('radio', { name: 'Left return' }).click();
  check('the layout preview leaves the kitchen unchanged until confirmed', sortedJson(await design()) === beforeGallerySearch);
  await page.getByTestId('confirm-idea-fit').click();
  const laid = await design();
  check(
    'a ready-made L-shaped kitchen fills the plan',
    laid.items.length > 8 && laid.items.some((i) => i.kind === 'corner' && i.x === 0 && i.y === 0) && sortedJson(laid.room) === sortedJson(sourceProject.room),
    laid.items.map((i) => i.label),
  );
  await page.getByRole('radio', { name: '2. Layout', exact: true }).click();
  await page.locator('.konvajs-content').waitFor();
  await shot('01b-l-layout.png');
  await page.keyboard.press('Control+z');
  check('Undo takes the layout away again', (await design()).items.length === 0);

  console.log('Library');
  for (const id of ['base-600', 'base-600', 'sink', 'dishwasher']) await page.click(`[data-preset="${id}"]`);
  let d = await design();
  check(
    'clicking elements lines them up along the top wall',
    JSON.stringify(d.items.map((i) => [i.label, i.x, i.y, i.rotation])) ===
      JSON.stringify([['B1', 0, 0, 0], ['B2', 600, 0, 0], ['S1', 1200, 0, 0], ['DW1', 2000, 0, 0]]),
    d.items.map((i) => [i.label, i.x, i.y, i.rotation]),
  );
  check('the added element is selected', (await view()).selectedId === d.items.at(-1).id);

  await dragPreset('corner', await screen(400, d.room.depth - 400), {
    beforeRelease: () => shot('02-library-drag-preview.png'),
  });
  const corner = await item((i) => i.kind === 'corner');
  check(
    'a corner unit dragged near a room corner drops into it',
    corner?.rotation === 270 && corner.x === 0 && corner.y === d.room.depth - 900,
    corner,
  );

  await dragPreset('base-600', await screen(200, 1300));
  const leftUnit = await byLabel('B3');
  check('a unit dropped near the left wall turns its back to it', leftUnit?.rotation === 270 && leftUnit.x === 0, leftUnit);

  await page.click('[data-preset="wall-600"]');
  if (await page.getByRole('button', { name: 'Browse all parts', exact: true }).isVisible()) await page.getByRole('button', { name: 'Browse all parts', exact: true }).click();
  await page.click('[data-preset="wall-800"]');
  const [w1, w2] = [await byLabel('W1'), await byLabel('W2')];
  check('wall cabinets line up above the base units', w1.x === 0 && w1.y === 0 && w2.x === 600, [w1, w2]);

  await dragPreset('fridge', { x: 1300, y: 450 });
  check('dropping outside the plan adds nothing', !(await item((i) => i.kind === 'fridge')));

  await page.click('[data-preset="base-custom"]');
  const focus = await view();
  check('a custom cabinet opens its width for typing', focus.focus !== null && (await page.evaluate(() => document.activeElement?.tagName)) === 'INPUT', focus);
  await page.keyboard.type('750');
  await page.keyboard.press('Enter');
  check('typing the custom width applies it', (await byLabel('B4'))?.width === 750, await byLabel('B4'));
  await page.keyboard.press('Escape');
  await shot('03-layout.png');
  await page.keyboard.press('Delete');
  check('Delete removes the selected unit', !(await byLabel('B4')));

  console.log('Plan');
  const b2 = await byLabel('B2');
  const grip = await screen(900, 450);
  await page.mouse.click(grip.x, grip.y);
  check('clicking a unit selects it', (await view()).selectedId === b2.id);
  check('the properties panel shows it', await page.getByText(/^Base cabinet\s*B2$/).isVisible());

  await drag(grip, await screen(2915, 470), { beforeRelease: () => shot('04-moving.png') });
  let moved = await byLabel('B2');
  check('dragging moves the unit and snaps it to its neighbour', moved.x === 2600 && moved.y === 0 && moved.rotation === 0, moved);

  await page.keyboard.press('Control+z');
  check('Ctrl+Z undoes the whole drag', (await byLabel('B2')).x === 600, await byLabel('B2'));
  await page.keyboard.press('Control+y');
  check('Ctrl+Y redoes it', (await byLabel('B2')).x === 2600, await byLabel('B2'));

  await drag(await screen(3200, 280), await screen(3590, 300));
  check('dragging the side handle stretches the unit to the wall', (await byLabel('B2')).width === 1000, await byLabel('B2'));

  const widthField = page.getByLabel('Width', { exact: true });
  await widthField.fill('450+150');
  await widthField.press('Enter');
  check('typing a sum in the width field applies the result', (await byLabel('B2')).width === 600, await byLabel('B2'));
  await widthField.fill('5000');
  await widthField.press('Enter');
  check('widths are limited to what the cabinet type allows', (await byLabel('B2')).width === 1200, await byLabel('B2'));
  await page.keyboard.press('Escape');

  const b2Box = await screen(2900, 450);
  await page.mouse.click(b2Box.x, b2Box.y);
  await page.keyboard.press('r');
  check('R rotates the selected unit', (await byLabel('B2')).rotation === 90, await byLabel('B2'));
  await page.keyboard.press('Shift+R');
  check('Shift+R rotates it back', (await byLabel('B2')).rotation === 0, await byLabel('B2'));

  const before = (await byLabel('B2')).x;
  await page.keyboard.press('ArrowLeft');
  check('arrow keys nudge the unit by 10 mm', (await byLabel('B2')).x === before - 10, await byLabel('B2'));
  await page.keyboard.press('Control+z');

  const countBefore = (await design()).items.length;
  await page.keyboard.press('Control+d');
  d = await design();
  const copy = d.items.at(-1);
  check(
    'Ctrl+D duplicates the unit and selects the copy',
    d.items.length === countBefore + 1 && copy.kind === 'base' && copy.width === 1200 && (await view()).selectedId === copy.id,
    copy,
  );
  await page.keyboard.press('Delete');
  check('Delete removes it', (await design()).items.length === countBefore);
  await page.keyboard.press('Control+z');
  check('undo brings it back', (await design()).items.length === countBefore + 1);
  await page.keyboard.press('Control+z');
  check('undo again removes the duplicate', (await design()).items.length === countBefore);

  const b1 = await byLabel('B1');
  const b1Point = await screen(300, 450);
  await drag(b1Point, await screen(1100, 1500), {
    beforeRelease: async () => {
      await page.keyboard.press('Escape');
    },
  });
  const b1After = await byLabel('B1');
  check('Escape during a drag puts the unit back', b1After.x === b1.x && b1After.y === b1.y, b1After);

  console.log('View');
  // The drawing now has cabinet chains that were not present when this room first opened.
  await page.getByRole('button', { name: 'Fit the room in view' }).click();
  const fitZoom = (await view()).zoom;
  const centre = await screen(1800, 1500);
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.wheel(0, -600);
  await page.waitForTimeout(50);
  check('the mouse wheel zooms in', (await view()).zoom > fitZoom * 1.5, await view());
  await shot('05-zoomed.png');
  await page.getByRole('button', { name: 'Fit the room in view' }).click();
  check('Fit returns to the whole room', Math.abs((await view()).zoom - fitZoom) < 1e-9);

  const panBefore = (await view()).pan;
  const stageBox = await page.locator('.konvajs-content').boundingBox();
  const empty = { x: Math.round(stageBox.x + 7), y: Math.round(stageBox.y + stageBox.height / 2) };
  await drag(empty, { x: empty.x + 150, y: empty.y + 60 });
  const panAfter = (await view()).pan;
  check('dragging empty space pans the view', Math.round(panAfter.x - panBefore.x) === 150 && Math.round(panAfter.y - panBefore.y) === 60, { panBefore, panAfter });
  await page.getByRole('button', { name: 'Fit the room in view' }).click();

  await page.mouse.click(empty.x, empty.y);
  check('clicking empty space clears the selection', (await view()).selectedId === null);

  await page.getByRole('button', { name: 'Wall units' }).click();
  const underWall = await screen(300, 450);
  await page.mouse.click(underWall.x, underWall.y);
  check('with "Wall units" shown, floor units cannot be picked', (await view()).selectedId === null, await view());
  const wallPoint = await screen(300, 150);
  await page.mouse.click(wallPoint.x, wallPoint.y);
  check('…but wall units can', (await view()).selectedId === w1.id, await view());
  await shot('06-wall-units.png');
  await page.getByRole('button', { name: 'All', exact: true }).click();

  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page.getByRole('button', { name: 'Snap to walls and units', exact: true }).click();
  await page.getByRole('button', { name: 'View', exact: true }).click();
  const s1 = await byLabel('S1');
  await page.mouse.click((await screen(1600, 450)).x, (await screen(1600, 450)).y);
  await drag(await screen(1600, 450), await screen(1633, 1237));
  const s1After = await byLabel('S1');
  check('with Snap off, units move freely', s1After.y > 600 && s1After.x % 50 !== 0 && s1After.rotation === s1.rotation, s1After);
  await page.keyboard.press('Control+z');
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page.getByRole('button', { name: 'Snap to walls and units', exact: true }).click();

  await page.getByRole('button', { name: 'Wall dimensions', exact: true }).click();
  await shot('07-no-dimensions.png');
  await page.getByRole('button', { name: 'Wall dimensions', exact: true }).click();
  await page.getByRole('button', { name: 'View', exact: true }).click();

  console.log('Room');
  await page.keyboard.press('Escape');
  await page.getByRole('radio', { name: '1. Room', exact: true }).click();
  const roomWidth = page.getByLabel('Width', { exact: true });
  await roomWidth.fill('3000');
  await roomWidth.press('Enter');
  d = await design();
  const b2Clamped = d.items.find((i) => i.label === 'B2');
  check('shrinking the room keeps every unit inside', d.room.width === 3000 && b2Clamped.x + b2Clamped.width <= 3000, b2Clamped);
  await roomWidth.press('Escape');
  await page.keyboard.press('Control+z');
  check('undo restores the room', (await design()).room.width === 3600);

  await page.getByLabel('Project name').fill('Kuhinja Petrović');
  await page.getByLabel('Project name').press('Enter');

  console.log('Persistence');
  const saved = await design();
  await page.reload();
  await page.waitForSelector('canvas');
  const loaded = await design();
  check('the design survives a page reload', sortedJson(saved) === sortedJson(loaded), { saved, loaded });
  check('the project name was kept', loaded.name === 'Kuhinja Petrović', loaded.name);
  await page.waitForTimeout(200);
  await shot('08-reloaded.png');

  console.log('U-shaped kitchen');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Remove all elements' }).click();
  await page.getByRole('button', { name: 'Remove all', exact: true }).click();
  check('"Remove all elements" empties the plan', (await design()).items.length === 0);

  await page.getByRole('button', { name: 'Browse all parts', exact: true }).click();
  for (const id of ['corner', 'corner', 'base-600', 'sink', 'base-400', 'dishwasher', 'drawer', 'fridge']) {
    await page.click(`[data-preset="${id}"]`);
  }
  const placed = (await design()).items.map((i) => [i.label, i.x, i.y, i.rotation]);
  check(
    'corner units take the two top corners and the runs fill the gaps between them',
    JSON.stringify(placed) ===
      JSON.stringify([
        ['C1', 0, 0, 0],
        ['C2', 2700, 0, 90],
        ['B1', 900, 0, 0],
        ['S1', 1500, 0, 0],
        ['B2', 2300, 0, 0],
        ['DW1', 3040, 900, 90],
        ['D1', 3040, 1500, 90],
        ['F1', 3000, 2100, 90],
      ]),
    placed,
  );

  await dragPreset('base-600', await screen(200, 1220));
  await dragPreset('oven', await screen(200, 1820));
  const [leftBase, oven] = [await byLabel('B3'), await byLabel('O1')];
  check(
    'units dragged to the left wall stack under the corner unit',
    leftBase.rotation === 270 && leftBase.x === 0 && leftBase.y === 900 && oven.rotation === 270 && oven.y === 1500,
    [leftBase, oven],
  );

  for (const id of ['wall-800', 'wall-800', 'wall-600', 'wall-600']) await page.click(`[data-preset="${id}"]`);
  await page.click('[data-preset="endPanel"]');
  await page.click('[data-preset="tall"]');

  await page.getByRole('button', { name: 'Wall units' }).click();
  await page.click('[data-preset="base-300"]');
  check('adding a floor unit keeps the chosen wall layer and the new cabinet selected', await page.evaluate(() => {
    const ui = window.__kitchen.ui.getState();
    const added = window.__kitchen.design.getState().design.items.at(-1);
    const node = window.Konva.stages[0].findOne(`#${added.id}`);
    return ui.viewFilter === 'wall' && ui.selectedId === added.id && node?.opacity() === 1 && node.isListening();
  }));
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  await shot('09-u-shaped.png');

  console.log('3D');
  await page.getByRole('radio', { name: '3. 3D', exact: true }).click();
  await page.locator('main canvas').first().waitFor();
  await page.waitForTimeout(2500); // shader compilation and first frames
  await shot('14-3d.png');
  await open3DTools(page);
  await page.getByRole('button', { name: 'Style', exact: true }).click();
  await page.getByRole('button', { name: 'Fronts: Sage green' }).click();
  await page.getByRole('button', { name: 'Worktop: Oak' }).click();
  await page.getByRole('button', { name: 'Black bar' }).click();
  const style = (await design()).style;
  check('fronts, worktop and handles can be restyled', style.front === 'sage' && style.worktop === 'oak' && style.handles === 'black', style);
  await page.waitForTimeout(800);
  await shot('15-3d-styled.png');
  await page.keyboard.press('Control+z');
  check('a style change can be undone', (await design()).style.handles === 'steel', (await design()).style);
  await page.getByRole('button', { name: 'Hide style options', exact: true }).click();
  await page.getByRole('group', { name: '3D camera' }).getByRole('button', { name: 'Top', exact: true }).click();
  const beforeOrbit = sortedJson(await design());
  const cabinetDrag = await cabinetBodyDrag(page, 'X', 0.35, (await byLabel('W1')).id);
  const camera = await page.evaluate(() => window.__kitchen3D.camera.position.toArray());
  const historyBeforeOrbit = await page.evaluate(() => window.__kitchen.design.getState().past.length);
  await drag(cabinetDrag.from, { x: cabinetDrag.to.x, y: cabinetDrag.to.y - 30 });
  await page.waitForFunction((initial) => window.__kitchen3D.camera.position.toArray().some((v, i) => Math.abs(v - initial[i]) > 0.001), camera);
  check('a 3D cabinet drag orbits the furnished kitchen without editing it', sortedJson(await design()) === beforeOrbit && await page.evaluate(() => window.__kitchen.design.getState().past.length) === historyBeforeOrbit);
  await page.getByRole('button', { name: 'Reset view' }).click();
  await page.getByRole('radio', { name: '2. Layout' }).click();
  await page.waitForSelector('canvas');

  console.log('Fronts, construction and cutting list');
  await page.getByRole('button', { name: 'Floor units', exact: true }).click();
  const b1Front = await screen(1200, 470);
  await page.mouse.click(b1Front.x, b1Front.y);
  check('clicking B1 selects it', (await view()).selectedId === (await byLabel('B1')).id);
  const cabinetTab = (name) => page.getByRole('tab', { name, exact: true });
  await cabinetTab('Fronts').click();
  check('a 600 mm base cabinet has two doors by default', (await page.getByLabel('Doors', { exact: true }).textContent()) === '2');
  await page.getByRole('button', { name: 'More drawers' }).click();
  check('adding a drawer is stored on the unit', (await byLabel('B1')).drawers === 1, await byLabel('B1'));
  await cabinetTab('Parts').click();
  check('its parts now include a drawer front', await page.getByText('Drawer front', { exact: true }).first().isVisible());
  await cabinetTab('Fronts').click();
  await page.getByRole('button', { name: 'Fewer doors' }).click();
  check('removing a door leaves one', (await byLabel('B1')).doors === 1, await byLabel('B1'));
  await shot('10-unit-fronts.png');

  await page.getByRole('radio', { name: 'Right' }).click();
  check('a single door can hang on the right', (await byLabel('B1')).hinge === 'right', await byLabel('B1'));
  await page.getByRole('radio', { name: 'Inset' }).click();
  check('a unit can have inset fronts', (await byLabel('B1')).doorType === 'inset', await byLabel('B1'));
  await shot('10b-inset.png');
  await page.getByRole('radio', { name: 'Full overlay' }).click();
  check('…and go back to full overlay', (await byLabel('B1')).doorType === undefined, await byLabel('B1'));

  await cabinetTab('Materials').click();
  await page.getByLabel('Carcass', { exact: true }).selectOption('particleboard-white-16');
  check('one unit can use another board', (await byLabel('B1')).carcassMaterial === 'particleboard-white-16', await byLabel('B1'));
  await page.getByLabel('Carcass', { exact: true }).selectOption('');
  check('…and go back to the kitchen board', (await byLabel('B1')).carcassMaterial === undefined, await byLabel('B1'));

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByLabel('Fronts', { exact: true }).selectOption('mdf-oak-19');
  await settings.getByLabel('Front edges', { exact: true }).selectOption('abs-2');
  const chosen = (await design()).construction;
  check('fronts and their edge band are chosen for the whole kitchen', chosen.frontMaterial === 'mdf-oak-19' && chosen.frontEdge === 'abs-2', chosen);
  const boardsBefore = (await design()).materials.length;
  await settings.getByRole('button', { name: 'Add board' }).click();
  check('a board can be added to the library', (await design()).materials.length === boardsBefore + 1);
  const carcassBoard = settings.locator(`[data-material-id="${chosen.carcassMaterial}"]`);
  await carcassBoard.locator('summary').click();
  const price = carcassBoard.getByRole('textbox', { name: 'Price per sheet (RSD)', exact: true });
  await price.fill('60');
  await price.press('Enter');
  check('a board can be given a price', (await design()).materials.find((m) => m.id === chosen.carcassMaterial)?.price === 60);
  await shot('11-materials.png');
  await settings.getByRole('radio', { name: 'Construction' }).click();
  await settings.getByRole('radio', { name: 'Under the sides' }).click();
  check('the bottom joint changes for the whole kitchen', (await design()).construction.bottomJoint === 'under');
  await settings.getByRole('radio', { name: 'Metal system' }).click();
  check('the drawer system can be switched', (await design()).construction.drawerSystem === 'metal');
  await shot('11b-construction.png');
  await page.getByRole('button', { name: 'Done' }).click();
  check('Done closes the dialog', !(await page.getByRole('dialog').isVisible()));

  await page.getByRole('radio', { name: /Cut list/ }).click();
  await page.waitForSelector('table');
  const cutListCounts = await page.evaluate(async () => {
    const { buildCuttingList } = await import('/src/engine/cuttingList.ts');
    const list = buildCuttingList(window.__kitchen.design.getState().design);
    return { rows: list.rows.length, pieces: list.pieceCount };
  });
  const displayedQuantities = await page.locator('table').first().locator('tbody tr').evaluateAll((rows) => rows.map((row) => Number(row.cells[1].textContent)));
  check('the displayed grouped rows and quantities match the calculated cutting list', displayedQuantities.length === cutListCounts.rows && displayedQuantities.reduce((sum, quantity) => sum + quantity, 0) === cutListCounts.pieces, { cutListCounts, displayedQuantities });
  const overview = page.getByTestId('cutting-overview');
  await overview.locator('..').locator(':scope > summary').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="cutting-overview"] img')?.naturalWidth > 0);
  check('the cut-list overview contains a real rendered kitchen plan', await overview.getByRole('img', { name: 'Kitchen plan', exact: true }).evaluate((image) => image.complete && image.naturalWidth > 0));
  const previewCabinet = page.getByTestId('cutting-cabinet-preview');
  const beforeCutPreview = sortedJson(await design());
  const previewB1 = (await design()).items.find((item) => item.label === 'B1');
  await previewCabinet.getByLabel('Preview cabinet', { exact: true }).selectOption(previewB1.id);
  check('the cabinet image uses the selected cabinet’s real width and height', await previewCabinet.getByRole('img', { name: `Front view, ${previewB1.width} by ${previewB1.height} mm`, exact: true }).isVisible());
  const previewW = (await design()).items.find((item) => item.kind === 'wall');
  await previewCabinet.getByLabel('Preview cabinet', { exact: true }).selectOption(previewW.id);
  check('changing the preview shows the matching cabinet without editing the design', await previewCabinet.getByRole('img', { name: `Front view, ${previewW.width} by ${previewW.height} mm`, exact: true }).isVisible() && sortedJson(await design()) === beforeCutPreview);
  const tableText = await page.locator('table').first().innerText();
  check('the cutting list shows sides standing on the bottom (720 − 18 = 702)', /Side\s+\d+\s+702\s+560/.test(tableText), tableText.slice(0, 200));
  check('it shows which edges are banded', tableText.includes('L1 W0'));
  check(
    'fronts are oak-veneered MDF with all four edges banded',
    /Door\s[^\n]*Oak-veneered MDF[^\n]*L2 W2/.test(tableText),
    tableText.split('\n').find((line) => line.startsWith('Door')),
  );
  check('drawers on the metal system only need a bottom and a back', tableText.includes('Drawer back') && !tableText.includes('Drawer side'));
  const totalsText = await page.getByTestId('material-totals').innerText();
  check('board totals give sheets and a price in the project currency', /sheets? of 2800 × 2070/.test(totalsText) && /RSD\s+[\d,]+\.\d\d/.test(totalsText), totalsText);
  check(
    'the hardware list is shown',
    (await page.getByRole('heading', { name: 'Hardware' }).isVisible()) && (await page.getByText('Concealed hinge, full overlay').first().isVisible()),
  );
  await shot('12-cutting-list.png');

  console.log('Exports');
  const exportMenu = page.getByRole('button', { name: 'Export the cut list' });
  /** Picks an entry from the cutting list's Export menu and keeps the file it downloads. */
  async function exportFile(entry, name) {
    await exportMenu.click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: entry }).click()]);
    const file = path.join(shotsDir, name);
    await download.saveAs(file);
    return { file, suggested: download.suggestedFilename() };
  }
  await exportMenu.click();
  await shot('12b-export-menu.png');
  await exportMenu.click();

  const csvFile = await exportFile('CSV file', 'cutting-list.csv');
  const csv = await readFile(csvFile.file, 'utf8');
  check('the CSV download has a header and a row per kind of piece', csv.includes('Piece;Quantity;Length (mm)') && csv.split('\r\n').length > 10, csv.slice(0, 200));
  check('downloads are named after the project', csvFile.suggested === 'Kuhinja Petrović - cut list.csv', csvFile.suggested);

  const pdfFile = await exportFile('PDF document', 'cutting-list.pdf');
  const pdf = await readFile(pdfFile.file);
  const pdfPages = pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)?.length ?? 0;
  check('the PDF download is a PDF of several pages', pdf.subarray(0, 5).toString() === '%PDF-' && pdfPages >= 3, { bytes: pdf.length, pdfPages });

  const xlsxFile = await exportFile('Excel workbook', 'cutting-list.xlsx');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(xlsxFile.file);
  const sheetNames = workbook.worksheets.map((w) => w.name);
  check(
    'the Excel workbook has the parts, units, materials, hardware and project sheets',
    JSON.stringify(sheetNames) === JSON.stringify(['Cut list', 'By unit', 'Materials', 'Hardware', 'Project']),
    sheetNames,
  );
  const firstSheet = workbook.getWorksheet('Cut list');
  check('…with a row per kind of piece', firstSheet.rowCount === csv.trim().split('\r\n').length, { rows: firstSheet.rowCount });
  check('the app says the file was saved', await page.getByText('Saved “Kuhinja Petrović - cut list.xlsx”.').isVisible());

  await exportMenu.click();
  await page.getByRole('button', { name: 'Copy table for a spreadsheet' }).click();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  check('Copy puts the table on the clipboard, tab-separated', clipboard.startsWith('Piece\tQuantity\tLength (mm)'), clipboard.slice(0, 80));

  console.log('Changing pieces by hand');
  const selectedBefore = await page.evaluate(() => window.__kitchen.ui.getState().selectedId);
  const unitBefore = (await design()).items.find((i) => i.id === selectedBefore);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Delete');
  const unitAfter = (await design()).items.find((i) => i.id === selectedBefore);
  check('keys for the selected unit do nothing while the cutting list is open', !!unitBefore && unitAfter?.x === unitBefore.x, { unitBefore, unitAfter });
  await page.getByRole('radio', { name: 'By unit' }).click();
  check('the list can be grouped by unit', await page.getByRole('heading', { name: /^B1 / }).isVisible());
  await shot('13-cutting-list-by-unit.png');
  const b1Id = (await byLabel('B1')).id;
  const b1Section = page.locator('section').filter({ has: page.getByRole('heading', { name: /^B1 / }) });
  check('each unit’s parts are paired with its own dimensioned image', await b1Section.getByRole('img', { name: `Front view, ${previewB1.width} by ${previewB1.height} mm`, exact: true }).isVisible());
  await b1Section.getByRole('button', { name: 'Change Side', exact: true }).click();
  const partEditor = page.getByTestId('part-editor');
  await partEditor.getByLabel('Length', { exact: true }).fill('700');
  await shot('13c-part-editor.png');
  await partEditor.getByRole('button', { name: 'Save' }).click();
  const b1Edits = (await design()).partEdits[b1Id];
  check(
    'a piece can be changed by hand, keeping only what differs from the calculation',
    b1Edits && Object.values(b1Edits).length === 1 && sortedJson(Object.values(b1Edits)[0]) === sortedJson({ length: 700 }),
    b1Edits,
  );
  const b1Table = await b1Section.locator('table').innerText();
  check('the changed piece is marked in the list', /Side\s*changed\s+2\s+700\s+560/i.test(b1Table), b1Table.split('\n').find((l) => l.startsWith('Side')));
  await b1Section.getByRole('button', { name: 'Undo the change to Side' }).click();
  check('…and put back as calculated', !(await design()).partEdits[b1Id], (await design()).partEdits);

  await b1Section.getByRole('button', { name: 'Change Side', exact: true }).click();
  await partEditor.getByLabel('Board', { exact: true }).selectOption('mdf-oak-19');
  check('the editor warns that the rest of the unit is sized for the old board', await partEditor.getByText('still sized for 18 mm').isVisible());
  await partEditor.getByRole('button', { name: 'Save' }).click();
  const boardEdits = (await design()).partEdits[b1Id];
  check(
    'a piece can be cut from another board',
    boardEdits && sortedJson(Object.values(boardEdits)) === sortedJson([{ materialId: 'mdf-oak-19' }]),
    boardEdits,
  );
  check('…which the list shows', /Side\s*changed\s+2\s+702\s+560\s+19\s+Oak-veneered MDF/i.test(await b1Section.locator('table').innerText()));
  await page.keyboard.press('Control+z');
  check('Ctrl+Z works in the cutting list too', !(await design()).partEdits[b1Id], (await design()).partEdits);

  console.log('Extra pieces');
  await page.getByRole('button', { name: 'Add piece' }).click();
  const extraCard = page.getByTestId('custom-part').first();
  const extraName = extraCard.getByLabel('Name', { exact: true });
  await extraName.fill('Plinth');
  await extraName.press('Enter');
  for (const [label, value] of [
    ['Quantity', '2'],
    ['Length', '2400'],
    ['Width', '100'],
  ]) {
    const field = extraCard.getByLabel(label, { exact: true });
    await field.fill(value);
    await field.press('Enter');
  }
  await extraCard.getByLabel('Edge band', { exact: true }).selectOption('abs-1');
  await extraCard.getByLabel('Length edges', { exact: true }).selectOption('1');
  const extraPart = (await design()).customParts[0];
  check(
    'an extra piece can be added and described',
    extraPart?.name === 'Plinth' && extraPart.quantity === 2 && extraPart.length === 2400 && extraPart.width === 100 && extraPart.edgeBandId === 'abs-1' && extraPart.edgesLength === 1,
    extraPart,
  );
  await shot('13d-extra-pieces.png');
  const extraTable = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Extra pieces', exact: true }) }).locator('table');
  check('extra pieces also appear in the By unit tables, not only in totals', /Plinth\s+2\s+2400\s+100/.test(await extraTable.innerText()));
  await page.getByRole('radio', { name: 'Identical pieces together' }).click();
  const grouped = await page.locator('table').first().innerText();
  check('it is listed with the rest, under "Extra"', /Plinth\s+2\s+2400\s+100[^\n]*Extra/.test(grouped), grouped.split('\n').find((l) => l.startsWith('Plinth')));

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('radio', { name: 'Construction', exact: true }).click();
  await page.getByRole('button', { name: 'Reset to defaults' }).click();
  const reset = (await design()).construction;
  check('Reset to defaults restores the construction rules', reset.bottomJoint === 'between' && reset.drawerSystem === 'wooden', reset);
  check('…and keeps the chosen materials', reset.frontMaterial === 'mdf-oak-19', reset);
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('radio', { name: '2. Layout' }).click();
  await page.waitForSelector('canvas');

  console.log('Projects');
  await projectsButton.click();
  check('the projects dialog lists the open kitchen and the separate originals', (await projectRows.count()) === projectsWithOriginals && (await projectRows.first().innerText()).includes('Kuhinja Petrović'));
  await projectsDialog.getByRole('button', { name: 'Copy Kuhinja Petrović' }).click();
  check('a project can be copied', (await projectRows.count()) === projectsWithOriginals + 1 && (await projectsDialog.getByText('Kuhinja Petrović (copy)').isVisible()));

  // Exercise the non-picker path: a download request alone is not proof the file was saved.
  await page.evaluate(() => Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined }));
  const backupRow = projectRows.filter({ has: page.getByRole('button', { name: 'Save Kuhinja Petrović to a file', exact: true }) });
  const [projectDownload] = await Promise.all([
    page.waitForEvent('download'),
    projectsDialog.getByRole('button', { name: 'Save Kuhinja Petrović to a file' }).click(),
  ]);
  const projectPath = path.join(shotsDir, 'project.kitchen.json');
  await projectDownload.saveAs(projectPath);
  const projectFile = JSON.parse(await readFile(projectPath, 'utf8'));
  check('a download alone does not count as a backup', await backupRow.getByText('No confirmed file backup yet.').isVisible());
  await backupRow.getByRole('button', { name: 'I saved the file' }).click();
  check('Projects shows the confirmed file backup', await backupRow.getByText(/^Last file backup:/).isVisible());
  check(
    'a project can be saved to a file, extra pieces and all',
    projectDownload.suggestedFilename() === 'Kuhinja Petrović.kitchen.json' && projectFile.customParts.length === 1 && projectFile.items.length > 10,
    projectDownload.suggestedFilename(),
  );
  await shot('17-projects.png');

  await projectsDialog.getByRole('button', { name: 'Start fresh', exact: true }).click();
  check(
    'a new project starts empty in its room workspace, without a kitchen already chosen',
    (await design()).items.length === 0 && (await design()).name === 'Kitchen 1' && await workspace.getByTestId('room-plan').isVisible() && !(await gallery.isVisible()),
    (await design()).name,
  );
  await projectsButton.click();
  await projectsDialog.getByLabel('Project file').setInputFiles(projectPath);
  // The file is read in the background; the dialog closes once it is open.
  await projectsDialog.waitFor({ state: 'hidden' });
  check(
    'a project file can be opened again',
    (await design()).name === 'Kuhinja Petrović' && sortedJson((await design()).items) === sortedJson(projectFile.items) && !(await projectsDialog.isVisible()),
  );

  await projectsButton.click();
  await projectsDialog.getByRole('button', { name: 'Delete Kitchen 1' }).click();
  check('deleting asks for a second click', (await projectRows.count()) === projectsWithOriginals + 3);
  await projectsDialog.getByRole('button', { name: 'Delete?' }).click();
  check('…and then deletes the project', (await projectRows.count()) === projectsWithOriginals + 2 && !(await projectsDialog.getByText('Kitchen 1').isVisible()));
  await projectRows.filter({ hasText: 'Kuhinja Petrović (copy)' }).getByRole('button', { name: 'Open' }).click();
  check('another project can be opened', (await design()).name === 'Kuhinja Petrović (copy)' && (await design()).customParts.length === 1, (await design()).name);

  await page.reload();
  await page.waitForSelector('canvas');
  const storedIndex = await page.evaluate(() => JSON.parse(localStorage.getItem('kitchen-designer:projects')));
  check(
    'the projects and the open one survive a reload',
    (await design()).name === 'Kuhinja Petrović (copy)' && storedIndex.projects.length === projectsWithOriginals + 2,
    { name: (await design()).name, projects: storedIndex.projects.map((p) => p.name) },
  );

  console.log('Checks');
  const checksButton = page.getByRole('button', { name: /^Checks:/ });
  const b1Unit = await screen(1200, 470);
  await page.mouse.click(b1Unit.x, b1Unit.y);
  const fromLeft = page.getByLabel('From left wall');
  await fromLeft.fill('1200');
  await fromLeft.press('Enter');
  await fromLeft.press('Escape');
  check('the checks count the overlap as an error', /error/.test(await checksButton.getAttribute('aria-label')), await checksButton.getAttribute('aria-label'));
  await checksButton.click();
  const overlap = page.getByRole('button', { name: 'B1 and S1 overlap.' });
  if (!await overlap.isVisible()) await page.getByRole('dialog', { name: 'Checks', exact: true }).locator('summary').filter({ hasText: /^Show all/ }).click();
  check('the checks list names the units', await overlap.isVisible());
  await shot('14b-checks.png');
  await overlap.click();
  check('opening an issue selects the unit', (await view()).selectedId === (await byLabel('B1')).id);
  await page.keyboard.press('Control+z');
  check('undo clears the error', !/error/.test(await checksButton.getAttribute('aria-label')), await checksButton.getAttribute('aria-label'));

  console.log('Windows and doors');
  await page.keyboard.press('Escape');
  await page.getByRole('radio', { name: '1. Room', exact: true }).click();
  await page.getByRole('button', { name: 'Add an object', exact: true }).click();
  await page.getByRole('button', { name: 'Window', exact: true }).click();
  const selectedOpening = page.getByTestId('selected-room-card').getByTestId('opening-card');
  for (const [label, value] of [
    ['From wall start', '1500'],
    ['Width', '800'],
  ]) {
    const field = selectedOpening.getByLabel(label, { exact: true });
    await field.fill(value);
    await field.press('Enter');
  }
  const windowOpening = (await design()).openings[0];
  check(
    'a window can be added and placed on a wall',
    windowOpening?.kind === 'window' && windowOpening.wallId === 'top' && windowOpening.offset === 1500 && windowOpening.width === 800,
    windowOpening,
  );
  check('the checks notice wall units in front of the window', /warning/.test(await checksButton.getAttribute('aria-label')), await checksButton.getAttribute('aria-label'));
  await page.getByRole('button', { name: 'Add an object', exact: true }).click();
  await page.getByRole('button', { name: 'Door', exact: true }).click();
  await selectedOpening.getByLabel('Wall', { exact: true }).selectOption('bottom');
  const doorFrom = selectedOpening.getByLabel('From wall start', { exact: true });
  await doorFrom.fill('1200');
  await doorFrom.press('Enter');
  const doorOpening = (await design()).openings[1];
  check('a door can go on another wall', doorOpening?.kind === 'door' && doorOpening.wallId === 'bottom' && doorOpening.offset === 1200, doorOpening);
  await doorFrom.press('Escape');
  await page.waitForTimeout(150);
  await shot('15b-window-and-door.png');
  await page.getByRole('radio', { name: '3. 3D', exact: true }).click();
  await page.locator('main canvas').first().waitFor();
  await page.waitForTimeout(2500);
  await shot('16-3d-window.png');
  await page.getByRole('radio', { name: '2. Layout' }).click();
  await page.waitForSelector('canvas');

  console.log('Phone');
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'sr-Latn-RS', isMobile: true, hasTouch: true, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  const mobile = await phone.newPage();
  mobile.on('pageerror', (e) => problems.push(`phone page error: ${e.message}`));
  mobile.on('console', (m) => {
    if ((m.type() === 'error' || m.type() === 'warning') && !isNoise(m.text())) problems.push(`phone ${m.type()}: ${m.text()}`);
  });
  const mobileDesign = () => mobile.evaluate(() => window.__kitchen.design.getState().design);
  const mobileView = () =>
    mobile.evaluate(() => {
      const s = window.__kitchen.ui.getState();
      return { zoom: s.zoom, pan: s.pan, selectedId: s.selectedId };
    });
  const mobileScreen = async (x, y) => {
    const { zoom, pan } = await mobileView();
    const box = await mobile.locator('main').boundingBox();
    return { x: Math.round(box.x + pan.x + x * zoom), y: Math.round(box.y + pan.y + y * zoom) };
  };
  const cdp = await phone.newCDPSession(mobile);
  const touch = (type, points) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
  async function touchPath(from, to, steps = 10) {
    await touch('touchStart', from.map((p) => [p.x, p.y]));
    for (let i = 1; i <= steps; i++) {
      await touch('touchMove', from.map((p, k) => [p.x + ((to[k].x - p.x) * i) / steps, p.y + ((to[k].y - p.y) * i) / steps]));
    }
    await touch('touchEnd', []);
  }

  await mobile.goto(url, { waitUntil: 'domcontentloaded' });
  const phoneRoom = mobile.getByTestId('room-workspace');
  await phoneRoom.getByTestId('room-plan').waitFor();
  await mobile.evaluate(() => document.fonts.ready);
  await mobile.screenshot({ path: path.join(shotsDir, 'phone-01-empty-sr.png') });
  check('the phone starts in the Serbian room editor too', await phoneRoom.getByRole('heading', { name: 'Prostorija', exact: true }).isVisible());
  await mobile.setViewportSize({ width: 320, height: 568 });
  const startActions = await Promise.all([mobile.getByRole('button', { name: /^Provere:/ }), mobile.getByTestId('room-done')].map((el) => el.boundingBox()));
  check('the room starting actions fit on a 320 px phone', startActions.every((box) => box && box.x >= 0 && box.x + box.width <= 320 && box.y + box.height <= 568), startActions);
  await mobile.screenshot({ path: path.join(shotsDir, 'usability-start-phone-narrow.png') });
  await mobile.getByTestId('room-done').tap();
  await mobile.locator('.konvajs-content').waitFor();
  const filterBounds = await mobile.getByRole('group', { name: 'Prikaz elemenata' }).boundingBox();
  const planTools = mobile.getByRole('group', { name: 'Uvećanje osnove' });
  const zoomBounds = await planTools.boundingBox();
  const fitBounds = await planTools.getByRole('button', { name: 'Prikaži celu prostoriju' }).boundingBox();
  check('320px plan filters leave room for a tappable Fit button', fitBounds.width >= 44 && fitBounds.height >= 44
    && filterBounds.x >= 0 && zoomBounds.x + zoomBounds.width <= 320
    && (filterBounds.x + filterBounds.width + 4 <= zoomBounds.x || filterBounds.y + filterBounds.height + 4 <= zoomBounds.y),
    { filterBounds, zoomBounds, fitBounds });
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.getByRole('button', { name: 'Više' }).tap();
  await mobile.screenshot({ path: path.join(shotsDir, 'phone-00-menu-sr.png') });
  await mobile.getByRole('button', { name: 'Više', exact: true }).tap();
  await chooseLanguage(mobile, 'en');
  check('the empty layout offers both starting choices', await mobile.getByRole('button', { name: 'Add cabinets yourself', exact: true }).isVisible() && await mobile.getByRole('button', { name: 'Start from an idea', exact: true }).isVisible());
  check('the phone keeps consistent navigation labels visible', (await mobile.getByLabel('Project name').isVisible()) && (await mobile.getByRole('radio', { name: '2. Layout', exact: true }).getByText('Layout', { exact: true }).isVisible()) && (await mobile.getByRole('radio', { name: '4. Cut list', exact: true }).getByText('Cut list', { exact: true }).isVisible()));
  await mobile.getByRole('radio', { name: '1. Room', exact: true }).tap();
  await phoneRoom.getByTestId('room-plan').waitFor();
  await mobile.screenshot({ path: path.join(shotsDir, 'usability-room-setup-phone.png') });
  await mobile.getByTestId('room-done').tap();
  await mobile.getByRole('button', { name: 'Add cabinets yourself', exact: true }).tap();
  check('users can open the part picker after room setup on phones', await mobile.getByRole('dialog', { name: 'Add element', exact: true }).isVisible());
  await mobile.getByRole('searchbox', { name: 'Search kitchen parts' }).fill('600');
  await mobile.screenshot({ path: path.join(shotsDir, 'phone-02-add.png') });
  await mobile.locator('[data-preset="base-600"]').tap();
  const phoneAdd = mobile.getByRole('dialog', { name: 'Add element', exact: true });
  check('tapping a part keeps the picker ready for another', (await mobileDesign()).items.length === 1 && await phoneAdd.getByRole('status').filter({ hasText: 'Added:' }).isVisible());
  await phoneAdd.getByRole('button', { name: 'Close', exact: true }).tap();
  check('the new unit is selected and shown at the bottom', await mobile.getByTestId('item-sheet').isVisible());

  check('users can add another element without deselecting', await mobile.getByTestId('item-sheet').getByRole('button', { name: 'Add element' }).isVisible());
  const unitCentre = await mobileScreen(300, 400);
  const target = await mobileScreen(1500, 400);
  await touchPath([unitCentre], [target]);
  const movedOnPhone = (await mobileDesign()).items[0];
  check('dragging with a finger moves the unit along the wall', movedOnPhone.x === 1200 && movedOnPhone.y === 0, movedOnPhone);

  const zoomBefore = (await mobileView()).zoom;
  const pinchCentre = await mobileScreen(1800, 1500);
  await touchPath(
    [{ x: pinchCentre.x - 40, y: pinchCentre.y }, { x: pinchCentre.x + 40, y: pinchCentre.y }],
    [{ x: pinchCentre.x - 120, y: pinchCentre.y }, { x: pinchCentre.x + 120, y: pinchCentre.y }],
  );
  const zoomAfter = (await mobileView()).zoom;
  check('pinching with two fingers zooms in', zoomAfter > zoomBefore * 2.5, { zoomBefore, zoomAfter });
  check('a pinch does not move the unit', (await mobileDesign()).items[0].x === 1200);
  await mobile.getByRole('button', { name: 'Fit the room in view' }).tap();

  await mobile.getByTestId('item-sheet').getByRole('slider').tap();
  await mobile.getByRole('tab', { name: 'Fronts', exact: true }).tap();
  await mobile.getByRole('button', { name: 'More drawers' }).tap();
  check('the unit can be configured on the phone', (await mobileDesign()).items[0].drawers === 1);
  await mobile.screenshot({ path: path.join(shotsDir, 'phone-03-edit.png') });
  await mobile.getByTestId('item-sheet').getByRole('slider').press('Home');

  await mobile.getByRole('radio', { name: '4. Cut list', exact: true }).tap();
  check('the cutting list opens on the phone', await mobile.locator('table').first().isVisible());
  await mobile.getByTestId('cutting-overview').locator('..').locator(':scope > summary').tap();
  check('phone users can see a dimensioned image of their cabinet', await mobile.getByTestId('cutting-cabinet-preview').getByRole('img').isVisible());
  await mobile.setViewportSize({ width: 320, height: 568 });
  check('the cut-list overview fits a narrow phone without page-level horizontal overflow', await mobile.getByTestId('cutting-overview').evaluate((element) => element.scrollWidth <= element.clientWidth + 1));
  await mobile.screenshot({ path: path.join(shotsDir, 'phone-cutting-overview-narrow.png') });
  await mobile.setViewportSize({ width: 390, height: 844 });
  check('…with its Export menu and extra pieces', (await mobile.getByRole('button', { name: 'Export the cut list' }).isVisible()) && (await mobile.getByRole('button', { name: 'Add piece' }).isVisible()));
  await mobile.screenshot({ path: path.join(shotsDir, 'phone-04-list.png') });
  await mobile.getByRole('button', { name: 'Export the cut list' }).tap();
  await mobile.screenshot({ path: path.join(shotsDir, 'phone-04b-export.png') });
  await mobile.getByRole('button', { name: 'Export the cut list' }).tap();

  await mobile.getByRole('radio', { name: '3. 3D', exact: true }).tap();
  await mobile.locator('main canvas').first().waitFor();
  await mobile.waitForTimeout(2500);
  await open3DTools(mobile);
  check('the 3D view opens on the phone', await mobile.getByRole('button', { name: 'Style' }).isVisible());
  await mobile.screenshot({ path: path.join(shotsDir, 'phone-05-3d.png') });
  await close3DTools(mobile);
  await mobile.getByRole('button', { name: 'Deselect' }).tap();
  await mobile.getByRole('radio', { name: '1. Room', exact: true }).tap();
  await mobile.getByRole('button', { name: 'More', exact: true }).tap();
  await mobile.getByTestId('room-ideas').tap();
  const beforeStarter = await mobileDesign();
  await mobile.getByRole('radio', { name: 'Starter layouts' }).tap();
  await mobile.getByRole('button', { name: /^U-shaped/ }).tap();
  check('a phone starter preview has not replaced the existing kitchen', sortedJson(await mobileDesign()) === sortedJson(beforeStarter));
  await mobile.getByTestId('confirm-idea-fit').tap();
  const phoneLayout = await mobileDesign();
  check('confirming the U-shaped starter builds two corners in the existing room', phoneLayout.items.filter((i) => i.kind === 'corner').length === 2 && sortedJson(phoneLayout.room) === sortedJson(beforeStarter.room));
  await mobile.getByRole('radio', { name: '3. 3D', exact: true }).tap();
  await mobile.waitForTimeout(2000);
  await mobile.screenshot({ path: path.join(shotsDir, 'phone-06-u-3d.png') });

  await mobile.getByRole('banner').getByRole('button', { name: 'More', exact: true }).tap();
  await mobile.getByRole('button', { name: 'Ideas', exact: true }).tap();
  const phoneGallery = mobile.getByRole('dialog', { name: 'Ideas' });
  check('phone gallery keeps advanced filters collapsed until requested', !(await phoneGallery.locator('#kitchen-design-filters').isVisible()));
  await phoneGallery.getByRole('button', { name: 'Reset filters', exact: true }).tap();
  check('all inspiration kitchens are available on the phone', (await phoneGallery.locator('[data-kitchen-design]').count()) === 61);
  await mobile.setViewportSize({ width: 320, height: 568 });
  await mobile.evaluate(() => window.__kitchen.ui.getState().setLanguage('sr'));
  await mobile.getByRole('dialog', { name: 'Ideje', exact: true }).waitFor();
  await mobile.getByRole('searchbox', { name: 'Pretraži dizajne kuhinja', exact: true }).fill('sodji');
  check('phone search matches Serbian names without diacritics', (await mobile.locator('[data-kitchen-design]').count()) === 1 && await mobile.locator('[data-kitchen-design="shoji-retreat"]').isVisible());
  await mobile.getByRole('button', { name: 'Obriši pretragu dizajna', exact: true }).tap();
  check('phone users can clear search and recover all designs', (await mobile.locator('[data-kitchen-design]').count()) === 61);
  const narrowOverflow = await mobile.getByRole('dialog').evaluate((dialog) =>
    [...dialog.querySelectorAll('button, [role="radiogroup"], p, summary')]
      .filter((element) => element.scrollWidth > element.clientWidth + 1)
      .map((element) => element.textContent),
  );
  check('the gallery fits a 320 px phone in Serbian without clipped controls or text', narrowOverflow.length === 0, narrowOverflow);
  const headerFits = () => mobile.locator('header').evaluate((header) => {
    const bounds = header.getBoundingClientRect();
    const buttons = [...header.querySelectorAll('button')].map((button) => button.getBoundingClientRect()).filter((rect) => rect.width > 0 && rect.height > 0);
    return header.scrollWidth <= header.clientWidth + 1 &&
      buttons.every((rect, index) => rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1 && rect.bottom <= bounds.bottom + 1 &&
        buttons.slice(index + 1).every((other) => Math.min(rect.right, other.right) - Math.max(rect.left, other.left) <= 1 || Math.min(rect.bottom, other.bottom) - Math.max(rect.top, other.top) <= 1));
  });
  check('all phone toolbar controls fit at 320 px', await headerFits());
  await mobile.screenshot({ path: path.join(shotsDir, 'phone-06a-kitchen-gallery-sr-narrow.png') });
  await mobile.setViewportSize({ width: 390, height: 844 });
  check('the Serbian toolbar also fits a 390 px phone', await headerFits());
  await mobile.evaluate(() => window.__kitchen.ui.getState().setLanguage('en'));
  await mobile.waitForFunction(() => document.querySelector('[data-kitchen-design] img')?.naturalWidth === 900);
  await mobile.screenshot({ path: path.join(shotsDir, 'phone-06b-kitchen-gallery.png') });
  await phoneGallery.getByRole('button', { name: 'Filter designs', exact: true }).tap();
  check('phone users can reveal the style, layout and room-size filters', await phoneGallery.locator('#kitchen-design-filters').isVisible());
  await phoneGallery.getByLabel('Kitchen layout', { exact: true }).selectOption('island');
  await phoneGallery.locator('[data-kitchen-design="monochrome-island"]').locator('..').getByRole('button', { name: /^More options for / }).tap();
  await phoneGallery.locator('[data-kitchen-original="monochrome-island"]').tap();
  check(
    'opening an original on the phone opens its exact editable kitchen without an underlying room sheet',
    sortedJson(kitchenSnapshot(await mobileDesign())) === sortedJson(kitchenSnapshot(kitchenPresets.find((preset) => preset.id === 'monochrome-island').design)) && (await mobile.getByRole('dialog').count()) === 0,
  );
  check('warning counts do not overlap or hide the phone menu', await headerFits());
  await mobile.waitForTimeout(500);
  await mobile.screenshot({ path: path.join(shotsDir, 'phone-06c-gallery-kitchen-loaded.png') });

  await mobile.getByRole('button', { name: 'More' }).tap();
  await mobile.getByRole('button', { name: 'Projects', exact: true }).tap();
  check('projects open from the menu on the phone', await mobile.getByRole('dialog', { name: 'Projects' }).isVisible());
  await mobile.screenshot({ path: path.join(shotsDir, 'phone-07-projects.png') });
  await mobile.getByRole('button', { name: 'Close' }).tap();
  await phone.close();
} catch (error) {
  failures++;
  console.error(error);
  await shot('error.png').catch(() => {});
} finally {
  check('no errors or warnings in the browser console', problems.length === 0, problems);
  await browser.close();
  await server.close();
}

console.log(failures === 0 ? '\nAll browser checks passed.' : `\n${failures} browser check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
