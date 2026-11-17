import { describe, expect, it } from 'vitest';
import { createItem } from './catalog';
import { footprintsOverlap, localToRoom } from './geometry';
import { createKitchenDesign, KITCHEN_DESIGNS } from './kitchens';
import { canPlaceItem } from './placement';
import { shuffledKitchen } from './shuffleKitchen';
import type { KitchenItem, Room } from './types';

const room = { width: 4000, depth: 3400, height: 2700 };
const random = () => {
  let state = 17;
  return () => { state = (state * 16807) % 2147483647; return state / 2147483647; };
};
const attributes = ({ x: _x, y: _y, rotation: _rotation, ...item }: KitchenItem) => item;

describe('shuffledKitchen', () => {
  it('moves sinks and appliances without changing inventory, sizes, elevations or finishes', () => {
    const items = ['sink', 'oven', 'fridge', 'drawer', 'wall'].map((kind, index) => createItem(kind as KitchenItem['kind'], [], { id: `item-${index}`, x: index * 600, y: 0 }));
    const before = structuredClone(items);
    const result = shuffledKitchen(room, items, [], random())!;
    expect(result).not.toBeNull();
    expect(result.map(attributes)).toEqual(items.map(attributes));
    for (const kind of ['sink', 'oven', 'fridge']) {
      const index = items.findIndex((item) => item.kind === kind);
      expect([result[index].x, result[index].y, result[index].rotation]).not.toEqual([items[index].x, items[index].y, items[index].rotation]);
    }
    expect(result.every((item) => canPlaceItem(room, result, item))).toBe(true);
    expect(items).toEqual(before);
  });

  it('keeps the hood attached to its cooker when moving and rotating them', () => {
    const hob = createItem('hob', [], { id: 'hob', x: 1000, y: 0 });
    const hood = createItem('hood', [], { id: 'hood', x: 1000, y: 0, width: hob.width });
    const items = [hob, hood, createItem('wall', [], { id: 'upper', x: 2000, y: 0 })];
    const result = shuffledKitchen(room, items, [], random())!;
    expect(result).not.toBeNull();
    expect(result[0].rotation).toBe(result[1].rotation);
    expect(footprintsOverlap(result[0], result[1])).toBe(true);
    expect(localToRoom(result[0], 0, 0)).toEqual(localToRoom(result[1], 0, 0));
    expect(result.every((item) => canPlaceItem(room, result, item))).toBe(true);
  });

  it('fits complete inventories around polygon edges, structures, partitions and openings', () => {
    const shaped: Room = {
      ...room,
      vertices: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 4000, y: 0 }, { id: 'c', x: 4000, y: 2000 }, { id: 'd', x: 2500, y: 3400 }, { id: 'e', x: 0, y: 3400 }],
      features: [{ id: 'column', kind: 'column', x: 0, y: 0, width: 500, depth: 500 }],
      partitions: [{ id: 'partition', start: { x: 2000, y: 1500 }, end: { x: 3000, y: 1500 }, thickness: 100, height: 2700 }],
    };
    const openings = [{ id: 'door', kind: 'door' as const, wall: 'left' as const, offset: 1000, width: 900, height: 2050, sill: 0 }];
    const items = ['corner', 'base', 'wall', 'sink'].map((kind, index) => createItem(kind as KitchenItem['kind'], [], { id: `item-${index}` }));
    const result = shuffledKitchen(shaped, items, openings, random())!;
    expect(result).not.toBeNull();
    expect(result.map(attributes)).toEqual(items.map(attributes));
    expect(result.every((item) => canPlaceItem(shaped, result, item, openings))).toBe(true);
  });

  it('can exchange occupied island slots when openings block every wall', () => {
    const openings = (['top', 'right', 'bottom', 'left'] as const).map((wall) => ({
      id: wall, wall, kind: 'window' as const, offset: 0, width: wall === 'top' || wall === 'bottom' ? room.width : room.depth, sill: 0, height: 2700,
    }));
    const items = [createItem('base', [], { id: 'a', x: 1200, y: 1300 }), createItem('drawer', [], { id: 'b', x: 1800, y: 1300 })];
    const result = shuffledKitchen(room, items, openings, random())!;
    expect(result).not.toBeNull();
    expect(result[0].x).toBe(items[1].x);
    expect(result[1].x).toBe(items[0].x);
    expect(result.every((item) => canPlaceItem(room, result, item, openings))).toBe(true);
  });

  it('never drops a cabinet or returns a partial or ceiling-invalid arrangement', () => {
    const items = [createItem('base', [], { id: 'fits' }), createItem('base', [], { id: 'oversized', width: 1200 })];
    const before = structuredClone(items);
    expect(shuffledKitchen({ width: 1000, depth: 1000, height: 2700 }, items, [], random())).toBeNull();
    expect(shuffledKitchen(room, [{ ...items[0], elevation: 2600 }], [], random())).toBeNull();
    expect(shuffledKitchen(room, [], [], random())).toBeNull();
    expect(items).toEqual(before);
  });

  it('offers different valid arrangements across repeated shuffles of the kitchen collection', () => {
    const rng = random();
    for (const preset of KITCHEN_DESIGNS) {
      const design = createKitchenDesign(preset, preset.id);
      const result = shuffledKitchen(design.room, design.items, design.openings, rng);
      expect(result, preset.id).not.toBeNull();
      expect(result!.map(attributes), preset.id).toEqual(design.items.map(attributes));
      expect(result!.every((item) => canPlaceItem(design.room, result!, item, design.openings)), preset.id).toBe(true);
      const again = shuffledKitchen(design.room, result!, design.openings, rng);
      expect(again, preset.id).not.toBeNull();
      expect(again, preset.id).not.toEqual(result);
    }
  });
});
