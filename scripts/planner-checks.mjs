import assert from 'node:assert/strict';

/** Drive the public interface; this can also run against a static production build. */
export async function plannerChecks(browser, url) {
  for (const phone of [false, true]) {
    const page = await browser.newPage({ locale: phone ? 'sr-Latn-RS' : 'en-US', hasTouch: phone, isMobile: phone,
      viewport: phone ? { width: 320, height: 568 } : { width: 1024, height: 800 } });
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    try {
      if (!phone) await page.addInitScript(() => Object.defineProperty(navigator, 'platform', { value: 'MacIntel' }));
      await page.goto(url);
      const bar = page.getByRole('banner'), name = bar.getByRole('textbox');
      const room = page.getByTestId('room-workspace');
      await room.getByTestId('room-plan').waitFor();
      if (phone) {
        const drawing = await room.getByTestId('room-plan').boundingBox();
        assert.ok(drawing.height >= page.viewportSize().height / 2, `The room drawing should use at least half the phone screen; got ${drawing.height}px.`);
      }
      const guide = phone ? 'Vodič za planiranje' : 'Planning guide', projects = phone ? 'Projekti' : 'Projects';
      const compare = phone ? 'Uporedi rasporede' : 'Compare layouts';
      const dialog = page.getByRole('dialog'), button = (root, name) => root.getByRole('button', { name, exact: true });
      const open = async (label) => {
        if (phone) await button(bar, 'Više').tap();
        await button(bar, !phone && label === guide ? 'Help' : label).click();
        await page.getByRole('dialog', { name: label, exact: true }).waitFor();
      };
      const step = async (n) => {
        await open(guide);
        await dialog.getByRole('button', { name: new RegExp(`${n}\\. `) }).click();
      };
      const addBase = async () => {
        if (phone) await page.locator('[data-add-trigger]').tap();
        await page.locator('[data-preset="base-600"]').click();
        if (phone) await page.keyboard.press('Escape');
      };
      await name.fill('Kitchen A'); await name.press('Enter');
      await open(guide);
      assert.match(await dialog.locator('[aria-current="step"]').innerText(), /1\./);
      await page.keyboard.press('Shift+Tab');
      assert.ok(await button(dialog, compare).evaluate((b) => b === document.activeElement));
      await page.keyboard.press('Tab');
      const firstControl = phone ? dialog.getByRole('slider', { name: 'Visina panela' }) : button(dialog, 'Close');
      assert.ok(await firstControl.evaluate((b) => b === document.activeElement));
      await button(dialog, compare).click();
      assert.equal(await dialog.getByRole('table').count(), 0, 'One project alone is not a comparison.');
      await button(dialog, guide).click();
      await dialog.getByRole('button', { name: /2\. / }).click();
      const empty = page.getByTestId('empty-plan-hint');
      await button(empty, phone ? 'Počni od ideje' : 'Start from an idea').click();
      assert.ok(await dialog.getByRole('radio', { name: phone ? 'Početni rasporedi' : 'Starter layouts', exact: true }).isVisible());
      await page.keyboard.press('Escape');
      if (!phone) {
        await button(empty, 'Add cabinets yourself').click();
        assert.ok(await page.getByRole('searchbox', { name: 'Search kitchen parts' }).evaluate(el => el === document.activeElement));
      }
      await addBase();
      await open(projects);
      await button(dialog, compare).click();
      await button(dialog, phone ? 'Uredi kopiju ove kuhinje' : 'Edit a copy of this kitchen').click();
      assert.match(await name.inputValue(), /Kitchen A · (Variant|Varijanta) 1/);
      if (phone) {
        const more = button(bar, 'Više');
        const checks = page.getByRole('button', { name: 'Provere: Bez problema', exact: true });
        assert.equal(await page.getByRole('button', { name: /^Provere:/ }).count(), 0);
        await more.tap();
        await checks.focus();
        assert.equal(await checks.getAttribute('aria-expanded'), 'false', 'Restoring focus must not open a popup over Add.');
        await checks.press('Enter');
        await bar.getByRole('region', { name: 'Provere', exact: true }).waitFor();
        await page.keyboard.press('Escape');
        await checks.tap();
        assert.equal(await checks.getAttribute('aria-expanded'), 'true');
        await checks.tap();
        await more.tap();
      }
      await addBase();
      await step(1);
      if (phone) await button(room, 'Mere').tap();
      const width = room.getByLabel(phone ? 'Širina' : 'Width', { exact: true });
      await width.fill('4800'); await width.press('Enter');
      await step(3);
      assert.equal(await page.getByRole('radio', { name: '3. 3D', exact: true }).getAttribute('aria-checked'), 'true');
      if (!phone) {
        const help = page.locator('aside section').filter({ has: page.getByRole('heading', { name: 'How it works' }) });
        assert.match(await help.innerText(), /orbit/i);
        assert.doesNotMatch(await help.innerText(), /blue handles|from the left|Ctrl/);
        assert.ok(await help.locator('kbd').filter({ hasText: '⌘' }).count() >= 3);
      }
      await step(4);
      assert.equal(await page.getByRole('radio', { name: phone ? '4. Krojna lista' : '4. Cut list', exact: true }).getAttribute('aria-checked'), 'true');
      const snapshot = () => page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage).filter(([k]) => k.startsWith('kitchen-designer:project')))));
      await page.waitForFunction(() => {
        const index = JSON.parse(localStorage.getItem('kitchen-designer:projects'));
        return JSON.parse(localStorage.getItem(`kitchen-designer:project:${index.activeId}`)).room.width === 4800;
      });
      const saved = await snapshot();
      await open(projects); await button(dialog, compare).click();
      const cells = (label) => dialog.getByRole('row').filter({ has: page.getByRole('rowheader', { name: label, exact: true }) }).getByRole('cell').allTextContents();
      assert.deepEqual(await cells(phone ? 'Kuhinjski elementi' : 'Kitchen units'), ['2', '1']);
      assert.deepEqual(await cells(phone ? 'Površina osnove' : 'Floor area'), phone ? ['14,4 m²', '10,8 m²'] : ['14.4 m²', '10.8 m²']);
      const [a, b] = (await cells(phone ? 'Delovi za krojenje' : 'Parts to cut')).map(Number);
      assert.ok(b > 0 && a === b * 2);
      await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"] img')].every((img) => img.complete && img.naturalWidth));
      const scales = await dialog.getByRole('img').evaluateAll((imgs) => imgs.map((img) => {
        const r = img.getBoundingClientRect(); return Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight);
      }));
      assert.ok(scales.length === 2 && scales[0] > 0 && Math.abs(scales[0] - scales[1]) < .001, 'Both drawings must use the same physical scale.');
      assert.ok(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth && document.documentElement.scrollWidth <= innerWidth));
      await button(dialog, projects).click();
      assert.equal(await snapshot(), saved, 'Comparing must not switch, re-date or rewrite either project.');
      await button(dialog.getByTestId('project-row').filter({ hasText: /^Kitchen A(?! ·)/ }), phone ? 'Otvori' : 'Open').click();
      assert.equal(await name.inputValue(), 'Kitchen A');
      assert.deepEqual(errors, []);
      console.log(`PASS ${phone ? 'Serbian phone' : 'English desktop'} planning guide, independent variant, measured A/B drawings and comparison.`);
    } finally { await page.close(); }
  }
}
