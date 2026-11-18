import { clamp } from './math';
import { roomContainsRect, roomWallRuns, type RoomWallRun } from './roomGeometry';
import type { KitchenItem, Point, Rect, Room, Rotation, Wall } from './types';
import { angleBasis, normalizeAngle, polygonBounds, polygonContains, polygonsOverlap } from './polygons';
import { roomOutline } from './roomGeometry';
import { mountingSegments, wallCoordinates, type WallSegment } from './walls';

/**
 * Plan geometry.
 *
 * Every item is described in its own local frame: u runs along the front from
 * the item's left side (seen from the front), v runs from the back (v = 0) to
 * the front. Rotation maps that frame onto the plan clockwise, and (x, y)
 * is the top-left corner of the resulting axis-aligned footprint.
 */

/** The parts of an item that decide where it sits on the plan. */
export type Placed = Pick<KitchenItem, 'kind' | 'x' | 'y' | 'rotation' | 'width' | 'depth' | 'width2'>;

export const WALLS: readonly Wall[] = ['top', 'right', 'bottom', 'left'];

/** Items mounted at or above this height count as wall units. */
export const WALL_UNIT_MIN_ELEVATION = 1000;

export function isWallMounted(item: Pick<KitchenItem, 'elevation'>): boolean {
  return item.elevation >= WALL_UNIT_MIN_ELEVATION;
}

export function fridgeNextToOven(fridge: KitchenItem, oven: KitchenItem): boolean {
  if (!['fridge', 'integratedFridge'].includes(fridge.kind) || !['oven', 'ovenTower'].includes(oven.kind) || !verticalOverlap(fridge, oven)) return false;
  const r = itemRect(fridge);
  return footprintRects(oven).some((other) => rectsOverlap({ x: r.x - 1, y: r.y - 1, w: r.w + 2, h: r.h + 2 }, other, 0));
}

/** Extent of the footprint from back to front, before rotation. */
export function localDepthExtent(item: Placed): number {
  return item.kind === 'corner' ? (item.width2 ?? item.width) : item.depth;
}

export function aabbSize(item: Placed): { w: number; h: number } {
  const lw = item.width;
  const lh = localDepthExtent(item);
  const { c, s } = angleBasis(item.rotation);
  return { w: Math.abs(c) * lw + Math.abs(s) * lh, h: Math.abs(s) * lw + Math.abs(c) * lh };
}

export function itemRect(item: Placed): Rect {
  const { w, h } = aabbSize(item);
  return { x: item.x, y: item.y, w, h };
}

export function localToRoom(item: Placed, u: number, v: number): Point {
  const lw = item.width;
  const lh = localDepthExtent(item);
  const { c, s } = angleBasis(item.rotation);
  return { x: item.x + c * u - s * v - Math.min(0, c * lw) - Math.min(0, -s * lh),
    y: item.y + s * u + c * v - Math.min(0, s * lw) - Math.min(0, c * lh) };
}

export function roomToLocal(item: Placed, point: Point): Point {
  const origin = localToRoom(item, 0, 0);
  const { c, s } = angleBasis(item.rotation);
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  return { x: c * dx + s * dy, y: -s * dx + c * dy };
}

export function localRectToRoom(item: Placed, u1: number, v1: number, u2: number, v2: number): Rect {
  return polygonBounds([[u1, v1], [u2, v1], [u2, v2], [u1, v2]].map(([u, v]) => localToRoom(item, u, v)));
}

function localOutline(item: Placed): Array<[number, number]> {
  const w = item.width;
  const d = item.depth;
  if (item.kind === 'corner') {
    const w2 = localDepthExtent(item);
    return [[0, 0], [w, 0], [w, d], [d, d], [d, w2], [0, w2]];
  }
  return [[0, 0], [w, 0], [w, d], [0, d]];
}

/** Outline as a flat [x0, y0, x1, y1, …] list, ready for a closed canvas line. */
export function footprintPolygon(item: Placed): number[] {
  return localOutline(item).flatMap(([u, v]) => {
    const p = localToRoom(item, u, v);
    return [p.x, p.y];
  });
}

/** The footprint as a union of rectangles (exact for L-shaped corner units). */
export function footprintRects(item: Placed): Rect[] {
  if (item.kind === 'corner') {
    const d = item.depth;
    const w2 = localDepthExtent(item);
    return [localRectToRoom(item, 0, 0, item.width, d), localRectToRoom(item, 0, d, d, w2)];
  }

  return [itemRect(item)];
}

export function footprintPieces(item: Placed): Point[][] {
  const rectangles = item.kind === 'corner' ? [[0, 0, item.width, item.depth], [0, item.depth, item.depth, localDepthExtent(item)]]
    : [[0, 0, item.width, item.depth]];
  return rectangles.filter(([, v1, , v2]) => v2 > v1).map(([u1, v1, u2, v2]) =>
    [[u1, v1], [u2, v1], [u2, v2], [u1, v2]].map(([u, v]) => localToRoom(item, u, v)));
}

export function itemInsideRoom(item: Placed, room: Room): boolean {
  return footprintPieces(item).every((p) => polygonContains(roomOutline(room), p));
}

export function attachedSegment(item: Placed, room: Room): WallSegment | null {
  const a = localToRoom(item, 0, 0);
  const b = localToRoom(item, item.width, 0);
  return mountingSegments(room).find((s) => {
    const first = wallCoordinates(s, a);
    const last = wallCoordinates(s, b);
    return Math.abs(first.y) < 1.1 && Math.abs(last.y) < 1.1 && first.x >= -1 && last.x <= s.length + 1 && last.x > first.x;
  }) ?? null;
}

/** Span of the cabinet against this face, including the second arm of a corner. */
export function mountedSpan(item: Placed, segment: WallSegment): [number, number] | null {
  const origin = localToRoom(item, 0, 0);
  const ends = [localToRoom(item, item.width, 0)];
  if (item.kind === 'corner') ends.push(localToRoom(item, 0, localDepthExtent(item)));
  const p = wallCoordinates(segment, origin);
  if (Math.abs(p.y) >= 1.1) return null;
  for (const end of ends) {
    const q = wallCoordinates(segment, end);
    const from = Math.max(0, Math.min(p.x, q.x)), to = Math.min(segment.length, Math.max(p.x, q.x));
    if (Math.abs(q.y) < 1.1 && to > from) return [from, to];
  }
  return null;
}

/** The edges where doors and drawer fronts are. */
export function frontEdges(item: Placed): Array<[Point, Point]> {
  const d = item.depth;
  if (item.kind === 'corner') {
    const w2 = localDepthExtent(item);
    return [
      [localToRoom(item, item.width, d), localToRoom(item, d, d)],
      [localToRoom(item, d, d), localToRoom(item, d, w2)],
    ];
  }
  return [[localToRoom(item, 0, d), localToRoom(item, item.width, d)]];
}

const BACK_WALL: Record<Rotation, Wall> = { 0: 'top', 90: 'right', 180: 'bottom', 270: 'left' };
const WALL_ROTATION: Record<Wall, Rotation> = { top: 0, right: 90, bottom: 180, left: 270 };

export function backWall(rotation: Rotation): Wall {
  return BACK_WALL[(Math.round(normalizeAngle(rotation) / 90) * 90) % 360];
}

export function rotationForWall(wall: Wall): Rotation {
  return WALL_ROTATION[wall];
}

export function rotateRotation(rotation: Rotation, steps: number): Rotation {
  return ((((rotation + steps * 90) % 360) + 360) % 360) as Rotation;
}

/** Walls the item is designed to stand against: its back, plus the side arm of a corner unit. */
export function mountingWalls(item: Placed): Wall[] {
  if (normalizeAngle(item.rotation) % 90 !== 0) return [];
  const walls = [backWall(item.rotation)];
  if (item.kind === 'corner') walls.push(backWall(rotateRotation(item.rotation, -1)));
  return walls;
}

export function isFlushWith(rect: Rect, wall: Wall, room: Room, tolerance = 1): boolean {
  switch (wall) {
    case 'top':
      return Math.abs(rect.y) <= tolerance;
    case 'bottom':
      return Math.abs(rect.y + rect.h - room.depth) <= tolerance;
    case 'left':
      return Math.abs(rect.x) <= tolerance;
    case 'right':
      return Math.abs(rect.x + rect.w - room.width) <= tolerance;
  }
}

/** The wall the item's back currently stands against, if any. */
export function attachedWall(item: Placed, room: Room): Wall | null {
  if (normalizeAngle(item.rotation) % 90 !== 0) return null;
  const wall = backWall(item.rotation);
  return isFlushWith(itemRect(item), wall, room) ? wall : null;
}

export function attachedRoomSurface(item: Placed, room: Room): RoomWallRun | null {
  const wall = backWall(item.rotation);
  const rect = itemRect(item);
  const horizontal = wall === 'top' || wall === 'bottom';
  const along = horizontal ? rect.x : rect.y;
  const size = horizontal ? rect.w : rect.h;
  const face = wall === 'top' ? rect.y : wall === 'bottom' ? rect.y + rect.h : wall === 'left' ? rect.x : rect.x + rect.w;
  return roomWallRuns(room).find((surface) => surface.wall === wall && Math.abs(face - surface.offset) <= 1 && along >= surface.from - 1 && along + size <= surface.to + 1) ?? null;
}

export type Corner = 'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft';

export const CORNERS: readonly Corner[] = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'];

/** Rotation that puts an L-shaped corner unit into the given room corner. */
export const CORNER_ROTATION: Record<Corner, Rotation> = {
  topLeft: 0,
  topRight: 90,
  bottomRight: 180,
  bottomLeft: 270,
};

export function cornerPosition(room: Room, corner: Corner, size: { w: number; h: number }): Point {
  const right = corner === 'topRight' || corner === 'bottomRight';
  const bottom = corner === 'bottomLeft' || corner === 'bottomRight';
  return { x: right ? room.width - size.w : 0, y: bottom ? room.depth - size.h : 0 };
}

export function clampToRoom<T extends Placed>(item: T, room: Room): T {
  const { w, h } = aabbSize(item);
  const x = clamp(item.x, 0, Math.max(0, room.width - w));
  const y = clamp(item.y, 0, Math.max(0, room.depth - h));
  return x === item.x && y === item.y ? item : { ...item, x, y };
}

/** Rotates in 90° steps (positive = clockwise) around the footprint centre. */
export function rotateItem<T extends Placed>(item: T, steps: number, room: Room): T {
  const before = aabbSize(item);
  const cx = item.x + before.w / 2;
  const cy = item.y + before.h / 2;
  const rotated = { ...item, rotation: rotateRotation(item.rotation, steps) };
  const after = aabbSize(rotated);
  return clampToRoom(
    { ...rotated, x: Math.round(cx - after.w / 2), y: Math.round(cy - after.h / 2) },
    room,
  );
}

/**
 * Applies new sizes while keeping the back-left corner where it is, so a unit
 * stays against its wall and a corner unit stays in its corner.
 */
export function resizeFromAnchor<T extends Placed>(
  item: T,
  patch: Partial<Pick<KitchenItem, 'width' | 'depth' | 'width2'>>,
): T {
  const anchor = localToRoom(item, 0, 0);
  const next = { ...item, ...patch };
  const offset = localToRoom({ ...next, x: 0, y: 0 }, 0, 0);
  return { ...next, x: anchor.x - offset.x, y: anchor.y - offset.y };
}

/** True when two rectangles share area (touching edges do not count). */
export function rectsOverlap(a: Rect, b: Rect, epsilon = 0.5): boolean {
  return (
    a.x < b.x + b.w - epsilon &&
    b.x < a.x + a.w - epsilon &&
    a.y < b.y + b.h - epsilon &&
    b.y < a.y + a.h - epsilon
  );
}

export function verticalOverlap(
  a: Pick<KitchenItem, 'elevation' | 'height'>,
  b: Pick<KitchenItem, 'elevation' | 'height'>,
): boolean {
  return a.elevation < b.elevation + b.height && b.elevation < a.elevation + a.height;
}

export function footprintsOverlap(a: Placed, b: Placed): boolean {
  return footprintPieces(a).some((pa) => footprintPieces(b).some((pb) => polygonsOverlap(pa, pb)));
}

export function insideRoom(rect: Rect, room: Room): boolean {
  return roomContainsRect(rect, room);
}
