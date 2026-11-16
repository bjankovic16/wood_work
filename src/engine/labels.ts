import type { HandleStyle } from '../domain/style';
import type { EdgeBand, Material, OpeningKind, RoomFeatureKind, Wall } from '../domain/types';
import { formatMm } from './format';

/**
 * Everything the engine puts into words, so the cutting list, the hardware
 * list and the checks can be produced in any language. The engine works with
 * the codes below; a language only supplies the text. English is the default,
 * and hand edits are always keyed by the English names, so they survive a
 * change of language.
 */

/** Pieces the construction rules make. */
export type PartName =
  | 'side'
  | 'bottom'
  | 'top'
  | 'frontRail'
  | 'backRail'
  | 'back'
  | 'shelf'
  | 'ovenShelf'
  | 'fixedShelf'
  | 'drawerBottom'
  | 'drawerBack'
  | 'drawerSide'
  | 'drawerFrontBack'
  | 'door'
  | 'drawerFront'
  | 'ovenPanel'
  | 'dishwasherFront'
  | 'fillerPanel'
  | 'panel'
  | 'endPanel'
  | 'glassDoor'
  | 'pullOutFront'
  | 'barTop';

/** A remark on a piece, as data. */
export type PartNote =
  | { kind: 'grooved' }
  | { kind: 'metalDrawer'; slide: number }
  | { kind: 'woodenDrawer'; slide: number }
  | { kind: 'lShaped'; a: number; b: number }
  | { kind: 'cornerBack'; wall: 'A' | 'B' }
  | { kind: 'cornerDoor'; wall: 'A' | 'B' }
  | { kind: 'glassBlank' }
  | { kind: 'barBlank' };

/** A fitting to buy, as data. */
export type HardwareItem =
  | { kind: 'hinge'; inset: boolean }
  | { kind: 'cornerHinge' }
  | { kind: 'metalDrawer'; slide: number }
  | { kind: 'slides'; slide: number }
  | { kind: 'handle'; style: HandleStyle }
  | { kind: 'shelfPin' }
  | { kind: 'hangers' }
  | { kind: 'leg'; height: number }
  | { kind: 'glassHinge' }
  | { kind: 'pullOut'; width: number }
  | { kind: 'barLeg'; height: number }
  | { kind: 'appliance'; appliance: 'oven' | 'fridge' | 'hob' | 'hood' | 'dishwasher'; width: number };

/** The checks' messages. Units are given by their codes. */
export interface CheckLabels {
  overlap: (a: string, b: string) => string;
  outside: (unit: string) => string;
  ceiling: (unit: string, top: number, ceiling: number) => string;
  /** `b` is null for a gap between a unit and the corner. */
  gap: (gap: number, a: string, b: string | null, wall: Wall) => string;
  lowWallUnit: (unit: string, clearance: number) => string;
  frontsDoNotFit: (unit: string) => string;
  wideDoors: (unit: string, width: number, max: number) => string;
  lowDoors: (unit: string, height: number) => string;
  lowDrawers: (unit: string) => string;
  shallowForSlides: (unit: string, depth: number) => string;
  partTooLarge: (part: string, unit: string, length: number, width: number, sheet: Pick<Material, 'sheetLength' | 'sheetWidth'>, material: string) => string;
  extraTooLarge: (part: string, length: number, width: number, sheet: Pick<Material, 'sheetLength' | 'sheetWidth'>, material: string) => string;
  fridgeByOven: (fridge: string, oven: string) => string;
  openingDoesNotFit: (kind: OpeningKind, wall: Wall) => string;
  blocksDoor: (unit: string, wall: Wall) => string;
  coversWindow: (unit: string, wall: Wall) => string;
  windowBelowWorktop: (wall: Wall, sill: number, unit: string, top: number) => string;
  specialistModule: (unit: string) => string;
  glassSupplier: (unit: string) => string;
  roomFeatureCollision: (unit: string, feature: string) => string;
  roomFeatureOutside: (feature: string) => string;
  chimneyClearance: (feature: string) => string;
  frontProfile: string;
  handleless: string;
}

/** Everything the engine says, in one language. */
export interface EngineLabels {
  /** BCP 47 locale, for sorting. */
  locale: string;
  part: Record<PartName, string>;
  note: (note: PartNote) => string;
  hardware: (item: HardwareItem) => string;
  /** A board's name; the built-in boards are named in this language unless they were renamed. */
  material: (material: Material) => string;
  edgeBand: (band: EdgeBand) => string;
  unknownBoard: string;
  /** Units column entry for pieces added by hand. */
  extra: string;
  changedByHand: string;
  leftOutByHand: string;
  /** Banded edges along the length and the width, e.g. "L1 W0". */
  edges: (length: number, width: number) => string;
  /** L-shaped pieces banded only on their inner edges. */
  innerEdges: string;
  /** A size in millimetres, without the unit. */
  mm: (value: number) => string;
  csvHeader: string[];
  checks: CheckLabels;
  roomFeatures: Record<RoomFeatureKind, string>;
}

const HANDLES: Record<HandleStyle, string> = { steel: 'steel bar', black: 'black bar', brass: 'brass bar', none: 'no handles', bronze: 'bronze bar', copper: 'copper bar' };
const APPLIANCES = { oven: 'Built-in oven', fridge: 'Refrigerator', hob: 'Hob', hood: 'Extractor hood', dishwasher: 'Dishwasher' };
const wall = (w: Wall) => `${w} wall`;

export const EN_LABELS: EngineLabels = {
  roomFeatures: { chimney: 'Chimney', column: 'Column', projection: 'Wall projection' },
  locale: 'en',
  part: {
    side: 'Side',
    bottom: 'Bottom',
    top: 'Top',
    frontRail: 'Front rail',
    backRail: 'Back rail',
    back: 'Back',
    shelf: 'Shelf',
    ovenShelf: 'Oven shelf',
    fixedShelf: 'Fixed shelf',
    drawerBottom: 'Drawer bottom',
    drawerBack: 'Drawer back',
    drawerSide: 'Drawer side',
    drawerFrontBack: 'Drawer front/back',
    door: 'Door',
    drawerFront: 'Drawer front',
    ovenPanel: 'Panel under oven',
    dishwasherFront: 'Dishwasher front',
    fillerPanel: 'Filler panel',
    panel: 'Panel',
    endPanel: 'End panel',
    glassDoor: 'Glass door blank',
    pullOutFront: 'Pull-out front',
    barTop: 'Breakfast bar top',
  },
  note: (note) => {
    switch (note.kind) {
      case 'grooved':
        return 'Set into grooves';
      case 'metalDrawer':
        return `Metal drawer system, ${note.slide} mm`;
      case 'woodenDrawer':
        return `Drawer box, ${note.slide} mm slides`;
      case 'lShaped':
        return `L-shaped: cut out ${note.a} × ${note.b} at the inner corner`;
      case 'cornerBack':
        return `Corner unit, wall ${note.wall}`;
      case 'cornerDoor':
        return `Corner door, wall ${note.wall}`;
      case 'glassBlank':
        return 'Supplier to confirm safety glass, polished edges, hinge drilling and clearances';
      case 'barBlank':
        return 'Confirm finished edges, supports and fixings before ordering';
    }
  },
  hardware: (item) => {
    switch (item.kind) {
      case 'hinge':
        return item.inset ? 'Concealed hinge, inset' : 'Concealed hinge, full overlay';
      case 'cornerHinge':
        return 'Corner fold hinge';
      case 'metalDrawer':
        return `Metal drawer system set, ${item.slide} mm`;
      case 'slides':
        return `Ball-bearing slides, ${item.slide} mm (pair)`;
      case 'handle':
        return `Handle, ${HANDLES[item.style]}`;
      case 'shelfPin':
        return 'Shelf support pin';
      case 'hangers':
        return 'Wall cabinet hangers (pair)';
      case 'leg':
        return `Adjustable leg, ${item.height} mm`;
      case 'glassHinge':
        return 'Glass door hinge / clamp (confirm glass specification)';
      case 'pullOut':
        return `Pull-out basket and runner system, ${item.width} mm cabinet (confirm model)`;
      case 'barLeg':
        return `Bar support leg with mounting plate, ${formatMm(item.height)} mm`;
      case 'appliance':
        return `${APPLIANCES[item.appliance]}, ${item.width} mm unit (confirm model)`;
    }
  },
  material: (material) => material.name,
  edgeBand: (band) => band.name,
  unknownBoard: 'Unknown board',
  extra: 'Extra',
  changedByHand: 'changed by hand',
  leftOutByHand: 'left out by hand',
  edges: (length, width) => `L${length} W${width}`,
  innerEdges: 'inner L edges',
  mm: formatMm,
  csvHeader: ['Piece', 'Quantity', 'Length (mm)', 'Width (mm)', 'Thickness (mm)', 'Material', 'Edges', 'Edge band', 'Units', 'Note'],
  checks: {
    overlap: (a, b) => `${a} and ${b} overlap.`,
    outside: (unit) => `${unit} sticks out of the room.`,
    ceiling: (unit, top, ceiling) => `${unit} reaches ${top} mm, above the ${ceiling} mm ceiling.`,
    specialistModule: (unit) => `${unit}: confirm the chosen appliance/system's niche, ventilation, load capacity, fixings and clearances with its manufacturer before production.`,
    glassSupplier: (unit) => `${unit}: glass sizes are blanks; ask the glazing supplier to confirm safety glass, polished edges, hinge holes and operating clearances.`,
    roomFeatureCollision: (unit, feature) => `${unit} overlaps ${feature}; leave the fixed room structure clear.`,
    roomFeatureOutside: (feature) => `${feature} extends beyond the usable room footprint.`,
    chimneyClearance: (feature) => `${feature}: reserve the required fire/heat clearances with a qualified installer. The modeled block is geometry, not a fire-safety calculation.`,
    frontProfile: 'Shaker relief is an appearance preview. The cutting list gives front blanks, not CNC or joinery instructions; confirm the front construction with your supplier.',
    handleless: 'Handleless fronts need a specified push-to-open or profile system. The cutting list gives blanks, not machining or mechanism specifications.',
    gap: (gap, a, b, w) =>
      `A ${gap} mm gap between ${b === null ? `${a} and the corner` : `${a} and ${b}`} on the ${wall(w)}: close it, or fill it with a filler panel.`,
    lowWallUnit: (unit, clearance) => `${unit} hangs only ${clearance} mm above the worktop below it; 500–650 mm is usual.`,
    frontsDoNotFit: (unit) => `The fronts of ${unit} do not fit: use fewer doors or drawers.`,
    wideDoors: (unit, width, max) => `${unit} has doors ${width} mm wide; doors over ${max} mm sag. Use more doors.`,
    lowDoors: (unit, height) => `The doors of ${unit} are only ${height} mm high under the drawers; use fewer drawers.`,
    lowDrawers: (unit) => `The drawer fronts of ${unit} are too low for a drawer box.`,
    shallowForSlides: (unit, depth) => `${unit} is too shallow for drawer slides; they need ${depth} mm inside.`,
    partTooLarge: (part, unit, length, width, sheet, material) =>
      `${part} of ${unit} (${formatMm(length)} × ${formatMm(width)}) does not fit on a ${sheet.sheetLength} × ${sheet.sheetWidth} sheet of ${material}.`,
    extraTooLarge: (part, length, width, sheet, material) =>
      `The extra piece “${part}” (${formatMm(length)} × ${formatMm(width)}) does not fit on a ${sheet.sheetLength} × ${sheet.sheetWidth} sheet of ${material}.`,
    fridgeByOven: (fridge, oven) => `Fridge ${fridge} stands right next to oven ${oven}; put a unit or a panel between them.`,
    openingDoesNotFit: (kind, w) => `The ${kind === 'door' ? 'door' : 'window'} on the ${wall(w)} does not fit in the wall.`,
    blocksDoor: (unit, w) => `${unit} blocks the door on the ${wall(w)}.`,
    coversWindow: (unit, w) => `${unit} covers the window on the ${wall(w)}.`,
    windowBelowWorktop: (w, sill, unit, top) => `The window on the ${wall(w)} starts at ${sill} mm, below the worktop of ${unit} (${top} mm).`,
  },
};
