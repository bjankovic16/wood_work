import { hasWorktop, WORKTOP_THICKNESS } from '../domain/catalog';
import {
  footprintRects,
  footprintsOverlap,
  insideRoom,
  isFlushWith,
  isWallMounted,
  itemRect,
  mountingWalls,
  rectsOverlap,
  verticalOverlap,
  WALLS,
} from '../domain/geometry';
import { alongWall, doorClearance, wallLength } from '../domain/openings';
import { openingFitsRoomWall, roomContainsRect, roomFeatureRect } from '../domain/roomGeometry';
import { inUpperRow, upperCabinetRows } from '../domain/upperCabinets';
import type { Design, KitchenItem, Material } from '../domain/types';
import { KIND_OPTIONS, buildContext, resolveConfig } from './config';
import { frontLayout } from './fronts';
import { EN_LABELS, type EngineLabels } from './labels';
import { SHEET_TRIM } from './nesting';
import { customPart, innerDepth, MIN_DRAWER_BOX_HEIGHT, unitParts, type Part } from './parts';

export type Severity = 'error' | 'warning';

export interface Issue {
  /** Stable identity, for lists. */
  key: string;
  severity: Severity;
  message: string;
  /** Units involved; the first one is shown when the issue is opened. */
  itemIds: string[];
  roomFeatureId?: string;
}

/** Gaps narrower than this between units, or to a wall, cannot be used and should be closed or filled. */
export const MIN_USEFUL_GAP = 100;
/** Doors wider than this tend to sag. */
export const MAX_DOOR_WIDTH = 600;
/** Doors lower than this (below drawers) are not worth having. */
const MIN_DOOR_HEIGHT = 100;
/** Usual minimum space between a worktop and the wall units above it. */
export const MIN_WORKTOP_CLEARANCE = 450;
/** Drawer slides need at least this much depth inside a unit. */
const MIN_SLIDE_DEPTH = 260;

/** Top of a floor unit, including its worktop. */
function workingTop(item: KitchenItem): number {
  return item.elevation + item.height + (hasWorktop(item) ? WORKTOP_THICKNESS : 0);
}

/** Whether a piece can be cut from one sheet; with grain it cannot be turned. */
function fitsOnSheet(part: Part, material: Material): boolean {
  const usableLength = material.sheetLength - 2 * SHEET_TRIM;
  const usableWidth = material.sheetWidth - 2 * SHEET_TRIM;
  return (part.length <= usableLength && part.width <= usableWidth) || (!part.grain && part.length <= usableWidth && part.width <= usableLength);
}

/**
 * Checks a design for things a workshop would catch: units that collide or
 * do not fit, gaps that need a filler, doors that will sag, drawers that
 * cannot be built, wall units too low, and units in the way of doors and
 * windows. Errors make the kitchen unbuildable; warnings are worth a look.
 */
export function checkDesign(design: Design, labels: EngineLabels = EN_LABELS): Issue[] {
  const { room, items } = design;
  const ctx = buildContext(design, labels);
  const say = labels.checks;
  const issues: Issue[] = [];
  const add = (severity: Severity, key: string, message: string, itemIds: string[] = []) =>
    issues.push({ key, severity, message, itemIds });

  // Units colliding with each other or with the room.
  items.forEach((a, i) => {
    for (const b of items.slice(i + 1)) {
      if (verticalOverlap(a, b) && footprintsOverlap(a, b)) {
        add('error', `overlap-${a.id}-${b.id}`, say.overlap(a.label, b.label), [a.id, b.id]);
      }
    }
    if (!footprintRects(a).every((rect) => insideRoom(rect, room))) add('error', `outside-${a.id}`, say.outside(a.label), [a.id]);
    if (a.elevation + a.height > room.height) {
      add('error', `ceiling-${a.id}`, say.ceiling(a.label, a.elevation + a.height, room.height), [a.id]);
    }
  });

  for (const [index, feature] of (room.features ?? []).entries()) {
    const name = `${labels.roomFeatures[feature.kind]} ${index + 1}`;
    const rect = roomFeatureRect(feature);
    if (feature.kind === 'chimney') issues.push({ key: `chimney-clearance-${feature.id}`, severity: 'warning', message: say.chimneyClearance(name), itemIds: [], roomFeatureId: feature.id });
    if (!roomContainsRect(rect, room)) issues.push({ key: `room-feature-${feature.id}`, severity: 'error', message: say.roomFeatureOutside(name), itemIds: [], roomFeatureId: feature.id });
    for (const item of items) {
      if (item.elevation < room.height && item.elevation + item.height > 0 && footprintRects(item).some((footprint) => rectsOverlap(footprint, rect))) {
        add('error', `structure-${feature.id}-${item.id}`, say.roomFeatureCollision(item.label, name), [item.id]);
      }
    }
  }
  if (items.length > 0 && design.style.frontProfile === 'shaker') add('warning', 'front-profile', say.frontProfile);
  if (design.style.handles === 'none' && items.some((item) => KIND_OPTIONS[item.kind].fronts)) add('warning', 'handleless', say.handleless);

  // Unusable gaps along each wall, between units at the same height or between a unit and the wall.
  for (const wall of WALLS) {
    const length = wallLength(room, wall);
    for (const level of ['floor', 'wall'] as const) {
      const rows = level === 'wall' ? upperCabinetRows(items) : [undefined];
      for (const row of rows) {
        const spans = items
          .filter((item) => (level === 'wall') === isWallMounted(item) && (!row || inUpperRow(item, row)) && mountingWalls(item).includes(wall) && isFlushWith(itemRect(item), wall, room))
          .map((item) => {
            const [start, end] = alongWall(itemRect(item), wall);
            return { item, start, end };
          })
          .sort((a, b) => a.start - b.start);
        if (spans.length === 0) continue;
        let previous: { item: KitchenItem | null; end: number } = { item: null, end: 0 };
        for (const span of [...spans, { item: null, start: length, end: length }]) {
          const gap = Math.round(span.start - previous.end);
          if (gap > 0 && gap < MIN_USEFUL_GAP && (previous.item || span.item)) {
            const message =
              previous.item && span.item
                ? say.gap(gap, previous.item.label, span.item.label, wall)
                : say.gap(gap, (previous.item ?? span.item)!.label, null, wall);
            add(
              'warning',
              `gap-${wall}-${level}${rows.length > 1 ? `-${row?.elevation}` : ''}-${previous.end}`,
              message,
              [previous.item, span.item].filter((x): x is KitchenItem => x !== null).map((x) => x.id),
            );
          }
          if (span.end > previous.end) previous = { item: span.item, end: span.end };
        }
      }
    }
  }

  for (const item of items) {
    const options = KIND_OPTIONS[item.kind];
    const config = resolveConfig(item, ctx);
    const fronts = frontLayout(item, config, ctx.settings);
    if (['ovenTower', 'integratedFridge', 'hood', 'hob', 'pullOut', 'bar'].includes(item.kind)) {
      add('warning', `manufacturer-${item.id}`, say.specialistModule(item.label), [item.id]);
    }
    if (item.kind === 'glassWall') add('warning', `glass-${item.id}`, say.glassSupplier(item.label), [item.id]);

    // Wall units too close to the worktop under them.
    if (isWallMounted(item)) {
      const below = items.filter((other) => !isWallMounted(other) && !verticalOverlap(other, item) && footprintsOverlap(other, item) && workingTop(other) <= item.elevation);
      if (below.length > 0) {
        const clearance = item.elevation - Math.max(...below.map(workingTop));
        if (clearance < MIN_WORKTOP_CLEARANCE) {
          add('warning', `low-${item.id}`, say.lowWallUnit(item.label, clearance), [item.id]);
        }
      }
    }

    // Fronts that do not work.
    if (fronts.some((f) => f.w <= 0 || f.h <= 0)) {
      add('error', `fronts-${item.id}`, say.frontsDoNotFit(item.label), [item.id]);
    } else {
      const widest = Math.max(0, ...fronts.filter((f) => f.kind === 'door').map((f) => f.w));
      if (widest > MAX_DOOR_WIDTH) {
        add('warning', `wide-door-${item.id}`, say.wideDoors(item.label, widest, MAX_DOOR_WIDTH), [item.id]);
      }
      const lowest = Math.min(Infinity, ...fronts.filter((f) => f.kind === 'door').map((f) => f.h));
      if (config.drawers > 0 && lowest < MIN_DOOR_HEIGHT) {
        add('warning', `low-door-${item.id}`, say.lowDoors(item.label, lowest), [item.id]);
      }
      const drawers = fronts.filter((f) => f.kind === 'drawer');
      if (drawers.some((f) => f.h - ctx.settings.drawerBoxGap < MIN_DRAWER_BOX_HEIGHT)) {
        add('warning', `drawer-box-${item.id}`, say.lowDrawers(item.label), [item.id]);
      }
      if (drawers.length > 0 && innerDepth(item, config, ctx) < MIN_SLIDE_DEPTH) {
        add('warning', `slides-${item.id}`, say.shallowForSlides(item.label, MIN_SLIDE_DEPTH), [item.id]);
      }
    }

    // Parts that do not fit on their sheet.
    if (options.carcass || options.fronts) {
      for (const part of unitParts(item, ctx, design.partEdits[item.id])) {
        const material = ctx.materials.get(part.materialId);
        if (!material || part.quantity <= 0 || fitsOnSheet(part, material)) continue;
        add(
          'error',
          `sheet-${item.id}-${part.key}`,
          say.partTooLarge(part.name, item.label, part.length, part.width, material, labels.material(material)),
          [item.id],
        );
      }
    }
  }

  for (const custom of design.customParts) {
    const part = customPart(custom, ctx);
    const material = ctx.materials.get(part.materialId);
    if (!material || fitsOnSheet(part, material)) continue;
    add('error', `sheet-custom-${custom.id}`, say.extraTooLarge(part.name, part.length, part.width, material, labels.material(material)));
  }

  // A fridge right next to an oven gets warm.
  for (const fridge of items.filter((i) => i.kind === 'fridge' || i.kind === 'integratedFridge')) {
    for (const oven of items.filter((i) => i.kind === 'oven' || i.kind === 'ovenTower')) {
      const grown = { ...itemRect(fridge), x: itemRect(fridge).x - 1, y: itemRect(fridge).y - 1, w: itemRect(fridge).w + 2, h: itemRect(fridge).h + 2 };
      if (footprintRects(oven).some((r) => rectsOverlap(grown, r, 0))) {
        add('warning', `fridge-${fridge.id}-${oven.id}`, say.fridgeByOven(fridge.label, oven.label), [fridge.id, oven.id]);
      }
    }
  }

  // Windows and doors.
  for (const opening of design.openings) {
    if (!openingFitsRoomWall(room, opening.wall, opening.offset, opening.width) || opening.sill + opening.height > room.height) {
      add('error', `opening-${opening.id}`, say.openingDoesNotFit(opening.kind, opening.wall));
    }
    for (const item of items) {
      if (opening.kind === 'door') {
        const clear = doorClearance(room, opening);
        if (item.elevation < opening.height && footprintRects(item).some((r) => rectsOverlap(r, clear))) {
          add('error', `door-${opening.id}-${item.id}`, say.blocksDoor(item.label, opening.wall), [item.id]);
        }
        continue;
      }
      // Windows: only units standing against that wall, within the window's width.
      if (!mountingWalls(item).includes(opening.wall) || !isFlushWith(itemRect(item), opening.wall, room)) continue;
      const [start, end] = alongWall(itemRect(item), opening.wall);
      if (end <= opening.offset || start >= opening.offset + opening.width) continue;
      const top = isWallMounted(item) ? item.elevation + item.height : workingTop(item);
      if (item.elevation >= opening.sill + opening.height || top <= opening.sill) continue;
      // A base unit only reaches into a window that starts below its worktop.
      const lowUnit = !isWallMounted(item) && top <= 1100;
      add(
        'warning',
        `window-${opening.id}-${item.id}`,
        lowUnit ? say.windowBelowWorktop(opening.wall, opening.sill, item.label, top) : say.coversWindow(item.label, opening.wall),
        [item.id],
      );
    }
  }

  return issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1));
}
