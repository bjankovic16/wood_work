import { localDepthExtent, roomToLocal } from '../../domain/geometry';
import type { KitchenItem, Point } from '../../domain/types';

/** Bare-canvas taps only: give small footprints a 44px target without enlarging
 * the drawing, stealing an actual shape's hit or guessing between neighbours. */
export function nearbyCabinet(items: KitchenItem[], point: Point, px: number): KitchenItem | undefined {
  let best: KitchenItem | undefined, nearest = Infinity, second = Infinity;
  for (const item of items) {
    const { x, y } = roomToLocal(item, point);
    const distance = (left: number, top: number, w: number, h: number) => {
      const dx = Math.max(left - x, x - left - w, 0), dy = Math.max(top - y, y - top - h, 0);
      if (dx > Math.max(0, (44 * px - w) / 2) || dy > Math.max(0, (44 * px - h) / 2)) return Infinity;
      return Math.hypot(dx, dy);
    };
    let d = distance(0, 0, item.width, item.depth);
    if (item.kind === 'corner') d = Math.min(d, distance(0, 0, item.depth, localDepthExtent(item)));
    if (d < nearest) { second = nearest; nearest = d; best = item; }
    else second = Math.min(second, d);
  }
  return second - nearest > 2 * px ? best : undefined;
}
