import { footprintsOverlap, isWallMounted, localToRoom, roomToLocal, WALLS } from './geometry';
import { canPlaceItem, findFreeSpot } from './placement';
import { normalizeAngle } from './polygons';
import type { KitchenItem, Opening, Room } from './types';

function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function priority(item: KitchenItem): number {
  if (item.kind === 'corner') return 0;
  if (!isWallMounted(item)) return item.height > 1000 ? 1 : 2;
  return 3;
}

function changed(before: readonly KitchenItem[], after: readonly KitchenItem[]): boolean {
  return after.some((item, index) => item.x !== before[index].x || item.y !== before[index].y || item.rotation !== before[index].rotation);
}

/** Keeps an extractor with the cooking cabinet it was positioned over. */
function moveAttached(item: KitchenItem, before: KitchenItem, after: KitchenItem): KitchenItem {
  const anchor = localToRoom(item, 0, 0);
  const local = roomToLocal(before, anchor);
  const nextAnchor = localToRoom(after, local.x, local.y);
  const rotation = normalizeAngle(item.rotation + after.rotation - before.rotation);
  const origin = localToRoom({ ...item, rotation, x: 0, y: 0 }, 0, 0);
  return { ...item, rotation, x: nextAnchor.x - origin.x, y: nextAnchor.y - origin.y };
}

/** A bounded search; an unsuccessful shuffle never changes or drops any cabinet. */
export function shuffledKitchen(
  room: Room, items: readonly KitchenItem[], openings: readonly Opening[] = [], random: () => number = Math.random,
): KitchenItem[] | null {
  if (items.length === 0 || items.some((item) => item.elevation < 0 || item.elevation + item.height > room.height)) return null;
  const attachments = new Map<string, KitchenItem[]>();
  const attachedIds = new Set<string>();
  for (const hood of items.filter((item) => item.kind === 'hood')) {
    const cooker = items.find((item) => ['hob', 'oven'].includes(item.kind) && item.rotation === hood.rotation && footprintsOverlap(item, hood));
    if (!cooker) continue;
    attachments.set(cooker.id, [...attachments.get(cooker.id) ?? [], hood]);
    attachedIds.add(hood.id);
  }
  for (let attempt = 0; attempt < 24; attempt++) {
    const walls = shuffled(WALLS, random);
    const ordered = shuffled(items.filter((item) => !attachedIds.has(item.id)), random)
      .sort((a, b) => priority(a) - priority(b) || (isWallMounted(a) && isWallMounted(b) ? a.elevation - b.elevation : 0));
    const placed: KitchenItem[] = [];
    for (const item of ordered) {
      const position = findFreeSpot(room, placed, item, openings, false, walls);
      if (!position) break;
      const next = { ...item, ...position };
      placed.push(next);
      let blocked = false;
      for (const attachment of attachments.get(item.id) ?? []) {
        const moved = moveAttached(attachment, item, next);
        if (!canPlaceItem(room, placed, moved, openings)) { blocked = true; break; }
        placed.push(moved);
      }
      if (blocked) break;
    }
    if (placed.length !== items.length) continue;
    const byId = new Map(placed.map((item) => [item.id, item]));
    const result = items.map((item) => byId.get(item.id)!);
    if (changed(items, result)) return result;
  }

  // Dense island layouts may have no spare wall space: try exchanging compatible occupied slots instead.
  const order = shuffled(items, random);
  for (let i = 0; i < order.length; i++) for (const b of order.slice(i + 1)) {
    const a = order[i];
    if (attachments.has(a.id) || attachments.has(b.id) || attachedIds.has(a.id) || attachedIds.has(b.id)
      || a.width !== b.width || a.depth !== b.depth || a.elevation !== b.elevation
      || (a.kind === 'corner') !== (b.kind === 'corner') || (a.width2 ?? a.width) !== (b.width2 ?? b.width)) continue;
    const result = items.map((item) => item.id === a.id ? { ...a, x: b.x, y: b.y, rotation: b.rotation }
      : item.id === b.id ? { ...b, x: a.x, y: a.y, rotation: a.rotation } : item);
    if (changed(items, result) && result.every((item) => canPlaceItem(room, result, item, openings))) return result;
  }
  return null;
}
