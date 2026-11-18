import { describe, expect, it } from 'vitest';
import { createItem } from './catalog';
import { createDesign, parseDesign } from './designOps';
import { moveRoomCorner } from './roomCornerEdit';
import type { Design, Opening, Room } from './types';
import { roomSegments } from './walls';

const room: Room = { width: 4000, depth: 3000, height: 2680 };
const window: Opening = { id: 'window', kind: 'window', wall: 'bottom', offset: 300, width: 900, height: 1000, sill: 1100 };
const design = (patch: Partial<Design> = {}): Design => ({ ...createDesign(), room, ...patch });

describe('moving one perimeter corner', () => {
  it('keeps the gesture-start design on a tap, and converts legacy offsets only on an actual edit', () => {
    const bottom = { ...window, id: 'bottom' }, left = { ...window, id: 'left', wall: 'left' as const };
    const base = design({ openings: [bottom, left] });
    const original = structuredClone(base);
    const tap = moveRoomCorner(base, 'right', { x: 0, y: 0 });
    expect(tap.ok && tap.design).toBe(base);
    expect(tap.ok && tap.shift).toEqual({ x: 0, y: 0 });

    // Both legacy walls run in the opposite direction to the polygon segments.
    const next = moveRoomCorner(base, 'right', { x: 200, y: -150 });
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    expect(next.shift).toEqual({ x: 0, y: 150 });
    expect(next.design.room).toEqual({ width: 4200, depth: 3150, height: 2680, vertices: [
      { id: 'top', x: 0, y: 150 }, { id: 'right', x: 4200, y: 0 },
      { id: 'bottom', x: 4000, y: 3150 }, { id: 'left', x: 0, y: 3150 },
    ] });
    expect(next.design.openings).toEqual([
      { ...bottom, wallId: 'bottom', offset: 2800 }, { ...left, wallId: 'left', offset: 1800 },
    ]);
    expect(base).toEqual(original);
    expect(parseDesign(JSON.parse(JSON.stringify(next.design)))).toEqual(next.design);
  });

  it('rebases fixed footprints and partitions for both outward and inward moves of the only minimum', () => {
    const vertices = [
      { id: 'a', x: 0, y: 0 }, { id: 'b', x: 4000, y: 400 }, { id: 'c', x: 900, y: 3000 },
    ];
    const feature = { id: 'post', kind: 'column' as const, x: 800, y: 600, width: 200, depth: 200 };
    const partition = { id: 'divider', start: { x: 1200, y: 1100 }, end: { x: 2200, y: 1100 }, thickness: 100, height: 2200 };
    const finish = { id: 'oak', wallId: 'divider:1', offset: 50, width: 900, elevation: 0, height: 1700, finish: 'oak' as const };
    const opening = { ...window, wallId: 'divider:-1', offset: 250, width: 550 };
    const item = createItem('base', [], { x: 1200.5, y: 550.25, rotation: 17, width: 450, depth: 350 });
    const base = design({ room: { ...room, vertices, features: [feature], partitions: [partition], treatments: [finish] }, items: [item], openings: [opening] });
    const original = structuredClone(base);

    for (const [x, y] of [[-100, -160], [200, 125]]) {
      const next = moveRoomCorner(base, 'a', { x, y });
      expect(next.ok).toBe(true);
      if (!next.ok) return;
      expect(next.shift).toEqual({ x: -x, y: -y });
      expect(next.design.room).toEqual({
        ...base.room, width: 4000 - x, depth: 3000 - y,
        vertices: [vertices[0], { id: 'b', x: 4000 - x, y: 400 - y }, { id: 'c', x: 900 - x, y: 3000 - y }],
        features: [{ ...feature, x: feature.x - x, y: feature.y - y }],
        partitions: [{ ...partition, start: { x: 1200 - x, y: 1100 - y }, end: { x: 2200 - x, y: 1100 - y } }],
      });
      expect(next.design.items).toEqual([{ ...item, x: item.x - x, y: item.y - y }]);
      expect(next.design.openings).toEqual([opening]);
    }
    expect(base).toEqual(original);
  });

  it('stops at a concave cabinet footprint crossing, but not at an unrelated existing placement error', () => {
    const vertices = [
      { id: 'top', x: 0, y: 0 }, { id: 'right', x: 4000, y: 0 }, { id: 'bottom', x: 4000, y: 3000 },
      { id: 'bend', x: 2000, y: 3000 }, { id: 'left', x: 0, y: 3000 },
    ];
    const crossing = createItem('base', [], { x: 1500, y: 800, width: 1000, depth: 600 });
    const outside = createItem('base', [], { x: -100, y: 400 });
    const base = design({ room: { ...room, vertices }, items: [crossing, outside] });
    // All four cabinet corners still fit, but the notch cuts through its front edge.
    expect(moveRoomCorner(base, 'bend', { x: 0, y: -1800 })).toEqual({ ok: false, reason: 'cabinet' });
    const touching = moveRoomCorner(base, 'bend', { x: 0, y: -1600 });
    expect(touching.ok && touching.design.items).toEqual([crossing, outside]);
  });

  it('accepts a legacy opening exactly at the wall end but never slides or trims it to fit', () => {
    const base = design({ openings: [window] });
    const fits = moveRoomCorner(base, 'left', { x: 300, y: 0 });
    expect(fits.ok && fits.design.openings).toEqual([{ ...window, wallId: 'bottom', offset: 2800 }]);
    expect(moveRoomCorner(base, 'left', { x: 301, y: 0 })).toEqual({ ok: false, reason: 'opening' });
  });

  it('rejects a door swinging into a new cabinet clearance conflict, not a pre-existing conflict', () => {
    const door: Opening = { id: 'door', kind: 'door', wall: 'top', wallId: 'top', offset: 1200, width: 900, height: 2050, sill: 0 };
    const blocked = createItem('base', [], { x: 1650, y: 300, width: 400, depth: 400 });
    const clear = { ...blocked, id: 'clear', y: 1000 };
    const base = design({ openings: [door], items: [blocked] });
    const delta = { x: 0, y: 500 };
    expect(moveRoomCorner(base, 'right', delta).ok).toBe(true);
    expect(moveRoomCorner({ ...base, items: [blocked, clear] }, 'right', delta)).toEqual({ ok: false, reason: 'opening' });
  });

  it('protects the full partition thickness, a fixed column and an attached wall finish before clamping', () => {
    const partition = { id: 'divider', start: { x: 3000, y: 150 }, end: { x: 3600, y: 150 }, thickness: 120, height: 1500 };
    const feature = { id: 'post', kind: 'column' as const, x: 3200, y: 90, width: 200, depth: 200 };
    for (const fixtures of [{ partitions: [partition] }, { features: [feature] }]) {
      expect(moveRoomCorner(design({ room: { ...room, ...fixtures } }), 'right', { x: 0, y: 150 }))
        .toEqual({ ok: false, reason: 'fixture' });
    }
    const finish = { id: 'stone', wallId: 'top', offset: 1000, width: 3000, elevation: 900, height: 1200, finish: 'stone' as const };
    expect(moveRoomCorner(design({ room: { ...room, treatments: [finish] } }), 'right', { x: -10, y: 0 }))
      .toEqual({ ok: false, reason: 'fixture' });
    const attached = { ...feature, wallId: 'top', offset: feature.x, y: 0 };
    const mounted = design({ room: { ...room, features: [attached] } });
    expect(moveRoomCorner(mounted, 'right', { x: 200, y: 0 }).ok).toBe(true); // the fixed post is untouched
    expect(moveRoomCorner(mounted, 'right', { x: 200, y: 100 })).toEqual({ ok: false, reason: 'fixture' });
  });

  it('rejects crossed, degenerate and out-of-range outlines without losing legacy cutout segment IDs', () => {
    const shaped = { ...room, cutout: { kind: 'diagonal' as const, corner: 'bottomRight' as const, width: 800, depth: 600 } };
    const base = design({ room: shaped });
    for (const delta of [{ x: -4100, y: 500 }, { x: -4000, y: 0 }, { x: 20000, y: 0 }]) {
      expect(moveRoomCorner(base, 'right', delta)).toEqual({ ok: false, reason: 'outline' });
    }
    const moved = moveRoomCorner(base, 'right', { x: 100, y: 150 });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.design.room.cutout).toBeUndefined();
    expect(moved.design.room.vertices?.map((v) => v.id)).toEqual(roomSegments(shaped, false).map((s) => s.id));
  });
});
