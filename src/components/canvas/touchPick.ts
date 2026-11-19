import { footprintsOverlap, localDepthExtent, roomToLocal } from '../../domain/geometry';
import type { KitchenItem, Point } from '../../domain/types';

function candidates(items: KitchenItem[], point: Point, px: number) {
  return items.flatMap((item) => {
    const { x, y } = roomToLocal(item, point);
    const distance = (left: number, top: number, w: number, h: number) => {
      const dx = Math.max(left - x, x - left - w, 0), dy = Math.max(top - y, y - top - h, 0);
      if (dx > Math.max(0, (44 * px - w) / 2) || dy > Math.max(0, (44 * px - h) / 2)) return Infinity;
      return Math.hypot(dx, dy);
    };
    let d = distance(0, 0, item.width, item.depth);
    if (item.kind === 'corner') d = Math.min(d, distance(0, 0, item.depth, localDepthExtent(item)));
    return Number.isFinite(d) ? [{ item, distance: d }] : [];
  });
}

/** Bare-canvas touches only: give small footprints a 44px target without enlarging
 * the drawing, stealing an actual shape's hit or guessing between neighbours. */
export function nearbyCabinet(items: KitchenItem[], point: Point, px: number, upperOutlines: KitchenItem[] = []): KitchenItem | undefined {
  const primary = candidates(items, point, px);
  const tie = 2 * px;
  // Coincident upper tiers must not turn a clear floor near-hit into an ambiguous one.
  const uppers = candidates(upperOutlines, point, px).filter((upper) => !primary.some((floor) =>
    floor.distance <= upper.distance + tie && footprintsOverlap(floor.item, upper.item)));
  const [first, second] = [...primary, ...uppers].sort((a, b) => a.distance - b.distance);
  return first && (!second || second.distance - first.distance > tie) ? first.item : undefined;
}
