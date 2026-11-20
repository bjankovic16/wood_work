import { hasWorktop, WORKTOP_THICKNESS } from './catalog';
import { footprintPieces, itemInsideRoom } from './geometry';
import { openingObstacles } from './openings';
import { normalizeAngle, polygonBounds, polygonContains, polygonsOverlap, validRoomPolygon } from './polygons';
import { featureFitsRoom, ROOM_LIMITS, roomFeaturePolygon, roomOutline } from './roomGeometry';
import type { Design, KitchenItem, Opening, Point, Room, RoomVertex } from './types';
import { openingOnWall, partitionPolygon, roomSegments, type WallSegment } from './walls';

export type RoomCornerEditResult =
  | { ok: true; design: Design; shift: Point }
  | { ok: false; reason: 'outline' | 'cabinet' | 'opening' | 'fixture' };

export const ROOM_ANGLE_SNAP_TOLERANCE = 5;

export function snapRoomAngle(angle: number): number {
  if (!Number.isFinite(angle)) throw new RangeError('Invalid wall angle.');
  const value = angle >= 0 && angle < 360 ? angle : normalizeAngle(angle);
  const closest = Math.round(value / 90) * 90;
  return Math.abs(value - closest) <= ROOM_ANGLE_SNAP_TOLERANCE + 1e-9 ? normalizeAngle(closest) : value;
}

export function snapRoomCorner(room: Room, cornerId: string, delta: Point): Point {
  const walls = roomSegments(room, false);
  const index = walls.findIndex((wall) => wall.id === cornerId);
  if (index < 0 || !Number.isFinite(delta.x) || !Number.isFinite(delta.y)) throw new RangeError('Invalid room corner.');
  if (!delta.x && !delta.y) return delta;
  const corner = walls[index].start, a = walls[(index + walls.length - 1) % walls.length].start, b = walls[index].end;
  const p = { x: corner.x + delta.x, y: corner.y + delta.y };
  const angle = normalizeAngle((Math.atan2(a.y - p.y, a.x - p.x) - Math.atan2(b.y - p.y, b.x - p.x)) * 180 / Math.PI);
  if (Math.min(Math.abs(angle - 90), Math.abs(angle - 270)) > ROOM_ANGLE_SNAP_TOLERANCE + 1e-9) return delta;
  const centre = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const radius = Math.hypot(a.x - b.x, a.y - b.y) / 2;
  const length = Math.hypot(p.x - centre.x, p.y - centre.y);
  if (!length || p.x === a.x && p.y === a.y || p.x === b.x && p.y === b.y) return delta;
  // The circle with the adjoining corners as its diameter makes the selected corner exactly square.
  return { x: centre.x + (p.x - centre.x) * radius / length - corner.x,
    y: centre.y + (p.y - centre.y) * radius / length - corner.y };
}

// Do not introduce an overhang, or worsen an existing one. Height and offset do not change.
function keepsSpan(before: WallSegment, after: WallSegment | undefined, end: number): boolean {
  return !!after && after.length + 1e-7 >= Math.min(before.length, end);
}

function newlyBlocksOpening(items: KitchenItem[], before: Room, after: Room, opening: Opening): boolean {
  if (!items.length) return false;
  const [next] = openingObstacles(after, [opening]);
  const [old] = openingObstacles(before, [opening]);
  return items.some((item) => {
    const worktop = opening.kind === 'window' && hasWorktop(item) ? WORKTOP_THICKNESS : 0;
    if (item.elevation >= next.top || item.elevation + item.height + worktop <= next.bottom) return false;
    const pieces = footprintPieces(item);
    return pieces.some((p) => polygonsOverlap(p, next.polygon)) && !pieces.some((p) => polygonsOverlap(p, old.polygon));
  });
}

/**
 * Try a single delta in the gesture-start frame, without clamping or searching for a fit.
 * On success, stored plan coordinates equal physical coordinates in that frame plus `shift`.
 * Wall attachments are measured from their segment's clockwise start, not the bounding box.
 */
export function moveRoomCorner(base: Design, cornerId: string, delta: Point): RoomCornerEditResult {
  const walls = roomSegments(base.room, false);
  const index = walls.findIndex((wall) => wall.id === cornerId);
  if (index < 0 || !Number.isFinite(delta.x) || !Number.isFinite(delta.y)) return { ok: false, reason: 'outline' };
  const start = walls[index].start;
  const x = start.x + delta.x, y = start.y + delta.y;
  if (x === start.x && y === start.y) return { ok: true, design: base, shift: { x: 0, y: 0 } };

  const vertices = walls.map((wall, i) => ({ ...(i === index ? { x, y } : wall.start), id: wall.id }));
  return editOutline(base, vertices);
}

export function moveRoomWall(base: Design, wallId: string, delta: Point): RoomCornerEditResult {
  const walls = roomSegments(base.room, false);
  const index = walls.findIndex((wall) => wall.id === wallId);
  if (index < 0 || !Number.isFinite(delta.x) || !Number.isFinite(delta.y)) return { ok: false, reason: 'outline' };
  const wall = walls[index];
  const amount = Math.round(delta.x * wall.inward.x + delta.y * wall.inward.y);
  if (!amount) return { ok: true, design: base, shift: { x: 0, y: 0 } };
  const vertices = walls.map((w, i) => ({ id: w.id, x: w.start.x + (i === index || i === (index + 1) % walls.length ? wall.inward.x * amount : 0),
    y: w.start.y + (i === index || i === (index + 1) % walls.length ? wall.inward.y * amount : 0) }));
  return editOutline(base, vertices);
}

function editOutline(base: Design, vertices: RoomVertex[]): RoomCornerEditResult {
  const before = base.room, walls = roomSegments(before, false);
  const bounds = polygonBounds(vertices);
  if (!validRoomPolygon(vertices) || bounds.w < ROOM_LIMITS.width.min || bounds.w > ROOM_LIMITS.width.max
    || bounds.h < ROOM_LIMITS.depth.min || bounds.h > ROOM_LIMITS.depth.max) return { ok: false, reason: 'outline' };

  // Validate before rebasing, so furniture and fixed structures stay in the same physical frame.
  const { cutout: _cutout, ...rest } = before;
  const room: Room = { ...rest, width: Math.ceil(bounds.w), depth: Math.ceil(bounds.h), vertices };
  const nextWalls = new Map(roomSegments(room).map((w) => [w.id, w]));
  const incident = new Set(walls.filter((wall) => {
    const next = nextWalls.get(wall.id)!;
    return next.start.x !== wall.start.x || next.start.y !== wall.start.y || next.end.x !== wall.end.x || next.end.y !== wall.end.y;
  }).map((wall) => wall.id));
  if (base.items.some((item) => !itemInsideRoom(item, room) && itemInsideRoom(item, before))) return { ok: false, reason: 'cabinet' };

  const openings: Opening[] = [];
  for (const opening of base.openings) {
    const at = openingOnWall(before, opening);
    if (!at || !keepsSpan(at.segment, nextWalls.get(at.segment.id), at.offset + opening.width)) return { ok: false, reason: 'opening' };
    const attached = opening.wallId ? opening : { ...opening, wallId: at.segment.id, offset: at.offset };
    if (incident.has(at.segment.id) && newlyBlocksOpening(base.items, before, room, attached)) return { ok: false, reason: 'opening' };
    openings.push(attached);
  }

  for (const feature of before.features ?? []) {
    if (!featureFitsRoom(room, feature) && featureFitsRoom(before, feature)) return { ok: false, reason: 'fixture' };
    if (feature.wallId && incident.has(feature.wallId)) {
      // An attached chimney/column cannot rotate or travel with the corner.
      const old = roomFeaturePolygon(before, feature), next = roomFeaturePolygon(room, feature);
      if (next.some((p, i) => Math.hypot(p.x - old[i].x, p.y - old[i].y) > 1e-7)) return { ok: false, reason: 'fixture' };
    }
  }
  const outline = roomOutline(before);
  const newlyOutside = (points: Point[]) => !polygonContains(vertices, points) && polygonContains(outline, points);
  for (const p of before.partitions ?? []) {
    // The body can already overhang an edge while its centreline is still valid.
    if (newlyOutside(partitionPolygon(p)) || newlyOutside([p.start, p.end])) return { ok: false, reason: 'fixture' };
  }
  for (const t of before.treatments ?? []) {
    if (!incident.has(t.wallId)) continue;
    const wall = walls.find((w) => w.id === t.wallId)!;
    if (!keepsSpan(wall, nextWalls.get(t.wallId), t.offset + t.width)) return { ok: false, reason: 'fixture' };
  }

  const shift = { x: -bounds.x || 0, y: -bounds.y || 0 };
  const translate = <T extends Point>(p: T): T => ({ ...p, x: p.x + shift.x, y: p.y + shift.y });
  let items = base.items;
  if (shift.x || shift.y) {
    room.vertices = vertices.map(translate);
    if (room.features) room.features = room.features.map(translate);
    if (room.partitions) room.partitions = room.partitions.map((p) => ({ ...p, start: translate(p.start), end: translate(p.end) }));
    items = items.map(translate);
  }
  return { ok: true, design: { ...base, room, items, openings }, shift };
}
