import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkDesign } from '../engine/checks';
import { buildCuttingList } from '../engine/cuttingList';
import { parseDesign } from './designOps';
import { createKitchenDesign, KITCHEN_DESIGNS, kitchenCategory, type KitchenPreset } from './kitchens';

describe('kitchen inspiration designs', () => {
  it('offers twenty-four unique kitchens, including four stacked collections and all three wall layouts', () => {
    expect(KITCHEN_DESIGNS).toHaveLength(24);
    expect(new Set(KITCHEN_DESIGNS.map((kitchen) => kitchen.id)).size).toBe(24);
    expect(KITCHEN_DESIGNS.filter((kitchen) => 'layered' in kitchen)).toHaveLength(4);
    expect(new Set(KITCHEN_DESIGNS.map(kitchenCategory))).toEqual(new Set(['straight', 'l-shape', 'u-shape', 'island']));
  });

  it('includes every premium module in the collection and uses warm lighting and stone backsplashes', () => {
    const kinds = new Set(KITCHEN_DESIGNS.flatMap((preset) => createKitchenDesign(preset, '').items.map((item) => item.kind)));
    for (const kind of ['pullOut', 'glassWall', 'ovenTower', 'integratedFridge', 'hood', 'hob', 'bar', 'tall'] as const) expect(kinds.has(kind)).toBe(true);
    for (const preset of KITCHEN_DESIGNS) {
      expect(preset.style.lighting).toBe(true);
      expect(preset.style.backsplash).not.toBe('none');
    }
  });

  for (const preset of KITCHEN_DESIGNS) {
    it(`${preset.id} is buildable, serializable, and has its own rendered image`, () => {
      const design = createKitchenDesign(preset, 'My project');
      expect(design.room).toEqual(preset.room);
      expect(design.style).toEqual(preset.style);
      const options: KitchenPreset = preset;
      if (options.ovenTower) expect(design.items.some((item) => item.kind === 'ovenTower')).toBe(true);
      if (options.pantry) expect(design.items.some((item) => item.kind === 'tall')).toBe(true);
      if (options.pullOut) expect(design.items.some((item) => item.kind === 'pullOut')).toBe(true);
      if (options.breakfastBar) expect(design.items.some((item) => item.kind === 'bar')).toBe(true);
      expect(new Set(design.items.map((item) => item.id)).size).toBe(design.items.length);
      expect(new Set(design.items.map((item) => item.label)).size).toBe(design.items.length);
      expect(checkDesign(design).filter((issue) => issue.severity === 'error')).toEqual([]);
      const list = buildCuttingList(design);
      expect(list.pieceCount).toBeGreaterThan(0);
      expect(list.rows.every((row) => row.length > 0 && row.width > 0 && row.quantity > 0)).toBe(true);
      expect(parseDesign(JSON.parse(JSON.stringify(design)))).toEqual(design);
      const image = readFileSync(path.resolve('public', 'kitchens', `${preset.id}.jpg`));
      expect(image.length).toBeGreaterThan(8000);
      expect([...image.subarray(0, 2)]).toEqual([0xff, 0xd8]);
      expect([...image.subarray(-2)]).toEqual([0xff, 0xd9]);
    });
  }

  it('makes independent copies, with fresh unit IDs on every load', () => {
    const first = createKitchenDesign(KITCHEN_DESIGNS[17], 'First');
    const second = createKitchenDesign(KITCHEN_DESIGNS[17], 'Second');
    expect(first.items.map((item) => item.id).some((id) => second.items.some((item) => item.id === id))).toBe(false);
    first.room.width = 1000;
    first.items[0].width = 700;
    first.style.front = 'navy';
    expect(second.room).toEqual(KITCHEN_DESIGNS[17].room);
    expect(second.style).toEqual(KITCHEN_DESIGNS[17].style);
    expect(second.items[0].width).toBe(900);
  });
});
