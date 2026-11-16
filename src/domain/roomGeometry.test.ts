import { describe, expect, it } from 'vitest';
import { createItem } from './catalog';
import { createDesign, parseDesign, setRoom } from './designOps';
import { attachedRoomSurface, footprintRects, insideRoom, itemRect } from './geometry';
import { clampOpening } from './openings';
import { canPlaceItem, findFreeSpot } from './placement';
import { createRoomExample, ROOM_EXAMPLES } from './roomExamples';
import { openingFitsRoomWall, parseRoom, ROOM_CORNERS, roomContainsPoint, roomFeatureRect, roomOutline, roomWallRuns } from './roomGeometry';
import { computeDragPlacement } from './snapping';
import type { Room } from './types';
import { checkDesign } from '../engine/checks';
import { buildCuttingList } from '../engine/cuttingList';
import { planSvg } from '../export/planSvg';
import { SR_LABELS } from '../i18n/srEngine';

const base: Room = { width: 4000, depth: 3000, height: 2600 };
const chimney = { id: 'chimney-1', kind: 'chimney' as const, x: 1000, y: 0, width: 450, depth: 450 };

describe('room footprints and fixed structures', () => {
  it('preserves rectangular rooms and their original wall order', () => {
    expect(parseRoom(base)).toEqual(base);
    expect(roomOutline(base)).toHaveLength(4);
    expect(roomWallRuns(base).map((run) => run.wall)).toEqual(['top', 'right', 'bottom', 'left']);
    expect(insideRoom({ x: 0, y: 0, w: 4000, h: 3000 }, base)).toBe(true);
  });

  for (const kind of ['notch', 'diagonal'] as const) {
    for (const corner of ROOM_CORNERS) {
      it(`${kind} in ${corner} has the correct area and excludes that corner`, () => {
        const room: Room = { ...base, cutout: { kind, corner, width: 1000, depth: 800 } };
        const points = roomOutline(room);
        const area = points.reduce((sum, point, index) => {
          const next = points[(index + 1) % points.length];
          return sum + point.x * next.y - next.x * point.y;
        }, 0) / 2;
        expect(area).toBe(base.width * base.depth - 1000 * 800 * (kind === 'notch' ? 1 : 0.5));
        expect(roomContainsPoint({ x: corner.includes('Left') ? 0 : room.width, y: corner.startsWith('top') ? 0 : room.depth }, room)).toBe(false);
        expect(roomContainsPoint({ x: 2000, y: 1500 }, room)).toBe(true);
      });
    }
  }

  it('checks a corner cabinet by its real L-shaped footprint, not its empty bounding-box corner', () => {
    const room: Room = { width: 2000, depth: 2000, height: 2600, cutout: { kind: 'notch', corner: 'bottomRight', width: 1100, depth: 1100 } };
    const item = createItem('corner', [], { width: 1400, width2: 1400 });
    expect(insideRoom(itemRect(item), room)).toBe(false);
    expect(footprintRects(item).every((rect) => insideRoom(rect, room))).toBe(true);
    expect(canPlaceItem(room, [], item)).toBe(true);
  });

  it('reserves chimney space for automatic placement and exposes its faces for snapping', () => {
    const room = { ...base, features: [chimney] };
    const item = createItem('base', [], { x: 1000 });
    expect(canPlaceItem(room, [], item)).toBe(false);
    const placement = findFreeSpot(room, [], item);
    expect(placement).not.toBeNull();
    expect(placement && canPlaceItem(room, [], { ...item, ...placement })).toBe(true);
    const drag = computeDragPlacement({ room, others: [], item: createItem('base', [], { width: 400 }), pointer: { x: 1225, y: 600 }, grabOffset: null, previousWall: 'top', snap: { enabled: true, grid: 10, threshold: 30 } });
    expect(drag.y).toBe(450);
    expect(attachedRoomSurface({ ...item, width: 400, x: 1000, y: 450 }, room)?.offset).toBe(450);
  });

  it('reports one structural collision without manufacturing parts for the structure', () => {
    const design = { ...createDesign(), room: { ...base, features: [chimney] }, items: [createItem('base', [], { x: 1000 }), createItem('base', [], { x: 2200 })] };
    expect(checkDesign(design).filter((issue) => issue.key.startsWith('structure-'))).toHaveLength(1);
    expect(buildCuttingList(design).pieceCount).toBe(buildCuttingList({ ...design, room: base }).pieceCount);
    expect(planSvg(design).svg).toContain('Chimney 1');
    expect(planSvg(design, SR_LABELS).svg).toContain('Dimnjak 1');
  });

  it('surfaces a structure outside a cut-out even when no cabinets have been added', () => {
    const room: Room = { ...base, cutout: { kind: 'notch', corner: 'topLeft', width: 1000, depth: 800 }, features: [{ ...chimney, x: 0 }] };
    expect(checkDesign({ ...createDesign(), room }).filter((issue) => issue.roomFeatureId === chimney.id && issue.severity === 'error')).toHaveLength(1);
  });

  it('keeps openings on an actual remaining outer wall', () => {
    const room: Room = { ...base, cutout: { kind: 'diagonal', corner: 'topRight', width: 1000, depth: 800 } };
    const opening = clampOpening({ id: 'window', kind: 'window', wall: 'top', offset: 3200, width: 1200, height: 1000, sill: 900 }, room);
    expect(opening.offset).toBe(1800);
    expect(openingFitsRoomWall(room, opening.wall, opening.offset, opening.width)).toBe(true);
  });

  it('preserves shapes and structures when resizing and round-tripping a project', () => {
    const original = { ...createDesign(), room: { ...base, features: [chimney], cutout: { kind: 'notch' as const, corner: 'bottomRight' as const, width: 1000, depth: 800 } } };
    expect(setRoom(original, { width: 4000 })).toBe(original);
    const resized = setRoom(original, { width: 3500 });
    expect(resized.room.features).toEqual([chimney]);
    expect(resized.room.cutout).toEqual(original.room.cutout);
    expect(parseDesign(JSON.parse(JSON.stringify(resized)))).toEqual(resized);
    expect(original.room.width).toBe(4000);
  });

  it('rejects malformed or duplicate structures instead of silently dropping room data', () => {
    expect(parseRoom({ ...base, features: [chimney, chimney] })).toBeNull();
    expect(parseRoom({ ...base, features: [{ ...chimney, width: -1 }] })).toBeNull();
    expect(parseRoom({ ...base, features: [{ ...chimney, kind: { toString: 'chimney' } }] })).toBeNull();
    expect(parseRoom({ ...base, cutout: { kind: 'curve', corner: 'topLeft', width: 1000, depth: 800 } })).toBeNull();
  });

  for (const id of ROOM_EXAMPLES) {
    it(`${id} is a usable example kitchen with persistent room geometry`, () => {
      const design = createRoomExample(id, 'Example');
      expect(design.room.features?.length).toBeGreaterThan(0);
      expect(design.room.features?.every((feature) => insideRoom(roomFeatureRect(feature), design.room))).toBe(true);
      expect(checkDesign(design).filter((issue) => issue.severity === 'error')).toEqual([]);
      expect(parseDesign(JSON.parse(JSON.stringify(design)))).toEqual(design);
    });
  }
});
