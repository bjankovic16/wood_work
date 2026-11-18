import type { Point, Rect } from './types';

export function angleBasis(angle: number): { c: number; s: number } {
  const radians = angle * Math.PI / 180;
  const clean = (n: number) => Math.abs(n) < 1e-12 ? 0 : Math.abs(Math.abs(n) - 1) < 1e-12 ? Math.sign(n) : n;
  return { c: clean(Math.cos(radians)), s: clean(Math.sin(radians)) };
}

export const normalizeAngle = (angle: number): number => ((angle % 360) + 360) % 360;
export const cross = (a: Point, b: Point, p: Point): number => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
export const polygonArea = (points: readonly Point[]): number =>
  points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]; return sum + p.x * q.y - q.x * p.y; }, 0) / 2;
export const rectPolygon = (r: Rect): Point[] => [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }];

export function polygonBounds(points: readonly Point[]): Rect {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export function onSegment(p: Point, a: Point, b: Point, epsilon = 0.01): boolean {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  return Math.abs(cross(a, b, p)) <= epsilon * length
    && p.x >= Math.min(a.x, b.x) - epsilon && p.x <= Math.max(a.x, b.x) + epsilon
    && p.y >= Math.min(a.y, b.y) - epsilon && p.y <= Math.max(a.y, b.y) + epsilon;
}

export function pointInPolygon(p: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j];
    const b = polygon[i];
    if (onSegment(p, a, b)) return true;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  // Test signed distances, not the product of two cross products: a long
  // cabinet edge can meet a sloped wall within machine precision at one end.
  const straddles = (p: Point, q: Point, r: Point, s: Point) => {
    const eps = 1e-7 * Math.hypot(q.x - p.x, q.y - p.y);
    const x = cross(p, q, r), y = cross(p, q, s);
    return (x < -eps && y > eps) || (x > eps && y < -eps);
  };
  return straddles(a, b, c, d) && straddles(c, d, a, b);
}

/** Split candidate edges at boundary contacts so concave notches cannot be bridged. */
export function polygonContains(outer: readonly Point[], inner: readonly Point[]): boolean {
  if (!inner.every((p) => pointInPolygon(p, outer))) return false;
  return inner.every((a, i) => {
    const b = inner[(i + 1) % inner.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length2 = dx * dx + dy * dy;
    const ticks = [0, 1];
    for (let j = 0; j < outer.length; j++) {
      const c = outer[j];
      const d = outer[(j + 1) % outer.length];
      if (segmentsCross(a, b, c, d)) return false;
      if (onSegment(c, a, b)) ticks.push(((c.x - a.x) * dx + (c.y - a.y) * dy) / length2);
    }
    ticks.sort((u, v) => u - v);
    return ticks.slice(1).every((t, j) => {
      const mid = (t + ticks[j]) / 2;
      return pointInPolygon({ x: a.x + dx * mid, y: a.y + dy * mid }, outer);
    });
  });
}

/** Separating-axis test for convex pieces. Touching edges are not overlap. */
export function polygonsOverlap(a: readonly Point[], b: readonly Point[], epsilon = 0.5): boolean {
  for (const polygon of [a, b]) {
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i];
      const q = polygon[(i + 1) % polygon.length];
      const length = Math.hypot(q.x - p.x, q.y - p.y);
      if (!length) continue;
      const nx = -(q.y - p.y) / length;
      const ny = (q.x - p.x) / length;
      const project = (points: readonly Point[]) => points.map((v) => v.x * nx + v.y * ny);
      const ap = project(a);
      const bp = project(b);
      if (Math.max(...ap) <= Math.min(...bp) + epsilon || Math.max(...bp) <= Math.min(...ap) + epsilon) return false;
    }
  }
  return true;
}

export function validRoomPolygon(points: readonly Point[]): boolean {
  if (points.length < 3 || polygonArea(points) <= 10000) return false;
  return points.every((a, i) => {
    const b = points[(i + 1) % points.length];
    if (![a.x, a.y].every(Number.isFinite) || Math.hypot(b.x - a.x, b.y - a.y) < 100) return false;
    return points.every((c, j) => {
      if (j === i || j === (i + 1) % points.length || (j + 1) % points.length === i) return true;
      const d = points[(j + 1) % points.length];
      return !segmentsCross(a, b, c, d) && !onSegment(c, a, b) && !onSegment(a, c, d);
    });
  });
}
