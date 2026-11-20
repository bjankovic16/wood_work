import { clamp } from './math';
import { clampOpening } from './openings';
import { featureFitsRoom, roomFeaturePolygon, roomFeaturePose } from './roomGeometry';
import { polygonBounds } from './polygons';
import type { Opening, Point, Room, RoomFeature } from './types';
import { openingFrame, roomSegments, wallCoordinates, type WallSegment } from './walls';

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
export function featureDragPlacement(room: Room, feature: RoomFeature, centre: Point, grid: number): { x?: number; y?: number; offset?: number } | null {
  if (feature.wallId) {
    const wall = roomSegments(room).find((s) => s.id === feature.wallId);
    if (!wall) return null;
    const offset = clamp(snap(wallCoordinates(wall, centre).x - feature.width / 2, grid), 0, Math.floor(wall.length - feature.width));
    return featureFitsRoom(room, { ...feature, offset }) ? { offset } : null;
  }
  const x = clamp(snap(centre.x - feature.width / 2, grid), 0, room.width - feature.width);
  const y = clamp(snap(centre.y - feature.depth / 2, grid), 0, room.depth - feature.depth);
  return featureFitsRoom(room, { ...feature, x, y }) ? { x, y } : null;
}

export type FeatureDimension = 'width' | 'depth';
type FixedEnd = 'start' | 'end';

/** Dragging fixes the opposite edge. A typed size may grow back from a wall end instead. */
export function featureResize(room: Room, f: RoomFeature, field: FeatureDimension, size: number, fixed?: FixedEnd) {
  if (!Number.isFinite(size) || size < 100) return null;
  const wall = f.wallId ? roomSegments(room).find((s) => s.id === f.wallId) : undefined;
  if (f.wallId && !wall) return null;
  if (wall && field === 'depth') {
    const next = { ...f, depth: size };
    return featureFitsRoom(room, next) ? next : null;
  }
  const axis = wall ? 'offset' : field === 'width' ? 'x' : 'y';
  const extent = wall?.length ?? room[field];
  if (size > extent) return null;
  const start = f[axis] ?? 0;
  const endAnchored = start + f[field] - size;
  const starts = fixed ? [fixed === 'start' ? start : endAnchored]
    : [Math.min(start, Math.floor(extent - size)), Math.max(0, endAnchored)];
  for (const at of starts) {
    const next = { ...f, [field]: size, [axis]: at };
    if (featureFitsRoom(room, next)) return next;
  }
  return null;
}

/** A fast pointer sample can overshoot a sloping boundary; stop at the last whole millimetre. */
export function dragFeatureSize(room: Room, f: RoomFeature, field: FeatureDimension, size: number, fixed: FixedEnd) {
  const candidate = featureResize(room, f, field, size, fixed);
  if (candidate) return candidate;
  let good = f, bad = size;
  while (Math.abs(good[field] - bad) > 1) {
    const value = Math.round((good[field] + bad) / 2);
    if (value === good[field] || value === bad) break;
    const next = featureResize(room, f, field, value, fixed);
    if (next) good = next;
    else bad = value;
  }
  return good;
}

/** Place the entire back edge on the chosen wall, including on an acute or concave outline. */
export function attachFeature(room: Room, feature: RoomFeature, wall: WallSegment, preferred = (wall.length - feature.width) / 2): RoomFeature {
  const max = Math.floor(wall.length - feature.width);
  if (max >= 0) {
    const candidate = (at: number) => {
      const placed = { ...feature, wallId: wall.id, offset: Math.round(clamp(at, 0, max)) };
      const { x, y } = polygonBounds(roomFeaturePolygon(room, placed));
      return { ...placed, x, y };
    };
    for (const at of [preferred, max / 2, 0, max]) {
      const placed = candidate(at);
      if (featureFitsRoom(room, placed)) return placed;
    }
    for (let at = 0; at <= max; at += 10) {
      const placed = candidate(at);
      if (featureFitsRoom(room, placed)) return placed;
    }
  }
  throw new RangeError('This structure does not fit against this wall.');
}

export function freeFeature(room: Room, feature: RoomFeature): RoomFeature {
  const { wallId, offset: _offset, ...free } = feature;
  const { centre } = roomFeaturePose(room, feature);
  const wall = roomSegments(room).find((s) => s.id === wallId);
  // An axis-aligned footprint can need a little more room after leaving a diagonal face.
  for (let inward = 0; inward <= Math.max(free.width, free.depth); inward += 10) {
    const placement = featureDragPlacement(room, free, { x: centre.x + inward * (wall?.inward.x ?? 0), y: centre.y + inward * (wall?.inward.y ?? 0) }, 0);
    if (placement) return { ...free, ...placement };
  }
  throw new RangeError('No space for the freestanding structure.');
}
