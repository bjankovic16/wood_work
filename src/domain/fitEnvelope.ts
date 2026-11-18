import { hasWorktop, WORKTOP_THICKNESS } from './catalog';
import { footprintPieces, localToRoom } from './geometry';
import { openingObstacles } from './openings';
import { polygonContains, polygonsOverlap } from './polygons';
import { roomFeaturePolygon, roomOutline } from './roomGeometry';
import type { KitchenItem, Opening, Point, Room } from './types';
import { partitionPolygon, wallCoordinates, wallPoint, type WallSegment } from './walls';
import type { FitReason } from './fitLayout';

export interface Span { from: number; to: number }
export interface Run { wall: WallSegment; reverse: boolean }
export interface Solid {
  polygon: Point[];
  bottom: number;
  top: number;
  reason: 'opening' | 'structure' | 'space';
  window?: boolean;
}

const EPS = 1e-6;
export const runPoint = (run: Run, along: number, depth = 0): Point =>
  wallPoint(run.wall, run.reverse ? run.wall.length - along : along, depth);
export function runCoordinates(run: Run, p: Point): Point {
  const { x, y } = wallCoordinates(run.wall, p);
  return { x: run.reverse ? run.wall.length - x : x, y };
}
export function against(run: Run, item: KitchenItem, from: number, depth = 0): KitchenItem {
  const anchor = runPoint(run, run.reverse ? from + item.width : from, depth);
  const rotated = { ...item, rotation: run.wall.angle, x: 0, y: 0 };
  const offset = localToRoom(rotated, 0, 0);
  return { ...rotated, x: anchor.x - offset.x, y: anchor.y - offset.y };
}
export function topOf(item: KitchenItem): number {
  return item.elevation + item.height + (hasWorktop(item) ? WORKTOP_THICKNESS : 0);
}
export function inHeight(solid: Solid, bottom: number, top: number): boolean {
  return solid.bottom < top - EPS && bottom < solid.top - EPS;
}
export class Envelope {
  readonly outline: Point[];
  readonly solids: Solid[];
  constructor(readonly room: Room, openings: readonly Opening[]) {
    this.outline = roomOutline(room);
    this.solids = [
      ...(room.features ?? []).map((f): Solid => ({
        polygon: roomFeaturePolygon(room, f), bottom: 0, top: room.height, reason: 'structure',
      })),
      ...(room.partitions ?? []).map((p): Solid => ({
        polygon: partitionPolygon(p), bottom: 0, top: p.height, reason: 'structure',
      })),
      ...openingObstacles(room, openings).map((o, i): Solid => ({
        polygon: o.polygon, bottom: o.bottom, top: o.top, reason: 'opening', window: openings[i].kind === 'window',
      })),
    ];
  }
  obstruction(item: KitchenItem): FitReason | undefined {
    const top = topOf(item);
    if (item.elevation < 0 || top > this.room.height + EPS) return 'headroom';
    const pieces = footprintPieces(item);
    if (!pieces.every((p) => polygonContains(this.outline, p))) return 'wall';
    return this.solids.find((s) => inHeight(s, item.elevation, top)
      && pieces.some((p) => polygonsOverlap(p, s.polygon)))?.reason;
  }
  add(item: KitchenItem) {
    for (const polygon of footprintPieces(item))
      this.solids.push({ polygon, bottom: item.elevation, top: topOf(item), reason: 'space' });
  }
}

/** Project only the portion of a polygon inside the depth band, not its bounding box. */
function stripEvents(polygon: Point[], back: number, front: number): number[] {
  const xs: number[] = [];
  polygon.forEach((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    if (a.y >= back - EPS && a.y <= front + EPS) xs.push(a.x);
    for (const edge of [back, front]) {
      if ((a.y < edge && edge < b.y) || (b.y < edge && edge < a.y))
        xs.push(a.x + (b.x - a.x) * (edge - a.y) / (b.y - a.y));
    }
  });
  return xs;
}

/** Local-coordinate sweep of a whole depth band; valid for concave rooms and diagonal obstacles. */
export class RunSection {
  private readonly outline: Point[];
  private readonly solids: Solid[];
  constructor(run: Run, envelope: Envelope) {
    const local = (polygon: Point[]) => polygon.map((p) => runCoordinates(run, p));
    this.outline = local(envelope.outline);
    this.solids = envelope.solids.map((s) => ({ ...s, polygon: local(s.polygon) }));
  }

  free(bounds: Span, back: number, front: number, bottom: number, top: number, passage = false) {
    const ticks = [bounds.from, bounds.to, ...stripEvents(this.outline, back, front)
      .filter((x) => x > bounds.from && x < bounds.to)].sort((a, b) => a - b);
    let spans: Span[] = [];
    for (let i = 1; i < ticks.length; i++) {
      const from = ticks[i - 1], to = ticks[i], x = (from + to) / 2;
      if (to - from <= EPS || !polygonContains(this.outline, [{ x, y: back }, { x, y: front }])) continue;
      const last = spans.at(-1);
      if (last && last.to >= from - EPS) last.to = to;
      else spans.push({ from, to });
    }
    let reason: FitReason = spans.reduce((sum, s) => sum + s.to - s.from, 0) < bounds.to - bounds.from - 1 ? 'wall' : 'space';
    let largestLoss = 0;
    for (const solid of this.solids) {
      if (!inHeight(solid, bottom, top) || (passage && solid.window)) continue;
      const ys = solid.polygon.map((p) => p.y);
      if (Math.max(...ys) <= back + EPS || Math.min(...ys) >= front - EPS) continue;
      const xs = stripEvents(solid.polygon, back, front);
      if (!xs.length) continue;
      const lo = Math.min(...xs), hi = Math.max(...xs);
      let loss = 0;
      spans = spans.flatMap((s) => {
        const a = Math.max(s.from, lo), b = Math.min(s.to, hi);
        if (b <= a + EPS) return [s];
        loss += b - a;
        return [{ from: s.from, to: a }, { from: b, to: s.to }].filter((r) => r.to > r.from + EPS);
      });
      if (solid.reason !== 'space' && loss > largestLoss) { largestLoss = loss; reason = solid.reason; }
    }
    return { spans, reason };
  }
}
