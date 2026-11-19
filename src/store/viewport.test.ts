import { describe, expect, it } from 'vitest';
import { viewportRevealing } from './viewport';

describe('revealing a cabinet above the sheet', () => {
  const view = { zoom: 0.1, pan: { x: 8, y: 170 } };
  const rect = { x: 1200, y: 2100, w: 600, h: 560 };

  it('only pans as far as the sheet requires; collapsing the sheet does not reset the view', () => {
    const area = { left: 0, top: 54, right: 360, bottom: 370 };
    const next = viewportRevealing(rect, view, [area], 12);
    expect(next.zoom).toBe(view.zoom);
    expect(next.pan.x).toBe(view.pan.x);
    expect(next.pan.y + (rect.y + rect.h) * next.zoom).toBe(358);
    expect(viewportRevealing(rect, next, [{ ...area, bottom: 600 }], 12)).toBe(next);
  });

  it('uses the nearer clear region at the current scale, shrinking only if none fits', () => {
    const narrow = { left: 0, right: 64, top: 0, bottom: 450 };
    const far = { left: 200, right: 360, top: 0, bottom: 450 };
    const near = { left: 64, right: 220, top: 60, bottom: 460 };
    expect(viewportRevealing(rect, view, [narrow, far, near], 12)).toBe(view);
    expect(viewportRevealing(rect, view, [narrow], 12).zoom * rect.w).toBe(40);
  });
});
