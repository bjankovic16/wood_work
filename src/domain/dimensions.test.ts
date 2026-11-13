import { describe, expect, it } from 'vitest';
import { createItem } from './catalog';
import { computeClearances, computeWallChains } from './dimensions';

const room = { width: 3600, depth: 3000, height: 2600 };

describe('computeWallChains', () => {
  it('chains units and gaps along a wall', () => {
    const items = [
      createItem('base', [], { x: 0, y: 0 }),
      createItem('base', [], { x: 600, y: 0 }),
      createItem('base', [], { x: 1500, y: 0 }),
    ];
    const chains = computeWallChains(room, items);
    expect(chains).toHaveLength(1);
    expect(chains[0]).toMatchObject({ wall: 'top', level: 'floor' });
    expect(chains[0].segments).toEqual([
      { from: 0, to: 600, occupied: true },
      { from: 600, to: 1200, occupied: true },
      { from: 1200, to: 1500, occupied: false },
      { from: 1500, to: 2100, occupied: true },
      { from: 2100, to: 3600, occupied: false },
    ]);
  });

  it('keeps wall units in their own chain and skips free-standing units', () => {
    const items = [
      createItem('base', [], { x: 0, y: 0 }),
      createItem('wall', [], { x: 0, y: 0, width: 800 }),
      createItem('base', [], { x: 1500, y: 1500 }),
    ];
    const chains = computeWallChains(room, items);
    expect(chains.map((c) => c.level)).toEqual(['floor', 'wall']);
    expect(chains[1].segments[0]).toEqual({ from: 0, to: 800, occupied: true });
  });

  it('measures both arms of a corner unit', () => {
    const chains = computeWallChains(room, [createItem('corner', [])]);
    expect(chains.map((c) => c.wall)).toEqual(['top', 'left']);
    expect(chains[1].segments[0]).toEqual({ from: 0, to: 900, occupied: true });
  });
});

describe('computeClearances', () => {
  it('measures the free space to walls and neighbours', () => {
    const item = createItem('base', [], { x: 1000, y: 0 });
    const neighbour = createItem('base', [], { x: 2000, y: 0 });
    expect(computeClearances(room, [item, neighbour], item)).toEqual([
      { axis: 'x', from: 0, to: 1000, at: 280 },
      { axis: 'x', from: 1600, to: 2000, at: 280 },
      { axis: 'y', from: 560, to: 3000, at: 1300 },
    ]);
  });

  it('ignores units at a different height', () => {
    const wall = createItem('wall', [], { x: 0, y: 0 });
    const base = createItem('base', [], { x: 600, y: 0 });
    const clearances = computeClearances(room, [wall, base], wall);
    expect(clearances.find((c) => c.axis === 'x')).toEqual({ axis: 'x', from: 600, to: 3600, at: 160 });
  });
});
