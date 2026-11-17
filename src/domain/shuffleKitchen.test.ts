import { describe, expect, it, vi } from 'vitest';
import { createItem } from './catalog';
import { attachedWall, footprintsOverlap, itemRect, localToRoom } from './geometry';
import { createKitchenDesign, KITCHEN_DESIGNS } from './kitchens';
import { canPlaceItem } from './placement';
import { nextKitchenVariant } from './shuffleKitchen';
import type { ItemKind, KitchenItem, Room } from './types';

const room = { width: 4000, depth: 3400, height: 2700 };
const attributes = ({ x: _x, y: _y, rotation: _rotation, ...item }: KitchenItem) => item;
const inventory = (kinds: ItemKind[]) => kinds.map((kind, index) => createItem(kind, [], { id: `item-${index}`, x: index * 600, y: 0 }));

describe('nextKitchenVariant', () => {
  it('cycles deterministically through all four planned layout families without random placement', () => {
    const items = inventory(['fridge', 'sink', 'dishwasher', 'drawer', 'oven', 'wall', 'wall']);
    const original = structuredClone(items);
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Layouts must not use randomness'); });
    try {
      expect(nextKitchenVariant(room, items)).toEqual(nextKitchenVariant(room, items));
      const layouts = new Set<string>();
      const ids = new Set<string>();
      let current = items;
      let first: KitchenItem[] | null = null;
      for (let index = 0; index < 17; index++) {
        const next = nextKitchenVariant(room, current)!;
        expect(next).not.toBeNull();
        if (ids.has(next.id)) {
          expect(next.items).toEqual(first);
          break;
        }
        first ??= next.items;
        ids.add(next.id);
        layouts.add(next.layout);
        expect(next.items).not.toEqual(current);
        expect(next.items.map(attributes)).toEqual(items.map(attributes));
        expect(next.items.every((item) => canPlaceItem(room, next.items, item))).toBe(true);
        const floors = next.items.filter((item) => item.elevation < 1000);
        const walls = new Set(floors.map((item) => attachedWall(item, room)));
        if (next.layout === 'island') {
          expect(walls.has(null)).toBe(true);
          for (const item of floors.filter((item) => attachedWall(item, room) === null)) {
            const rect = itemRect(item);
            expect(Math.min(rect.x, rect.y, room.width - rect.x - rect.w, room.depth - rect.y - rect.h)).toBeGreaterThanOrEqual(900);
            for (const wallItem of floors.filter((item) => attachedWall(item, room) !== null)) {
              const wallRect = itemRect(wallItem);
              const gap = Math.max(rect.x - wallRect.x - wallRect.w, wallRect.x - rect.x - rect.w,
                rect.y - wallRect.y - wallRect.h, wallRect.y - rect.y - rect.h);
              expect(gap).toBeGreaterThanOrEqual(900);
            }
          }
        } else {
          expect(walls.has(null)).toBe(false);
          expect(walls.size).toBe(next.layout === 'straight' ? 1 : next.layout === 'l-shape' ? 2 : 3);
        }
        current = next.items;
      }
      expect(layouts).toEqual(new Set(['straight', 'l-shape', 'u-shape', 'island']));
      expect(items).toEqual(original);
    } finally {
      random.mockRestore();
    }
  });

  it('keeps the hood attached to its cooker when moving and rotating them', () => {
    const hob = createItem('hob', [], { id: 'hob', x: 1000, y: 0 });
    const hood = createItem('hood', [], { id: 'hood', x: 1000, y: 0, width: hob.width });
    let items = [hob, hood, createItem('wall', [], { id: 'upper', x: 2000, y: 0 })];
    for (let index = 0; index < 4; index++) {
      const next = nextKitchenVariant(room, items)!;
      expect(next).not.toBeNull();
      expect(next.items[0].rotation).toBe(next.items[1].rotation);
      expect(footprintsOverlap(next.items[0], next.items[1])).toBe(true);
      expect(localToRoom(next.items[0], 0, 0)).toEqual(localToRoom(next.items[1], 0, 0));
      expect(next.items.every((item) => canPlaceItem(room, next.items, item))).toBe(true);
      items = next.items;
    }
  });

  it('adapts planned runs around polygon edges, structures, partitions and openings', () => {
    const shaped: Room = {
      ...room,
      vertices: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 4000, y: 0 }, { id: 'c', x: 4000, y: 2000 }, { id: 'd', x: 2500, y: 3400 }, { id: 'e', x: 0, y: 3400 }],
      features: [{ id: 'column', kind: 'column', x: 0, y: 0, width: 500, depth: 500 }],
      partitions: [{ id: 'partition', start: { x: 2000, y: 1500 }, end: { x: 3000, y: 1500 }, thickness: 100, height: 2700 }],
    };
    const openings = [{ id: 'door', kind: 'door' as const, wall: 'left' as const, offset: 1000, width: 900, height: 2050, sill: 0 }];
    const items = inventory(['corner', 'base', 'wall', 'sink']);
    const result = nextKitchenVariant(shaped, items, openings)!;
    expect(result).not.toBeNull();
    expect(result.layout).toBe('l-shape');
    expect(result.items.map(attributes)).toEqual(items.map(attributes));
    expect(result.items.every((item) => canPlaceItem(shaped, result.items, item, openings))).toBe(true);
  });

  it('skips island and opposing-wall layouts without enough aisle space', () => {
    const narrow = { width: 4000, depth: 1800, height: 2700 };
    let items = inventory(['base', 'sink', 'drawer', 'oven']);
    const layouts: string[] = [];
    for (let index = 0; index < 12; index++) {
      const result = nextKitchenVariant(narrow, items)!;
      expect(result).not.toBeNull();
      layouts.push(result.id);
      expect(result.layout).not.toBe('island');
      items = result.items;
    }
    expect(layouts).not.toContain('u-shape-right');
    expect(layouts).not.toContain('u-shape-left');
  });

  it('does not fall back to random slot swaps when no planned layout fits', () => {
    const openings = (['top', 'right', 'bottom', 'left'] as const).map((wall) => ({
      id: wall, wall, kind: 'window' as const, offset: 0, width: wall === 'top' || wall === 'bottom' ? room.width : room.depth, sill: 0, height: 2700,
    }));
    const items = [createItem('base', [], { id: 'a', x: 1200, y: 1300 }), createItem('drawer', [], { id: 'b', x: 1800, y: 1300 })];
    const before = structuredClone(items);
    expect(nextKitchenVariant(room, items, openings)).toBeNull();
    expect(items).toEqual(before);
  });

  it('never drops a cabinet or returns a partial or ceiling-invalid arrangement', () => {
    const items = inventory(['base', 'base']);
    items[1].width = 1200;
    const before = structuredClone(items);
    expect(nextKitchenVariant({ width: 1000, depth: 1000, height: 2700 }, items)).toBeNull();
    expect(nextKitchenVariant(room, [{ ...items[0], elevation: 2600 }])).toBeNull();
    expect(nextKitchenVariant(room, [])).toBeNull();
    expect(items).toEqual(before);
  });

  it('preserves every cabinet and finds planned alternatives for the kitchen collection', () => {
    for (const preset of KITCHEN_DESIGNS) {
      const design = createKitchenDesign(preset, preset.id);
      const result = nextKitchenVariant(design.room, design.items, design.openings);
      expect(result, preset.id).not.toBeNull();
      expect(result!.items.map(attributes), preset.id).toEqual(design.items.map(attributes));
      expect(result!.items.every((item) => canPlaceItem(design.room, result!.items, item, design.openings)), preset.id).toBe(true);
      const again = nextKitchenVariant(design.room, result!.items, design.openings);
      expect(again, preset.id).not.toBeNull();
      expect(again!.items, preset.id).not.toEqual(result!.items);
    }
  });
});
