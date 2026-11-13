import { describe, expect, it } from 'vitest';
import { createItem } from './catalog';
import {
  aabbSize,
  attachedWall,
  footprintPolygon,
  footprintRects,
  frontEdges,
  localToRoom,
  mountingWalls,
  resizeFromAnchor,
  rotateItem,
} from './geometry';
import type { KitchenItem, Rotation } from './types';

const room = { width: 3600, depth: 3000, height: 2600 };
const base = (over: Partial<KitchenItem> = {}) => createItem('base', [], { width: 600, depth: 560, ...over });

describe('localToRoom', () => {
  it('puts the back-left corner on the correct side for every rotation', () => {
    const at = (rotation: Rotation) => localToRoom(base({ x: 100, y: 200, rotation }), 0, 0);
    expect(at(0)).toEqual({ x: 100, y: 200 });
    expect(at(90)).toEqual({ x: 660, y: 200 });
    expect(at(180)).toEqual({ x: 700, y: 760 });
    expect(at(270)).toEqual({ x: 100, y: 800 });
  });

  it('puts the front edge on the side facing into the room', () => {
    const [[a, b]] = frontEdges(base({ rotation: 90, x: 3040, y: 0 }));
    expect(a).toEqual({ x: 3040, y: 0 });
    expect(b).toEqual({ x: 3040, y: 600 });
  });
});

describe('aabbSize', () => {
  it('swaps width and depth for side walls', () => {
    expect(aabbSize(base())).toEqual({ w: 600, h: 560 });
    expect(aabbSize(base({ rotation: 270 }))).toEqual({ w: 560, h: 600 });
  });
});

describe('corner units', () => {
  const corner = createItem('corner', []);

  it('have an L-shaped footprint', () => {
    expect(footprintRects(corner)).toEqual([
      { x: 0, y: 0, w: 900, h: 560 },
      { x: 0, y: 560, w: 560, h: 340 },
    ]);
    expect(footprintPolygon(corner)).toEqual([0, 0, 900, 0, 900, 560, 560, 560, 560, 900, 0, 900]);
    expect(mountingWalls(corner)).toEqual(['top', 'left']);
  });

  it('fit the top-right corner when rotated 90°', () => {
    const c = { ...corner, rotation: 90 as const, x: 2700, y: 0 };
    expect(mountingWalls(c)).toEqual(['right', 'top']);
    expect(footprintRects(c)).toEqual([
      { x: 3040, y: 0, w: 560, h: 900 },
      { x: 2700, y: 0, w: 340, h: 560 },
    ]);
  });
});

describe('resizeFromAnchor', () => {
  it('keeps a unit against its wall when the depth changes', () => {
    const onRightWall = base({ rotation: 90, x: 3040, y: 500 });
    const deeper = resizeFromAnchor(onRightWall, { depth: 600 });
    expect(deeper.x + aabbSize(deeper).w).toBe(3600);
    expect(deeper.y).toBe(500);
  });

  it('keeps the left side (seen from the front) in place when the width changes', () => {
    const onBottomWall = base({ rotation: 180, x: 1000, y: 2440 });
    const wider = resizeFromAnchor(onBottomWall, { width: 800 });
    expect(wider.x + 800).toBe(1600);
    expect(wider.y).toBe(2440);
  });

  it('keeps a corner unit in its corner', () => {
    const c = { ...createItem('corner', []), rotation: 180 as const, x: 2700, y: 2100 };
    const bigger = resizeFromAnchor(c, { width: 1000, width2: 1100 });
    const r = aabbSize(bigger);
    expect(bigger.x + r.w).toBe(3600);
    expect(bigger.y + r.h).toBe(3000);
  });
});

describe('rotateItem', () => {
  it('rotates around the centre and stays inside the room', () => {
    const rotated = rotateItem(base({ x: 0, y: 0 }), 1, room);
    expect(rotated).toMatchObject({ rotation: 90, x: 20, y: 0 });
  });

  it('rotates anticlockwise with negative steps', () => {
    expect(rotateItem(base({ x: 1000, y: 1000 }), -1, room).rotation).toBe(270);
  });
});

describe('attachedWall', () => {
  it('reports the wall a unit stands against', () => {
    expect(attachedWall(base({ x: 500, y: 0 }), room)).toBe('top');
    expect(attachedWall(base({ x: 500, y: 10 }), room)).toBeNull();
    expect(attachedWall(base({ rotation: 270, x: 0, y: 900 }), room)).toBe('left');
  });
});
