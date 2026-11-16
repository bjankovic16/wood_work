import { clamp } from './math';
import { clampOpening } from './openings';
import { roomContainsRect } from './roomGeometry';
import type { Opening, Point, Room, RoomFeature } from './types';
import { openingFrame, wallCoordinates } from './walls';

export interface RoomObjectSelection {
  type: 'opening' | 'feature';
  id: string;
}

export interface RoomObjectPosition extends Point {
  elevation: number;
}

const snap = (value: number, grid: number) => grid > 0 ? Math.round(value / grid) * grid : Math.round(value);

/** Project a dragged centre onto its existing wall; door sills always stay at floor level. */
export function openingDragPlacement(room: Room, opening: Opening, centre: RoomObjectPosition, grid: number): Opening {
  const frame = openingFrame(room, opening);
  if (!frame) return opening;
  return clampOpening({
    ...opening,
    offset: snap(wallCoordinates(frame, centre).x - opening.width / 2, grid),
    sill: opening.kind === 'door' ? 0 : snap(centre.elevation - opening.height / 2, grid),
  }, room);
}

/** Reject cut-out/polygon excursions rather than teleporting a structure to another usable area. */
export function featureDragPlacement(room: Room, feature: RoomFeature, centre: Point, grid: number): Point | null {
  const x = clamp(snap(centre.x - feature.width / 2, grid), 0, room.width - feature.width);
  const y = clamp(snap(centre.y - feature.depth / 2, grid), 0, room.depth - feature.depth);
  return roomContainsRect({ x, y, w: feature.width, h: feature.depth }, room) ? { x, y } : null;
}
