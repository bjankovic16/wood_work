import assert from 'node:assert/strict';

/** Drive the public interface; this can also run against a static production build. */
export async function plannerChecks(browser, url) {
  for (const phone of [false, true]) {
    const page = await browser.newPage({ locale: phone ? 'sr-Latn-RS' : 'en-US', hasTouch: phone, isMobile: phone,
      viewport: phone ? { width: 320, height: 568 } : { width: 1024, height: 800 } });
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    try {
      await page.goto(url);
      const bar = page.getByRole('banner'), name = bar.getByRole('textbox');
      const room = page.getByTestId('room-workspace');
      await room.getByTestId('room-plan').waitFor();
      const guide = phone ? 'Vodič za planiranje' : 'Planning guide', projects = phone ? 'Projekti' : 'Projects';
      const compare = phone ? 'Uporedi rasporede' : 'Compare layouts';
      const dialog = page.getByRole('dialog'), button = (root, name) => root.getByRole('button', { name, exact: true });
      const open = async (label) => {
        const lastStep = phone && label === projects && await button(bar, projects).and(bar.getByTestId('step-next')).isVisible();
        if (phone && label === projects && !lastStep) await button(bar, 'Više').tap();
        await (lastStep ? bar.getByTestId('step-next') : phone && label === guide ? bar.getByRole('button', { name: /^Vodič za planiranje:/ }) : button(bar, label)).click();
        await page.getByRole('dialog', { name: label, exact: true }).waitFor();
      };
      const step = async (n) => {
        await open(guide);
        await dialog.getByRole('button', { name: new RegExp(`${n}\\. `) }).click();
      };
      const addBase = async () => {
        if (phone) await button(page, 'Dodaj element').and(page.locator('[data-plan-controls]')).tap();
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
      await addBase();
      await open(projects);
      await button(dialog, compare).click();
      await button(dialog, phone ? 'Uredi kopiju ove kuhinje' : 'Edit a copy of this kitchen').click();
      assert.match(await name.inputValue(), /Kitchen A · (Variant|Varijanta) 1/);
      await addBase();
      await step(1);
      const width = room.getByLabel(phone ? 'Širina' : 'Width', { exact: true });
      await width.fill('4800'); await width.press('Enter');
      await step(3);
      assert.equal(await page.getByRole('radio', { name: '3D', exact: true }).getAttribute('aria-checked'), 'true');
      await step(4);
      assert.equal(await page.getByRole('radio', { name: phone ? 'Krojna lista' : 'Cutting list', exact: true }).getAttribute('aria-checked'), 'true');
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
