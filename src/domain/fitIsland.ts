import { against, inHeight, runCoordinates, RunSection, type Envelope, type Run } from './fitEnvelope';
import { polygonBounds } from './polygons';
import type { KitchenItem } from './types';

/** Free working/passing space on *all* four sides, not just between the back run and the island. */
export const ISLAND_PASSAGE = 900;

/** Existing gallery islands are single rows. Move the composition, never scatter individual cabinets. */
export function placeIsland(env: Envelope, run: Run, originals: KitchenItem[]): KitchenItem[] {
  if (!originals.length) return [];
  const section = new RunSection(run, env);
  const room = polygonBounds(env.outline.map((p) => runCoordinates(run, p)));
  const p = ISLAND_PASSAGE;
  const sorted = [...originals].sort((a, b) => a.x - b.x);
  const alternatives = [sorted];
  if (sorted.length === 1 && sorted[0].kind === 'bar') {
    for (const width of [1800, 1500, 1200].filter((w) => w < sorted[0].width))
      alternatives.push([{ ...sorted[0], width }]);
  } else {
    for (let count = sorted.length - 1; count >= 2; count--) alternatives.push(sorted.slice(0, count));
  }
  for (const group of alternatives) {
    const minX = group[0].x, minY = Math.min(...group.map((i) => i.y));
    const width = Math.max(...group.map((i) => i.x + i.width)) - minX;
    const depth = Math.max(...group.map((i) => i.y + i.depth)) - minY;
    const w = width + 2 * p, d = depth + 2 * p;
    if (w > room.w || d > room.h) continue;

    // At a fixed depth, the same exact strip test used by wall runs yields all legal
    // lateral positions. Try contact depths before the bounded search between them.
    const lo = room.y, hi = room.y + room.h - d, mid = (lo + hi) / 2;
    const events = new Set([lo, mid, hi]);
    for (const point of [...env.outline, ...env.solids.filter((s) => !s.window && inHeight(s, 0, 2000)).flatMap((s) => s.polygon)]) {
      const { y } = runCoordinates(run, point);
      for (const v of [y, y - d]) if (v >= lo && v <= hi) events.add(v);
    }
    for (let v = lo; v < hi; v += 150) events.add(v);
    for (const back of [...events].sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid))) {
      const { spans } = section.free({ from: room.x, to: room.x + room.w }, back, back + d, 0, 2000, true);
      const centre = room.x + (room.w - w) / 2;
      const starts = spans.filter((s) => s.to - s.from >= w - 1e-6)
        .map((s) => Math.max(s.from, Math.min(centre, s.to - w))).sort((a, b) => Math.abs(a - centre) - Math.abs(b - centre));
      for (const start of starts) {
        const placed = group.map((i) => against(run, i, start + p + i.x - minX, back + p + i.y - minY));
        if (placed.every((i) => !env.obstruction(i))) return placed;
      }
    }
  }
  return [];
}
