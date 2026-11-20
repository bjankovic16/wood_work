import type { Point } from '../../domain/types';
import { wallPoint, type WallSegment } from '../../domain/walls';
import type { RoomPlanAngle } from '../../store/uiStore';
import { rotatePlanPoint, unrotatePlanPoint } from './roomPlanView';

type Frame = Point & { px: number; angle?: RoomPlanAngle };
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
export function planWallControls(sourceWalls: WallSegment[], frame: Frame, size: Viewport, sourceMovingWall?: WallSegment, namedView?: { id: string; width: number }) {
  const angle = frame.angle ?? 0;
  const walls = sourceWalls.map((wall) => ({ ...wall, start: rotatePlanPoint(wall.start, angle), end: rotatePlanPoint(wall.end, angle),
    tangent: rotatePlanPoint(wall.tangent, angle), inward: rotatePlanPoint(wall.inward, angle), angle: (wall.angle + angle) % 360 }));
  const movingWall = walls.find((wall) => wall.id === sourceMovingWall?.id);
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

  let grip: Point | undefined;
  if (movingWall) {
    const origin = screen(wallPoint(movingWall, movingWall.length / 2));
    const start = screen(wallPoint(movingWall, movingWall.length / 2, 24 * frame.px));
    const at = place(start, origin, movingWall.inward, halfHit, size, taken);
    grip = plan(at);
    taken.push({ ...at, halfWidth: halfHit, halfHeight: halfHit });
  }

  for (const wall of walls) {
    const dimension = dimensions.get(wall.id);
    const origin = screen(dimension?.anchor ?? wallPoint(wall, wall.length / 2));
    const start = dimension ? screen(dimension.at) : screen(wallPoint(wall, wall.length / 2, 28 * frame.px));
    const normal = dimension ? { x: -wall.inward.x, y: -wall.inward.y } : wall.inward;
    const halfWidth = namedView?.id === wall.id ? Math.max(44, namedView.width) / 2 : halfHit;
    const at = place(start, origin, normal, halfWidth, size, taken);
    icons.set(wall.id, plan(at));
    taken.push({ ...at, halfWidth, halfHeight: halfHit });
  }
  return {
    dimensions: new Map<string, { anchor: Point; at: Point }>(Array.from(dimensions, ([id, p]) =>
      [id, { anchor: unrotatePlanPoint(p.anchor, angle), at: unrotatePlanPoint(p.at, angle) }])),
    icons: new Map<string, Point>(Array.from(icons, ([id, at]) => [id, unrotatePlanPoint(at, angle)])),
    grip: grip && unrotatePlanPoint(grip, angle),
  };
}
