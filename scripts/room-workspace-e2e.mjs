import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { draftedWindowCheck, furnishedWallChecks, planCornerChecks, workspaceObjectChecks } from './room-object-checks.mjs';
import { startFreshChecks } from './start-fresh-checks.mjs';
import { plannerChecks } from './planner-checks.mjs';
import { showRoomModel, waitForIdleRendering } from './three-test-helpers.mjs';

const server = await createServer({ logLevel: 'error', cacheDir: path.resolve('test-results/room-workspace/.vite'),
  optimizeDeps: { entries: ['index.html'] }, server: { host: '127.0.0.1', port: 0, watch: null, hmr: false } });
const planOnly = process.argv.includes('--plan-only');

async function assertWallTargets(plan, count) {
  const targets = await plan.locator('[data-wall-dimension],[data-wall-view]').evaluateAll((nodes) => nodes.map((node) => {
    const box = node.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return { w: box.width, h: box.height, reachable: node.contains(hit), horizontal: node.getScreenCTM().b === 0 };
  }));
  assert.equal(targets.length, count);
  assert.ok(targets.every((b) => b.w >= 43.9 && b.h >= 43.9 && b.reachable && b.horizontal), 'Every number and adjacent wall shortcut must have its own reachable target.');
}

async function phoneRoomTools(page, workspace) {
  await page.evaluate(() => window.__kitchen.ui.getState().setLanguage('sr'));
  const plan = workspace.getByTestId('room-plan');
  for (const viewport of [{ width: 320, height: 568 }, { width: 430, height: 778 }]) {
    await page.setViewportSize(viewport);
    await plan.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await assertWallTargets(plan, 8);
    const shortcut = plan.getByRole('button', { name: 'Pogled na zid 3' });
    await shortcut.tap();
    assert.equal(await workspace.getByRole('combobox', { name: 'Izaberi pogled' }).inputValue(), 'bottom');
    await workspace.getByRole('button', { name: 'Nazad na osnovu' }).tap();
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-wall-view') === 'bottom');
    const panel = workspace.getByTestId('room-inspector');
    const dimensions = panel.getByRole('button', { name: 'Mere', exact: true });
    if (await dimensions.getAttribute('aria-expanded') === 'false') await dimensions.tap();
    for (const control of [panel.getByRole('button', { name: 'Boje i pločice' }), panel.getByLabel('Visina do plafona')]) {
      await control.scrollIntoViewIfNeeded();
      const box = await control.boundingBox();
      assert.ok(box && box.width >= 44 && box.x >= 0 && box.x + box.width <= viewport.width, 'Inspector fields and disclosures must fit horizontally.');
    }
    if (viewport.width === 320) {
      await page.evaluate(() => window.__kitchen.design.getState().apply((d) => ({
        ...d, room: { ...d.room, cutout: { kind: 'notch', corner: 'bottomRight', width: 1080, depth: 900 } },
      })));
      await assertWallTargets(plan, 12);
      await plan.getByRole('button', { name: 'Pogled na zid 3' }).tap();
      assert.equal(await workspace.getByRole('combobox', { name: 'Izaberi pogled' }).inputValue(), 'edge-2');
      await workspace.getByRole('button', { name: 'Nazad na osnovu' }).tap();
      await page.getByRole('button', { name: 'Korak unazad', exact: true }).tap();
    }
  }
  await workspace.getByRole('button', { name: 'Boje i pločice' }).tap();
  await workspace.getByRole('checkbox', { name: 'Podne pločice' }).check();
  await workspace.getByRole('button', { name: 'Boja zidova: Maslina' }).tap();
  assert.equal(await plan.locator('[data-wall-paint]').getAttribute('stroke'), '#777c64');
  const tileSize = workspace.getByLabel('Stranica pločice', { exact: true });
  await tileSize.fill('450');
  await tileSize.press('Enter');
  assert.equal(await plan.locator('pattern').getAttribute('width'), '450');
  await page.getByRole('button', { name: 'Korak unazad', exact: true }).tap();
  assert.equal(await plan.locator('pattern').getAttribute('width'), '600');
  await page.reload();
  assert.equal(await plan.locator('[data-wall-paint]').getAttribute('stroke'), '#777c64', 'Finishes chosen in room setup survive reload');
  await workspace.locator('[data-wall-dimension="top"]').tap();
  await workspace.getByRole('dialog', { name: 'Zid 1' }).getByLabel('Dužina zida').waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await workspace.getByRole('dialog').count(), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.__kitchen.ui.getState().setLanguage('en'));
}

async function phoneRoomPreview(page, workspace) {
  const original = await page.evaluate(async () => {
    const { createKitchenDesign, KITCHEN_DESIGNS } = await import('/src/domain/kitchens.ts');
    const d = createKitchenDesign(KITCHEN_DESIGNS.find((preset) => preset.id === 'oak-frame-island'), 'Moja kuhinja');
    window.__kitchen.design.getState().load(d);
    window.__kitchen.ui.getState().setMoveHintSeen();
    return d;
  });
  await showRoomModel(page);
  const bar = page.getByTestId('three-toolbar');
  const canvas = workspace.getByTestId('three-viewport').locator('canvas');
  const trigger = (name) => bar.getByRole('button', { name, exact: true });
  const sheet = (name) => page.getByRole('dialog', { name, exact: true });
  const state = () => page.evaluate(() => {
    const { design, past } = window.__kitchen.design.getState();
    return { design, revisions: past.length };
  });
  await page.waitForFunction(() => window.__kitchen3D?.scene.getObjectByName('room-floor'));
  for (const [width, height, lang, label] of [[320, 568, 'en', 'View'], [320, 568, 'sr', 'Prikaz'], [430, 778, 'sr', 'Prikaz']]) {
    await page.setViewportSize({ width, height });
    await page.evaluate((lang) => window.__kitchen.ui.getState().setLanguage(lang), lang);
    const buttons = bar.getByRole('button');
    assert.deepEqual(await buttons.allInnerTexts(), [label]);
    const box = await trigger(label).boundingBox();
    assert.ok(box && box.width >= 44 && box.height >= 44 && box.x >= 0 && box.x + box.width <= width);
    assert.ok(await trigger(label).evaluate((b) => {
      const { x, y, width, height } = b.getBoundingClientRect();
      return b.contains(document.elementFromPoint(x + width / 2, y + height / 2));
    }), 'The labelled View trigger must remain tappable at each width.');
  }
  await waitForIdleRendering(page);
  await page.screenshot({ path: path.resolve('test-results/room-workspace/phone-3d-preview-sr.png') });

  const before = await state();
  const viewport = await canvas.boundingBox();
  const view = trigger('Prikaz');
  await view.press('Enter');
  const camera = sheet('Prikaz');
  assert.deepEqual(await canvas.boundingBox(), viewport, 'The sheet must overlay the room, not resize it.');
  await camera.getByRole('button', { name: 'Odozgo' }).press('Enter');
  assert.ok(await view.evaluate((el) => el === document.activeElement));
  await view.tap();
  assert.equal(await camera.getByRole('button', { name: 'Odozgo' }).getAttribute('aria-pressed'), 'true');
  await camera.getByRole('button', { name: 'Vrati pogled' }).tap();
  await view.tap();
  assert.equal(await camera.getByRole('button', { name: 'Perspektiva' }).getAttribute('aria-pressed'), 'true');
  await camera.getByRole('button', { name: 'Oznake mera' }).tap();
  assert.equal(await workspace.locator('[data-room-measure]').count(), 0);
  assert.ok(await workspace.getByTestId('room-measurements').isVisible(), 'The full schedule remains when scene labels are hidden.');
  assert.equal(await camera.getByTestId('customer-export').count(), 0);
  assert.equal(await camera.getByRole('button', { name: /Sledeća kuhinja|Otvori sve|Stil/ }).count(), 0);
  await page.keyboard.press('Escape');
  assert.ok(await view.evaluate((el) => el === document.activeElement));

  assert.deepEqual(await state(), before, 'Room review is read-only.');
  await page.getByRole('radio', { name: '3. 3D', exact: true }).tap();
  await page.waitForFunction((id) => window.__kitchen3D?.scene.getObjectByName(id), original.items[0].id);
  const kitchen = sheet('Prikaz');
  const openIdeas = async () => {
    const header = page.getByRole('banner');
    await header.getByRole('button', { name: 'Više', exact: true }).tap();
    await header.getByRole('button', { name: 'Ideje', exact: true }).tap();
  };
  const gallery = page.getByRole('dialog', { name: 'Ideje' });
  const next = gallery.getByRole('button', { name: 'Primeni stil na moju kuhinju' });
  assert.ok(await page.getByTestId('three-toolbar').getByRole('button', { name: 'Podeli', exact: true }).isEnabled());
  await view.tap();
  assert.equal(await kitchen.getByRole('button', { name: /Podeli|Primeni stil na moju kuhinju/ }).count(), 0);
  await page.touchscreen.tap(8, 8);
  await kitchen.waitFor({ state: 'hidden' });
  for (const [on, off] of [['Otvori sve', 'Zatvori sve'], ['Unutrašnjost elemenata', 'Unutrašnjost elemenata']]) {
    await view.tap();
    await kitchen.getByRole('button', { name: on }).tap();
    await kitchen.waitFor({ state: 'hidden' });
    await openIdeas();
    assert.ok(await next.isDisabled(), 'A cabinet preview still locks style changes from Ideas.');
    await gallery.getByRole('button', { name: 'Zatvori', exact: true }).tap();
    await view.tap();
    const disablePreview = kitchen.getByRole('button', { name: off });
    assert.equal(await disablePreview.getAttribute('aria-pressed'), 'true');
    await disablePreview.tap();
  }
  assert.deepEqual(await state(), before, 'Browsing cameras, finishes and cabinet previews must not edit the project or Undo history.');
  await openIdeas();
  await next.tap();
  assert.equal((await state()).revisions, before.revisions + 1);
  await page.getByTestId('feedback-toast').getByRole('button', { name: 'Korak unazad', exact: true }).tap();
  assert.deepEqual((await state()).design, original, 'Ideas must use the existing undoable style command.');
}

async function separatedRoomChecks(page) {
  const nav = page.getByRole('radiogroup', { name: 'Design workspace' });
  const roomTab = nav.getByRole('radio', { name: '1. Room' });
  const kitchen3D = nav.getByRole('radio', { name: '3. 3D', exact: true });
  const room = page.getByTestId('room-workspace');
  await page.evaluate(async () => {
    const { createDesign } = await import('/src/domain/designOps.ts');
    const { createItem } = await import('/src/domain/catalog.ts');
    const d = createDesign('Shared irregular room');
    d.room = { width: 4000, depth: 3200, height: 2700, vertices: [
      { id: 'north', x: 0, y: 0 }, { id: 'slope', x: 4000, y: 0 }, { id: 'south', x: 3500, y: 3200 }, { id: 'west', x: 0, y: 3200 },
    ], partitions: [{ id: 'divider', start: { x: 1400, y: 1700 }, end: { x: 2600, y: 1700 }, thickness: 120, height: 1450 }],
    treatments: [{ id: 'panel', wallId: 'west', offset: 300, width: 900, elevation: 900, height: 550, finish: 'oak' }] };
    d.items = [{ ...createItem('base', [], { x: 500, y: 0 }), id: 'kitchen-only' }];
    d.style.backsplash = 'marble';
    const ui = window.__kitchen.ui.getState();
    window.__kitchen.design.getState().load(d);
    ui.setLanguage('en'); ui.setView('3d'); ui.requestCamera('studio', 'kitchen-only');
  });
  const state = () => page.evaluate(async () => {
    const { design, past, future } = window.__kitchen.design.getState();
    const { activeId } = (await import('/src/store/projects.ts')).useProjectsStore.getState();
    return { design, past: past.length, future: future.length, activeId };
  });
  await page.waitForFunction(() => window.__kitchen3D?.scene.getObjectByName('kitchen-only'));
  const initial = await state();
  await roomTab.click();
  const corner = room.getByRole('button', { name: 'Move corner 3' });
  await corner.waitFor();
  assert.deepEqual(await state(), initial);
  await corner.press('Shift+ArrowLeft');
  const edited = await state();
  assert.equal(edited.design.room.vertices[2].x, 3400);
  assert.equal(edited.past, initial.past + 1);
  await room.getByRole('combobox', { name: 'Drawing view' }).selectOption('slope');
  await showRoomModel(page);
  await page.waitForFunction(() => window.__kitchen3D?.scene.getObjectByName('wall-finish-panel-0'));
  assert.equal(await roomTab.getAttribute('aria-checked'), 'true');
  const schedule = room.getByTestId('room-measurements');
  assert.match(await schedule.locator('[data-measure="area"]').innerText(), /11\.84 m²/);
  assert.match(await schedule.locator('[data-measure="wall:slope"]').innerText(), /3256 mm.*Height: 2700 mm/s);
  assert.match(await schedule.locator('[data-measure="partition:divider"]').innerText(), /1200 mm.*120 mm.*1450 mm/s);
  assert.equal(await schedule.locator('[data-measure^="wall:"]').count(), 4);
  await waitForIdleRendering(page);
  assert.ok(await room.locator('[data-room-measure]:visible').count() > 0);
  assert.deepEqual(await page.evaluate(() => {
    const names = [];
    window.__kitchen3D.scene.traverse((n) => { if (n.name === 'kitchen-only' || n.name.startsWith('kitchen-backsplash-')) names.push(n.name); });
    return names;
  }), []);
  const projected = room.locator('[data-room-measure^="wall:"]:visible').first();
  await projected.waitFor();
  const projectedWall = (await projected.getAttribute('data-room-measure')).slice('wall:'.length);
  await projected.getByRole('button').click();
  const picker = room.getByRole('combobox', { name: 'Drawing view' });
  assert.equal(await picker.inputValue(), projectedWall, 'The 3D icon opens the wall shown beside it.');
  await showRoomModel(page);
  await schedule.locator('[data-measure="partition:divider"]').getByRole('button', { name: 'Wall view: Wall 6' }).press('Enter');
  assert.equal(await picker.inputValue(), 'divider:-1');
  assert.deepEqual(await state(), edited, 'Wall shortcuts change the view, not measurements, selections in the design, or history.');
  await kitchen3D.click();
  await page.waitForFunction(() => window.__kitchen3D?.scene.getObjectByName('kitchen-only') && window.__kitchen3D.scene.getObjectByName('kitchen-backsplash-north-0'));
  assert.equal(await page.getByTestId('room-measurements').count(), 0);
  await roomTab.click();
  await corner.waitFor();
  assert.equal(await room.getByRole('combobox', { name: 'Drawing view' }).inputValue(), '');
  assert.deepEqual(await state(), edited, 'Visiting either workspace must not change the active project, room, cabinets or undo/redo.');
}

let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const url = server.resolvedUrls.local[0];
  for (const compact of [false, true]) {
    const page = await browser.newPage({ locale: 'en-US', hasTouch: compact, viewport: compact ? { width: 390, height: 844 } : { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => { errors.push(error.message); console.error(error); });
    await page.goto(url);
    const workspace = page.getByTestId('room-workspace');
    await workspace.getByRole('heading', { name: 'Room', exact: true }).waitFor();
    assert.equal(await page.getByTestId('room-plan').count(), 1);
    assert.equal(await page.locator('[data-kitchen-idea]').count(), 0);
    if (compact) await phoneRoomTools(page, workspace);
    await workspace.locator('[data-wall-dimension="right"]').focus();
    await page.keyboard.press('Enter');
    const drawing = workspace.getByTestId('drawing-measure');
    const length = drawing.getByLabel('Wall length');
    await length.fill('');
    await length.pressSequentially('3500');
    const room = () => page.evaluate(() => window.__kitchen.design.getState().design.room);
    assert.notEqual((await room()).depth, 3500, 'intermediate digits are drafts');
    await length.press('Enter');
    assert.equal((await room()).depth, 3500);
    assert.equal((await room()).vertices, undefined);
    await drawing.getByRole('button', { name: 'Done' }).click();
    if (!compact && !planOnly) {
      await workspace.getByRole('button', { name: '3D preview' }).click();
      await workspace.getByTestId('three-viewport').locator('canvas').waitFor().catch(async (error) => {
        console.error('Preview state:', await page.locator('body').evaluate((el) => ({ text: el.innerText.slice(0, 900),
          canvases: [...el.querySelectorAll('canvas')].map((c) => [c.clientWidth, c.clientHeight]), view: window.__kitchen?.ui.getState().view })));
        throw error;
      });
      assert.equal(await page.getByTestId('room-plan').count(), 1);
      await workspace.getByRole('button', { name: '3D preview' }).click();
    }
    if (!planOnly) {
      await showRoomModel(page);
      await workspace.getByTestId('three-viewport').locator('canvas').waitFor();
      await workspace.locator('.room-view-picker select').selectOption('');
    }
    await workspace.getByTestId('room-plan').waitFor();
    assert.equal(await workspace.locator('[data-wall-id="right"]').getAttribute('aria-pressed'), 'true');
    if (compact) await workspace.getByRole('button', { name: 'Dimensions', exact: true }).tap();
    await workspace.getByText('Advanced room', { exact: true }).click();
    await workspace.getByLabel('Floor shape').selectOption('diagonal');
    await page.evaluate(() => window.__kitchen.ui.getState().setLanguage('sr'));
    await workspace.locator('[data-wall-dimension="edge-2"]').click();
    const angle = drawing.getByLabel('Ugao', { exact: true });
    await angle.fill('145,5');
    await angle.press('Enter');
    const diagonal = await room();
    assert.equal(diagonal.vertices[2].id, 'edge-2');
    assert.equal(await angle.inputValue(), '145,5');
    await angle.fill('270');
    await angle.press('Enter');
    assert.deepEqual(await room(), diagonal, 'a crossed/overlapping outline is rejected');
    await drawing.getByRole('alert').waitFor();
    await page.keyboard.press('Escape');
    await workspaceObjectChecks(page, compact, !planOnly);
    await furnishedWallChecks(page, compact, path.resolve('test-results/room-workspace'));
    if (compact && !planOnly) await phoneRoomPreview(page, workspace);
    if (!planOnly) await separatedRoomChecks(page);
    await planCornerChecks(page, compact);
    if (compact) {
      await page.evaluate(async () => {
        (await import('/src/store/projects.ts')).createProject('Kote');
        window.__kitchen.ui.getState().setLanguage('sr');
      });
      await page.setViewportSize({ width: 320, height: 568 });
      await draftedWindowCheck(page);
    }
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`PASS room-first workspace, ${compact ? 'phone' : 'desktop'}`);
  }
  if (!planOnly) {
    await startFreshChecks(browser, url);
    await plannerChecks(browser, url);
  }
} finally {
  await browser?.close();
  await server.close();
}
