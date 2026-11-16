import { CEILING_CABINET_HEIGHT, CEILING_GAP, ELEVATION_LIMITS, KIND_SPECS, WORKTOP_THICKNESS, hasWorktop } from './catalog';
import { footprintRects, footprintsOverlap, isWallMounted, itemRect, localToRoom, mountingWalls, resizeFromAnchor, verticalOverlap } from './geometry';
import { canPlaceItem } from './placement';
import type { KitchenItem, Opening, Room, Wall } from './types';
import { angleBasis } from './polygons';

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

export function isUpperCabinet(item: KitchenItem): boolean {
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

export interface ThreeTierOptions {
  middleHeight: number;
  topHeight: number;
  middleDepth: number;
  topDepth: number;
}

export const DEFAULT_THREE_TIER: ThreeTierOptions = { middleHeight: 720, topHeight: 400, middleDepth: 320, topDepth: 560 };
export type ThreeTierPlan = { ok: true; cabinets: StackPlacement[] } | { ok: false; reason: StackError };

export function canBuildThreeTier(item: KitchenItem): boolean {
  return hasWorktop(item) && !['filler', 'oven', 'hob'].includes(item.kind);
}

/** A connected straight run is planned completely before any units are inserted. */
export function planThreeTier(room: Room, items: readonly KitchenItem[], source: KitchenItem, options: ThreeTierOptions, openings: readonly Opening[] = []): ThreeTierPlan {
  if (!canBuildThreeTier(source)) return { ok: false, reason: 'unsupported' };
  const limits = KIND_SPECS.wall.limits;
  if (![options.middleHeight, options.topHeight].every((n) => Number.isFinite(n) && n >= limits.height.min && n <= limits.height.max)
    || ![options.middleDepth, options.topDepth].every((n) => Number.isFinite(n) && n >= limits.depth.min && n <= limits.depth.max)) return { ok: false, reason: 'noSpace' };
  const elevation = room.height - CEILING_GAP - options.middleHeight - options.topHeight;
  if (elevation - source.elevation - source.height - WORKTOP_THICKNESS < 450) return { ok: false, reason: 'noSpace' };
  const origin = localToRoom(source, 0, 0);
  const { c, s } = angleBasis(source.rotation);
  const candidates = items.filter((item) => canBuildThreeTier(item) && item.kind !== 'corner'
    && item.rotation === source.rotation && item.elevation === source.elevation && item.height === source.height).map((item) => {
    const anchor = localToRoom(item, 0, 0);
    return { item, along: (anchor.x - origin.x) * c + (anchor.y - origin.y) * s, across: -(anchor.x - origin.x) * s + (anchor.y - origin.y) * c };
  }).filter((entry) => Math.abs(entry.across) < 1).sort((a, b) => a.along - b.along);
  let start = 0;
  let end = source.width;
  for (let pass = 0; pass < candidates.length; pass++) for (const candidate of candidates) {
    if (candidate.along <= end + 1 && candidate.along + candidate.item.width >= start - 1) {
      start = Math.min(start, candidate.along);
      end = Math.max(end, candidate.along + candidate.item.width);
    }
  }
  const run = source.kind === 'corner' ? [source] : candidates.filter((e) => e.along >= start - 1 && e.along + e.item.width <= end + 1).map((e) => e.item);
  if (!run.length) return { ok: false, reason: 'noSelection' };
  const cabinets: StackPlacement[] = [];
  const planned: KitchenItem[] = [...items];
  for (const base of run) for (const row of [
    { height: options.middleHeight, depth: options.middleDepth, elevation },
    { height: options.topHeight, depth: options.topDepth, elevation: elevation + options.middleHeight },
  ]) {
    const kind = base.kind === 'corner' ? 'corner' : 'wall';
    const rowLimits = KIND_SPECS[kind].limits;
    if (base.width < rowLimits.width.min || base.width > rowLimits.width.max) return { ok: false, reason: 'unsupported' };
    const anchored = resizeFromAnchor(base, { depth: row.depth });
    const cabinet: StackPlacement = { kind, x: anchored.x, y: anchored.y, rotation: base.rotation, width: base.width,
      ...(kind === 'corner' ? { width2: base.width2 ?? base.width } : {}), ...row,
      ...(base.frontFinish ? { frontFinish: base.frontFinish } : {}), ...(base.carcassFinish ? { carcassFinish: base.carcassFinish } : {}) };
    const item = { ...base, ...cabinet, id: `planned-${cabinets.length}` };
    if (!canPlaceItem(room, planned, item, openings)) return { ok: false, reason: 'blocked' };
    cabinets.push(cabinet);
    planned.push(item);
  }
  return { ok: true, cabinets };
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
