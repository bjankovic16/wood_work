import type { Opening, Rect, Room, Wall } from './types';
import { outerWallRuns } from './roomGeometry';

/** Doors need at least this much free floor in front of them, even when narrower. */
const MIN_DOOR_CLEARANCE = 800;

export function wallLength(room: Room, wall: Wall): number {
  return wall === 'top' || wall === 'bottom' ? room.width : room.depth;
}

/** Start and end of a rectangle measured along a wall. */
export function alongWall(rect: Rect, wall: Wall): [number, number] {
  return wall === 'top' || wall === 'bottom' ? [rect.x, rect.x + rect.w] : [rect.y, rect.y + rect.h];
}

/** A strip of floor against a wall, `depth` deep, between `from` and `to` along it. */
export function stripAgainstWall(room: Room, wall: Wall, from: number, to: number, depth: number): Rect {
  switch (wall) {
    case 'top':
      return { x: from, y: 0, w: to - from, h: depth };
    case 'bottom':
      return { x: from, y: room.depth - depth, w: to - from, h: depth };
    case 'left':
      return { x: 0, y: from, w: depth, h: to - from };
    case 'right':
      return { x: room.width - depth, y: from, w: depth, h: to - from };
  }
}

/** The floor a door needs kept clear: as deep as the door is wide, at least the minimum clearance. */
export function doorClearance(room: Room, door: Opening): Rect {
  return stripAgainstWall(room, door.wall, door.offset, door.offset + door.width, Math.max(door.width, MIN_DOOR_CLEARANCE));
}

export interface OpeningObstacle {
  rect: Rect;
  /** Floor to the bottom and top of the space it takes. */
  bottom: number;
  top: number;
}

/**
 * Space units must keep free because of windows and doors: in front of a door
 * from the floor up, and in front of a window between its sill and its top.
 */
export function openingObstacles(room: Room, openings: readonly Opening[], unitDepth = 650): OpeningObstacle[] {
  return openings.map((opening) =>
    opening.kind === 'door'
      ? { rect: doorClearance(room, opening), bottom: 0, top: opening.height }
      : {
          rect: stripAgainstWall(room, opening.wall, opening.offset, opening.offset + opening.width, unitDepth),
          bottom: opening.sill,
          top: opening.sill + opening.height,
        },
  );
}

/** Keeps an opening inside its wall and below the ceiling. */
export function clampOpening(opening: Opening, room: Room): Opening {
  const spans = outerWallRuns(room, opening.wall);
  const span = [...spans].sort((a, b) => {
    const distance = (run: typeof a) => Math.abs(Math.min(Math.max(opening.offset, run.from), Math.max(run.from, run.to - opening.width)) - opening.offset);
    return distance(a) - distance(b) || (b.to - b.from) - (a.to - a.from);
  })[0];
  const length = span ? span.to - span.from : wallLength(room, opening.wall);
  const width = Math.round(Math.min(Math.max(opening.width, 300), length));
  const height = Math.round(Math.min(Math.max(opening.height, 300), room.height));
  const sill = opening.kind === 'door' ? 0 : Math.round(Math.min(Math.max(opening.sill, 0), room.height - height));
  const from = span?.from ?? 0;
  const offset = Math.round(Math.min(Math.max(opening.offset, from), from + length - width));
  return { ...opening, width, height, sill, offset };
}

export const OPENING_DEFAULTS = {
  window: { width: 1200, height: 1200, sill: 1000 },
  door: { width: 900, height: 2050, sill: 0 },
} as const;
