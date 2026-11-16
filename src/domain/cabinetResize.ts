import { sizeLimits, type SizeField } from './catalog';
import { itemInsideRoom, resizeFromAnchor } from './geometry';
import { clamp } from './math';
import type { KitchenItem, Room } from './types';

/** Resize one dimension without moving the back-left anchor or the cabinet's elevation. */
export function cabinetResize(item: KitchenItem, field: SizeField, value: number, room: Room, grid: number): KitchenItem | null {
  const limits = sizeLimits(item, field);
  const max = field === 'height' ? Math.min(limits.max, room.height - item.elevation) : limits.max;
  if (max < limits.min) return null;
  const snapped = Math.round(clamp(grid > 0 ? Math.round(value / grid) * grid : value, limits.min, max));
  const next = field === 'height' ? { ...item, height: snapped } : resizeFromAnchor(item, { [field]: snapped });
  return itemInsideRoom(next, room) ? next : null;
}
