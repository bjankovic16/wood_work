import assert from 'node:assert/strict';

/** Independent fixtures: safe to call from the usability suite without changing its open project. */
export async function checkWorkshopPanels(browser, url) {
  for (const compact of [false, true]) {
    const context = await browser.newContext({ viewport: compact ? { width: 320, height: 720 } : { width: 1440, height: 900 },
      hasTouch: compact, isMobile: compact, locale: compact ? 'sr-Latn-RS' : 'en-US' });
    try {
      const page = await context.newPage();
      const press = (control) => compact ? control.tap() : control.click();
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__kitchen);
      const expected = await page.evaluate(async () => {
        const { createDesign } = await import('/src/domain/designOps.ts');
        const { createItem } = await import('/src/domain/catalog.ts');
        const { buildCuttingList } = await import('/src/engine/cuttingList.ts');
        const { checkDesign } = await import('/src/engine/checks.ts');
        const { currentMessages } = await import('/src/i18n/index.ts');
        const t = currentMessages();
        const fixture = createDesign('Workshop');
        fixture.room.features = [
          { id: 'column', kind: 'column', x: 3100, y: 2720, width: 200, depth: 200 },
          { id: 'outside', kind: 'column', x: 3530, y: 1200, width: 200, depth: 200 },
        ];
        fixture.items = [createItem('wall', [], { id: 'upper', label: 'U7', x: 2800, y: 2680, width: 800, doors: 1,
          elevation: 2400, frontMaterial: 'mdf-oak-19' })];
        const parts = buildCuttingList(fixture).units[0].parts;
        fixture.partEdits.upper = {
          [parts.find((p) => p.name === 'Shelf').key]: { quantity: 0, materialId: 'particleboard-oak-18' },
          [parts.find((p) => p.name === 'Bottom').key]: { materialId: 'particleboard-white-16' },
        };
        fixture.customParts = [{ id: 'extra', name: 'Spacer', quantity: 3, length: 330, width: 100, materialId: 'mdf-18',
          edgesLength: 0, edgesWidth: 0, edgeBandId: null, note: '' }];
        const ui = window.__kitchen.ui.getState();
        window.__kitchen.design.getState().load(fixture);
        ui.setView('list'); ui.setSettingsTab('materials');
        const list = buildCuttingList(fixture), issues = checkDesign(fixture, t.engine).filter((i) => !i.category);
        return { badges: list.materials.map((m) => m.materialId).sort(), issues: issues.map((i) => i.message),
          collision: issues.find((i) => i.roomFeatureId === 'column' && i.itemIds.length).message,
          roomOnly: issues.find((i) => i.roomFeatureId === 'outside' && !i.itemIds.length).message,
          settings: t.settings.title, done: t.common.done, used: t.settings.usedBoard, price: `${t.settings.pricePerSheet} (RSD)`,
          white: t.engine.material(fixture.materials.find((m) => m.id === 'particleboard-white-18')),
          name: t.settings.name, enterPrice: t.settings.enterPrice, addPrices: t.cutting.addPrices,
          money: t.money(1234.5), count: t.cutting.sheetCount(list.materials.reduce((n, m) => n + m.sheets, 0)),
          info: t.cutting.aboutEstimate, note: t.cutting.estimateNote, checks: t.checks.checks, all: t.checks.showAll(issues.length),
          dimensions: t.room.dimensions, advanced: t.room.advanced, more: t.topBar.more, menuChecks: t.checks.summary(t.checks.chip(issues.length)),
          print: t.cutting.print, exp: t.cutting.exportLabel, pdf: t.cutting.pdf };
      });

      const settings = page.getByRole('dialog', { name: expected.settings });
      const cards = settings.getByTestId('material-card');
      await cards.first().waitFor();
      assert.equal(await settings.locator('summary .board-price').count(), 0, 'Unknown prices do not get a currency placeholder.');
      for (const thickness of [16, 18]) {
        const label = settings.locator(`[data-material-id="particleboard-white-${thickness}"] .board-name`);
        assert.equal(await label.innerText(), `${expected.white} ${thickness} mm`);
      }
      assert.equal(await settings.locator('details[open]').count(), 0);
      const ids = await cards.evaluateAll((els) => els.map((el) => el.dataset.materialId));
      const marked = await cards.filter({ has: page.getByText(expected.used, { exact: true }) }).evaluateAll((els) => els.map((el) => el.dataset.materialId));
      assert.deepEqual(marked, ids.slice(0, marked.length));
      assert.deepEqual([...marked].sort(), expected.badges);
      await press(cards.last().locator('summary'));
      const first = cards.first(), row = first.locator('summary');
      await press(row);
      assert.equal(await settings.locator('details[open]').count(), 1);
      const price = first.getByRole('textbox', { name: expected.price, exact: true });
      assert.equal(await first.getByRole('textbox', { name: expected.name, exact: true }).inputValue(), expected.white);
      assert.equal(await price.inputValue(), '');
      assert.equal(await price.getAttribute('placeholder'), expected.enterPrice);
      await price.fill(compact ? '1234,5' : '1234.5'); await price.press('Enter');
      assert.match(await row.innerText(), /2800×2070 mm/);
      assert.ok((await row.innerText()).includes(expected.money));
      assert.ok(await row.evaluate((el) => el.scrollWidth <= el.clientWidth && el.offsetHeight >= 46 && getComputedStyle(el).listStyleType === 'none'),
        'Material names and prices can wrap on a phone; rows must not overflow or shrink their touch targets.');
      if (compact) assert.ok(await row.locator('.board-name').evaluate((el) => el.clientWidth > 0 && el.scrollWidth <= el.clientWidth));
      await press(settings.getByRole('button', { name: expected.done }));

      const summary = page.getByTestId('cutting-summary');
      assert.match(await summary.innerText(), /^\d/);
      assert.doesNotMatch(await summary.innerText(), /RSD/, 'One priced board is not the material total.');
      assert.ok((await page.getByTestId('material-totals').innerText()).includes(expected.money));
      for (const thickness of [16, 18]) {
        assert.ok(await page.locator('[data-part-card]').getByText(`${expected.white} ${thickness} mm`, { exact: true }).count() > 0);
      }
      await press(summary.getByRole('button', { name: expected.addPrices }));
      await settings.waitFor();
      const reloadCard = settings.locator('[data-material-id="particleboard-white-18"]');
      await press(reloadCard.locator('summary'));
      const reloadPrice = reloadCard.getByRole('textbox', { name: expected.price, exact: true });
      await reloadPrice.fill(''); await reloadPrice.press('Enter');
      assert.equal(await reloadCard.locator('.board-price').count(), 0);
      await press(settings.getByRole('button', { name: expected.done }));
      assert.doesNotMatch(await page.getByTestId('material-totals').innerText(), /RSD/);
      assert.equal(await summary.getByText(expected.count, { exact: true }).isVisible(), true);
      const note = summary.getByText(expected.note), info = summary.getByRole('button', { name: expected.info });
      assert.equal(await note.isVisible(), false);
      await press(info); await note.waitFor(); await press(info);
      const exports = page.getByRole('button', { name: expected.exp, exact: true }), print = page.getByRole('button', { name: expected.print, exact: true });
      const before = await Promise.all([exports.boundingBox(), print.boundingBox()]);
      assert.ok(await page.getByTestId('cutting-scroll').evaluate((el) => { el.scrollTop = el.scrollHeight; return el.scrollTop > 100; }));
      assert.deepEqual(await Promise.all([exports.boundingBox(), print.boundingBox()]), before);
      await page.evaluate(() => { window.print = () => { window.printRequested = true; }; });
      await press(print); assert.equal(await page.evaluate(() => window.printRequested), true);
      await press(exports);
      const pdf = page.getByRole('button', { name: expected.pdf, exact: true });
      const box = await pdf.boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= page.viewportSize().width);
      await press(exports);

      const badge = page.getByRole('button', { name: new RegExp(`^${expected.checks}:`) });
      const checks = page.getByRole('dialog', { name: expected.checks, exact: true });
      if (compact) await badge.tap();
      else {
        await badge.hover();
        await checks.waitFor(); await page.mouse.move(0, 0); await checks.waitFor({ state: 'hidden' });
        await badge.focus();
      }
      assert.deepEqual(await checks.locator('li button:visible').allTextContents(), expected.issues.slice(0, 2));
      await press(checks.getByRole('button', { name: expected.collision, exact: true }));
      // Check the actual undimmed Konva shape and that the compact sheet/controls aren't covering it.
      const cabinetVisible = () => {
        const ui = window.__kitchen.ui.getState(), stage = window.Konva?.stages?.[0], unit = stage?.findOne('#upper');
        if (ui.selectedId !== 'upper' || ui.roomOpen || ui.view !== 'plan' || unit?.opacity() !== 1) return false;
        const r = stage.container().getBoundingClientRect();
        return !!document.elementFromPoint(r.left + ui.pan.x + 3200 * ui.zoom, r.top + ui.pan.y + 2800 * ui.zoom)?.closest('.konvajs-content');
      };
      await page.waitForFunction(cabinetVisible);
      await page.evaluate(() => window.__kitchen.ui.getState().setViewport(1, { x: -8000, y: -8000 }));
      const openPlanChecks = async () => {
        if (compact) {
          await page.getByRole('button', { name: expected.more, exact: true }).tap();
          await page.getByRole('button', { name: expected.menuChecks, exact: true }).tap();
        } else await press(badge);
      };
      const planChecks = compact ? page.getByRole('region', { name: expected.checks, exact: true }) : checks;
      await openPlanChecks(); await press(planChecks.getByRole('button', { name: expected.collision, exact: true }));
      await page.waitForFunction(cabinetVisible);
      await openPlanChecks();
      await press(planChecks.getByText(expected.all, { exact: true }));
      await press(planChecks.getByRole('button', { name: expected.roomOnly, exact: true }));
      await page.getByTestId('room-plan').waitFor();
      await page.getByTestId('selected-room-card').locator('[data-room-feature="outside"]').waitFor();
      await press(page.getByRole(compact ? 'button' : 'tab', { name: expected.dimensions, exact: true }));
      const walls = page.locator('.room-wall-details > summary'), advanced = page.locator('summary').filter({ hasText: expected.advanced });
      const treatment = (el) => [el.offsetHeight, getComputedStyle(el).padding, getComputedStyle(el, '::after').transform];
      assert.deepEqual(await advanced.evaluate(treatment), await walls.evaluate(treatment));
      const closed = await walls.evaluate(treatment);
      await press(walls);
      assert.notEqual((await walls.evaluate(treatment))[2], closed[2]);
      assert.equal(await walls.locator('svg').count(), 0, 'Walls must not add another arrow to the shared chevron.');
      // Exercise the room's 3D-to-2D hand-off using the same Checks chip on every step.
      await page.evaluate(() => window.__kitchen.ui.getState().setRoomView('3d'));
      await press(badge); await press(checks.getByRole('button', { name: expected.collision, exact: true }));
      await page.waitForFunction(cabinetVisible);
    } finally { await context.close(); }
  }
}
