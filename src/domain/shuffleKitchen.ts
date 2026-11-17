import { hasWorktop } from './catalog';
import { aabbSize, CORNERS, CORNER_ROTATION, cornerPosition, footprintsOverlap, isWallMounted, itemRect, localToRoom, mountingWalls, roomToLocal, WALLS } from './geometry';
import { canPlaceItem, findFreeSpot } from './placement';
import { normalizeAngle } from './polygons';
import { outerWallRuns, type RoomWallRun } from './roomGeometry';
import { LAYOUTS, type LayoutId } from './templates';
import type { KitchenItem, Opening, Room, Wall } from './types';

export type KitchenVariantLayout = LayoutId | 'island';
export interface KitchenVariant {
  id: string;
  layout: KitchenVariantLayout;
  items: KitchenItem[];
}

interface Template {
  id: string;
  layout: KitchenVariantLayout;
  walls: Wall[];
}

const AISLE = 900;

/** The starter-layout families, plus an island, each turned toward the four walls. */
const TEMPLATES: Template[] = [...LAYOUTS.map(({ id }) => id), 'island' as const].flatMap((layout) =>
  WALLS.map((wall, index) => ({
    id: `${layout}-${wall}`,
    layout,
    walls: layout === 'l-shape' ? [wall, WALLS[(index + 3) % 4]]
      : layout === 'u-shape' ? [WALLS[(index + 3) % 4], wall, WALLS[(index + 1) % 4]] : [wall],
  })));

function samePlacement(before: readonly KitchenItem[], after: readonly KitchenItem[]): boolean {
  return after.every((item, index) => Math.abs(item.x - before[index].x) < 0.01
    && Math.abs(item.y - before[index].y) < 0.01 && item.rotation === before[index].rotation);
}

function workZone(item: KitchenItem): number {
  if (['fridge', 'integratedFridge', 'tall', 'ovenTower'].includes(item.kind)) return 0;
  if (item.kind === 'sink') return 1;
  if (item.kind === 'dishwasher') return 2;
  if (['oven', 'hob'].includes(item.kind)) return 4;
  return 3;
}

/** Keeps an extractor with the cooking cabinet it was positioned over. */
function moveAttached(item: KitchenItem, before: KitchenItem, after: KitchenItem): KitchenItem {
  const local = roomToLocal(before, localToRoom(item, 0, 0));
  const nextAnchor = localToRoom(after, local.x, local.y);
  const rotation = normalizeAngle(item.rotation + after.rotation - before.rotation);
  const origin = localToRoom({ ...item, rotation, x: 0, y: 0 }, 0, 0);
  return { ...item, rotation, x: nextAnchor.x - origin.x, y: nextAnchor.y - origin.y };
}

/** Contiguous work zones, balanced across the template's runs rather than randomized. */
function divisions(items: readonly KitchenItem[], lengths: readonly number[]): KitchenItem[][][] {
  if (lengths.length === 1) return [[[...items]]];
  const choices: KitchenItem[][][] = [];
  const split = (from: number, groups: KitchenItem[][]) => {
    if (groups.length === lengths.length - 1) {
      if (from < items.length) choices.push([...groups, items.slice(from)]);
      return;
    }
    for (let end = from + 1; end <= items.length - (lengths.length - groups.length - 1); end++) {
      split(end, [...groups, items.slice(from, end)]);
    }
  };
  split(0, []);
  const score = (groups: KitchenItem[][]) => {
    const fill = groups.map((group, index) => group.reduce((sum, item) => sum + item.width, 0) / Math.max(1, lengths[index]));
    return Math.max(...fill) - Math.min(...fill);
  };
  return choices.sort((a, b) => score(a) - score(b)).slice(0, 24);
}

function islandRun(room: Room, wall: Wall, items: readonly KitchenItem[], wallDepth: number): RoomWallRun[] {
  if (items.some((item) => !hasWorktop(item) || item.height > 1100)) return [];
  const horizontal = wall === 'top' || wall === 'bottom';
  const along = horizontal ? room.width : room.depth;
  const across = horizontal ? room.depth : room.width;
  const width = items.reduce((sum, item) => sum + item.width, 0);
  const depth = Math.max(...items.map((item) => item.depth));
  if (along - width < 2 * AISLE || across - wallDepth - depth < 2 * AISLE) return [];
  const from = (along - width) / 2;
  const near = wallDepth + AISLE;
  return [{ wall, from, to: from + width, offset: wall === 'top' || wall === 'left' ? near : across - near }];
}

function fitTemplate(
  template: Template, room: Room, items: readonly KitchenItem[], openings: readonly Opening[],
  attachments: ReadonlyMap<string, KitchenItem[]>, attachedIds: ReadonlySet<string>,
): KitchenItem[] | null {
  const wallRuns = template.walls.map((wall) => outerWallRuns(room, wall));
  if (wallRuns.some((runs) => runs.length === 0)) return null;
  const corners = items.filter((item) => item.kind === 'corner').sort((a, b) => a.elevation - b.elevation);
  const cornerSlots = CORNERS.filter((corner) => {
    const walls = mountingWalls({ ...items[0], kind: 'corner', rotation: CORNER_ROTATION[corner] });
    return walls.every((wall) => template.walls.includes(wall));
  });
  if (corners.length && !cornerSlots.length) return null;
  const fixed: KitchenItem[] = [];
  for (const item of corners) {
    const candidates = cornerSlots.map((corner) => {
      const rotation = CORNER_ROTATION[corner];
      return { ...item, rotation, ...cornerPosition(room, corner, aabbSize({ ...item, rotation })) };
    });
    const next = candidates.find((candidate) => canPlaceItem(room, fixed, candidate, openings));
    if (!next) return null;
    fixed.push(next);
  }
  const floor = items.filter((item) => item.kind !== 'corner' && !isWallMounted(item) && !attachedIds.has(item.id))
    .sort((a, b) => workZone(a) - workZone(b));
  const uppers = items.filter((item) => item.kind !== 'corner' && isWallMounted(item) && !attachedIds.has(item.id))
    .sort((a, b) => a.elevation - b.elevation);
  const lengths = wallRuns.map((runs) => runs.reduce((sum, run) => sum + run.to - run.from, 0));
  if (template.layout === 'island') lengths.push(lengths[0]);
  for (const groups of divisions(floor, lengths)) {
    const placed = [...fixed];
    let failed = false;
    for (let index = 0; index < groups.length && !failed; index++) {
      const group = groups[index];
      const wallDepth = Math.max(0, ...groups[0].map((item) => item.depth));
      const runs = index < wallRuns.length ? wallRuns[index] : islandRun(room, template.walls[0], group, wallDepth);
      for (const item of group) {
        const spot = findFreeSpot(room, placed, item, openings, false, runs);
        if (!spot) { failed = true; break; }
        const next = { ...item, ...spot };
        placed.push(next);
        for (const attachment of attachments.get(item.id) ?? []) {
          const moved = moveAttached(attachment, item, next);
          if (!canPlaceItem(room, placed, moved, openings)) { failed = true; break; }
          placed.push(moved);
        }
        if (failed) break;
      }
    }
    if (failed) continue;
    // Opposing wall runs need a usable passage, not just non-overlapping cabinets.
    const depthAt = (wall: Wall) => Math.max(0, ...placed.filter((item) => !isWallMounted(item) && mountingWalls(item).includes(wall))
      .map((item) => { const rect = itemRect(item); return wall === 'left' || wall === 'right' ? rect.w : rect.h; }));
    if (template.walls.includes('left') && template.walls.includes('right') && room.width - depthAt('left') - depthAt('right') < AISLE
      || template.walls.includes('top') && template.walls.includes('bottom') && room.depth - depthAt('top') - depthAt('bottom') < AISLE) continue;
    for (const item of uppers) {
      const spot = findFreeSpot(room, placed, item, openings, false, wallRuns.flat());
      if (!spot) { failed = true; break; }
      placed.push({ ...item, ...spot });
    }
    if (failed || placed.length !== items.length) continue;
    const byId = new Map(placed.map((item) => [item.id, item]));
    return items.map((item) => byId.get(item.id)!);
  }
  return null;
}

/** Cycles through complete, feasible starter-layout variants; never changes the inventory. */
export function nextKitchenVariant(
  room: Room, items: readonly KitchenItem[], openings: readonly Opening[] = [],
): KitchenVariant | null {
  if (!items.length || items.some((item) => item.elevation < 0 || item.elevation + item.height > room.height)) return null;
  const attachments = new Map<string, KitchenItem[]>();
  const attachedIds = new Set<string>();
  for (const hood of items.filter((item) => item.kind === 'hood')) {
    const cooker = items.find((item) => ['hob', 'oven'].includes(item.kind) && item.rotation === hood.rotation && footprintsOverlap(item, hood));
    if (!cooker) continue;
    attachments.set(cooker.id, [...attachments.get(cooker.id) ?? [], hood]);
    attachedIds.add(hood.id);
  }
  const variants: KitchenVariant[] = [];
  for (const template of TEMPLATES) {
    const placed = fitTemplate(template, room, items, openings, attachments, attachedIds);
    if (placed && !variants.some((variant) => samePlacement(variant.items, placed))) variants.push({ id: template.id, layout: template.layout, items: placed });
  }
  const current = variants.findIndex((variant) => samePlacement(items, variant.items));
  for (let offset = 1; offset <= variants.length; offset++) {
    const candidate = variants[(current + offset) % variants.length];
    if (!samePlacement(items, candidate.items)) return candidate;
  }
  return null;
}
