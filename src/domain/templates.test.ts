import { describe, expect, it } from 'vitest';
import { footprintsOverlap, insideRoom, itemRect, verticalOverlap } from './geometry';
import { buildLayout, fillWidths, LAYOUTS } from './templates';
import type { KitchenItem, Room } from './types';

const ROOMS: Room[] = [
  { width: 3600, depth: 3000, height: 2600 },
  { width: 2400, depth: 2000, height: 2500 },
  { width: 1500, depth: 1200, height: 2400 },
  { width: 6000, depth: 4500, height: 2800 },
];

function collisions(items: KitchenItem[]): string[] {
  const found: string[] = [];
  items.forEach((a, i) =>
    items.slice(i + 1).forEach((b) => {
      if (verticalOverlap(a, b) && footprintsOverlap(a, b)) found.push(`${a.label}/${b.label}`);
    }),
  );
  return found;
}

describe('ready-made layouts', () => {
  for (const layout of LAYOUTS) {
    for (const room of ROOMS) {
      it(`${layout.id} fits a ${room.width} × ${room.depth} room without overlaps`, () => {
        const items = buildLayout(layout.id, room);
        expect(items.length).toBeGreaterThan(0);
        expect(items.filter((item) => !insideRoom(itemRect(item), room)).map((i) => i.label)).toEqual([]);
        expect(collisions(items)).toEqual([]);
      });
    }
  }

  it('lays out a straight kitchen with standard widths', () => {
    const items = buildLayout('straight', { width: 3600, depth: 3000, height: 2600 });
    expect(items.filter((i) => i.elevation < 1000).map((i) => [i.kind, i.x, i.width])).toEqual([
      ['fridge', 0, 600],
      ['sink', 600, 800],
      ['dishwasher', 1400, 600],
      ['oven', 2000, 600],
      ['drawer', 2600, 600],
      ['base', 3200, 400],
    ]);
    // No wall unit over the hob (x 2000–2600), where the extractor hood goes.
    const wallUnits = items.filter((i) => i.kind === 'wall');
    expect(wallUnits.map((i) => [i.x, i.width])).toEqual([
      [600, 800],
      [1400, 600],
      [2600, 800],
    ]);
  });

  it('puts the corner units of a U-shaped kitchen in both top corners', () => {
    const corners = buildLayout('u-shape', { width: 3600, depth: 3000, height: 2600 }).filter((i) => i.kind === 'corner');
    expect(corners.map((c) => [c.x, c.y, c.rotation])).toEqual([
      [0, 0, 0],
      [2700, 0, 90],
    ]);
  });

  it('fills a length with the largest standard widths first', () => {
    expect(fillWidths(2150)).toEqual([900, 900, 300]);
    expect(fillWidths(250)).toEqual([]);
  });
});
