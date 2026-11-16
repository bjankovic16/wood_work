import { roomOutline } from './roomGeometry';
import { normalizeAngle, polygonBounds } from './polygons';
import type { Opening, Partition, Point, Room, Wall } from './types';

export interface WallSegment {
  id: string;
  start: Point;
  end: Point;
  tangent: Point;
  inward: Point;
  length: number;
  angle: number;
  height: number;
  partitionId?: string;
}

export function segmentFrame(id: string, start: Point, end: Point, height: number, partitionId?: string): WallSegment {
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  const tangent = { x: (end.x - start.x) / length, y: (end.y - start.y) / length };
  return { id, start, end, tangent, inward: { x: -tangent.y, y: tangent.x }, length, height,
    angle: normalizeAngle(Math.atan2(tangent.y, tangent.x) * 180 / Math.PI), ...(partitionId ? { partitionId } : {}) };
}

export function wallPoint(segment: WallSegment, along: number, depth = 0): Point {
  return { x: segment.start.x + segment.tangent.x * along + segment.inward.x * depth,
    y: segment.start.y + segment.tangent.y * along + segment.inward.y * depth };
}

export function wallCoordinates(segment: WallSegment, point: Point): Point {
  const dx = point.x - segment.start.x;
  const dy = point.y - segment.start.y;
  return { x: dx * segment.tangent.x + dy * segment.tangent.y, y: dx * segment.inward.x + dy * segment.inward.y };
}

export function partitionPolygon(partition: Partition): Point[] {
  const frame = segmentFrame(partition.id, partition.start, partition.end, partition.height);
  return [wallPoint(frame, 0, -partition.thickness / 2), wallPoint(frame, frame.length, -partition.thickness / 2),
    wallPoint(frame, frame.length, partition.thickness / 2), wallPoint(frame, 0, partition.thickness / 2)];
}

export function roomSegments(room: Room, includePartitions = true): WallSegment[] {
  const outline = roomOutline(room);
  const segments = outline.map((start, i) => {
    const end = outline[(i + 1) % outline.length];
    let id = room.vertices?.[i].id;
    if (!id) {
      const cardinal = start.y === 0 && end.y === 0 ? 'top' : start.x === room.width && end.x === room.width ? 'right'
        : start.y === room.depth && end.y === room.depth ? 'bottom' : start.x === 0 && end.x === 0 ? 'left' : `edge-${i}`;
      id = cardinal;
    }
    return segmentFrame(id, start, end, room.height);
  });
  if (includePartitions) for (const partition of room.partitions ?? []) {
    const centre = segmentFrame(partition.id, partition.start, partition.end, partition.height);
    for (const side of [1, -1]) {
      const start = wallPoint(centre, side === 1 ? 0 : centre.length, side * partition.thickness / 2);
      const end = wallPoint(centre, side === 1 ? centre.length : 0, side * partition.thickness / 2);
      segments.push(segmentFrame(`${partition.id}:${side}`, start, end, partition.height, partition.id));
    }
  }
  return segments;
}

export function mountingSegments(room: Room): WallSegment[] {
  const surfaces = roomSegments(room);
  for (const f of room.features ?? []) {
    const a = { x: f.x, y: f.y };
    const b = { x: f.x + f.width, y: f.y };
    const c = { x: f.x + f.width, y: f.y + f.depth };
    const d = { x: f.x, y: f.y + f.depth };
    for (const [index, [start, end]] of [[b, a], [c, b], [d, c], [a, d]].entries())
      surfaces.push(segmentFrame(`feature:${f.id}:${index}`, start, end, room.height));
  }
  return surfaces;
}

/** Legacy bottom/left openings measured from left/top, unlike clockwise polygon edges. */
export function openingFrame(room: Room, opening: Pick<Opening, 'wall' | 'wallId'>): WallSegment | null {
  if (opening.wallId) return roomSegments(room).find((s) => s.id === opening.wallId) ?? null;
  const wall: Wall = opening.wall;
  const points: Record<Wall, [Point, Point]> = {
    top: [{ x: 0, y: 0 }, { x: room.width, y: 0 }],
    right: [{ x: room.width, y: 0 }, { x: room.width, y: room.depth }],
    bottom: [{ x: 0, y: room.depth }, { x: room.width, y: room.depth }],
    left: [{ x: 0, y: 0 }, { x: 0, y: room.depth }],
  };
  const [start, end] = points[wall];
  const frame = segmentFrame(wall, start, end, room.height);
  if (wall === 'bottom' || wall === 'left') frame.inward = { x: -frame.inward.x, y: -frame.inward.y };
  return frame;
}

export function openingPolygon(room: Room, opening: Opening, depth: number): Point[] {
  const frame = openingFrame(room, opening);
  if (!frame) return [];
  return [wallPoint(frame, opening.offset), wallPoint(frame, opening.offset + opening.width),
    wallPoint(frame, opening.offset + opening.width, depth), wallPoint(frame, opening.offset, depth)];
}

export function openingBounds(room: Room, opening: Opening, depth: number) {
  return polygonBounds(openingPolygon(room, opening, depth));
}

export function openingIsValid(room: Room, opening: Opening): boolean {
  const frame = openingFrame(room, opening);
  if (!frame) return false;
  return opening.offset >= 0 && opening.offset + opening.width <= frame.length + 0.01
    && opening.sill >= 0 && opening.sill + opening.height <= frame.height;
}

export interface WallPiece { from: number; to: number; bottom: number; top: number }

export function openingsOnSegment(room: Room, segment: WallSegment, openings: readonly Opening[]): WallPiece[] {
  return openings.flatMap((opening) => {
    const frame = openingFrame(room, opening);
    if (!frame) return [];
    if (opening.wallId && opening.wallId !== segment.id
      && !(segment.partitionId && opening.wallId.startsWith(`${segment.partitionId}:`))) return [];
    const a = wallCoordinates(segment, wallPoint(frame, opening.offset));
    const b = wallCoordinates(segment, wallPoint(frame, opening.offset + opening.width));
    const tolerance = segment.partitionId ? (room.partitions?.find((p) => p.id === segment.partitionId)?.thickness ?? 0) + 1 : 1;
    if (Math.abs(a.y) > tolerance || Math.abs(b.y) > tolerance) return [];
    return [{ from: Math.max(0, Math.min(a.x, b.x)), to: Math.min(segment.length, Math.max(a.x, b.x)), bottom: opening.sill, top: opening.sill + opening.height }];
  }).filter((p) => p.to > p.from);
}

/** Split wall rectangles around every opening, also usable for clipping cladding. */
export function solidWallPieces(segment: WallSegment, holes: readonly WallPiece[], area: WallPiece = { from: 0, to: segment.length, bottom: 0, top: segment.height }): WallPiece[] {
  const xs = [...new Set([area.from, area.to, ...holes.flatMap((h) => [Math.max(area.from, Math.min(area.to, h.from)), Math.max(area.from, Math.min(area.to, h.to))])])].sort((a, b) => a - b);
  const ys = [...new Set([area.bottom, area.top, ...holes.flatMap((h) => [Math.max(area.bottom, Math.min(area.top, h.bottom)), Math.max(area.bottom, Math.min(area.top, h.top))])])].sort((a, b) => a - b);
  const result: WallPiece[] = [];
  for (let i = 1; i < xs.length; i++) for (let j = 1; j < ys.length; j++) {
    const x = (xs[i - 1] + xs[i]) / 2;
    const y = (ys[j - 1] + ys[j]) / 2;
    if (!holes.some((h) => x > h.from && x < h.to && y > h.bottom && y < h.top))
      result.push({ from: xs[i - 1], to: xs[i], bottom: ys[j - 1], top: ys[j] });
  }
  return result.filter((p) => p.to > p.from && p.top > p.bottom);
}
