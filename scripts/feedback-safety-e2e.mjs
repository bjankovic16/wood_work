import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const server = await createServer({ logLevel: 'error', cacheDir: path.resolve('test-results/feedback/.vite'),
  optimizeDeps: { entries: ['index.html'] }, server: { host: '127.0.0.1', port: 0, watch: null, hmr: false } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'en-US', reducedMotion: 'reduce' });
  const errors = [], downloads = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('download', (file) => downloads.push(file));
  await page.addInitScript(() => {
    window.testDevice = { requests: 0, retained: false, picker: 'cancel', share: 'cancel', shares: [], activation: true };
    const device = window.testDevice;
    Object.defineProperty(navigator, 'storage', { value: {
      persisted: async () => device.retained, persist: async () => { device.requests++; return device.retained = true; },
    } });
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: async () => {
      if (device.picker === 'cancel') throw new DOMException('Cancel', 'AbortError');
      return { createWritable: async () => ({
        write: async (data) => { device.written = JSON.parse(await data.text()).name; },
        close: async () => { if (device.picker === 'fail') throw new Error('disk full'); },
      }) };
    } });
    Object.defineProperty(navigator, 'canShare', { value: ({ files }) => files.length === 1 && files[0] instanceof File });
    Object.defineProperty(navigator, 'userActivation', { value: { get isActive() { return device.activation; } } });
    Object.defineProperty(navigator, 'share', { value: async ({ files }) => {
      const file = files[0];
      device.shares.push({ name: file.name, type: file.type, offline: (await file.text()).includes('id="model"') });
      if (device.share === 'cancel') throw new DOMException('Cancel', 'AbortError');
      if (device.share === 'fail') throw new DOMException('Unavailable', 'NotAllowedError');
    } });
  });
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'domcontentloaded' });
  const design = () => page.evaluate(() => window.__kitchen.design.getState().design);
  const index = () => page.evaluate(() => JSON.parse(localStorage.getItem('kitchen-designer:projects')));
  const device = (patch) => page.evaluate((patch) => Object.assign(window.testDevice, patch), patch);
  const dialog = page.getByRole('dialog', { name: 'Projects', exact: true });
  const toast = page.getByTestId('feedback-toast');
  const button = (root, name) => root.getByRole('button', { name, exact: true });
  const projects = async () => {
    await button(page.getByRole('banner'), 'More').tap();
    await button(page.getByRole('banner'), 'Projects').tap();
  };
  await page.evaluate(async () => {
    const { addPresetToPlan, setProjectName } = await import('/src/store/actions.ts');
    const { finishRoom } = await import('/src/store/projects.ts');
    finishRoom();
    setProjectName('Workshop A');
    addPresetToPlan('base-600');
  });
  const original = await design();
  const previous = (await index()).activeId;
  await page.keyboard.press('Delete');
  await toast.getByRole('status').filter({ hasText: /Deleted cabinet/ }).waitFor();
  assert.equal((await design()).items.length, 0);
  const bounds = await toast.boundingBox();
  const nav = await page.getByRole('navigation').filter({ has: page.getByRole('radio', { name: '3. 3D', exact: true }) }).boundingBox();
  assert.ok(bounds && nav && bounds.y + bounds.height <= nav.y, 'Undo must be reachable above the bottom navigation.');
  await button(toast, 'Undo').press('Enter');
  assert.deepEqual(await design(), original);

  await projects();
  assert.equal(await page.evaluate(() => window.testDevice.requests), 0);
  assert.ok(await dialog.getByText('There is no cloud copy.', { exact: false }).isVisible());
  await button(dialog, 'Ask browser to keep projects').tap();
  await dialog.getByText(/still need file backups/).waitFor();
  assert.equal(await page.evaluate(() => window.testDevice.requests), 1);
  const row = dialog.getByTestId('project-row').filter({ hasText: 'Workshop A' });
  const backup = button(row, 'Save Workshop A to a file');
  await backup.tap();
  await dialog.getByText('Not saved.', { exact: true }).waitFor();
  await device({ picker: 'fail' });
  await backup.tap();
  await dialog.getByText('Saving files is not available here.').waitFor();
  assert.equal((await index()).projects[0].lastBackupAt, undefined);
  await device({ picker: 'saved' });
  await backup.tap();
  await row.getByText(/^Last file backup:/).waitFor();
  assert.equal(await page.evaluate(() => window.testDevice.written), 'Workshop A');
  const backedUp = (await index()).projects[0].lastBackupAt;
  await button(dialog, 'Start fresh').tap();
  await toast.getByText(/still in Projects/).waitFor();
  const fresh = (await index()).activeId;
  assert.notEqual(fresh, previous);
  await page.keyboard.press('Control+z');
  assert.equal((await index()).activeId, previous);
  assert.deepEqual(await design(), original);
  assert.deepEqual((await index()).projects.map((p) => p.id), [fresh, previous]);
  await page.evaluate(async () => (await import('/src/store/actions.ts')).setProjectName('Workshop B'));
  await projects();
  await dialog.getByText(/Back up again:/).waitFor();
  await button(dialog, 'Close').tap();
  console.log('  PASS keyboard Delete/Undo, safe-area toast, Start fresh, intentional storage request and confirmed/stale per-project backups');

  await page.getByRole('radio', { name: '3. 3D', exact: true }).tap();
  const share = button(page.getByTestId('three-toolbar'), 'Share');
  await share.tap().catch(async (error) => {
    console.error('3D share state:', await page.evaluate(() => ({
      view: window.__kitchen.ui.getState().view, roomOpen: window.__kitchen.ui.getState().roomOpen,
      scene: !!window.__kitchen3D, text: document.body.innerText.slice(0, 1400),
    })), 'Page errors:', errors);
    throw error;
  });
  await toast.getByText(/Not shared/).waitFor({ timeout: 60000 });
  assert.equal(downloads.length, 0, 'Cancelling native share must not download a file instead.');
  const payload = await page.evaluate(() => window.testDevice.shares);
  assert.deepEqual(payload, [{ name: 'Workshop B.html', type: 'text/html', offline: true }]);
  await device({ share: 'ok', activation: false });
  await share.tap();
  const retry = page.getByRole('dialog', { name: 'Share', exact: true });
  await button(retry, 'Share file').tap({ timeout: 60000 });
  await toast.getByText(/Handed .* to your sharing app/).waitFor();
  await device({ share: 'fail', activation: true });
  await share.tap();
  await retry.getByText(/sharing app could not take the file/).waitFor({ timeout: 60000 });
  const [file] = await Promise.all([page.waitForEvent('download'), button(retry, 'Download HTML').tap()]);
  assert.equal(file.suggestedFilename(), 'Workshop B.html');
  assert.equal(await file.failure(), null);
  assert.equal((await index()).projects.find((p) => p.id === previous).lastBackupAt, backedUp, 'Customer HTML is not a project backup.');
  await page.evaluate(() => window.__kitchen.ui.getState().setLanguage('sr'));
  await button(page.getByTestId('three-toolbar'), 'Prikaz').tap();
  const sheet = page.getByTestId('phone-view-sheet');
  await sheet.getByText(/^Dodirnite objekat/).waitFor();
  assert.ok(await sheet.evaluate((el) => el.scrollWidth <= el.clientWidth && el.getBoundingClientRect().bottom <= innerHeight));
  assert.deepEqual(await sheet.getByRole('button').evaluateAll((buttons) => buttons.filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.innerText)), []);
  assert.equal(await button(sheet, 'Podeli').count(), 0);
  await button(sheet, 'Zatvori').tap();
  await button(page.getByRole('banner'), 'Više').tap();
  await button(page.getByRole('banner'), 'Ideje').tap();
  const gallery = page.getByRole('dialog', { name: 'Ideje' });
  const tryStyle = button(gallery, 'Primeni stil na moju kuhinju');
  assert.ok(await tryStyle.isVisible() && await gallery.getByText(/elementi ostaju na mestu/).isVisible());
  assert.ok(await gallery.evaluate((el) => el.scrollWidth <= el.clientWidth && el.getBoundingClientRect().bottom <= innerHeight));
  const firstPhoto = await gallery.locator('[data-kitchen-design] img').first().boundingBox();
  assert.ok(firstPhoto && firstPhoto.y + 100 < page.viewportSize().height, 'The inline explanation does not push the first photo off the 390px screen.');
  await tryStyle.tap();
  await button(toast, 'Korak unazad').tap();
  assert.deepEqual((await design()).items, original.items);
  await page.evaluate(() => {
    window.__kitchen.ui.getState().setLanguage('en');
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined });
  });
  await projects();
  const freshRow = dialog.getByTestId('project-row').filter({ has: button(page, 'Save Kitchen 1 to a file') });
  const fallbackBackup = async () => {
    const [download] = await Promise.all([page.waitForEvent('download'), button(freshRow, 'Save Kitchen 1 to a file').tap()]);
    assert.equal(download.suggestedFilename(), 'Kitchen 1.kitchen.json');
    assert.equal(await download.failure(), null);
    await freshRow.getByText(/Check that the project file was saved/).waitFor();
  };
  await fallbackBackup();
  await button(freshRow, 'Cancel').tap();
  assert.equal((await index()).projects.find((p) => p.id === fresh).lastBackupAt, undefined);
  await fallbackBackup();
  await button(freshRow, 'I saved the file').tap();
  await freshRow.getByText(/^Last file backup:/).waitFor();
  assert.equal((await index()).projects.find((p) => p.id === previous).lastBackupAt, backedUp);
  await page.reload();
  assert.ok((await index()).projects.find((p) => p.id === fresh).lastBackupAt);
  await projects();
  const beforeImport = await page.evaluate(() => {
    const s = window.__kitchen.design.getState();
    return { design: s.design, past: s.past, future: s.future, index: localStorage.getItem('kitchen-designer:projects') };
  });
  for (const raw of [
    { ...beforeImport.design, version: 999 },
    { ...beforeImport.design, items: [{ ...beforeImport.design.items[0], kind: 'constructor' }] },
    { ...beforeImport.design, items: [beforeImport.design.items[0], beforeImport.design.items[0]] },
  ]) {
    await dialog.getByLabel('Project file', { exact: true }).setInputFiles({
      name: 'invalid.kitchen.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(raw)),
    });
    await dialog.getByText('That file is not a kitchen project.', { exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => {
      const s = window.__kitchen.design.getState();
      return { design: s.design, past: s.past, future: s.future, index: localStorage.getItem('kitchen-designer:projects') };
    }), beforeImport);
  }
  await page.evaluate(() => {
    const text = File.prototype.text;
    File.prototype.text = function () {
      const file = this;
      return new Promise((resolve) => { window.releaseProjectRead = async () => {
        File.prototype.text = text;
        resolve(await text.call(file));
      }; });
    };
  });
  await dialog.getByLabel('Project file', { exact: true }).setInputFiles({
    name: 'slow.kitchen.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(beforeImport.design)),
  });
  await page.waitForFunction(() => typeof window.releaseProjectRead === 'function');
  await button(dialog, 'Close').tap();
  await page.evaluate(async () => { await window.releaseProjectRead(); await new Promise(requestAnimationFrame); });
  assert.equal(await dialog.count(), 0);
  assert.equal((await index()).activeId, JSON.parse(beforeImport.index).activeId);
  assert.deepEqual(await design(), beforeImport.design);

  const unreadable = { ...beforeImport.design, version: 999 };
  await page.evaluate((raw) => {
    const index = JSON.parse(localStorage.getItem('kitchen-designer:projects'));
    localStorage.setItem(`kitchen-designer:project:${index.activeId}`, JSON.stringify(raw));
  }, unreadable);
  await page.reload();
  await dialog.getByText(/The original is preserved/).waitFor();
  assert.notEqual((await index()).activeId, JSON.parse(beforeImport.index).activeId);
  assert.equal(await page.evaluate((id) => localStorage.getItem(`kitchen-designer:project:${id}`), JSON.parse(beforeImport.index).activeId), JSON.stringify(unreadable));
  assert.deepEqual(errors, []);
  console.log('  PASS native share, cancellation and download fallback; 390px Serbian View/Ideas and style Undo; confirmed JSON download survives reload');
  console.log('  PASS atomic invalid imports, cancelled slow file reads and preserved unreadable saved projects');
} finally {
  await browser?.close();
  await server.close();
}
