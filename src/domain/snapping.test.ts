import { describe, expect, it } from 'vitest';
import { createItem } from './catalog';
import { computeDragPlacement, computeHandleResize, type DragInput } from './snapping';
import type { KitchenItem } from './types';

const room = { width: 3600, depth: 3000, height: 2600 };
const snap = { enabled: true, grid: 50, threshold: 50 };

function drop(item: KitchenItem, x: number, y: number, extra: Partial<DragInput> = {}) {
  return computeDragPlacement({
    room,
    others: [],
    item,
    pointer: { x, y },
    grabOffset: null,
    previousWall: null,
    snap,
    ...extra,
  });
}

describe('computeDragPlacement', () => {
  it('turns a unit dropped near a wall to stand against it', () => {
    const result = drop(createItem('base', []), 3400, 1500);
    expect(result).toMatchObject({ rotation: 90, wall: 'right', x: 3040, y: 1200 });
  });

  it('snaps to the side of a neighbouring unit', () => {
    const neighbour = createItem('base', [], { x: 0, y: 0 });
    const result = drop(createItem('base', [neighbour]), 920, 200, { others: [neighbour] });
    expect(result).toMatchObject({ x: 600, y: 0, rotation: 0 });
    expect(result.guides).toContainEqual({ axis: 'x', value: 600 });
  });

  it('falls back to the grid when nothing is close', () => {
    expect(drop(createItem('base', []), 1333, 100)).toMatchObject({ x: 1050, y: 0 });
  });

  it('leaves units in the middle of the room free-standing', () => {
    expect(drop(createItem('base', []), 1800, 1500)).toMatchObject({ x: 1500, y: 1200, rotation: 0, wall: null });
  });

  it('keeps a unit on its current wall near a corner', () => {
    const item = createItem('base', [], { rotation: 270 });
    expect(drop(item, 300, 290).wall).toBe('top');
    expect(drop(item, 300, 290, { previousWall: 'left' })).toMatchObject({ wall: 'left', rotation: 270, x: 0 });
  });

  it('drops corner units into the nearest room corner', () => {
    expect(drop(createItem('corner', []), 3300, 2700)).toMatchObject({ rotation: 180, x: 2700, y: 2100 });
  });

  it('never leaves the room', () => {
    expect(drop(createItem('base', []), -500, -500)).toMatchObject({ x: 0, y: 0 });
    expect(drop(createItem('fridge', []), 5000, 5000)).toMatchObject({ x: 3000, y: 2400 });
  });

  it('places freely when snapping is off', () => {
    const result = drop(createItem('base', []), 1503, 1203, { snap: { ...snap, enabled: false } });
    expect(result).toMatchObject({ x: 1203, y: 923, rotation: 0, wall: null });
  });

  it('keeps the grab offset while dragging along a wall', () => {
    const item = createItem('base', [], { x: 1000, y: 0 });
    // Grabbed 200 mm right of the centre, pointer moved to x = 1700.
    const result = drop(item, 1700, 300, { grabOffset: { x: 200, y: 20 } });
    expect(result).toMatchObject({ x: 1200, y: 0, rotation: 0 });
  });
});

describe('computeHandleResize', () => {
  it('stretches to a neighbour from the right handle', () => {
    const a = createItem('base', [], { x: 0, y: 0 });
    const b = createItem('base', [a], { x: 1000, y: 0 });
    const result = computeHandleResize({ room, others: [b], item: a, handleId: 'right', pointer: { x: 990, y: 300 }, snap });
    expect(result.item).toMatchObject({ x: 0, width: 1000 });
    expect(result.guides).toContainEqual({ axis: 'x', value: 1000 });
  });

  it('keeps the right side in place when dragging the left handle', () => {
    const a = createItem('base', [], { x: 1000, y: 0 });
    const result = computeHandleResize({ room, others: [], item: a, handleId: 'left', pointer: { x: 812, y: 300 }, snap });
    expect(result.item).toMatchObject({ x: 800, width: 800 });
  });

  it('respects the minimum width', () => {
    const a = createItem('base', [], { x: 1000, y: 0 });
    const result = computeHandleResize({ room, others: [], item: a, handleId: 'right', pointer: { x: 900, y: 300 }, snap });
    expect(result.item.width).toBe(150);
  });

  it('maps handles through the rotation', () => {
    const a = createItem('base', [], { rotation: 90, x: 3040, y: 0 });
    const result = computeHandleResize({ room, others: [], item: a, handleId: 'right', pointer: { x: 3300, y: 812 }, snap });
    expect(result.item).toMatchObject({ width: 800, x: 3040, y: 0 });
  });

  it('changes the second arm of a corner unit', () => {
    const c = createItem('corner', []);
    const result = computeHandleResize({ room, others: [], item: c, handleId: 'sideEnd', pointer: { x: 200, y: 1010 }, snap });
    expect(result.item).toMatchObject({ width: 900, width2: 1000, x: 0, y: 0 });
  });
});
