import type { Point } from '../../domain/types';
import { wallPoint, type WallSegment } from '../../domain/walls';

type Frame = Point & { px: number };
type Box = Point & { halfWidth: number; halfHeight: number };
type Viewport = { width: number; height: number };
const halfHit = 22;
const fit = (v: number, half: number, extent: number) => Math.max(half, Math.min(v, extent - half));

/** Search near the wall, preferring clear touch targets on the intended side of its face. */
function place(start: Point, origin: Point, normal: Point, halfWidth: number, size: Viewport, taken: Box[]) {
  let best = start, least = Infinity;
  for (let ring = 0; ring <= 3; ring++) {
    for (let i = -ring; i <= ring; i++) for (let j = -ring; j <= ring; j++) {
      if (Math.max(Math.abs(i), Math.abs(j)) !== ring) continue;
      const x = fit(start.x + i * (halfWidth + 34), halfWidth, size.width);
      const y = fit(start.y + j * 46, halfHit, size.height);
      const side = (x - origin.x) * normal.x + (y - origin.y) * normal.y;
      let score = Math.hypot(x - start.x, y - start.y) + Math.max(0, halfHit - side) * 4;
      for (const q of taken) {
        const dx = Math.abs(x - q.x), dy = Math.abs(y - q.y);
        score += Math.max(0, q.halfWidth + halfWidth - dx) * Math.max(0, q.halfHeight + halfHit - dy);
        if (dx < Math.max(q.halfWidth, halfWidth) && dy < halfHit) score += 10000;
      }
      if (score < least) { best = { x, y }; least = score; }
    }
    if (least <= (ring + 1) * 46) break;
  }
  return best;
}

/** Place the numbers first. A new shortcut must not displace a measurement or cover a corner. */
export function planWallControls(walls: WallSegment[], frame: Frame, size: Viewport) {
  const screen = (p: Point) => ({ x: (p.x - frame.x) / frame.px, y: (p.y - frame.y) / frame.px });
  const plan = (p: Point) => ({ x: frame.x + p.x * frame.px, y: frame.y + p.y * frame.px });
  const perimeter = walls.filter((wall) => !wall.partitionId), taken: Box[] = [];
  const dimensions = new Map<string, { anchor: Point; at: Point }>(), icons = new Map<string, Point>();
  for (const wall of perimeter) {
    const candidates = [0.5, 0.3, 0.7, 0.15, 0.85].map((fraction) => {
      const anchor = wallPoint(wall, wall.length * fraction), p = screen(anchor);
      return { anchor, x: p.x - wall.inward.x * 42, y: p.y - wall.inward.y * 28 };
    });
    const clear = candidates.find((p) => taken.every((q) => Math.abs(q.x - p.x) >= 70 || Math.abs(q.y - p.y) >= 45));
    const anchor = (clear ?? candidates[0]).anchor;
    const at = clear ?? place(candidates[0], screen(anchor), { x: -wall.inward.x, y: -wall.inward.y }, 32, size, taken);
    dimensions.set(wall.id, { anchor, at: plan(at) });
    taken.push({ ...at, halfWidth: 32, halfHeight: halfHit });
  }
  for (const [i, wall] of perimeter.entries()) {
    const p = screen(wall.start), before = perimeter[(i + perimeter.length - 1) % perimeter.length].inward;
    const nx = before.x + wall.inward.x, ny = before.y + wall.inward.y;
    const offset = 12 / (Math.hypot(nx, ny) || 1);
    taken.push({ x: p.x - nx * offset, y: p.y - ny * offset, halfWidth: halfHit, halfHeight: halfHit });
  }

  for (const wall of walls) {
    const dimension = dimensions.get(wall.id);
    const origin = screen(dimension?.anchor ?? wallPoint(wall, wall.length / 2));
    const start = dimension ? screen(dimension.at) : screen(wallPoint(wall, wall.length / 2, 28 * frame.px));
    const normal = dimension ? { x: -wall.inward.x, y: -wall.inward.y } : wall.inward;
    const halfWidth = 39;
    const at = place(start, origin, normal, halfWidth, size, taken);
    icons.set(wall.id, plan(at));
    taken.push({ ...at, halfWidth, halfHeight: halfHit });
  }
  return { dimensions, icons };
}
