import { describe, expect, it } from 'vitest';
import { createItem, LIBRARY, nextLabel, sizeLimits } from './catalog';
import { evaluateExpression } from './math';

describe('library', () => {
  it('offers every element from the specification', () => {
    const ids = LIBRARY.flatMap((s) => s.presets.map((p) => p.id));
    expect(ids).toEqual([
      'base-300', 'base-400', 'base-450', 'base-500', 'base-600', 'base-800', 'base-900', 'base-custom',
      'wall-300', 'wall-400', 'wall-500', 'wall-600', 'wall-800', 'wall-custom',
      'sink', 'oven', 'dishwasher', 'fridge', 'drawer', 'corner', 'tall', 'shelf', 'filler', 'endPanel',
    ]);
  });
});

describe('nextLabel', () => {
  it('numbers each kind separately and skips used numbers', () => {
    const b1 = createItem('base', []);
    const b2 = createItem('base', [b1]);
    expect([b1.label, b2.label]).toEqual(['B1', 'B2']);
    expect(nextLabel('base', [b2])).toBe('B3');
    expect(nextLabel('dishwasher', [b1, b2])).toBe('DW1');
    expect(nextLabel('shelf', [createItem('sink', [])])).toBe('SH1');
  });
});

describe('sizeLimits', () => {
  it('keeps the arms of a corner unit longer than its depth', () => {
    const corner = createItem('corner', []);
    expect(sizeLimits(corner, 'width').min).toBe(760);
    expect(sizeLimits(corner, 'depth').max).toBe(650);
    expect(sizeLimits({ ...corner, width: 800 }, 'depth').max).toBe(600);
  });
});

describe('evaluateExpression', () => {
  it('evaluates simple arithmetic', () => {
    expect(evaluateExpression('600')).toBe(600);
    expect(evaluateExpression('600+18')).toBe(618);
    expect(evaluateExpression('(2400 - 36) / 4')).toBe(591);
    expect(evaluateExpression('2*-3')).toBe(-6);
    expect(evaluateExpression('12,5')).toBe(12.5);
  });

  it('rejects anything else', () => {
    expect(evaluateExpression('')).toBeNull();
    expect(evaluateExpression('abc')).toBeNull();
    expect(evaluateExpression('600+')).toBeNull();
    expect(evaluateExpression('(1+2')).toBeNull();
    expect(evaluateExpression('1/0')).toBeNull();
  });
});
