import assert from 'node:assert/strict';

const button = (scope, name) => scope.getByRole('button', { name, exact: true });
const design = (page) => page.evaluate(() => window.__kitchen.design.getState().design);
const index = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('kitchen-designer:projects')));
const preferences = (page) => page.evaluate(() => localStorage.getItem('kitchen-designer:preferences'));

async function checkBlankRoom(page, dimensions, blank) {
  const room = page.getByTestId('room-workspace');
  await room.getByTestId('room-plan').waitFor();
  assert.equal(await room.locator('.room-view-picker select').inputValue(), '');
  const compact = page.viewportSize().width < 1024;
  assert.equal(await room.getByRole(compact ? 'button' : 'tab', { name: dimensions, exact: true }).getAttribute(compact ? 'aria-expanded' : 'aria-selected'), 'true');
  assert.equal(await room.getByTestId('room-3d').count(), 0, 'No 3D preview should follow a kitchen switch.');
  assert.deepEqual({ ...await design(page), name: blank.name }, blank);
}

export async function startFreshChecks(browser, url) {
  const errors = [];
  const desktop = await browser.newPage({ viewport: { width: 1024, height: 800 }, locale: 'sr-Latn-RS', reducedMotion: 'reduce' });
  desktop.on('pageerror', (e) => errors.push(e.message));
  await desktop.goto(url);
  const bar = desktop.getByRole('banner');
  const room = desktop.getByTestId('room-workspace');
  await room.getByTestId('room-plan').waitFor();
  await desktop.evaluate(() => document.fonts.ready);
  for (const [language, undo, start] of [['sr', 'Korak unazad', 'Počni iznova'], ['en', 'Undo', 'Start fresh']]) {
    await desktop.getByLabel('Jezik / Language').selectOption(language);
    for (const width of [1280, 1024]) {
      await desktop.setViewportSize({ width, height: 800 });
      assert.equal(await button(bar, undo).innerText(), undo, 'Desktop Undo keeps its visible label.');
      assert.equal(await button(bar, start).innerText(), start);
      assert.ok(await bar.evaluate((el) => el.scrollWidth <= innerWidth && el.querySelector('input').clientWidth >= 64
        && [...el.querySelectorAll('button')].every((b) => b.scrollWidth <= b.clientWidth + 1 && b.scrollHeight <= b.clientHeight + 1)),
      `Toolbar controls must fit at ${width}px in ${language}.`);
    }
  }
  const blank = await design(desktop);
  const previous = (await index(desktop)).activeId;
  const width = room.getByLabel('Width', { exact: true });
  await width.fill('4100');
  await width.press('Enter');
  await room.getByTestId('room-done').click();
  await desktop.locator('[data-preset="base-600"]').click();
  await bar.getByRole('radio', { name: 'Room design' }).click();
  await button(room, '3D preview').click();
  await room.getByTestId('room-3d').waitFor();
  await room.getByRole('tab', { name: 'Paint & tiles' }).click();
  const edited = { ...await design(desktop), name: 'Working kitchen' };
  const prefs = await preferences(desktop);
  // Blur commits the name just before Start fresh; no waiting for autosave.
  await bar.getByLabel('Project name').fill(edited.name);
  await button(bar, 'Start fresh').click();
  await checkBlankRoom(desktop, 'Dimensions', blank);
  const { activeId: fresh, projects } = await index(desktop);
  assert.notEqual(fresh, previous);
  assert.deepEqual(projects.map((p) => p.id), [fresh, previous]);

  await desktop.reload();
  await checkBlankRoom(desktop, 'Dimensions', blank);
  assert.equal((await index(desktop)).activeId, fresh);
  assert.equal(await preferences(desktop), prefs);
  const projectsDialog = desktop.getByRole('dialog', { name: 'Projects', exact: true });
  await button(bar, 'Projects').click();
  await button(projectsDialog.getByTestId('project-row').filter({ hasText: edited.name }), 'Open').click();
  assert.deepEqual(await design(desktop), edited, 'Reopening after reload restores all committed edits.');
  await button(bar, 'Projects').click();
  await button(projectsDialog, 'Start fresh').click();
  await checkBlankRoom(desktop, 'Dimensions', blank);
  assert.equal((await index(desktop)).projects.length, 3);
  assert.ok(await projectsDialog.isHidden());
  await desktop.close();

  const phone = await browser.newPage({ viewport: { width: 320, height: 568 }, locale: 'sr-Latn-RS', isMobile: true, hasTouch: true });
  phone.on('pageerror', (e) => errors.push(e.message));
  await phone.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Storage blocked', 'SecurityError'); } }));
  await phone.goto(url);
  const phoneBar = phone.getByRole('banner');
  const phoneRoom = phone.getByTestId('room-workspace');
  await phoneRoom.getByTestId('room-plan').waitFor();
  const phoneBlank = await design(phone);
  await phoneRoom.getByLabel('Širina', { exact: true }).fill('4200');
  await phoneRoom.getByLabel('Širina', { exact: true }).press('Enter');
  await phoneRoom.getByRole('button', { name: 'Objekti' }).tap();
  const more = button(phoneBar, 'Više');
  const start = button(phoneBar, 'Počni iznova');
  assert.ok(await start.isHidden(), 'The shortcut must not crowd the closed phone toolbar.');
  await more.tap();
  assert.match(await start.innerText(), /u Projektima samo dok je ova stranica otvorena/);
  await phoneBar.locator('summary').tap();
  const language = phoneBar.getByRole('radio', { name: 'Srpski', exact: true });
  await language.scrollIntoViewIfNeeded();
  const box = await language.boundingBox();
  assert.ok(box && box.y + box.height <= phone.viewportSize().height, 'The expanded More menu scrolls on a short phone.');
  await start.tap();
  await checkBlankRoom(phone, 'Mere', phoneBlank);
  assert.equal(await more.getAttribute('aria-expanded'), 'false');
  await more.tap();
  await button(phoneBar, 'Projekti').tap();
  const rows = phone.getByRole('dialog', { name: 'Projekti' }).getByTestId('project-row');
  assert.equal(await rows.count(), 2);
  await button(rows.filter({ hasText: phoneBlank.name }), 'Otvori').tap();
  assert.equal((await design(phone)).room.width, 4200, 'Blocked storage still keeps the previous kitchen in this session.');
  assert.deepEqual(errors, []);
  await phone.close();
  console.log('Start fresh: desktop, Projects, phone More, reload and blocked storage passed.');
}
