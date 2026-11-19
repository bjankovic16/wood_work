import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createItem, LIBRARY, nextLabel, sizeLimits } from './catalog';
import { evaluateExpression } from './math';

describe('library', () => {
  it('ships a local model picture for every addable preset', () => {
    for (const { presets } of LIBRARY) for (const { id } of presets) {
      const picture = readFileSync(`public/elements/${id}.jpg`);
      expect(picture.readUInt16BE(0), id).toBe(0xffd8);
      expect(picture.length, id).toBeGreaterThan(1000);
    }
  });
  it('keeps every original element and offers all premium module sizes', () => {
    const ids = LIBRARY.flatMap((s) => s.presets.map((p) => p.id));
    expect(ids).toEqual([
      'base-300', 'base-400', 'base-450', 'base-500', 'base-600', 'base-800', 'base-900', 'base-custom',
      'wall-300', 'wall-400', 'wall-500', 'wall-600', 'wall-800', 'wall-custom',
      'ceiling-300', 'ceiling-400', 'ceiling-500', 'ceiling-600', 'ceiling-800', 'ceiling-900',
      'sink', 'oven', 'dishwasher', 'fridge', 'drawer', 'corner', 'tall', 'shelf', 'filler', 'endPanel',
      'drawer-800', 'drawer-900', 'drawer-1200', 'pullOut-300', 'pullOut-450', 'pullOut-600',
      'tall-450', 'tall-600', 'tall-800', 'glassWall-600', 'glassWall-800', 'glassWall-900',
      'shelf-600', 'shelf-900', 'shelf-1200', 'hob', 'ovenTower', 'integratedFridge', 'hood',
      'island-1200', 'bar-1500', 'bar-1800',
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
