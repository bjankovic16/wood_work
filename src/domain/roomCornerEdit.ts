import { hasWorktop, WORKTOP_THICKNESS } from './catalog';
import { footprintPieces, itemInsideRoom } from './geometry';
import { openingObstacles } from './openings';
import { polygonBounds, polygonContains, polygonsOverlap, validRoomPolygon } from './polygons';
import { featureFitsRoom, ROOM_LIMITS, roomFeaturePolygon, roomOutline } from './roomGeometry';
import type { Design, KitchenItem, Opening, Point, Room } from './types';
import { openingOnWall, partitionPolygon, roomSegments, type WallSegment } from './walls';

export type RoomCornerEditResult =
  | { ok: true; design: Design; shift: Point }
  | { ok: false; reason: 'outline' | 'cabinet' | 'opening' | 'fixture' };

// Do not introduce an overhang, or worsen an existing one. Height and offset do not change.
function keepsSpan(before: WallSegment, after: WallSegment | undefined, end: number): boolean {
  return !!after && after.length >= Math.min(before.length, end);
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
  const before = base.room;
  const walls = roomSegments(before, false);
  const index = walls.findIndex((wall) => wall.id === cornerId);
  if (index < 0 || !Number.isFinite(delta.x) || !Number.isFinite(delta.y)) return { ok: false, reason: 'outline' };
  const start = walls[index].start;
  const x = start.x + delta.x, y = start.y + delta.y;
  if (x === start.x && y === start.y) return { ok: true, design: base, shift: { x: 0, y: 0 } };

  const vertices = walls.map((wall, i) => ({ ...(i === index ? { x, y } : wall.start), id: wall.id }));
  const bounds = polygonBounds(vertices);
  if (!validRoomPolygon(vertices) || bounds.w < ROOM_LIMITS.width.min || bounds.w > ROOM_LIMITS.width.max
    || bounds.h < ROOM_LIMITS.depth.min || bounds.h > ROOM_LIMITS.depth.max) return { ok: false, reason: 'outline' };

  // Validate in the *same* physical frame as the baseline. Only the two incident walls changed.
  const { cutout: _cutout, ...rest } = before;
  const room: Room = { ...rest, width: bounds.w, depth: bounds.h, vertices };
  const incident = new Set([cornerId, walls[(index + walls.length - 1) % walls.length].id]);
  const nextWalls = new Map(roomSegments(room).map((w) => [w.id, w]));
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
