import { clamp } from './math';
import type { Point, Rect, Room, RoomCorner, RoomFeature, Wall } from './types';

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
  if (point.x < -0.01 || point.y < -0.01 || point.x > room.width + 0.01 || point.y > room.depth + 0.01) return false;
  const cut = room.cutout;
  if (!cut) return true;
  const x = cut.corner === 'topLeft' || cut.corner === 'bottomLeft' ? point.x : room.width - point.x;
  const y = cut.corner === 'topLeft' || cut.corner === 'topRight' ? point.y : room.depth - point.y;
  return cut.kind === 'notch' ? x >= cut.width - 0.01 || y >= cut.depth - 0.01 : x / cut.width + y / cut.depth >= 1 - 0.00001;
}

/** Exact for the supported rectangular, corner-notched and diagonal-corner footprints. */
export function roomContainsRect(rect: Rect, room: Room): boolean {
  return [
    { x: rect.x, y: rect.y }, { x: rect.x + rect.w, y: rect.y },
    { x: rect.x + rect.w, y: rect.y + rect.h }, { x: rect.x, y: rect.y + rect.h },
  ].every((point) => roomContainsPoint(point, room));
}

export function roomFeatureRect(feature: RoomFeature): Rect {
  return { x: feature.x, y: feature.y, w: feature.width, h: feature.depth };
}

/** Right-angle wall faces available to the existing right-angle cabinetry system. */
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
      runs.push(
        { wall: 'bottom', from: feature.x, to: feature.x + feature.width, offset: feature.y },
        { wall: 'top', from: feature.x, to: feature.x + feature.width, offset: feature.y + feature.depth },
        { wall: 'right', from: feature.y, to: feature.y + feature.depth, offset: feature.x },
        { wall: 'left', from: feature.y, to: feature.y + feature.depth, offset: feature.x + feature.width },
      );
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
  let cutout = room.cutout;
  if (cutout) {
    const width = Math.round(clamp(cutout.width, 100, Math.max(100, room.width - 600)));
    const depth = Math.round(clamp(cutout.depth, 100, Math.max(100, room.depth - 600)));
    if (width !== cutout.width || depth !== cutout.depth) cutout = { ...cutout, width, depth };
  }
  let features = room.features;
  if (features) {
    const previous = features;
    const next = previous.map((feature) => {
      const width = Math.round(clamp(feature.width, 100, room.width));
      const depth = Math.round(clamp(feature.depth, 100, room.depth));
      const x = Math.round(clamp(feature.x, 0, room.width - width));
      const y = Math.round(clamp(feature.y, 0, room.depth - depth));
      return width === feature.width && depth === feature.depth && x === feature.x && y === feature.y ? feature : { ...feature, width, depth, x, y };
    });
    if (next.some((feature, index) => feature !== previous[index])) features = next;
  }
  const { cutout: _cutout, features: _features, ...size } = room;
  return { ...size, ...(cutout ? { cutout } : {}), ...(features ? { features } : {}) };
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
      features.push({ id: feature.id, kind: feature.kind as RoomFeature['kind'], x: feature.x, y: feature.y, width: feature.width, depth: feature.depth });
    }
    room.features = features;
  }
  return room;
}
