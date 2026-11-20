import { clamp } from './math';
import type { Point, Rect, Room, RoomCorner, RoomFeature, Wall } from './types';
import { pointInPolygon, polygonBounds, polygonContains, rectPolygon, validRoomPolygon } from './polygons';
import { roomSegments, wallPoint } from './walls';

export const ROOM_CORNERS: readonly RoomCorner[] = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'];
export const MAX_ROOM_FEATURES = 40;
export const ROOM_LIMITS = {
  width: { min: 1000, max: 20000 },
  depth: { min: 1000, max: 20000 },
  height: { min: 2000, max: 4000 },
} as const;

export interface RoomWallRun {
  wall: Wall;
  from: number;
  to: number;
  /** Coordinate of the wall face, on y for horizontal walls or x for vertical walls. */
  offset: number;
}

export function roomOutline(room: Room): Point[] {
  if (room.vertices) return room.vertices;
  const W = room.width;
  const D = room.depth;
  const cut = room.cutout;
  if (!cut) return [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: D }, { x: 0, y: D }];
  const points = [
    { x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: D - cut.depth },
    ...(cut.kind === 'notch' ? [{ x: W - cut.width, y: D - cut.depth }] : []),
    { x: W - cut.width, y: D }, { x: 0, y: D },
  ];
  const mirrorX = cut.corner === 'topLeft' || cut.corner === 'bottomLeft';
  const mirrorY = cut.corner === 'topLeft' || cut.corner === 'topRight';
  const mirrored = points.map((point) => ({ x: mirrorX ? W - point.x : point.x, y: mirrorY ? D - point.y : point.y }));
  return mirrorX !== mirrorY ? mirrored.reverse() : mirrored;
}

export function roomContainsPoint(point: Point, room: Room): boolean {
  if (room.vertices) return pointInPolygon(point, room.vertices);
  if (point.x < -0.01 || point.y < -0.01 || point.x > room.width + 0.01 || point.y > room.depth + 0.01) return false;
  const cut = room.cutout;
  if (!cut) return true;
  const x = cut.corner === 'topLeft' || cut.corner === 'bottomLeft' ? point.x : room.width - point.x;
  const y = cut.corner === 'topLeft' || cut.corner === 'topRight' ? point.y : room.depth - point.y;
  return cut.kind === 'notch' ? x >= cut.width - 0.01 || y >= cut.depth - 0.01 : x / cut.width + y / cut.depth >= 1 - 0.00001;
}

/** Exact for the supported rectangular, corner-notched and diagonal-corner footprints. */
export function roomContainsRect(rect: Rect, room: Room): boolean {
  if (room.vertices) return polygonContains(room.vertices, rectPolygon(rect));
  return [
    { x: rect.x, y: rect.y }, { x: rect.x + rect.w, y: rect.y },
    { x: rect.x + rect.w, y: rect.y + rect.h }, { x: rect.x, y: rect.y + rect.h },
  ].every((point) => roomContainsPoint(point, room));
}

export function roomFeatureRect(feature: RoomFeature): Rect {
  return { x: feature.x, y: feature.y, w: feature.width, h: feature.depth };
}

export function roomFeaturePolygon(room: Room, feature: RoomFeature): Point[] {
  if (!feature.wallId) return rectPolygon(roomFeatureRect(feature));
  const wall = roomSegments(room).find((s) => s.id === feature.wallId);
  if (!wall || feature.offset === undefined) return [];
  const a = feature.offset, b = a + feature.width;
  return [wallPoint(wall, a), wallPoint(wall, b), wallPoint(wall, b, feature.depth), wallPoint(wall, a, feature.depth)];
}

export function roomFeaturePose(room: Room, feature: RoomFeature): { centre: Point; angle: number } {
  const [a, b, c] = roomFeaturePolygon(room, feature);
  if (!a) return { centre: { x: feature.x + feature.width / 2, y: feature.y + feature.depth / 2 }, angle: 0 };
  return { centre: { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 }, angle: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI };
}

export function featureFitsRoom(room: Room, feature: RoomFeature): boolean {
  const polygon = roomFeaturePolygon(room, feature);
  if (!polygon.length || !polygonContains(roomOutline(room), polygon)) return false;
  if (!feature.wallId) return true;
  const wall = roomSegments(room).find((s) => s.id === feature.wallId);
  return !!wall && feature.offset !== undefined && feature.offset >= 0 && feature.offset + feature.width <= wall.length + 0.01;
}

/** Cardinal faces retained for simple-room placement and legacy dimensions. */
export function roomWallRuns(room: Room, includeFeatures = true): RoomWallRun[] {
  const points = roomOutline(room);
  const runs: RoomWallRun[] = [];
  points.forEach((a, index) => {
    const b = points[(index + 1) % points.length];
    if (a.y === b.y) runs.push({ wall: b.x > a.x ? 'top' : 'bottom', from: Math.min(a.x, b.x), to: Math.max(a.x, b.x), offset: a.y });
    else if (a.x === b.x) runs.push({ wall: b.y > a.y ? 'right' : 'left', from: Math.min(a.y, b.y), to: Math.max(a.y, b.y), offset: a.x });
  });
  if (includeFeatures) {
    for (const feature of room.features ?? []) {
      const polygon = roomFeaturePolygon(room, feature);
      polygon.forEach((a, i) => {
        const b = polygon[(i + 1) % polygon.length];
        if (Math.abs(a.y - b.y) < 0.01) runs.push({ wall: b.x > a.x ? 'bottom' : 'top', from: Math.min(a.x, b.x), to: Math.max(a.x, b.x), offset: a.y });
        if (Math.abs(a.x - b.x) < 0.01) runs.push({ wall: b.y > a.y ? 'left' : 'right', from: Math.min(a.y, b.y), to: Math.max(a.y, b.y), offset: a.x });
      });
    }
  }
  return runs;
}

export function outerWallRuns(room: Room, wall: Wall): RoomWallRun[] {
  const offset = wall === 'top' || wall === 'left' ? 0 : wall === 'right' ? room.width : room.depth;
  return roomWallRuns(room, false).filter((run) => run.wall === wall && run.offset === offset);
}

export function openingFitsRoomWall(room: Room, wall: Wall, offset: number, width: number): boolean {
  return outerWallRuns(room, wall).some((run) => offset >= run.from && offset + width <= run.to);
}

/** Constrain room edits without mutating objects held in undo history. */
export function normalizeRoom(room: Room): Room {
  if (room.vertices) {
    const width = Math.max(ROOM_LIMITS.width.min, ...room.vertices.map((p) => Math.ceil(p.x)));
    const depth = Math.max(ROOM_LIMITS.depth.min, ...room.vertices.map((p) => Math.ceil(p.y)));
    if (room.width !== width || room.depth !== depth) room = { ...room, width, depth };
  }
  let cutout = room.cutout;
  if (cutout) {
    const width = Math.round(clamp(cutout.width, 100, Math.max(100, room.width - 600)));
    const depth = Math.round(clamp(cutout.depth, 100, Math.max(100, room.depth - 600)));
    if (width !== cutout.width || depth !== cutout.depth) cutout = { ...cutout, width, depth };
  }
  let features = room.features;
  if (features) {
    const outlineRoom = cutout !== room.cutout ? { ...room, cutout } : room;
    const previous = features;
    const next = previous.map((feature) => {
      if (feature.wallId) {
        if (!featureFitsRoom(outlineRoom, feature)) throw new RangeError('Attached structure does not fit its wall.');
        const { x, y } = polygonBounds(roomFeaturePolygon(outlineRoom, feature));
        return x === feature.x && y === feature.y ? feature : { ...feature, x, y };
      }
      if (room.vertices) return feature;
      const width = Math.round(clamp(feature.width, 100, room.width));
      const depth = Math.round(clamp(feature.depth, 100, room.depth));
      const x = Math.round(clamp(feature.x, 0, room.width - width));
      const y = Math.round(clamp(feature.y, 0, room.depth - depth));
      return width === feature.width && depth === feature.depth && x === feature.x && y === feature.y ? feature : { ...feature, width, depth, x, y };
    });
    if (next.some((feature, index) => feature !== previous[index])) features = next;
  }
  const { cutout: _cutout, features: _features, vertices, partitions, treatments, ...size } = room;
  return { ...size, ...(cutout ? { cutout } : {}), ...(features ? { features } : {}),
    ...(vertices ? { vertices } : {}), ...(partitions ? { partitions } : {}), ...(treatments ? { treatments } : {}) };
}

export function parseRoom(raw: unknown): Room | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const positive = (number: unknown): number is number => typeof number === 'number' && Number.isFinite(number) && number > 0;
  if (!positive(value.width) || !positive(value.depth) || !positive(value.height)) return null;
  const room: Room = { width: value.width, depth: value.depth, height: value.height };
  for (const key of ['width', 'depth', 'height'] as const) {
    if (room[key] < ROOM_LIMITS[key].min || room[key] > ROOM_LIMITS[key].max) return null;
  }
  if (value.cutout !== undefined) {
    if (!value.cutout || typeof value.cutout !== 'object') return null;
    const cut = value.cutout as Record<string, unknown>;
    if ((cut.kind !== 'notch' && cut.kind !== 'diagonal') || !ROOM_CORNERS.includes(cut.corner as RoomCorner) ||
      !positive(cut.width) || !positive(cut.depth) || cut.width >= room.width || cut.depth >= room.depth) return null;
    room.cutout = { kind: cut.kind, corner: cut.corner as RoomCorner, width: cut.width, depth: cut.depth };
  }
  if (value.features !== undefined) {
    if (!Array.isArray(value.features) || value.features.length > MAX_ROOM_FEATURES) return null;
    const features: RoomFeature[] = [];
    for (const rawFeature of value.features) {
      if (!rawFeature || typeof rawFeature !== 'object') return null;
      const feature = rawFeature as Record<string, unknown>;
      if (typeof feature.id !== 'string' || !feature.id || features.some((entry) => entry.id === feature.id) ||
        typeof feature.kind !== 'string' || !['chimney', 'column', 'projection'].includes(feature.kind) ||
        typeof feature.x !== 'number' || !Number.isFinite(feature.x) || typeof feature.y !== 'number' || !Number.isFinite(feature.y) ||
        !positive(feature.width) || !positive(feature.depth)) return null;
      if (feature.wallId !== undefined && (typeof feature.wallId !== 'string' || !feature.wallId || typeof feature.offset !== 'number' || !Number.isFinite(feature.offset))) return null;
      features.push({ id: feature.id, kind: feature.kind as RoomFeature['kind'], x: feature.x, y: feature.y, width: feature.width, depth: feature.depth,
        ...(typeof feature.wallId === 'string' ? { wallId: feature.wallId, offset: feature.offset as number } : {}) });
    }
    room.features = features;
  }
  if (value.vertices !== undefined) {
    if (!Array.isArray(value.vertices) || !value.vertices.every((p) => p && typeof p.id === 'string' && p.id
      && typeof p.x === 'number' && typeof p.y === 'number')) return null;
    const vertices = value.vertices.map((p) => ({ id: String(p.id), x: Number(p.x), y: Number(p.y) }));
    if (new Set(vertices.map((p) => p.id)).size !== vertices.length || !validRoomPolygon(vertices)
      || vertices.some((p) => p.x < 0 || p.y < 0 || p.x > room.width || p.y > room.depth)) return null;
    room.vertices = vertices;
  }
  if (value.partitions !== undefined) {
    if (!Array.isArray(value.partitions)) return null;
    const partitions: NonNullable<Room['partitions']> = [];
    for (const p of value.partitions) {
      if (!p || typeof p.id !== 'string' || !p.id || partitions.some((v) => v.id === p.id)
        || !p.start || !p.end || ![p.start.x, p.start.y, p.end.x, p.end.y, p.thickness, p.height].every((n) => typeof n === 'number' && Number.isFinite(n))
        || Math.hypot(p.end.x - p.start.x, p.end.y - p.start.y) < 100 || p.thickness < 50 || p.thickness > 600
        || p.height < 100 || p.height > room.height || !polygonContains(roomOutline(room), [p.start, p.end])) return null;
      partitions.push({ id: p.id, start: { ...p.start }, end: { ...p.end }, thickness: p.thickness, height: p.height });
    }
    room.partitions = partitions;
  }
  if (value.treatments !== undefined) {
    if (!Array.isArray(value.treatments)) return null;
    const finishes = ['white', 'cream', 'grey', 'sage', 'navy', 'anthracite', 'oak', 'walnut', 'cashmere', 'sand', 'taupe', 'olive', 'clay', 'espresso', 'ash', 'stone', 'marble', 'travertine', 'black'];
    const treatments: NonNullable<Room['treatments']> = [];
    for (const t of value.treatments) {
      if (!t || typeof t.id !== 'string' || !t.id || treatments.some((v) => v.id === t.id) || typeof t.wallId !== 'string'
        || ![t.offset, t.width, t.elevation, t.height].every((n) => typeof n === 'number' && Number.isFinite(n))
        || t.offset < 0 || t.width <= 0 || t.elevation < 0 || t.height <= 0 || !finishes.includes(t.finish)) return null;
      treatments.push({ id: t.id, wallId: t.wallId, offset: t.offset, width: t.width, elevation: t.elevation, height: t.height, finish: t.finish });
    }
    room.treatments = treatments;
  }
  if (room.features?.some((f) => f.wallId && !featureFitsRoom(room, f))) return null;
  if (room.vertices) {
    room.width = Math.max(ROOM_LIMITS.width.min, ...room.vertices.map((p) => Math.ceil(p.x)));
    room.depth = Math.max(ROOM_LIMITS.depth.min, ...room.vertices.map((p) => Math.ceil(p.y)));
  }
  return room;
}
