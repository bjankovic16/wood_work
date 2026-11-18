import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { assertNeutralScene, open3DTools } from './three-test-helpers.mjs';

const server = await createServer({ logLevel: 'error', cacheDir: path.resolve('test-results/room-ideas/.vite'), optimizeDeps: { entries: ['index.html'] }, server: { host: '127.0.0.1', port: 0, watch: null, hmr: false } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ locale: 'en-US', viewport: { width: 1440, height: 900 }, hasTouch: true, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (m) => { if (/shader error/i.test(m.text())) errors.push(m.text()); });
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'domcontentloaded' });
  const room = page.getByTestId('room-workspace');
  await room.waitFor();
  const design = () => page.evaluate(() => window.__kitchen.design.getState().design);
  const initial = await design();
  const ideas = page.getByRole('button', { name: 'Ideas', exact: true });
  const gallery = page.getByRole('dialog', { name: 'Ideas', exact: true });
  const within = gallery.getByRole('checkbox', { name: 'No larger than my room' });
  const confirm = page.getByTestId('confirm-idea-fit');
  const notice = page.getByTestId('fit-notice');
  const previewReport = page.getByTestId('fit-checks');
  const actualChecks = () => page.evaluate(async () => {
    const { currentIssues } = await import('/src/store/derived.ts');
    const { en } = await import('/src/i18n/en.ts');
    return currentIssues(window.__kitchen.design.getState(), en.engine).map((i) => i.message);
  });
  const audited = await page.evaluate(async () => {
    const { KITCHEN_DESIGNS } = await import('/src/domain/kitchens.ts');
    const { prepareIdeaReview } = await import('/src/store/ideaReview.ts');
    const { acceptFit } = await import('/src/store/actions.ts');
    const { currentIssues } = await import('/src/store/derived.ts');
    const { currentMessages } = await import('/src/i18n/index.ts');
    const { design, ui } = window.__kitchen, original = design.getState().design, t = currentMessages();
    // Exercise the real preview, apply, badge and history commands in one browser turn.
    // The full UI (including card images, check text and Undo button) is exercised below.
    const rows = KITCHEN_DESIGNS.map(({ id }) => {
      const review = prepareIdeaReview(original, { type: 'idea', id }, { prefixes: t.labelPrefix }, t.engine);
      const applied = acceptFit(review);
      const actual = currentIssues(design.getState(), t.engine);
      const row = { id, applied, items: design.getState().design.items.length, checks: actual.map((issue) => issue.message),
        shown: review.issues.map((issue) => issue.message), count: ui.getState().fitNotice?.changes, changes: review.fit?.changes.length };
      design.getState().undo();
      return { ...row, restored: design.getState().design === original };
    });
    ui.getState().setView('plan');
    return rows;
  });
  assert.equal(audited.length, 61);
  for (const row of audited) {
    assert.ok(row.applied && row.items > 0 && row.restored, row.id);
    assert.deepEqual(row.checks, [], row.id);
    assert.deepEqual(row.shown, row.checks, row.id);
    assert.equal(row.count, row.changes, row.id);
  }
  for (const id of ['walnut-frame', 'olive-window-wall', 'urban-oak', 'basil-studio']) {
    await ideas.click();
    assert.ok(await within.isChecked(), 'The size filter is on each time the gallery opens.');
    await within.uncheck();
    const card = gallery.locator(`[data-kitchen-design="${id}"]`);
    await card.locator('img').click();
    assert.deepEqual(await design(), initial, `${id}: inspecting the picture must not change the project.`);
    assert.equal(await previewReport.getAttribute('data-issues'), '0', id);
    const changeCount = await page.getByTestId('fit-adjustments').locator('li').count();
    await confirm.click();
    assert.ok((await design()).items.length > 0, id);
    assert.deepEqual(await actualChecks(), [], id);
    if (id === 'basil-studio') {
      await page.waitForFunction(() => window.__kitchen3D?.scene.getObjectByName('studio-sink') && window.__kitchen3D.camera.fov === 28);
      await assertNeutralScene(page);
      const staged = await design();
      const camera = page.getByRole('group', { name: '3D camera' });
      await camera.getByRole('button', { name: 'Front', exact: true }).click();
      await page.waitForFunction(() => !window.__kitchen3D.scene.getObjectByName('studio-sink') && window.__kitchen3D.camera.fov === 45);
      await camera.getByRole('button', { name: 'Studio', exact: true }).click();
      assert.deepEqual(await design(), staged, 'Changing presentation must not change any project data.');
    }
    assert.match(await notice.innerText(), new RegExp(`\\b${changeCount} layout adjustment`), id);
    await notice.getByRole('button', { name: 'Undo' }).click();
    assert.deepEqual(await design(), initial, `Undo ${id}`);
  }
  console.log(`${audited.length}/${audited.length} gallery ideas applied to the default room: zero workshop errors or warnings; preview, adjustment count and Undo match.`);
  // A custom piece cannot be fixed by moving cabinets. Disclose it, unchanged, before confirmation.
  await page.evaluate(() => window.__kitchen.design.getState().apply((d) => ({
    ...d, customParts: [{ id: 'rail', name: 'Existing rail', length: 7900, width: 110, quantity: 1,
      materialId: d.construction.carcassMaterial, edgeBandId: null, edgesLength: 0, edgesWidth: 0, note: '' }],
  })));
  await ideas.click();
  await within.uncheck();
  await gallery.locator('[data-kitchen-design="walnut-frame"]').click();
  const disclosed = await previewReport.locator('li').allTextContents();
  assert.ok(disclosed.some((issue) => issue.includes('Existing rail')));
  await confirm.click();
  assert.deepEqual(await actualChecks(), disclosed);
  await page.getByRole('textbox', { name: 'Project name' }).fill('Measured example');
  await page.getByRole('textbox', { name: 'Project name' }).press('Enter');
  assert.equal(await notice.count(), 0, 'A stale suggestion cannot undo a later edit.');
  await page.evaluate((d) => window.__kitchen.design.getState().load(d), initial);
  const before = await page.evaluate(async () => {
    const { design } = window.__kitchen;
    const d = design.getState().design;
    const target = { ...d, name: 'Measured kitchen', room: { width: 4500, depth: 3500, height: 2600,
      features: [{ id: 'my-chimney', kind: 'chimney', x: 2000, y: 0, width: 450, depth: 400 }] },
      openings: [{ id: 'window', kind: 'window', wall: 'bottom', offset: 1550, width: 1050, sill: 970, height: 950 },
        { id: 'door', kind: 'door', wall: 'left', offset: 1200, width: 850, sill: 0, height: 2100 }] };
    design.getState().load(target);
    return target;
  });
  for (const [side, expectedWall] of [['Left return', 'right'], ['Right return', 'left']]) {
    await ideas.click();
    await within.uncheck();
    await page.locator('[data-kitchen-design="warm-minimal"]').click();
    if (side === 'Left return') {
      await page.locator('[data-fit-wall="bottom"]').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.getByLabel('Main wall', { exact: true }).inputValue(), 'bottom');
    } else await page.getByLabel('Main wall', { exact: true }).selectOption('bottom');
    await page.getByRole('radio', { name: side, exact: true }).click();
    assert.deepEqual(await design(), before, 'Looking at a proposal never commits it.');
    await page.getByTestId('confirm-idea-fit').click();
    await page.getByTestId('three-toolbar').waitFor();
    const fitted = await design();
    assert.deepEqual(fitted.room, before.room);
    assert.deepEqual(fitted.openings, before.openings);
    const sideWall = await page.evaluate(async () => {
      const { attachedSegment } = await import('/src/domain/geometry.ts');
      const { room, items } = window.__kitchen.design.getState().design;
      return attachedSegment(items.find((i) => i.kind === 'hob'), room)?.id;
    });
    assert.equal(sideWall, expectedWall);
    if (side === 'Left return') {
      await notice.getByRole('button', { name: 'Undo', exact: true }).click();
      assert.deepEqual(await design(), before);
    }
  }
  const fitted = await design();
  const transforms = (d) => d.items.map(({ id, kind, x, y, rotation, width, width2, height, depth, elevation }) =>
    [id, kind, x, y, rotation, width, width2, height, depth, elevation]);
  const parts = () => page.evaluate(async () => {
    const { buildCuttingList } = await import('/src/engine/cuttingList.ts');
    return buildCuttingList(window.__kitchen.design.getState().design).units.map((u) => u.parts);
  });
  const priorParts = await parts();
  await ideas.click();
  await within.uncheck();
  await page.locator('[data-kitchen-design="walnut-frame"]').click();
  await gallery.getByRole('heading', { name: /^Appearance only/ }).waitFor();
  assert.deepEqual(await design(), fitted);
  await confirm.click();
  const styled = await design();
  assert.deepEqual(transforms(styled), transforms(fitted));
  assert.deepEqual(styled.room, before.room);
  assert.deepEqual(styled.openings, before.openings);
  assert.deepEqual(await parts(), priorParts);
  assert.equal(styled.galleryPresetId, 'walnut-frame');
  assert.notDeepEqual(styled.style, fitted.style);
  assert.equal(styled.style.windowFrame, 'walnut');
  assert.equal(styled.style.doorFrame, 'walnut');
  await notice.getByRole('button', { name: 'Undo', exact: true }).click();
  assert.deepEqual(await design(), fitted);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate((empty) => {
    window.__kitchen.design.getState().load(empty);
    window.__kitchen.ui.getState().setRoomOpen(true);
  }, initial);
  await page.getByTestId('room-ideas').tap();
  await gallery.locator('[data-kitchen-design] img').first().tap();
  const sketch = gallery.getByRole('group', { name: 'Proposed layout in your room' });
  await sketch.scrollIntoViewIfNeeded();
  const bounds = await sketch.boundingBox();
  assert.ok(bounds.width >= 350 && bounds.height >= 240, 'The phone sketch should use the sheet width and have room for fingers.');
  const wall = sketch.locator('[data-fit-wall="right"]');
  const p = await wall.locator('circle').boundingBox();
  await page.touchscreen.tap(p.x + p.width / 2 + 21, p.y + p.height / 2);
  assert.equal(await gallery.getByLabel('Main wall', { exact: true }).inputValue(), 'right');
  assert.equal(await wall.getAttribute('aria-pressed'), 'true');
  assert.ok((await wall.getAttribute('aria-label')).includes('3000 mm'));
  await gallery.getByRole('button', { name: 'Close', exact: true }).tap();
  await page.getByTestId('room-done').tap();
  await page.getByTestId('empty-plan-hint').waitFor();
  await page.reload();
  await page.getByTestId('empty-plan-hint').waitFor();
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.equal(await ideas.count(), 1);
  await ideas.tap();
  await gallery.locator('[data-kitchen-design="basil-studio"]').tap();
  await gallery.getByRole('checkbox', { name: /pictured wall paint/ }).uncheck();
  await confirm.tap();
  await page.waitForFunction(() => window.__kitchen3D?.scene.getObjectByName('arched-mixer'));
  assert.equal((await design()).style.floorPattern, undefined);
  await open3DTools(page);
  await page.getByTestId('phone-view-sheet').getByRole('button', { name: 'Top', exact: true }).tap();
  await open3DTools(page);
  await page.getByTestId('phone-view-sheet').getByRole('button', { name: 'Studio', exact: true }).tap();
  await page.waitForFunction(() => window.__kitchen3D?.camera.fov === 28);
  await assertNeutralScene(page);
  assert.deepEqual(errors, []);
  console.log('Both L returns fit around the measured room; a subsequent idea keeps every cabinet, opening, structure and cut part, with one Undo.');
} finally {
  await browser?.close();
  await server.close();
}
