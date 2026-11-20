import { hasWorktop, WORKTOP_THICKNESS } from '../domain/catalog';
import {
  fridgeNextToOven,
  footprintsOverlap,
  isFlushWith,
  isWallMounted,
  itemRect,
  mountingWalls,
  verticalOverlap,
  WALLS,
  footprintPieces,
  itemInsideRoom,
} from '../domain/geometry';
import { alongWall, wallLength } from '../domain/openings';
import { featureFitsRoom, openingFitsRoomWall, roomFeaturePolygon, roomOutline } from '../domain/roomGeometry';
import { polygonContains, polygonsOverlap } from '../domain/polygons';
import { openingIsValid, openingPolygon, partitionPolygon, roomSegments } from '../domain/walls';
import { inUpperRow, upperCabinetRows } from '../domain/upperCabinets';
import type { Design, KitchenItem, Material } from '../domain/types';
import { KIND_OPTIONS, buildContext, resolveConfig } from './config';
import { frontLayout } from './fronts';
import { EN_LABELS, type EngineLabels } from './labels';
import { boardLabel } from './materialLabel';
import { SHEET_TRIM } from './nesting';
import { customPart, innerDepth, MIN_DRAWER_BOX_HEIGHT, unitParts, validPart, type Part } from './parts';

export type Severity = 'error' | 'warning';

export interface Issue {
  /** Stable identity, for lists. */
  key: string;
  severity: Severity;
  message: string;
  /** Units involved; the first one is shown when the issue is opened. */
  itemIds: string[];
  roomFeatureId?: string;
  roomOpeningId?: string;
  roomWallId?: string;
  category?: 'precut';
  /** Re-evaluate this obstacle against the moving cabinet, without running workshop checks. */
  placement?: true;
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

/** Physical obstacles, including exact footprints and height. During a cabinet drag only test affected pairs. */
export function checkPlacement(design: Design, labels: EngineLabels, moving?: ReadonlySet<string>): Issue[] {
  const { room, items } = design;
  const say = labels.checks;
  const issues: Issue[] = [];
  const add = (severity: Severity, key: string, message: string, itemIds: string[] = [], target?: Pick<Issue, 'roomFeatureId' | 'roomOpeningId' | 'roomWallId'>) =>
    issues.push({ severity, key, message, itemIds, placement: true, ...target });

  const affected = moving ? items.filter((item) => moving.has(item.id)) : items;
  for (const a of affected) {
    const i = items.indexOf(a);
    for (const [j, b] of items.entries()) {
      if (j === i || j < i && (!moving || moving.has(b.id))) continue;
      if (verticalOverlap(a, b) && footprintsOverlap(a, b)) {
        const [first, second] = i < j ? [a, b] : [b, a];
        add('error', `overlap-${first.id}-${second.id}`, say.overlap(first.label, second.label), [first.id, second.id]);
      }
    }
    if (!itemInsideRoom(a, room)) add('error', `outside-${a.id}`, say.outside(a.label), [a.id]);
    if (a.elevation + a.height > room.height) {
      add('error', `ceiling-${a.id}`, say.ceiling(a.label, a.elevation + a.height, room.height), [a.id]);
    }
  }

  for (const [index, feature] of (room.features ?? []).entries()) {
    const name = `${labels.roomFeatures[feature.kind]} ${index + 1}`;
    const polygon = roomFeaturePolygon(room, feature);
    if (!moving && !featureFitsRoom(room, feature)) add('error', `room-feature-${feature.id}`, say.roomFeatureOutside(name), [], { roomFeatureId: feature.id });
    if (!polygon.length) continue;
    for (const item of affected) {
      if (item.elevation < room.height && item.elevation + item.height > 0 && footprintPieces(item).some((footprint) => polygonsOverlap(footprint, polygon))) {
        add('error', `structure-${feature.id}-${item.id}`, say.roomFeatureCollision(item.label, name), [item.id], { roomFeatureId: feature.id });
      }
    }
  }
  for (const [index, partition] of (room.partitions ?? []).entries()) {
    const name = `${labels.roomPartition} ${index + 1}`;
    const polygon = partitionPolygon(partition);
    if (!moving && !polygonContains(roomOutline(room), polygon)) {
      add('error', `partition-outside-${partition.id}`, say.roomFeatureOutside(name), [], { roomWallId: roomSegments(room).find((s) => s.partitionId === partition.id)?.id });
    }
    for (const item of affected) {
      if (item.elevation < partition.height && item.elevation + item.height > 0
        && footprintPieces(item).some((p) => polygonsOverlap(p, polygon))) add('error', `partition-${partition.id}-${item.id}`, say.roomFeatureCollision(item.label, name), [item.id]);
    }
  }
  if (!moving) for (const treatment of room.treatments ?? []) {
    const segment = roomSegments(room).find((s) => s.id === treatment.wallId);
    if (!segment || treatment.offset + treatment.width > segment.length + 0.01 || treatment.elevation + treatment.height > segment.height)
      add('error', `treatment-${treatment.id}`, say.roomFeatureOutside(labels.roomTreatment), [], { roomWallId: segment?.id });
  }
  for (const opening of design.openings) {
    if (!moving && (!openingIsValid(room, opening) || (!opening.wallId && !openingFitsRoomWall(room, opening.wall, opening.offset, opening.width)))) {
      add('error', `opening-${opening.id}`, say.openingDoesNotFit(opening.kind, opening.wall), [], { roomOpeningId: opening.id });
    }
    const door = opening.kind === 'door';
    const clear = openingPolygon(room, opening, door ? Math.max(800, opening.width) : 650);
    for (const item of affected) {
      if (door) {
        if (clear.length && item.elevation < opening.height && footprintPieces(item).some((p) => polygonsOverlap(p, clear))) {
          add('error', `door-${opening.id}-${item.id}`, say.blocksDoor(item.label, opening.wall), [item.id]);
        }
        continue;
      }
      const top = workingTop(item);
      if (item.elevation >= opening.sill + opening.height || top <= opening.sill) continue;
      if (opening.wallId) {
        if (!clear.length || !footprintPieces(item).some((p) => polygonsOverlap(p, clear))) continue;
      } else {
        if (!mountingWalls(item).includes(opening.wall) || !isFlushWith(itemRect(item), opening.wall, room)) continue;
        const [start, end] = alongWall(itemRect(item), opening.wall);
        if (end <= opening.offset || start >= opening.offset + opening.width) continue;
      }
      const lowUnit = !isWallMounted(item) && top <= 1100;
      add('warning', `window-${opening.id}-${item.id}`, lowUnit ? say.windowBelowWorktop(opening.wall, opening.sill, item.label, top) : say.coversWindow(item.label, opening.wall), [item.id]);
    }
  }
  return issues;
}

/** Full workshop report: geometry plus construction, parts, suppliers and clearances. */
export function checkDesign(design: Design, labels: EngineLabels = EN_LABELS): Issue[] {
  const { room, items } = design;
  const ctx = buildContext(design, labels);
  const say = labels.checks;
  const issues = checkPlacement(design, labels);
  const add = (severity: Severity, key: string, message: string, itemIds: string[] = [], category?: Issue['category']) =>
    issues.push({ key, severity, message, itemIds, ...(category ? { category } : {}) });
  for (const [index, feature] of (room.features ?? []).entries()) {
    if (feature.kind === 'chimney') issues.push({ key: `chimney-clearance-${feature.id}`, severity: 'warning', category: 'precut', message: say.chimneyClearance(`${labels.roomFeatures[feature.kind]} ${index + 1}`), itemIds: [], roomFeatureId: feature.id });
  }
  if (items.length > 0 && design.style.frontProfile === 'shaker') add('warning', 'front-profile', say.frontProfile, [], 'precut');
  if (design.style.handles === 'none' && items.some((item) => KIND_OPTIONS[item.kind].fronts)) add('warning', 'handleless', say.handleless, [], 'precut');

  // Unusable gaps along each wall, between units at the same height or between a unit and the wall.
  for (const wall of WALLS) {
    const length = wallLength(room, wall);
    for (const level of ['floor', 'wall'] as const) {
      const rows = level === 'wall' ? upperCabinetRows(items) : [undefined];
      for (const row of rows) {
        const spans = items
          .filter((item) => (row ? inUpperRow(item, row) || item.kind === 'endPanel' && verticalOverlap(item, { elevation: row.elevation, height: row.top - row.elevation })
            : !isWallMounted(item)) && mountingWalls(item).includes(wall) && isFlushWith(itemRect(item), wall, room))
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
      add('warning', `manufacturer-${item.id}`, say.specialistModule(item.label), [item.id], 'precut');
    }
    if (item.kind === 'glassWall') add('warning', `glass-${item.id}`, say.glassSupplier(item.label), [item.id], 'precut');
    if (item.kind === 'shelf' && item.shelfForm === 'floating') {
      add('warning', `supports-${item.id}`, say.floatingSupports(item.label), [item.id], 'precut');
      if ((config.shelves + 2) * config.carcass.thickness >= item.height)
        add('error', `shelf-spacing-${item.id}`, say.shelfSpacing(item.label), [item.id]);
    }

    // Wall units too close to the worktop under them.
    if (isWallMounted(item)) {
      const below = items.filter((other) => (hasWorktop(other) || other.kind === 'bar') && footprintsOverlap(other, item) && workingTop(other) <= item.elevation);
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
        if (part.quantity === 0) continue;
        if (!validPart(part) || !material) {
          add('error', `invalid-${item.id}-${part.key}`, say.invalidPart(part.name, item.label), [item.id]);
          continue;
        }
        if (fitsOnSheet(part, material)) continue;
        add(
          'error',
          `sheet-${item.id}-${part.key}`,
          say.partTooLarge(part.name, item.label, part.length, part.width, material, boardLabel(material, labels)),
          [item.id],
        );
      }
    }
  }

  for (const custom of design.customParts) {
    const part = customPart(custom, ctx);
    const material = ctx.materials.get(part.materialId);
    if (part.quantity === 0) continue;
    if (!validPart(part) || !material) {
      add('error', `invalid-custom-${custom.id}`, say.invalidPart(part.name, labels.extra));
      continue;
    }
    if (fitsOnSheet(part, material)) continue;
    add('error', `sheet-custom-${custom.id}`, say.extraTooLarge(part.name, part.length, part.width, material, boardLabel(material, labels)));
  }

  // A fridge right next to an oven gets warm.
  for (const fridge of items.filter((i) => i.kind === 'fridge' || i.kind === 'integratedFridge')) {
    for (const oven of items.filter((i) => i.kind === 'oven' || i.kind === 'ovenTower')) {
      if (fridgeNextToOven(fridge, oven)) {
        add('warning', `fridge-${fridge.id}-${oven.id}`, say.fridgeByOven(fridge.label, oven.label), [fridge.id, oven.id]);
      }
    }
  }

  return issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1));
}
