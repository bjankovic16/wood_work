import { describe, expect, it } from 'vitest';
import { createItem } from './catalog';
import { createDesign, parseDesign } from './designOps';
import { moveRoomCorner, moveRoomWall, snapRoomAngle, snapRoomCorner } from './roomCornerEdit';
import { normalizeAngle } from './polygons';
import type { Design, Opening, Room } from './types';
import { roomSegments } from './walls';

const room: Room = { width: 4000, depth: 3000, height: 2680 };
const window: Opening = { id: 'window', kind: 'window', wall: 'bottom', offset: 300, width: 900, height: 1000, sill: 1100 };
const design = (patch: Partial<Design> = {}): Design => ({ ...createDesign(), room, ...patch });

describe('room outline editing', () => {
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

  describe('moving a whole perimeter wall', () => {
    it.each(['top', 'right', 'bottom', 'left'])('moves both ends of %s perpendicular to the wall, preserving the room and all wall IDs', (id) => {
      const base = design();
      const original = structuredClone(base);
      const wall = roomSegments(room, false).find((w) => w.id === id)!;
      const next = moveRoomWall(base, id, { x: wall.inward.x * -200 + wall.tangent.x * 500, y: wall.inward.y * -200 + wall.tangent.y * 500 });
      expect(next.ok).toBe(true);
      if (!next.ok) return;
      const moved = roomSegments(next.design.room, false).find((w) => w.id === id)!;
      expect(moved.angle).toBeCloseTo(wall.angle, 10);
      expect(moved.length).toBeCloseTo(wall.length, 10);
      for (const key of ['start', 'end'] as const) {
        expect(moved[key].x - next.shift.x).toBeCloseTo(wall[key].x - wall.inward.x * 200, 10);
        expect(moved[key].y - next.shift.y).toBeCloseTo(wall[key].y - wall.inward.y * 200, 10);
      }
      expect(next.design.room.vertices?.map((v) => v.id)).toEqual(['top', 'right', 'bottom', 'left']);
      expect(parseDesign(JSON.parse(JSON.stringify(next.design)))).toEqual(next.design);
      expect(base).toEqual(original);
    });

    it('preserves physical furniture and free-fixture positions while doors/windows travel with the moved wall', () => {
      const item = createItem('base', [], { x: 1800, y: 1300 });
      const feature = { id: 'post', kind: 'column' as const, x: 900, y: 900, width: 200, depth: 200 };
      const opening = { ...window, wall: 'top' as const, offset: 400 };
      const base = design({ items: [item], openings: [opening], room: { ...room, features: [feature] } });
      const next = moveRoomWall(base, 'top', { x: 450, y: 300 });
      expect(next.ok).toBe(true);
      if (!next.ok) return;
      expect(next.shift).toEqual({ x: 0, y: -300 });
      expect(next.design.items).toEqual([{ ...item, y: item.y - 300 }]);
      expect(next.design.room.features).toEqual([{ ...feature, y: feature.y - 300 }]);
      expect(next.design.openings).toEqual([{ ...opening, wallId: 'top' }]);
      expect(next.design.room.depth).toBe(2700);
    });

    it('keeps a diagonal wall parallel and ignores movement along its own line', () => {
      const vertices = [{ id: 'slope', x: 0, y: 0 }, { id: 'right', x: 4000, y: 800 },
        { id: 'bottom', x: 4000, y: 3000 }, { id: 'left', x: 0, y: 3000 }];
      const base = design({ room: { ...room, vertices } });
      const wall = roomSegments(base.room, false)[0];
      expect(moveRoomWall(base, wall.id, { x: wall.tangent.x * 800, y: wall.tangent.y * 800 }))
        .toEqual({ ok: true, design: base, shift: { x: 0, y: 0 } });
      const next = moveRoomWall(base, wall.id, { x: wall.inward.x * 200, y: wall.inward.y * 200 });
      expect(next.ok).toBe(true);
      if (!next.ok) return;
      const moved = roomSegments(next.design.room, false)[0];
      expect(moved.angle).toBeCloseTo(wall.angle, 10);
      expect(moved.length).toBeCloseTo(wall.length, 10);
      expect(parseDesign(JSON.parse(JSON.stringify(next.design)))).toEqual(next.design);
    });

    it('blocks newly excluded cabinets and door-clearance conflicts without relocating them', () => {
      const cabinet = createItem('base', [], { x: 1300, y: 400 });
      expect(moveRoomWall(design({ items: [cabinet] }), 'top', { x: 0, y: 450 })).toEqual({ ok: false, reason: 'cabinet' });
      const door: Opening = { id: 'door', kind: 'door', wall: 'top', wallId: 'top', offset: 1200, width: 900, height: 2050, sill: 0 };
      const clear = { ...cabinet, y: 1000 };
      expect(moveRoomWall(design({ items: [clear], openings: [door] }), 'top', { x: 0, y: 200 })).toEqual({ ok: false, reason: 'opening' });
    });

    it('protects openings on adjoining walls and fixed structures attached to the moved wall', () => {
      const opening = { ...window, wall: 'right' as const, wallId: 'right', offset: 2000 };
      expect(moveRoomWall(design({ openings: [opening] }), 'top', { x: 0, y: 200 })).toEqual({ ok: false, reason: 'opening' });
      const feature = { id: 'post', kind: 'column' as const, wallId: 'top', offset: 500, x: 500, y: 0, width: 200, depth: 200 };
      expect(moveRoomWall(design({ room: { ...room, features: [feature] } }), 'top', { x: 0, y: -100 }))
        .toEqual({ ok: false, reason: 'fixture' });
      const partition = { id: 'divider', start: { x: 900, y: 150 }, end: { x: 1900, y: 150 }, thickness: 100, height: 2200 };
      expect(moveRoomWall(design({ room: { ...room, partitions: [partition] } }), 'top', { x: 0, y: 200 }))
        .toEqual({ ok: false, reason: 'fixture' });
    });

    it('rejects invalid IDs, nonfinite movement and impossible room bounds without mutating the baseline', () => {
      const base = design();
      const original = structuredClone(base);
      for (const [id, delta] of [['missing', { x: 0, y: 100 }], ['top', { x: NaN, y: 0 }],
        ['top', { x: 0, y: 3000 }], ['left', { x: -20000, y: 0 }]] as const) {
        expect(moveRoomWall(base, id, delta)).toEqual({ ok: false, reason: 'outline' });
      }
      expect(base).toEqual(original);
    });
  });

  describe('right-angle snapping', () => {
    it.each([[85, 90], [95, 90], [84.9, 84.9], [95.1, 95.1], [355, 0], [360, 0], [185, 180], [265, 270], [45, 45]])(
      'snaps %s° to %s° only within the five-degree tolerance', (input, output) => {
        expect(snapRoomAngle(input)).toBe(output);
      });
    it('rejects a nonfinite angle explicitly', () => {
      expect(() => snapRoomAngle(NaN)).toThrow(RangeError);
    });
    it('also snaps a reflex corner to an exact 270° without changing its wall identities', () => {
      const shaped: Room = { ...room, vertices: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 4000, y: 0 },
        { id: 'c', x: 4000, y: 3000 }, { id: 'd', x: 2000, y: 3000 }, { id: 'bend', x: 2000, y: 1500 }, { id: 'f', x: 0, y: 1500 }] };
      const next = moveRoomCorner(design({ room: shaped }), 'bend', snapRoomCorner(shaped, 'bend', { x: 30, y: -30 }));
      expect(next.ok).toBe(true);
      if (!next.ok) return;
      const walls = roomSegments(next.design.room, false);
      expect(normalizeAngle(walls[3].angle + 180 - walls[4].angle)).toBeCloseTo(270, 10);
      expect(next.design.room.vertices?.map((v) => v.id)).toEqual(shaped.vertices?.map((v) => v.id));
    });
    it('makes a nearly square corner exactly 90° and round-trips its fractional outline', () => {
      const base = design();
      const delta = snapRoomCorner(room, 'right', { x: 50, y: 50 });
      const next = moveRoomCorner(base, 'right', delta);
      expect(next.ok).toBe(true);
      if (!next.ok) return;
      const walls = roomSegments(next.design.room, false);
      expect(normalizeAngle(walls[0].angle + 180 - walls[1].angle)).toBeCloseTo(90, 10);
      expect(parseDesign(JSON.parse(JSON.stringify(next.design)))).toEqual(next.design);
      const free = { x: -600, y: 600 };
      expect(snapRoomCorner(room, 'right', free)).toBe(free);
      const tap = { x: 0, y: 0 };
      expect(snapRoomCorner(room, 'right', tap)).toBe(tap);
    });
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
