import { describe, expect, it } from 'vitest';
import { createItem } from './catalog';
import { createDesign, parseDesign, setRoom } from './designOps';
import { attachedRoomSurface, footprintRects, insideRoom, itemRect, attachedSegment, localToRoom, itemInsideRoom } from './geometry';
import { clampOpening } from './openings';
import { canPlaceItem, findFreeSpot } from './placement';
import { createRoomExample, ROOM_EXAMPLES } from './roomExamples';
import { openingFitsRoomWall, parseRoom, ROOM_CORNERS, roomContainsPoint, roomFeatureRect, roomOutline, roomWallRuns } from './roomGeometry';
import { computeDragPlacement } from './snapping';
import type { Room, Opening } from './types';
import { roomSegments, wallPoint, openingPolygon, solidWallPieces } from './walls';
import { editableRoomVertices, editRoomWall, setRoomVertices, removeRoomCorner } from '../store/actions';
import { useDesignStore } from '../store/designStore';
import { checkDesign } from '../engine/checks';
import { buildCuttingList } from '../engine/cuttingList';
import { planSvg } from '../export/planSvg';
import { SR_LABELS } from '../i18n/srEngine';

const base: Room = { width: 4000, depth: 3000, height: 2600 };
const chimney = { id: 'chimney-1', kind: 'chimney' as const, x: 1000, y: 0, width: 450, depth: 450 };

describe('room footprints and fixed structures', () => {
  const angled: Room = { ...base, vertices: [
    { id: 'diagonal', x: 1000, y: 0 }, { id: 'east', x: 4000, y: 3000 }, { id: 'south', x: 0, y: 3000 }, { id: 'west', x: 0, y: 0 },
  ] };

  it('snaps a cabinet back to a real diagonal segment and reserves its angled opening', () => {
    const item = createItem('base', [], { width: 600 });
    const frame = roomSegments(angled)[0];
    const pointer = wallPoint(frame, 1600, 200);
    const result = computeDragPlacement({ room: angled, others: [], item, pointer, grabOffset: null, previousWall: null, snap: { enabled: true, threshold: 30, grid: 10 } });
    const placed = { ...item, ...result };
    expect(result.rotation).toBe(45);
    expect(attachedSegment(placed, angled)?.id).toBe('diagonal');
    expect(itemInsideRoom(placed, angled)).toBe(true);
    const opening: Opening = { id: 'door', kind: 'door', wall: 'top', wallId: 'diagonal', offset: 1200, width: 900, sill: 0, height: 2100 };
    expect(openingPolygon(angled, opening, 900)).toHaveLength(4);
    expect(canPlaceItem(angled, [], placed, [opening])).toBe(false);
    expect(checkDesign({ ...createDesign(), room: angled, openings: [opening], items: [placed] }).some((issue) => issue.key.startsWith('door-'))).toBe(true);
    expect(planSvg({ ...createDesign(), room: angled, openings: [opening], items: [placed] }).svg).not.toContain('NaN');
  });

  it('checks a low partition only at intersecting heights and snaps to either face', () => {
    const room: Room = { ...base, partitions: [{ id: 'low', start: { x: 800, y: 1500 }, end: { x: 3000, y: 1500 }, thickness: 100, height: 1100 }] };
    const baseItem = createItem('base', [], { x: 1000, y: 1400 });
    const upper = createItem('wall', [], { x: 1000, y: 1400 });
    expect(canPlaceItem(room, [], baseItem)).toBe(false);
    expect(canPlaceItem(room, [], upper)).toBe(true);
    for (const side of [-1, 1]) {
      const frame = roomSegments(room).find((s) => s.id === `low:${side}`)!;
      const result = computeDragPlacement({ room, others: [], item: baseItem, pointer: wallPoint(frame, 1000, 150), grabOffset: null, previousWall: null, snap: { enabled: true, threshold: 30, grid: 10 } });
      expect(attachedSegment({ ...baseItem, ...result }, room)?.id).toBe(frame.id);
      expect(canPlaceItem(room, [], { ...baseItem, ...result })).toBe(true);
    }
  });

  it('detects an edge bridging a concave notch even with every cabinet vertex inside', () => {
    const room: Room = { ...base, vertices: [
      { id: 'a', x: 0, y: 0 }, { id: 'b', x: 4000, y: 0 }, { id: 'c', x: 4000, y: 3000 }, { id: 'd', x: 2200, y: 3000 },
      { id: 'e', x: 2200, y: 1400 }, { id: 'f', x: 1800, y: 1400 }, { id: 'g', x: 1800, y: 3000 }, { id: 'h', x: 0, y: 3000 },
    ] };
    expect(insideRoom({ x: 1600, y: 1000, w: 800, h: 700 }, room)).toBe(false);
    expect(insideRoom({ x: 200, y: 1000, w: 800, h: 700 }, room)).toBe(true);
  });

  it('clips wall and decorative rectangles around windows', () => {
    const frame = roomSegments(angled)[0];
    const pieces = solidWallPieces(frame, [{ from: 500, to: 1500, bottom: 900, top: 2100 }]);
    const total = pieces.reduce((area, p) => area + (p.to - p.from) * (p.top - p.bottom), 0);
    expect(total).toBeCloseTo(frame.length * frame.height - 1000 * 1200);
    expect(pieces.some((p) => p.from < 1000 && p.to > 1000 && p.bottom < 1500 && p.top > 1500)).toBe(false);
  });

  it('preserves old opening world positions when converting to editable walls and makes wall edits undoable', () => {
    const opening: Opening = { id: 'bottom-window', kind: 'window', wall: 'bottom', offset: 300, width: 1200, sill: 1000, height: 1000 };
    const initial = { ...createDesign(), room: base, openings: [opening] };
    useDesignStore.getState().load(initial);
    setRoomVertices(editableRoomVertices(base));
    const converted = useDesignStore.getState().design;
    expect(converted.openings[0]).toMatchObject({ wallId: 'bottom', offset: 2500 });
    expect(openingPolygon(converted.room, converted.openings[0], 500).map((p) => p.x).sort()).toEqual(openingPolygon(base, opening, 500).map((p) => p.x).sort());
    editRoomWall('top', 3800, 0);
    expect(useDesignStore.getState().design.room.vertices?.[1].x).toBe(3800);
    useDesignStore.getState().undo();
    expect(useDesignStore.getState().design).toEqual(converted);
    expect(parseDesign(JSON.parse(JSON.stringify(converted)))).toEqual(converted);
    expect(() => removeRoomCorner('bottom')).toThrow(RangeError);
  });

  it('rejects invalid geometry and attachments without mutating the saved room', () => {
    expect(parseRoom({ ...base, vertices: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 4000, y: 3000 }, { id: 'c', x: 0, y: 3000 }, { id: 'd', x: 4000, y: 0 }] })).toBeNull();
    const design = { ...createDesign(), room: angled, items: [createItem('base', [], { rotation: 405, x: 1000, y: 1500 })] };
    const parsed = parseDesign(JSON.parse(JSON.stringify(design)));
    expect(parsed?.items[0].rotation).toBe(45);
    expect(parseDesign({ ...design, room: { ...angled, treatments: [{ id: 'bad', wallId: 'missing', offset: 0, width: 100, elevation: 0, height: 100, finish: 'oak' }] } })).toBeNull();
    useDesignStore.getState().load(design);
    expect(() => setRoomVertices([{ id: 'a', x: 0, y: 0 }])).toThrow(RangeError);
    expect(useDesignStore.getState().design).toBe(design);
    expect(localToRoom(design.items[0], 0, 0).x).toBeGreaterThan(0);
  });
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
