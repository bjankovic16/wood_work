import { sizeLimits } from './catalog';
import {
  CORNER_ROTATION,
  aabbSize,
  cornerPosition,
  footprintRects,
  itemRect,
  localDepthExtent,
  localToRoom,
  roomToLocal,
  resizeFromAnchor,
  rotationForWall,
  WALLS,
  type Corner,
  type Placed,
} from './geometry';
import { clamp, roundTo } from './math';
import { roomFeatureRect, roomOutline, roomWallRuns, type RoomWallRun } from './roomGeometry';
import type { KitchenItem, Point, Room, Rotation, Wall } from './types';
import { normalizeAngle } from './polygons';
import { mountingSegments, wallCoordinates, wallPoint } from './walls';

export interface SnapSettings {
  enabled: boolean;
  /** Grid step in mm; 0 disables the grid. */
  grid: number;
  /** How close (in mm) an edge must come to a wall or another edge to snap to it. */
  threshold: number;
}

/** An alignment line to draw while snapping: a vertical line at x = value or a horizontal one at y = value. */
export interface Guide {
  axis: 'x' | 'y';
  value: number;
}

/** A unit attaches to a wall when the pointer is within its depth plus this margin of the wall. */
const ATTACH_MARGIN = 250;
/** A unit already on a wall stays on it until another wall is clearly closer. */
const WALL_HYSTERESIS = 150;
/** Extra reach for pulling an L-shaped unit into a room corner. */
const CORNER_REACH = 400;

function wallDistances(room: Room, p: Point): Record<Wall, number> {
  return {
    top: Math.max(0, p.y),
    bottom: Math.max(0, room.depth - p.y),
    left: Math.max(0, p.x),
    right: Math.max(0, room.width - p.x),
  };
}

export function pickWall(room: Room, pointer: Point, depth: number, previous: Wall | null, sticky = false): Wall | null {
  const distance = wallDistances(room, pointer);
  const zone = depth + ATTACH_MARGIN;
  let best: Wall = 'top';
  for (const wall of WALLS) if (distance[wall] < distance[best]) best = wall;
  if (previous && distance[previous] <= zone && (sticky || distance[previous] <= distance[best] + WALL_HYSTERESIS)) {
    best = previous;
  }
  return distance[best] <= zone ? best : null;
}

export function pickCorner(room: Room, pointer: Point, reach: number): Corner | null {
  const left = pointer.x < room.width / 2;
  const top = pointer.y < room.depth / 2;
  const corner: Corner = top ? (left ? 'topLeft' : 'topRight') : left ? 'bottomLeft' : 'bottomRight';
  const cx = left ? 0 : room.width;
  const cy = top ? 0 : room.depth;
  return Math.hypot(pointer.x - cx, pointer.y - cy) <= reach ? corner : null;
}

/** Lines that moving edges are attracted to: the walls and every edge of the other items. */
export function snapTargets(room: Room, others: readonly Placed[]): { xs: number[]; ys: number[] } {
  const xs = [0, room.width];
  const ys = [0, room.depth];
  for (const point of roomOutline(room)) { xs.push(point.x); ys.push(point.y); }
  for (const feature of room.features ?? []) {
    const rect = roomFeatureRect(feature);
    xs.push(rect.x, rect.x + rect.w);
    ys.push(rect.y, rect.y + rect.h);
  }
  for (const other of others) {
    for (const r of footprintRects(other)) {
      xs.push(r.x, r.x + r.w);
      ys.push(r.y, r.y + r.h);
    }
  }
  return { xs, ys };
}

function pickSurface(room: Room, pointer: Point, depth: number, previous: Wall | null, sticky = false): RoomWallRun | null {
  const surfaces = roomWallRuns(room);
  const distance = (surface: RoomWallRun) => {
    const horizontal = surface.wall === 'top' || surface.wall === 'bottom';
    const along = horizontal ? pointer.x : pointer.y;
    const across = horizontal ? pointer.y : pointer.x;
    return Math.hypot(across - surface.offset, Math.max(surface.from - along, 0, along - surface.to));
  };
  const ordered = [...surfaces].sort((a, b) => distance(a) - distance(b));
  const best = ordered[0];
  if (!best || distance(best) > depth + ATTACH_MARGIN) return null;
  const same = ordered.find((surface) => surface.wall === previous);
  return same && distance(same) <= depth + ATTACH_MARGIN && (sticky || distance(same) <= distance(best) + WALL_HYSTERESIS) ? same : best;
}

/** Moves the segment [start, start + size] so that one of its ends meets the nearest target. */
export function snapSegment(
  start: number,
  size: number,
  targets: readonly number[],
  threshold: number,
): { start: number; target: number } | null {
  let best: { start: number; target: number; distance: number } | null = null;
  for (const target of targets) {
    for (const edge of [start, start + size]) {
      const distance = Math.abs(target - edge);
      if (distance <= threshold && (!best || distance < best.distance)) {
        best = { start: start + target - edge, target, distance };
      }
    }
  }
  return best && { start: best.start, target: best.target };
}

export function snapValue(value: number, targets: readonly number[], threshold: number): number | null {
  let best: number | null = null;
  for (const target of targets) {
    const distance = Math.abs(target - value);
    if (distance <= threshold && (best === null || distance < Math.abs(best - value))) best = target;
  }
  return best;
}

function isWallLine(axis: 'x' | 'y', value: number, room: Room): boolean {
  return value === 0 || value === (axis === 'x' ? room.width : room.depth);
}

export interface DragInput {
  room: Room;
  /** Every item except the one being placed. */
  others: readonly KitchenItem[];
  /** The item being placed, with the rotation it had when the drag started. */
  item: KitchenItem;
  /** Pointer position in plan coordinates. */
  pointer: Point;
  /** Pointer offset from the footprint centre when the drag started; null centres the item on the pointer. */
  grabOffset: Point | null;
  /** Wall the item was attached to on the previous move, for hysteresis. */
  previousWall: Wall | null;
  /**
   * Keep the item on its wall until it is pulled clear of it, however close
   * another wall comes. Used in 3D, where a unit slid into a corner should not
   * turn onto the next wall by itself.
   */
  stickyWall?: boolean;
  snap: SnapSettings;
}

export interface DragResult {
  x: number;
  y: number;
  rotation: Rotation;
  /** The wall the unit was attached to, if any. */
  wall: Wall | null;
  guides: Guide[];
}

/**
 * Where an item lands when dragged to a pointer position. Near a wall it turns
 * its back to that wall and sits flush against it; corner units drop into the
 * nearest room corner; edges snap to walls and neighbouring units, otherwise
 * to the grid. The result always stays inside the room.
 */
export function computeDragPlacement(input: DragInput): DragResult {
  const { room, others, item, pointer, snap } = input;
  let rotation = item.rotation;
  let wall: Wall | null = null;
  let corner: Corner | null = null;
  let surface: RoomWallRun | null = null;

  if (snap.enabled && item.kind !== 'corner' && (room.vertices || room.partitions?.length || room.cutout?.kind === 'diagonal')) {
    const candidates = mountingSegments(room).filter((s) => s.length >= item.width && (!s.partitionId || item.elevation < s.height));
    const ordered = candidates.map((segment) => {
      const local = wallCoordinates(segment, pointer);
      return { segment, local, distance: Math.hypot(local.y, Math.max(-local.x, 0, local.x - segment.length)) };
    }).filter((entry) => entry.local.y >= -snap.threshold).sort((a, b) => a.distance - b.distance);
    let best = ordered[0];
    const previous = ordered.find((entry) => Math.abs(entry.segment.angle - item.rotation) < 0.1);
    if (previous && best && (input.stickyWall ? previous.distance <= item.depth + ATTACH_MARGIN : previous.distance <= best.distance + WALL_HYSTERESIS)) best = previous;
    if (best && best.local.y >= -snap.threshold && best.distance <= item.depth + ATTACH_MARGIN) {
      const { segment } = best;
      rotation = segment.angle;
      let along = clamp(best.local.x - item.width / 2, 0, segment.length - item.width);
      const targets = [0, segment.length - item.width];
      for (const other of others.filter((o) => o.elevation < item.elevation + item.height && item.elevation < o.elevation + o.height)) {
        const start = wallCoordinates(segment, localToRoom(other, 0, 0));
        if (Math.abs(start.y) < 1 && Math.abs(normalizeAngle(other.rotation) - rotation) < 0.1) targets.push(start.x + other.width, start.x - item.width);
      }
      along = snapValue(along, targets, snap.threshold) ?? roundTo(along, snap.grid);
      along = clamp(along, 0, segment.length - item.width);
      const anchor = wallPoint(segment, along);
      const offset = localToRoom({ ...item, rotation, x: 0, y: 0 }, 0, 0);
      return { x: anchor.x - offset.x, y: anchor.y - offset.y, rotation, wall: null, guides: [] };
    }
  }

  if (snap.enabled) {
    if (item.kind === 'corner') {
      corner = pickCorner(room, pointer, Math.max(item.width, localDepthExtent(item)) + CORNER_REACH);
      if (corner) rotation = CORNER_ROTATION[corner];
    } else {
      if (room.cutout || room.features?.length) {
        surface = pickSurface(room, pointer, item.depth, input.previousWall, input.stickyWall);
        wall = surface?.wall ?? null;
      } else {
        wall = pickWall(room, pointer, item.depth, input.previousWall, input.stickyWall);
      }
      if (wall) rotation = rotationForWall(wall);
    }
  }

  const { w, h } = aabbSize({ ...item, rotation });
  const offset = input.grabOffset && rotation === item.rotation ? input.grabOffset : { x: 0, y: 0 };
  let x = pointer.x - offset.x - w / 2;
  let y = pointer.y - offset.y - h / 2;
  let lockX = false;
  let lockY = false;

  if (corner) {
    ({ x, y } = cornerPosition(room, corner, { w, h }));
    lockX = lockY = true;
  } else if (wall === 'top') {
    y = surface?.offset ?? 0;
    lockY = true;
  } else if (wall === 'bottom') {
    y = (surface?.offset ?? room.depth) - h;
    lockY = true;
  } else if (wall === 'left') {
    x = surface?.offset ?? 0;
    lockX = true;
  } else if (wall === 'right') {
    x = (surface?.offset ?? room.width) - w;
    lockX = true;
  }

  const guides: Guide[] = [];
  if (snap.enabled) {
    const { xs, ys } = snapTargets(room, others);
    if (!lockX) {
      const hit = snapSegment(x, w, xs, snap.threshold);
      if (hit) {
        x = hit.start;
        if (!isWallLine('x', hit.target, room)) guides.push({ axis: 'x', value: hit.target });
      } else {
        x = roundTo(x, snap.grid);
      }
    }
    if (!lockY) {
      const hit = snapSegment(y, h, ys, snap.threshold);
      if (hit) {
        y = hit.start;
        if (!isWallLine('y', hit.target, room)) guides.push({ axis: 'y', value: hit.target });
      } else {
        y = roundTo(y, snap.grid);
      }
    }
  }

  x = clamp(x, 0, Math.max(0, room.width - w));
  y = clamp(y, 0, Math.max(0, room.depth - h));
  return { x: Math.round(x), y: Math.round(y), rotation, wall, guides };
}

/** Resize handles, named from the item's own point of view. */
export type HandleId = 'left' | 'right' | 'front' | 'sideEnd';

export interface ItemHandle {
  id: HandleId;
  field: 'width' | 'depth' | 'width2';
  /** Where the handle is drawn. */
  point: Point;
  /** Which side of the footprint's bounding box the handle moves. */
  side: Wall;
}

type LocalEdge = 'uMin' | 'uMax' | 'vMin' | 'vMax';

const LOCAL_EDGE_SIDE: Record<Rotation, Record<LocalEdge, Wall>> = {
  0: { uMin: 'left', uMax: 'right', vMin: 'top', vMax: 'bottom' },
  90: { uMin: 'top', uMax: 'bottom', vMin: 'right', vMax: 'left' },
  180: { uMin: 'right', uMax: 'left', vMin: 'bottom', vMax: 'top' },
  270: { uMin: 'bottom', uMax: 'top', vMin: 'left', vMax: 'right' },
};

export function itemHandles(item: Placed): ItemHandle[] {
  const lw = item.width;
  const lh = localDepthExtent(item);
  const side = LOCAL_EDGE_SIDE[(Math.round(normalizeAngle(item.rotation) / 90) * 90) % 360];
  if (item.kind === 'corner') {
    const d = item.depth;
    return [
      { id: 'right', field: 'width', point: localToRoom(item, lw, d / 2), side: side.uMax },
      { id: 'sideEnd', field: 'width2', point: localToRoom(item, d / 2, lh), side: side.vMax },
    ];
  }
  return [
    { id: 'left', field: 'width', point: localToRoom(item, 0, lh / 2), side: side.uMin },
    { id: 'right', field: 'width', point: localToRoom(item, lw, lh / 2), side: side.uMax },
    { id: 'front', field: 'depth', point: localToRoom(item, lw / 2, lh), side: side.vMax },
  ];
}

export interface ResizeInput {
  room: Room;
  others: readonly KitchenItem[];
  /** The item as it was when the resize started. */
  item: KitchenItem;
  handleId: HandleId;
  pointer: Point;
  snap: SnapSettings;
}

/** Drags one side of an item to the pointer; the opposite side stays put. */
export function computeHandleResize(input: ResizeInput): { item: KitchenItem; guides: Guide[] } {
  const { room, others, item, pointer, snap } = input;
  const handle = itemHandles(item).find((h) => h.id === input.handleId);
  if (!handle) return { item, guides: [] };
  if (normalizeAngle(item.rotation) % 90 !== 0) {
    const local = roomToLocal(item, pointer);
    const limits = sizeLimits(item, handle.field);
    const coordinate = handle.field === 'width' ? local.x : local.y;
    const value = input.handleId === 'left' ? item.width - coordinate : coordinate;
    const extent = Math.round(clamp(snap.enabled ? roundTo(value, snap.grid) : value, limits.min, limits.max));
    let resized = resizeFromAnchor(item, { [handle.field]: extent });
    if (input.handleId === 'left') {
      const oldRight = localToRoom(item, item.width, 0);
      const newRight = localToRoom(resized, resized.width, 0);
      resized = { ...resized, x: resized.x + oldRight.x - newRight.x, y: resized.y + oldRight.y - newRight.y };
    }
    return { item: resized, guides: [] };
  }

  const horizontal = handle.side === 'left' || handle.side === 'right';
  const axis = horizontal ? 'x' : 'y';
  let position = horizontal ? pointer.x : pointer.y;
  const guides: Guide[] = [];
  if (snap.enabled) {
    const { xs, ys } = snapTargets(room, others);
    const hit = snapValue(position, horizontal ? xs : ys, snap.threshold);
    if (hit !== null) {
      position = hit;
      if (!isWallLine(axis, hit, room)) guides.push({ axis, value: hit });
    } else {
      position = roundTo(position, snap.grid);
    }
  }

  const limits = sizeLimits(item, handle.field);
  const r = itemRect(item);
  let x = r.x;
  let y = r.y;
  let extent: number;
  switch (handle.side) {
    case 'right':
      extent = clamp(position - r.x, limits.min, Math.max(limits.min, Math.min(limits.max, room.width - r.x)));
      break;
    case 'left': {
      const right = r.x + r.w;
      extent = clamp(right - position, limits.min, Math.max(limits.min, Math.min(limits.max, right)));
      x = right - extent;
      break;
    }
    case 'bottom':
      extent = clamp(position - r.y, limits.min, Math.max(limits.min, Math.min(limits.max, room.depth - r.y)));
      break;
    case 'top': {
      const bottom = r.y + r.h;
      extent = clamp(bottom - position, limits.min, Math.max(limits.min, Math.min(limits.max, bottom)));
      y = bottom - extent;
      break;
    }
  }

  return {
    item: { ...item, [handle.field]: Math.round(extent), x: Math.round(x), y: Math.round(y) },
    guides,
  };
}
