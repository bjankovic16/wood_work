import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkDesign } from '../engine/checks';
import { buildCuttingList } from '../engine/cuttingList';
import { parseDesign } from './designOps';
import { createKitchenDesign, KITCHEN_DESIGNS, kitchenCategory, type KitchenPreset } from './kitchens';
import { PREMIUM_KITCHENS } from './premiumKitchens';
import { en } from '../i18n/en';
import { sr } from '../i18n/sr';
import { roomSegments } from './walls';

describe('kitchen inspiration designs', () => {
  it('offers forty-two unique kitchens, including stacked collections and all three wall layouts', () => {
    expect(KITCHEN_DESIGNS).toHaveLength(42);
    expect(new Set(KITCHEN_DESIGNS.map((kitchen) => kitchen.id)).size).toBe(42);
    expect(KITCHEN_DESIGNS.filter((kitchen) => 'layered' in kitchen)).toHaveLength(4);
    expect(new Set(KITCHEN_DESIGNS.map(kitchenCategory))).toEqual(new Set(['straight', 'l-shape', 'u-shape', 'island']));
  });

  it('adds six original designs per collection, with bilingual names, public references and independently editable upper rows', () => {
    expect(PREMIUM_KITCHENS).toHaveLength(18);
    for (const collection of ['warm', 'dark', 'japandi']) {
      expect(PREMIUM_KITCHENS.filter((preset) => preset.collection === collection)).toHaveLength(6);
    }
    for (const preset of PREMIUM_KITCHENS) {
      expect(en.kitchens.names[preset.id]).toBeTruthy();
      expect(sr.kitchens.names[preset.id]).toBeTruthy();
      expect(preset.inspiration).toMatch(/^https:\/\/www\.pinterest\.com\/ideas\//);
      const design = createKitchenDesign(preset, preset.id);
      const uppers = design.items.filter((item) => ['wall', 'glassWall', 'shelf'].includes(item.kind));
      expect(new Set(uppers.map((item) => item.elevation)).size).toBe(2);
      expect(new Set(uppers.map((item) => item.depth)).size).toBeGreaterThan(1);
      expect(uppers.some((item) => item.frontFinish === preset.middleFinish)).toBe(true);
    }
  });

  it('includes every premium module in the collection and uses warm lighting and stone backsplashes', () => {
    const kinds = new Set(KITCHEN_DESIGNS.flatMap((preset) => createKitchenDesign(preset, '').items.map((item) => item.kind)));
    for (const kind of ['pullOut', 'glassWall', 'ovenTower', 'integratedFridge', 'hood', 'hob', 'bar', 'tall'] as const) expect(kinds.has(kind)).toBe(true);
    for (const preset of KITCHEN_DESIGNS) {
      expect(preset.style.lighting).toBe(true);
      expect(preset.style.backsplash).not.toBe('none');
    }
  });

  it('showcases multiple diagonal walls, half-height partitions and wall finishes without moving cabinetry or adding cut parts', () => {
    for (const id of ['travertine-courtyard', 'obsidian-island', 'clay-social', 'moss-pavilion']) {
      const preset = PREMIUM_KITCHENS.find((entry) => entry.id === id)!;
      const design = createKitchenDesign(preset, id);
      const { width, depth, height } = preset.room;
      const baseline = createKitchenDesign({ ...preset, room: { width, depth, height } }, id);
      expect(design.items.map(({ id: _id, ...item }) => item)).toEqual(baseline.items.map(({ id: _id, ...item }) => item));
      expect(checkDesign(design).filter((issue) => issue.severity === 'error')).toEqual([]);
      expect(buildCuttingList(design).pieceCount).toBe(buildCuttingList(baseline).pieceCount);
      expect(buildCuttingList(design).rows.map(({ length, width, quantity }) => ({ length, width, quantity })))
        .toEqual(buildCuttingList(baseline).rows.map(({ length, width, quantity }) => ({ length, width, quantity })));
      expect(design.room.treatments?.length).toBeGreaterThan(0);
      if (design.room.vertices) {
        expect(roomSegments(design.room, false).filter((wall) => wall.start.x !== wall.end.x && wall.start.y !== wall.end.y)).toHaveLength(2);
      } else {
        expect(design.room.partitions).toHaveLength(1);
        expect(design.room.partitions![0].height).toBe(1100);
      }
      expect(parseDesign(JSON.parse(JSON.stringify(design)))).toEqual(design);
      const second = createKitchenDesign(preset, id);
      design.room.treatments![0].width = 10;
      expect(second.room.treatments![0].width).not.toBe(10);
    }
  });

  for (const preset of KITCHEN_DESIGNS) {
    it(`${preset.id} is buildable and serializable`, () => {
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
    });

    it(`${preset.id} has its own rendered image`, () => {
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
