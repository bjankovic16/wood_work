import {
  footprintRects,
  isFlushWith,
  isWallMounted,
  itemRect,
  mountingWalls,
  verticalOverlap,
  WALLS,
  attachedSegment,
  localToRoom,
} from './geometry';
import { clamp } from './math';
import type { KitchenItem, Room, Wall } from './types';
import { roomSegments, wallCoordinates, type WallSegment } from './walls';

export interface ChainSegment {
  from: number;
  to: number;
  /** True when a unit fills this part of the wall, false for a gap. */
  occupied: boolean;
}

/** A run of chained dimensions along one wall, for either the floor or the wall units. */
export interface WallChain {
  wall: Wall;
  level: 'floor' | 'wall';
  segments: ChainSegment[];
}

export function computeSegmentChains(room: Room, items: readonly KitchenItem[]): Array<{ segment: WallSegment; level: 'floor' | 'wall'; segments: ChainSegment[] }> {
  return roomSegments(room).flatMap((segment) => (['floor', 'wall'] as const).flatMap((level) => {
    const spans = items.filter((item) => (level === 'wall') === isWallMounted(item) && attachedSegment(item, room)?.id === segment.id)
      .map((item) => { const start = wallCoordinates(segment, localToRoom(item, 0, 0)).x; return [start, start + item.width]; });
    if (level === 'wall' && !spans.length) return [];
    const ticks = [...new Set([0, segment.length, ...spans.flat()])].sort((a, b) => a - b);
    return [{ segment, level, segments: ticks.slice(1).map((to, i) => ({ from: ticks[i], to, occupied: spans.some(([a, b]) => a <= (to + ticks[i]) / 2 && b >= (to + ticks[i]) / 2) })) }];
  }));
}

/**
 * Chained dimensions along each wall, as on a workshop drawing: every unit
 * standing against the wall and every gap between them, from corner to corner.
 */
export function computeWallChains(room: Room, items: readonly KitchenItem[]): WallChain[] {
  const chains: WallChain[] = [];
  for (const wall of WALLS) {
    const alongX = wall === 'top' || wall === 'bottom';
    const length = alongX ? room.width : room.depth;
    for (const level of ['floor', 'wall'] as const) {
      const spans: Array<[number, number]> = [];
      for (const item of items) {
        if ((level === 'wall') !== isWallMounted(item)) continue;
        if (!mountingWalls(item).includes(wall)) continue;
        const r = itemRect(item);
        if (!isFlushWith(r, wall, room)) continue;
        const start = alongX ? r.x : r.y;
        const end = start + (alongX ? r.w : r.h);
        spans.push([clamp(start, 0, length), clamp(end, 0, length)]);
      }
      if (spans.length === 0) continue;

      const ticks = [...new Set([0, length, ...spans.flat()])].sort((a, b) => a - b);
      const segments: ChainSegment[] = [];
      for (let i = 0; i < ticks.length - 1; i++) {
        const from = ticks[i];
        const to = ticks[i + 1];
        if (to - from < 0.5) continue;
        const mid = (from + to) / 2;
        segments.push({ from, to, occupied: spans.some(([s, e]) => s <= mid && mid <= e) });
      }
      chains.push({ wall, level, segments });
    }
  }
  return chains;
}

/** Free distance from one side of an item to the nearest wall or unit at the same height. */
export interface Clearance {
  axis: 'x' | 'y';
  from: number;
  to: number;
  /** Position of the dimension line on the other axis. */
  at: number;
}

export function computeClearances(room: Room, items: readonly KitchenItem[], item: KitchenItem): Clearance[] {
  // Axis-aligned clearance rays are not valid dimensions for an angled cabinet.
  if (item.rotation % 90 !== 0 || room.vertices) return [];
  const r = itemRect(item);
  const obstacles = items
    .filter((o) => o.id !== item.id && verticalOverlap(o, item))
    .flatMap((o) => footprintRects(o));

  let left = 0;
  let right = room.width;
  let top = 0;
  let bottom = room.depth;
  for (const o of obstacles) {
    const sharesRows = o.y < r.y + r.h && r.y < o.y + o.h;
    const sharesColumns = o.x < r.x + r.w && r.x < o.x + o.w;
    if (sharesRows) {
      if (o.x + o.w <= r.x + 0.5) left = Math.max(left, o.x + o.w);
      if (o.x >= r.x + r.w - 0.5) right = Math.min(right, o.x);
    }
    if (sharesColumns) {
      if (o.y + o.h <= r.y + 0.5) top = Math.max(top, o.y + o.h);
      if (o.y >= r.y + r.h - 0.5) bottom = Math.min(bottom, o.y);
    }
  }

  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const result: Clearance[] = [];
  if (r.x - left >= 1) result.push({ axis: 'x', from: left, to: r.x, at: cy });
  if (right - (r.x + r.w) >= 1) result.push({ axis: 'x', from: r.x + r.w, to: right, at: cy });
  if (r.y - top >= 1) result.push({ axis: 'y', from: top, to: r.y, at: cx });
  if (bottom - (r.y + r.h) >= 1) result.push({ axis: 'y', from: r.y + r.h, to: bottom, at: cx });
  return result;
}
