import { WORKTOP_THICKNESS } from '../domain/catalog';
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
import type { Design, KitchenItem, Wall } from '../domain/types';
import { KIND_OPTIONS, buildContext, resolveConfig } from './config';
import { frontLayout } from './fronts';
import { SHEET_TRIM } from './nesting';
import { innerDepth, MIN_DRAWER_BOX_HEIGHT, unitParts } from './parts';

export type Severity = 'error' | 'warning';

export interface Issue {
  /** Stable identity, for lists. */
  key: string;
  severity: Severity;
  message: string;
  /** Units involved; the first one is shown when the issue is opened. */
  itemIds: string[];
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

const WORKTOP_KINDS = new Set<KitchenItem['kind']>(['base', 'sink', 'oven', 'drawer', 'dishwasher', 'filler', 'corner']);

/** Top of a floor unit, including its worktop. */
function workingTop(item: KitchenItem): number {
  return item.elevation + item.height + (WORKTOP_KINDS.has(item.kind) ? WORKTOP_THICKNESS : 0);
}

function wallName(wall: Wall): string {
  return `${wall} wall`;
}

/**
 * Checks a design for things a workshop would catch: units that collide or
 * do not fit, gaps that need a filler, doors that will sag, drawers that
 * cannot be built, wall units too low, and units in the way of doors and
 * windows. Errors make the kitchen unbuildable; warnings are worth a look.
 */
export function checkDesign(design: Design): Issue[] {
  const { room, items } = design;
  const ctx = buildContext(design);
  const issues: Issue[] = [];
  const add = (severity: Severity, key: string, message: string, itemIds: string[] = []) =>
    issues.push({ key, severity, message, itemIds });

  // Units colliding with each other or with the room.
  items.forEach((a, i) => {
    for (const b of items.slice(i + 1)) {
      if (verticalOverlap(a, b) && footprintsOverlap(a, b)) {
        add('error', `overlap-${a.id}-${b.id}`, `${a.label} and ${b.label} overlap.`, [a.id, b.id]);
      }
    }
    if (!insideRoom(itemRect(a), room)) add('error', `outside-${a.id}`, `${a.label} sticks out of the room.`, [a.id]);
    if (a.elevation + a.height > room.height) {
      add('error', `ceiling-${a.id}`, `${a.label} reaches ${a.elevation + a.height} mm, above the ${room.height} mm ceiling.`, [a.id]);
    }
  });

  // Unusable gaps along each wall, between units at the same height or between a unit and the wall.
  for (const wall of WALLS) {
    const length = wallLength(room, wall);
    for (const level of ['floor', 'wall'] as const) {
      const spans = items
        .filter((item) => (level === 'wall') === isWallMounted(item) && mountingWalls(item).includes(wall) && isFlushWith(itemRect(item), wall, room))
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
          const between = previous.item && span.item ? `${previous.item.label} and ${span.item.label}` : `${(previous.item ?? span.item)!.label} and the corner`;
          add(
            'warning',
            `gap-${wall}-${level}-${previous.end}`,
            `A ${gap} mm gap between ${between} on the ${wallName(wall)}: close it, or fill it with a filler panel.`,
            [previous.item, span.item].filter((x): x is KitchenItem => x !== null).map((x) => x.id),
          );
        }
        if (span.end > previous.end) previous = { item: span.item, end: span.end };
      }
    }
  }

  for (const item of items) {
    const options = KIND_OPTIONS[item.kind];
    const config = resolveConfig(item, ctx);
    const fronts = frontLayout(item, config, ctx.settings);

    // Wall units too close to the worktop under them.
    if (isWallMounted(item)) {
      const below = items.filter((other) => !isWallMounted(other) && !verticalOverlap(other, item) && footprintsOverlap(other, item) && workingTop(other) <= item.elevation);
      if (below.length > 0) {
        const clearance = item.elevation - Math.max(...below.map(workingTop));
        if (clearance < MIN_WORKTOP_CLEARANCE) {
          add('warning', `low-${item.id}`, `${item.label} hangs only ${clearance} mm above the worktop below it; 500–650 mm is usual.`, [item.id]);
        }
      }
    }

    // Fronts that do not work.
    if (fronts.some((f) => f.w <= 0 || f.h <= 0)) {
      add('error', `fronts-${item.id}`, `The fronts of ${item.label} do not fit: use fewer doors or drawers.`, [item.id]);
    } else {
      const widest = Math.max(0, ...fronts.filter((f) => f.kind === 'door').map((f) => f.w));
      if (widest > MAX_DOOR_WIDTH) {
        add('warning', `wide-door-${item.id}`, `${item.label} has doors ${widest} mm wide; doors over ${MAX_DOOR_WIDTH} mm sag. Use more doors.`, [item.id]);
      }
      const lowest = Math.min(Infinity, ...fronts.filter((f) => f.kind === 'door').map((f) => f.h));
      if (config.drawers > 0 && lowest < MIN_DOOR_HEIGHT) {
        add('warning', `low-door-${item.id}`, `The doors of ${item.label} are only ${lowest} mm high under the drawers; use fewer drawers.`, [item.id]);
      }
      const drawers = fronts.filter((f) => f.kind === 'drawer');
      if (drawers.some((f) => f.h - ctx.settings.drawerBoxGap < MIN_DRAWER_BOX_HEIGHT)) {
        add('warning', `drawer-box-${item.id}`, `The drawer fronts of ${item.label} are too low for a drawer box.`, [item.id]);
      }
      if (drawers.length > 0 && innerDepth(item, config, ctx) < MIN_SLIDE_DEPTH) {
        add('warning', `slides-${item.id}`, `${item.label} is too shallow for drawer slides; they need ${MIN_SLIDE_DEPTH} mm inside.`, [item.id]);
      }
    }

    // Parts that do not fit on their sheet.
    if (options.carcass || options.fronts) {
      for (const part of unitParts(item, ctx)) {
        const material = ctx.materials.get(part.materialId);
        if (!material) continue;
        const usableLength = material.sheetLength - 2 * SHEET_TRIM;
        const usableWidth = material.sheetWidth - 2 * SHEET_TRIM;
        const fits =
          (part.length <= usableLength && part.width <= usableWidth) ||
          (!part.grain && part.length <= usableWidth && part.width <= usableLength);
        if (!fits) {
          add(
            'error',
            `sheet-${item.id}-${part.name}`,
            `${part.name} of ${item.label} (${part.length} × ${part.width}) does not fit on a ${material.sheetLength} × ${material.sheetWidth} sheet of ${material.name}.`,
            [item.id],
          );
        }
      }
    }
  }

  // A fridge right next to an oven gets warm.
  for (const fridge of items.filter((i) => i.kind === 'fridge')) {
    for (const oven of items.filter((i) => i.kind === 'oven')) {
      const grown = { ...itemRect(fridge), x: itemRect(fridge).x - 1, y: itemRect(fridge).y - 1, w: itemRect(fridge).w + 2, h: itemRect(fridge).h + 2 };
      if (footprintRects(oven).some((r) => rectsOverlap(grown, r, 0))) {
        add('warning', `fridge-${fridge.id}-${oven.id}`, `Fridge ${fridge.label} stands right next to oven ${oven.label}; put a unit or a panel between them.`, [fridge.id, oven.id]);
      }
    }
  }

  // Windows and doors.
  for (const opening of design.openings) {
    const name = `${opening.kind === 'door' ? 'door' : 'window'} on the ${wallName(opening.wall)}`;
    if (opening.offset + opening.width > wallLength(room, opening.wall) || opening.sill + opening.height > room.height) {
      add('error', `opening-${opening.id}`, `The ${name} does not fit in the wall.`);
    }
    for (const item of items) {
      if (opening.kind === 'door') {
        const clear = doorClearance(room, opening);
        if (item.elevation < opening.height && footprintRects(item).some((r) => rectsOverlap(r, clear))) {
          add('error', `door-${opening.id}-${item.id}`, `${item.label} blocks the ${name}.`, [item.id]);
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
        lowUnit ? `The ${name} starts at ${opening.sill} mm, below the worktop of ${item.label} (${top} mm).` : `${item.label} covers the ${name}.`,
        [item.id],
      );
    }
  }

  return issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1));
}
