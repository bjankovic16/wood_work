import { itemRect, localDepthExtent, type Placed } from '../../domain/geometry';
import { angleBasis } from '../../domain/polygons';
import { itemHandles, type HandleId } from '../../domain/snapping';

/** Separate the grips from the move target without enlarging the drawn cabinet. */
export function planResizeEdges(item: Placed, px: number, touch: boolean, resizing?: { handle: HandleId; item: Placed }) {
  const { c, s } = angleBasis(item.rotation);
  return itemHandles(item).map((handle) => {
    const across = handle.field === 'width';
    const extent = across ? item.width : localDepthExtent(item);
    const length = across || item.kind === 'corner' ? item.depth : item.width;
    const outward = handle.id === 'left' ? -1 : 1;
    const nx = across ? c : -s, ny = across ? s : c;
    // Keep an outboard grip under the pointer until release, even as the footprint grows.
    const start = resizing?.handle === handle.id ? resizing.item : item;
    // On touch, 22px for the body plus 14px for the grip's hit radius.
    const offset = Math.max(0, (touch ? 36 : 17) * px - (across ? start.width : localDepthExtent(start)) / 2);
    const { x, y } = handle.point;
    return {
      handle,
      grip: { x: x + outward * offset * nx, y: y + outward * offset * ny },
      offset,
      // On very narrow units only the outboard grips resize; the body still moves.
      edge: extent < (touch ? 44 : 28) * px ? null
        : [x - ny * length / 2, y + nx * length / 2, x + ny * length / 2, y - nx * length / 2],
    };
  });
}

export function planSelectionRect(item: Placed, px: number, touch: boolean) {
  const r = itemRect(item);
  const grips = planResizeEdges(item, px, touch).map((e) => e.grip);
  const x = Math.min(r.x, ...grips.map((p) => p.x)), y = Math.min(r.y, ...grips.map((p) => p.y));
  return { x, y, w: Math.max(r.x + r.w, ...grips.map((p) => p.x)) - x, h: Math.max(r.y + r.h, ...grips.map((p) => p.y)) - y };
}
