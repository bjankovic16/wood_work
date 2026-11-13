import {
  CORNER_ROTATION,
  CORNERS,
  aabbSize,
  clampToRoom,
  cornerPosition,
  footprintRects,
  insideRoom,
  itemRect,
  rectsOverlap,
  rotationForWall,
  verticalOverlap,
  WALLS,
} from './geometry';
import { openingObstacles } from './openings';
import type { KitchenItem, Opening, Rect, Room, Rotation } from './types';

export type Placement = Pick<KitchenItem, 'x' | 'y' | 'rotation'>;

/** Floor areas a unit must not overlap: other units at the same height, and room a door or window needs. */
type Obstacle = Rect[];

function fitsAt(candidate: KitchenItem, room: Room, obstacles: readonly Obstacle[]): boolean {
  const rects = footprintRects(candidate);
  return insideRoom(itemRect(candidate), room) && !obstacles.some((o) => o.some((r) => rects.some((c) => rectsOverlap(c, r))));
}

function obstaclesFor(item: KitchenItem, items: readonly KitchenItem[], room: Room, openings: readonly Opening[]): Obstacle[] {
  const bottom = item.elevation;
  const top = item.elevation + item.height;
  return [
    ...items.filter((o) => o.id !== item.id && verticalOverlap(o, item)).map((o) => footprintRects(o)),
    ...openingObstacles(room, openings)
      .filter((o) => o.bottom < top && bottom < o.top)
      .map((o) => [o.rect]),
  ];
}

/**
 * First free spot for a new item: corner units go into the first free room
 * corner; everything else goes into the first gap along the walls, clockwise
 * from the top wall. Wall units only collide with units at their own height,
 * so they line up above the base units. Returns null when nothing fits.
 */
export function findFreeSpot(
  room: Room,
  items: readonly KitchenItem[],
  item: KitchenItem,
  openings: readonly Opening[] = [],
): Placement | null {
  const obstacles = obstaclesFor(item, items, room, openings);

  if (item.kind === 'corner') {
    for (const corner of CORNERS) {
      const rotation = CORNER_ROTATION[corner];
      const candidate = { ...item, rotation, ...cornerPosition(room, corner, aabbSize({ ...item, rotation })) };
      if (fitsAt(candidate, room, obstacles)) return { x: candidate.x, y: candidate.y, rotation };
    }
    return null;
  }

  for (const wall of WALLS) {
    const rotation = rotationForWall(wall);
    const { w, h } = aabbSize({ ...item, rotation });
    const alongX = wall === 'top' || wall === 'bottom';
    const length = alongX ? room.width : room.depth;
    const size = alongX ? w : h;
    const fixed = wall === 'top' || wall === 'left' ? 0 : wall === 'bottom' ? room.depth - h : room.width - w;

    const candidates = new Set<number>([0]);
    for (const obstacle of obstacles) {
      for (const r of obstacle) {
        const start = alongX ? r.x : r.y;
        const end = start + (alongX ? r.w : r.h);
        candidates.add(end);
        candidates.add(start - size);
      }
    }
    const ordered = [...candidates].filter((c) => c >= 0 && c <= length - size).sort((a, b) => a - b);
    for (const c of ordered) {
      const candidate = { ...item, rotation, x: alongX ? c : fixed, y: alongX ? fixed : c };
      if (fitsAt(candidate, room, obstacles)) return { x: candidate.x, y: candidate.y, rotation };
    }
  }
  return null;
}

const ALONG_FRONT: Record<Rotation, [number, number]> = {
  0: [1, 0],
  90: [0, 1],
  180: [-1, 0],
  270: [0, -1],
};

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
    const [dx, dy] = ALONG_FRONT[source.rotation];
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
