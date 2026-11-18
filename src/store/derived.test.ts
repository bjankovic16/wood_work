import { describe, expect, it, vi } from 'vitest';
import { createItem } from '../domain/catalog';
import { createDesign, updateItem } from '../domain/designOps';
import * as checks from '../engine/checks';
import { EN_LABELS } from '../engine/labels';
import { sr } from '../i18n/sr';
import { currentIssues } from './derived';

describe('shared live design checks', () => {
  it('keeps collisions current without regenerating workshop reports for each listener or movement', () => {
    const full = vi.spyOn(checks, 'checkDesign');
    try {
      const base = {
        ...createDesign(),
        room: { width: 4000, depth: 3000, height: 2600, features: [{ id: 'flue', kind: 'chimney' as const, width: 350, depth: 450, x: 1600, y: 0 }] },
        items: [createItem('base', [], { id: 'left', x: 0 }), createItem('base', [], { id: 'moving', x: 800, y: 1000 })],
        openings: [{ id: 'door', kind: 'door' as const, wall: 'top' as const, offset: 2300, width: 900, sill: 0, height: 2050 }],
      };
      const committed = currentIssues({ design: base, gestureBase: null }, EN_LABELS);
      expect(currentIssues({ design: base, gestureBase: null }, EN_LABELS)).toBe(committed);
      expect(full).toHaveBeenCalledTimes(1);
      const move = (x: number) => ({ design: updateItem(base, 'moving', { x, y: 0 }), gestureBase: base });
      const overlap = move(100);
      const collision = currentIssues(overlap, EN_LABELS);
      expect(collision.map((i) => i.key)).toContain('overlap-left-moving');
      expect(currentIssues(overlap, EN_LABELS)).toBe(collision);
      const chimney = currentIssues(move(1600), EN_LABELS);
      expect(chimney.map((i) => i.key)).toContain('structure-flue-moving');
      expect(chimney.map((i) => i.key)).not.toContain('overlap-left-moving');
      const doorway = move(2300);
      expect(currentIssues(doorway, EN_LABELS).map((i) => i.key)).toContain('door-door-moving');
      expect(full).toHaveBeenCalledTimes(1);
      expect(currentIssues({ design: base, gestureBase: null }, EN_LABELS)).toBe(committed); // Cancel.
      const atDrop = { design: doorway.design, gestureBase: null };
      const after = currentIssues(atDrop, EN_LABELS);
      expect(currentIssues(atDrop, EN_LABELS)).toBe(after);
      expect(full).toHaveBeenCalledTimes(2);
      expect(currentIssues(atDrop, sr.engine).map((issue) => issue.message)).not.toEqual(after.map((issue) => issue.message));
    } finally { full.mockRestore(); }
  });
});
