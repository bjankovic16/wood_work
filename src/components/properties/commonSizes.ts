import { cabinetResize } from '../../domain/cabinetResize';
import { KIND_SPECS, sizeLimits, type SizeField } from '../../domain/catalog';
import { withSize } from '../../domain/designOps';
import { itemInsideRoom } from '../../domain/geometry';
import type { KitchenItem, Room } from '../../domain/types';

/** Shortcuts request exact dimensions, never a silently clamped substitute. */
export function commonSizes(item: KitchenItem, field: SizeField, room: Room, inPlan: boolean) {
  const defaults = KIND_SPECS[item.kind].defaults;
  const typical = field === 'depth' ? (defaults.depth < 400 ? [250, 300, 350, 400] : [450, 500, 560, 600])
    : field === 'height' ? (defaults.height > 1200 ? [1800, 2000, 2200] : [400, 600, 720, 900])
    : item.kind === 'endPanel' ? [16, 18, 19, 25] : item.kind === 'filler' ? [30, 50, 80, 100]
    : item.kind === 'corner' ? [800, 900, 1000, 1200] : item.kind === 'bar' ? [1200, 1500, 1800]
    : [300, 450, 600, 800, 900];
  const limits = sizeLimits(item, field);
  return [...new Set([...typical, defaults[field] ?? defaults.width])].sort((a, b) => a - b)
    .filter((v) => v >= limits.min && v <= limits.max).map((value) => {
      const next = inPlan ? withSize(item, field, value, room) : cabinetResize(item, field, value, room, 0);
      return { value, disabled: !next || next[field] !== value || next.elevation + next.height > room.height || !itemInsideRoom(next, room) };
    });
}
