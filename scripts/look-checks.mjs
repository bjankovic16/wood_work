import assert from 'node:assert/strict';
import { waitForIdleRendering } from './three-test-helpers.mjs';

/** Run with the English Style picker open. Check the meshes, not just the saved swatch values. */
export async function assertShuffledLook(page) {
  const before = await page.evaluate(() => {
    const store = window.__kitchen.design;
    store.getState().apply((d) => ({
      ...d, items: d.items.map((item) => ({ ...item, frontFinish: 'navy', carcassFinish: 'clay' })),
      style: { ...d.style, windowFrame: 'ash', doorFrame: 'clay', doorLeaf: 'navy' },
      openings: [...d.openings,
        { id: 'look-window', kind: 'window', wall: 'left', offset: 200, sill: 900, width: 900, height: 1100 },
        { id: 'look-door', kind: 'door', wall: 'bottom', offset: 300, sill: 0, width: 900, height: 2000 }],
    }));
    return store.getState().design;
  });
  async function checkJoinery() {
    await page.waitForFunction(() => window.__kitchen3D?.scene.getObjectByName('room-opening-look-door'));
    await waitForIdleRendering(page);
    const matches = await page.evaluate(async () => {
      const { cabinetMaterial } = await import('/src/components/three/materials.ts');
      const { style } = window.__kitchen.design.getState().design;
      const meshes = (id) => window.__kitchen3D.scene.getObjectByName(`room-opening-look-${id}`).children.filter((child) => child.isMesh);
      const [glass, ...windowFrames] = meshes('window');
      const [leaf, ...jambs] = meshes('door');
      const finished = (meshes, finish) => {
        const expected = cabinetMaterial(finish);
        const ok = meshes.length > 0 && meshes.every(({ material }) =>
          material.color.equals(expected.color) && material.map === expected.map && !material.transparent);
        expected.dispose();
        return ok;
      };
      return glass.material.transparent && finished(windowFrames, style.windowFrame)
        && finished(jambs, style.doorFrame) && finished([leaf], style.doorLeaf);
    });
    assert.ok(matches, 'Window frames, jambs and door leaves must render their own finishes while the pane stays glass.');
  }
  await checkJoinery();
  await page.getByRole('button', { name: 'Shuffle look', exact: true }).click();
  await checkJoinery();
  const after = await page.evaluate(() => window.__kitchen.design.getState().design);
  assert.deepEqual(after.items.map(({ id }) => id), before.items.map(({ id }) => id));
  assert.ok(after.items.every((item) => item.frontFinish !== 'navy' || item.carcassFinish !== 'clay'), 'Shuffle must replace stale individual overrides.');
  await page.keyboard.press('Control+z');
  assert.deepEqual(await page.evaluate(() => window.__kitchen.design.getState().design), before, 'Undo must restore the whole look in one step.');
  await page.keyboard.press('Control+z'); // Remove the test openings/overrides.
}
