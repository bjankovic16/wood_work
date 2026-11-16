import { describe, expect, it } from 'vitest';
import { createItem } from '../domain/catalog';
import { createDesign } from '../domain/designOps';
import type { Design, KitchenItem, Opening } from '../domain/types';
import { checkDesign } from './checks';
import { buildContext } from './config';
import { unitParts } from './parts';

function design(items: KitchenItem[], openings: Opening[] = []): Design {
  return { ...createDesign(), items, openings };
}

const unit = (kind: KitchenItem['kind'], label: string, over: Partial<KitchenItem> = {}) => createItem(kind, [], { label, ...over });
const messages = (d: Design) => checkDesign(d).map((i) => `${i.severity}: ${i.message}`);

describe('checkDesign', () => {
  it('separates supplier confirmations from real geometry and clearance problems', () => {
    const value = design([unit('hob', 'HB1'), unit('base', 'B1', { x: 300 })]);
    value.style = { ...value.style, frontProfile: 'shaker', handles: 'none' };
    const issues = checkDesign(value);
    expect(issues.filter((issue) => issue.category === 'precut').map((issue) => issue.key)).toEqual(expect.arrayContaining(['front-profile', 'handleless', `manufacturer-${value.items[0].id}`]));
    expect(issues.find((issue) => issue.severity === 'error' && issue.itemIds.length === 2)).not.toHaveProperty('category');
    const gap = checkDesign(design([unit('base', 'B1'), unit('base', 'B2', { x: 620 })]));
    expect(gap.some((issue) => issue.severity === 'warning' && issue.category !== 'precut')).toBe(true);
  });
  it('passes a tidy run of units', () => {
    expect(messages(design([unit('base', 'B1', { x: 0 }), unit('base', 'B2', { x: 600 })]))).toEqual([]);
  });

  it('reports overlapping units, but not wall units above base units', () => {
    const issues = checkDesign(design([unit('base', 'B1', { x: 0 }), unit('base', 'B2', { x: 300 }), unit('wall', 'W1', { x: 0 })]));
    expect(issues.map((i) => i.message)).toContain('B1 and B2 overlap.');
    expect(issues.find((i) => i.message === 'B1 and B2 overlap.')).toMatchObject({ severity: 'error' });
    expect(issues.some((i) => i.message.includes('W1') && i.message.includes('overlap'))).toBe(false);
  });

  it('reports small gaps between units and to the wall', () => {
    expect(messages(design([unit('base', 'B1', { x: 0 }), unit('base', 'B2', { x: 620 }), unit('base', 'B3', { x: 2950 })]))).toEqual([
      'warning: A 20 mm gap between B1 and B2 on the top wall: close it, or fill it with a filler panel.',
      'warning: A 50 mm gap between B3 and the corner on the top wall: close it, or fill it with a filler panel.',
    ]);
  });

  it('reports units through the ceiling', () => {
    expect(messages(design([unit('tall', 'T1', { height: 2600 })]))).toContain('error: T1 reaches 2700 mm, above the 2600 mm ceiling.');
  });

  it('warns about wide doors and wall units hung too low', () => {
    expect(messages(design([unit('base', 'B1', { width: 1000, doors: 1 })]))).toContain(
      'warning: B1 has doors 997 mm wide; doors over 600 mm sag. Use more doors.',
    );
    expect(messages(design([unit('base', 'B1'), unit('wall', 'W1', { elevation: 1200 })]))).toContain(
      'warning: W1 hangs only 342 mm above the worktop below it; 500–650 mm is usual.',
    );
  });

  it('warns when a fridge stands right next to an oven', () => {
    expect(messages(design([unit('fridge', 'F1', { x: 0 }), unit('oven', 'O1', { x: 600 })]))).toContain(
      'warning: Fridge F1 stands right next to oven O1; put a unit or a panel between them.',
    );
  });

  it('reports units in front of doors and over windows', () => {
    const door: Opening = { id: 'd', kind: 'door', wall: 'top', offset: 1000, width: 900, height: 2050, sill: 0 };
    expect(messages(design([unit('base', 'B1', { x: 1200 })], [door]))).toContain('error: B1 blocks the door on the top wall.');

    const window: Opening = { id: 'w', kind: 'window', wall: 'top', offset: 600, width: 1200, height: 1200, sill: 1000 };
    const items = [unit('base', 'B1', { x: 600 }), unit('wall', 'W1', { x: 900 })];
    expect(messages(design(items, [window]))).toEqual(['warning: W1 covers the window on the top wall.']);
    expect(messages(design(items, [{ ...window, sill: 800 }]))).toContain(
      'warning: The window on the top wall starts at 800 mm, below the worktop of B1 (858 mm).',
    );
  });

  it('reports parts larger than their sheet', () => {
    const d = design([unit('tall', 'T1')]);
    d.materials = d.materials.map((m) => (m.id === 'particleboard-white-18' ? { ...m, sheetLength: 1800, grain: true } : m));
    expect(messages(d)).toContain('error: Side of T1 (2070 × 560) does not fit on a 1800 × 2070 sheet of White melamine particleboard.');
  });

  it('checks pieces changed or added by hand against their sheet', () => {
    const d = design([unit('base', 'B1')]);
    const shelf = unitParts(d.items[0], buildContext(d)).find((p) => p.name === 'Shelf')!;
    d.partEdits = { [d.items[0].id]: { [shelf.key]: { length: 3000 } } };
    d.customParts = [
      { id: 'c1', name: 'Worktop support', quantity: 1, length: 2900, width: 100, materialId: 'particleboard-white-18', edgesLength: 0, edgesWidth: 0, edgeBandId: null, note: '' },
    ];
    expect(messages(d)).toEqual([
      'error: Shelf of B1 (3000 × 540) does not fit on a 2800 × 2070 sheet of White melamine particleboard.',
      'error: The extra piece “Worktop support” (2900 × 100) does not fit on a 2800 × 2070 sheet of White melamine particleboard.',
    ]);
    // Left out, the shelf no longer matters.
    d.partEdits = { [d.items[0].id]: { [shelf.key]: { length: 3000, quantity: 0 } } };
    d.customParts = [];
    expect(messages(d)).toEqual([]);
  });
});
