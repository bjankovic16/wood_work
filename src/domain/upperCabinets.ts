import { CEILING_CABINET_HEIGHT, CEILING_GAP, ELEVATION_LIMITS, KIND_SPECS, WORKTOP_THICKNESS } from './catalog';
import { footprintRects, footprintsOverlap, isWallMounted, itemRect, localToRoom, mountingWalls, resizeFromAnchor, verticalOverlap } from './geometry';
import { canPlaceItem } from './placement';
import type { KitchenItem, Opening, Room, Wall } from './types';

export interface UpperRow {
  elevation: number;
  top: number;
}

export type StackError = 'unsupported' | 'noSpace' | 'blocked' | 'noSelection';
export type StackPlacement = Pick<KitchenItem, 'x' | 'y' | 'rotation' | 'width' | 'width2' | 'depth' | 'height' | 'elevation' | 'frontFinish' | 'carcassFinish'> & { kind: 'wall' | 'corner' };
export type StackPlan = { ok: true; cabinet: StackPlacement } | { ok: false; reason: StackError };

export function canStackCabinet(item: KitchenItem): boolean {
  if (item.kind === 'corner') return isWallMounted(item);
  const limits = KIND_SPECS.wall.limits.width;
  return ['wall', 'glassWall', 'shelf', 'tall', 'ovenTower', 'integratedFridge'].includes(item.kind)
    && item.width >= limits.min && item.width <= limits.max;
}

function isUpperCabinet(item: KitchenItem): boolean {
  return isWallMounted(item) && ['wall', 'glassWall', 'shelf', 'corner'].includes(item.kind);
}

/** Separate height bands keep full-height display cupboards visible in both rows. */
export function upperCabinetRows(items: readonly KitchenItem[]): UpperRow[] {
  const cabinets = items.filter(isUpperCabinet);
  const elevations = [...new Set(cabinets.map((item) => item.elevation))].sort((a, b) => a - b);
  return elevations.map((elevation, index) => ({
    elevation,
    top: Math.min(elevations[index + 1] ?? Infinity, Math.max(...cabinets.filter((item) => item.elevation === elevation).map((item) => item.elevation + item.height))),
  }));
}

export function inUpperRow(item: KitchenItem, row: UpperRow): boolean {
  return isWallMounted(item) && verticalOverlap(item, { elevation: row.elevation, height: row.top - row.elevation });
}

/** Places a standard closed cupboard above the source, keeping its back against the same surface. */
export function planCabinetAbove(room: Room, items: readonly KitchenItem[], source: KitchenItem, openings: readonly Opening[] = []): StackPlan {
  if (!canStackCabinet(source)) return { ok: false, reason: 'unsupported' };
  const kind = source.kind === 'corner' ? 'corner' : 'wall';
  const limits = KIND_SPECS[kind].limits;
  const elevation = source.elevation + source.height;
  const height = Math.min(CEILING_CABINET_HEIGHT, room.height - CEILING_GAP - elevation);
  if (height < limits.height.min || elevation > ELEVATION_LIMITS.max) return { ok: false, reason: 'noSpace' };
  const depth = Math.max(limits.depth.min, Math.min(limits.depth.max, source.depth));
  const anchored = resizeFromAnchor(source, { depth });
  const cabinet: StackPlacement = {
    kind, x: anchored.x, y: anchored.y, rotation: source.rotation, width: source.width, depth, height, elevation,
    ...(kind === 'corner' ? { width2: source.width2 ?? source.width } : {}),
    ...(source.frontFinish ? { frontFinish: source.frontFinish } : {}),
    ...(source.carcassFinish ? { carcassFinish: source.carcassFinish } : {}),
  };
  if (!canPlaceItem(room, items, { ...source, ...cabinet }, openings)) return { ok: false, reason: 'blocked' };
  return { ok: true, cabinet };
}

/** Cladding meets the actual lowest cupboard, not a fixed-height strip under taller rows. */
export function backsplashTop(item: KitchenItem, items: readonly KitchenItem[], wall: Wall): number {
  const bottom = item.elevation + item.height + WORKTOP_THICKNESS;
  const face = (entry: KitchenItem) => {
    const rect = itemRect(entry);
    return wall === 'top' ? rect.y : wall === 'bottom' ? rect.y + rect.h : wall === 'left' ? rect.x : rect.x + rect.w;
  };
  const above = items.filter((entry) => isUpperCabinet(entry) && mountingWalls(entry).includes(wall)
    && Math.abs(face(entry) - face(item)) <= 1 && entry.elevation > bottom && footprintsOverlap(item, entry));
  return above.length ? Math.min(...above.map((entry) => entry.elevation)) : bottom + 600;
}

/** A touching lower row must not have LED strips drawn through its closed top. */
export function exposedCabinetUnderside(item: KitchenItem, items: readonly KitchenItem[]): boolean {
  const below = items.filter((other) => other.id !== item.id && Math.abs(other.elevation + other.height - item.elevation) < 1);
  return [0.1, 0.5, 0.9].some((fraction) => {
    const point = localToRoom(item, item.width * fraction, Math.max(0, item.depth - 25));
    return !below.some((other) => footprintRects(other).some((rect) =>
      point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h));
  });
}
