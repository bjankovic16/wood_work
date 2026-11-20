import { describe, expect, it } from 'vitest';
import { createItem } from './catalog';
import { canPlaceItem, findFreeSpot, placeCopy, snapCornerToRoom } from './placement';
import type { ItemKind, KitchenItem, Room } from './types';

const room = { width: 3600, depth: 3000, height: 2600 };

function placeAll(kinds: ItemKind[]): KitchenItem[] {
  const items: KitchenItem[] = [];
  for (const kind of kinds) {
    const item = createItem(kind, items);
    const spot = findFreeSpot(room, items, item);
    if (!spot) throw new Error(`no spot for ${kind}`);
    items.push({ ...item, ...spot });
  }
  return items;
}

describe('findFreeSpot', () => {
  it('fills the top wall from left to right', () => {
    const [a, b] = placeAll(['base', 'base']);
    expect(a).toMatchObject({ x: 0, y: 0, rotation: 0 });
    expect(b).toMatchObject({ x: 600, y: 0, rotation: 0 });
  });

  it('lines wall units up above the base units', () => {
    const [, wall] = placeAll(['base', 'wall']);
    expect(wall).toMatchObject({ x: 0, y: 0, rotation: 0 });
  });

  it('does not put wall units in front of a tall unit', () => {
    const [, wall] = placeAll(['tall', 'wall']);
    expect(wall).toMatchObject({ x: 600, y: 0 });
  });

  it('continues on the right wall when the top wall is full', () => {
    const items = placeAll(['base', 'base', 'base', 'base', 'base', 'base', 'base']);
    expect(items[6]).toMatchObject({ rotation: 90, x: 3040, y: 560 });
  });

  it('puts corner units into the free corners', () => {
    const [first, second] = placeAll(['corner', 'corner']);
    expect(first).toMatchObject({ rotation: 0, x: 0, y: 0 });
    expect(second).toMatchObject({ rotation: 90, x: 2700, y: 0 });
  });

  it('uses the exposed junction beside a corner chimney, without shortening either arm', () => {
    const r: Room = { ...room, width: 3671, features: [{ id: 'flue', kind: 'chimney', wallId: 'top', offset: 3171, x: 3171, y: 0, width: 500, depth: 500 }] };
    const occupied = [[0, 0], [0, 2440], [3071, 2440]].map(([x, y]) => createItem('base', [], { x, y }));
    const item = createItem('corner', [], { width: 950, width2: 1050 });
    const pose = findFreeSpot(r, occupied, item);
    expect(pose).toEqual({ x: 3171 - 1050, y: 0, rotation: 90 });
    expect(canPlaceItem(r, occupied, { ...item, ...pose })).toBe(true);
    const otherSide = snapCornerToRoom(r, occupied, item, [], { x: 3620, y: 575 }, 1300);
    expect(otherSide).toEqual({ x: 3671 - 1050, y: 500, rotation: 90 });
    const door = { id: 'door', kind: 'door' as const, wall: 'top' as const, offset: 1800, width: 650, height: 2050, sill: 0 };
    expect(findFreeSpot(r, occupied, item, [door])).toEqual(otherSide);
  });

  it('snaps beside a chimney on a sloping wall in the actual wall frame', () => {
    const r: Room = { ...room, vertices: [{ id: 'slope', x: 0, y: 0 }, { id: 'b', x: 3600, y: 900 }, { id: 'c', x: 3600, y: 3000 }, { id: 'd', x: 0, y: 3000 }],
      features: [{ id: 'flue', kind: 'chimney', wallId: 'slope', offset: 1550, width: 500, depth: 400, x: 0, y: 0 }] };
    const item = createItem('corner', []);
    const pose = snapCornerToRoom(r, [], item, [], { x: 2000, y: 500 }, 400);
    expect(pose?.rotation).toBeCloseTo(Math.atan2(900, 3600) * 180 / Math.PI);
    expect(canPlaceItem(r, [], { ...item, ...pose })).toBe(true);
  });

  it('returns null when the unit fits nowhere', () => {
    const small = { width: 1000, depth: 1000, height: 2600 };
    expect(findFreeSpot(small, [], createItem('base', [], { width: 1200 }))).toBeNull();
  });
});

describe('placeCopy', () => {
  it('puts the copy next to the original along the same wall', () => {
    const source = { ...createItem('base', []), x: 600, y: 0 };
    const copy = { ...source, id: 'copy' };
    expect(placeCopy(room, [source], source, copy)).toEqual({ x: 1200, y: 0, rotation: 0 });
  });

  it('follows the wall direction for rotated units', () => {
    const source = { ...createItem('base', []), rotation: 90 as const, x: 3040, y: 600 };
    const copy = { ...source, id: 'copy' };
    expect(placeCopy(room, [source], source, copy)).toEqual({ x: 3040, y: 1200, rotation: 90 });
  });
});

describe('openings', () => {
  it('keeps units out of the way of doors and windows', () => {
    const door = { id: 'd', kind: 'door' as const, wall: 'top' as const, offset: 0, width: 900, height: 2050, sill: 0 };
    expect(findFreeSpot(room, [], createItem('base', []), [door])).toEqual({ x: 900, y: 0, rotation: 0 });

    const window = { id: 'w', kind: 'window' as const, wall: 'top' as const, offset: 0, width: 1200, height: 1200, sill: 1000 };
    // Base units fit under the window; wall units go beside it.
    expect(findFreeSpot(room, [], createItem('base', []), [window])).toEqual({ x: 0, y: 0, rotation: 0 });
    expect(findFreeSpot(room, [], createItem('wall', []), [window])).toEqual({ x: 1200, y: 0, rotation: 0 });
  });
});
