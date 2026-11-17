import {
  CORNER_ROTATION,
  CORNERS,
  aabbSize,
  clampToRoom,
  cornerPosition,
  rotationForWall,
  verticalOverlap,
  footprintPieces,
  itemInsideRoom,
  localToRoom,
  backWall,
} from './geometry';
import { openingObstacles } from './openings';
import { roomFeatureRect, roomWallRuns } from './roomGeometry';
import type { KitchenItem, Opening, Point, Room, Wall } from './types';
import { angleBasis, polygonsOverlap, rectPolygon } from './polygons';
import { partitionPolygon, mountingSegments, wallPoint } from './walls';

export type Placement = Pick<KitchenItem, 'x' | 'y' | 'rotation'>;

/** Floor areas a unit must not overlap: other units at the same height, and room a door or window needs. */
type Obstacle = Point[][];

function fitsAt(candidate: KitchenItem, room: Room, obstacles: readonly Obstacle[]): boolean {
  const pieces = footprintPieces(candidate);
  return itemInsideRoom(candidate, room) && !obstacles.some((o) => o.some((p) => pieces.some((c) => polygonsOverlap(c, p))));
}

function obstaclesFor(item: KitchenItem, items: readonly KitchenItem[], room: Room, openings: readonly Opening[]): Obstacle[] {
  const bottom = item.elevation;
  const top = item.elevation + item.height;
  return [
    ...(room.features ?? []).map((feature) => [rectPolygon(roomFeatureRect(feature))]),
    ...(room.partitions ?? []).filter((p) => item.elevation < p.height && item.elevation + item.height > 0).map((p) => [partitionPolygon(p)]),
    ...items.filter((o) => o.id !== item.id && verticalOverlap(o, item)).map((o) => footprintPieces(o)),
    ...openingObstacles(room, openings)
      .filter((o) => o.bottom < top && bottom < o.top)
      .map((o) => [o.polygon]),
  ];
}

export function canPlaceItem(room: Room, items: readonly KitchenItem[], item: KitchenItem, openings: readonly Opening[] = []): boolean {
  return fitsAt(item, room, obstaclesFor(item, items, room, openings));
}

/**
 * First free spot for a new item: corner units go into the first free room
 * corner; everything else goes into the first gap along the walls, clockwise
 * from the top wall. Wall units only collide with units at their own height,
 * so they line up above the base units. Returns null when nothing fits.
 * A wall preference changes search order only, not the placement constraints.
 */
export function findFreeSpot(
  room: Room,
  items: readonly KitchenItem[],
  item: KitchenItem,
  openings: readonly Opening[] = [],
  preferCentre = false,
  wallOrder?: readonly Wall[],
): Placement | null {
  const obstacles = obstaclesFor(item, items, room, openings);

  if (preferCentre) {
    const centre = centreOfRoom(room, item);
    if (fitsAt({ ...item, ...centre }, room, obstacles)) return centre;
  }

  if (item.kind === 'corner') {
    const corners = wallOrder ? [...CORNERS].sort((a, b) => wallOrder.indexOf(backWall(CORNER_ROTATION[a])) - wallOrder.indexOf(backWall(CORNER_ROTATION[b]))) : CORNERS;
    for (const corner of corners) {
      const rotation = CORNER_ROTATION[corner];
      const candidate = { ...item, rotation, ...cornerPosition(room, corner, aabbSize({ ...item, rotation })) };
      if (fitsAt(candidate, room, obstacles)) return { x: candidate.x, y: candidate.y, rotation };
    }

    if (room.vertices || room.partitions?.length || room.cutout?.kind === 'diagonal') {
      for (const surface of mountingSegments(room).filter((s) => !s.partitionId || item.elevation < s.height)) {
        for (let along = 0; along <= surface.length - item.width; along += 50) {
          const anchor = wallPoint(surface, along);
          const origin = localToRoom({ ...item, rotation: surface.angle, x: 0, y: 0 }, 0, 0);
          const candidate = { ...item, rotation: surface.angle, x: anchor.x - origin.x, y: anchor.y - origin.y };
          if (fitsAt(candidate, room, obstacles)) return { x: candidate.x, y: candidate.y, rotation: candidate.rotation };
        }
      }
      return null;
    }
    return null;
  }

  const surfaces = roomWallRuns(room);
  if (wallOrder) surfaces.sort((a, b) => wallOrder.indexOf(a.wall) - wallOrder.indexOf(b.wall));
  for (const surface of surfaces) {
    const wall = surface.wall;
    const rotation = rotationForWall(wall);
    const { w, h } = aabbSize({ ...item, rotation });
    const alongX = wall === 'top' || wall === 'bottom';
    const size = alongX ? w : h;
    const fixed = wall === 'top' || wall === 'left' ? surface.offset : wall === 'bottom' ? surface.offset - h : surface.offset - w;

    const candidates = new Set<number>([surface.from]);
    for (const obstacle of obstacles) {
      for (const polygon of obstacle) {
        const xs = polygon.map((p) => p.x);
        const ys = polygon.map((p) => p.y);
        const r = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
        const start = alongX ? r.x : r.y;
        const end = start + (alongX ? r.w : r.h);
        candidates.add(end);
        candidates.add(start - size);
      }
    }
    const ordered = [...candidates].filter((c) => c >= surface.from && c <= surface.to - size).sort((a, b) => a - b);
    for (const c of ordered) {
      const candidate = { ...item, rotation, x: alongX ? c : fixed, y: alongX ? fixed : c };
      if (fitsAt(candidate, room, obstacles)) return { x: candidate.x, y: candidate.y, rotation };
    }
  }
  return null;
}

/** Where a copy of `source` goes: right next to it along the same wall if there is room. */
export function placeCopy(
  room: Room,
  items: readonly KitchenItem[],
  source: KitchenItem,
  copy: KitchenItem,
  openings: readonly Opening[] = [],
): Placement {
  const obstacles = obstaclesFor(copy, items, room, openings);
  if (source.kind !== 'corner') {
    const { c: dx, s: dy } = angleBasis(source.rotation);
    for (const direction of [1, -1]) {
      const candidate = {
        ...copy,
        x: source.x + dx * source.width * direction,
        y: source.y + dy * source.width * direction,
      };
      if (fitsAt(candidate, room, obstacles)) {
        return { x: candidate.x, y: candidate.y, rotation: candidate.rotation };
      }
    }
  }
  const spot = findFreeSpot(room, items, copy, openings);
  if (spot) return spot;
  const shifted = clampToRoom({ ...copy, x: source.x + 100, y: source.y + 100 }, room);
  return { x: shifted.x, y: shifted.y, rotation: shifted.rotation };
}

/** Fallback for when nothing fits: the middle of the room. */
export function centreOfRoom(room: Room, item: KitchenItem): Placement {
  const { w, h } = aabbSize(item);
  const placed = clampToRoom(
    { ...item, x: Math.round((room.width - w) / 2), y: Math.round((room.depth - h) / 2) },
    room,
  );
  return { x: placed.x, y: placed.y, rotation: placed.rotation };
}
