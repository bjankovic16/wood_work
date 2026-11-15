import { newId } from './ids';
import type { ItemKind, KitchenItem } from './types';

export interface Range {
  min: number;
  max: number;
}

export type SizeField = 'width' | 'depth' | 'height' | 'width2';

/** Start of the automatic unit codes, per kind; the interface language supplies its own. */
export type LabelPrefixes = Record<ItemKind, string>;

/** Names live with the interface language (src/i18n), not here. */
export interface KindSpec {
  kind: ItemKind;
  /** Default prefix for the automatic item codes (B1, B2, W1, …). */
  labelPrefix: string;
  defaults: { width: number; depth: number; height: number; elevation: number; width2?: number };
  limits: { width: Range; depth: Range; height: Range; width2?: Range };
}

/** Standard European kitchen dimensions (mm). */
export const PLINTH_HEIGHT = 100;
/** Laminate worktops are usually 38 mm thick. */
export const WORKTOP_THICKNESS = 38;
export const BASE_HEIGHT = 720;
export const BASE_DEPTH = 560;
export const WALL_HEIGHT = 720;
export const WALL_DEPTH = 320;
export const WALL_ELEVATION = 1450;
/** Tall units are sized so their top lines up with the top of the wall units. */
export const TALL_HEIGHT = WALL_ELEVATION + WALL_HEIGHT - PLINTH_HEIGHT;
export const GLASS_MATERIAL_ID = 'glass-clear-4';
export const BAR_MATERIAL_ID = 'worktop-38';
export const WORKTOP_KINDS = new Set<ItemKind>(['base', 'sink', 'oven', 'drawer', 'dishwasher', 'filler', 'corner', 'pullOut', 'hob']);

export const MODULE_MATERIAL_DEFAULTS: Partial<Record<ItemKind, Partial<Pick<KitchenItem, 'carcassMaterial' | 'frontMaterial'>>>> = {
  glassWall: { frontMaterial: GLASS_MATERIAL_ID },
  bar: { carcassMaterial: BAR_MATERIAL_ID },
};

export const ELEVATION_LIMITS: Range = { min: 0, max: 2500 };

/** Minimum front opening of an L-shaped corner unit (arm length minus carcass depth). */
export const CORNER_MIN_OPENING = 200;

const range = (min: number, max: number): Range => ({ min, max });

const base = { width: 600, depth: BASE_DEPTH, height: BASE_HEIGHT, elevation: PLINTH_HEIGHT };
const baseLimits = { width: range(150, 1200), depth: range(250, 800), height: range(300, 1000) };

export const KIND_SPECS: Record<ItemKind, KindSpec> = {
  base: {
    kind: 'base',
    labelPrefix: 'B',
    defaults: base,
    limits: baseLimits,
  },
  wall: {
    kind: 'wall',
    labelPrefix: 'W',
    defaults: { width: 600, depth: WALL_DEPTH, height: WALL_HEIGHT, elevation: WALL_ELEVATION },
    limits: { width: range(150, 1200), depth: range(150, 600), height: range(200, 1200) },
  },
  sink: {
    kind: 'sink',
    labelPrefix: 'S',
    defaults: { ...base, width: 800 },
    limits: { ...baseLimits, width: range(400, 1200) },
  },
  oven: {
    kind: 'oven',
    labelPrefix: 'O',
    defaults: base,
    limits: { ...baseLimits, width: range(560, 900) },
  },
  dishwasher: {
    kind: 'dishwasher',
    labelPrefix: 'DW',
    defaults: { width: 600, depth: BASE_DEPTH, height: PLINTH_HEIGHT + BASE_HEIGHT, elevation: 0 },
    limits: { width: range(450, 600), depth: range(500, 700), height: range(700, 950) },
  },
  fridge: {
    kind: 'fridge',
    labelPrefix: 'F',
    defaults: { width: 600, depth: 600, height: 2000, elevation: 0 },
    limits: { width: range(500, 1000), depth: range(500, 800), height: range(800, 2400) },
  },
  drawer: {
    kind: 'drawer',
    labelPrefix: 'D',
    defaults: base,
    limits: { ...baseLimits, width: range(300, 1200) },
  },
  corner: {
    kind: 'corner',
    labelPrefix: 'C',
    defaults: { ...base, width: 900, width2: 900 },
    limits: {
      width: range(700, 1400),
      width2: range(700, 1400),
      depth: range(300, 650),
      height: range(300, 1000),
    },
  },
  tall: {
    kind: 'tall',
    labelPrefix: 'T',
    defaults: { ...base, height: TALL_HEIGHT },
    limits: { width: range(300, 1200), depth: range(250, 800), height: range(1200, 2600) },
  },
  shelf: {
    kind: 'shelf',
    labelPrefix: 'SH',
    defaults: { width: 800, depth: 300, height: WALL_HEIGHT, elevation: WALL_ELEVATION },
    limits: { width: range(200, 1600), depth: range(100, 600), height: range(100, 1200) },
  },
  filler: {
    kind: 'filler',
    labelPrefix: 'FP',
    defaults: { width: 50, depth: BASE_DEPTH, height: BASE_HEIGHT, elevation: PLINTH_HEIGHT },
    limits: { width: range(10, 300), depth: range(20, 800), height: range(100, 2600) },
  },
  endPanel: {
    kind: 'endPanel',
    labelPrefix: 'EP',
    // Covers the side of a base unit from the floor to the worktop, including the door thickness.
    defaults: { width: 18, depth: BASE_DEPTH + 20, height: PLINTH_HEIGHT + BASE_HEIGHT, elevation: 0 },
    limits: { width: range(10, 60), depth: range(100, 800), height: range(100, 2600) },
  },
  pullOut: {
    kind: 'pullOut', labelPrefix: 'PO',
    defaults: { ...base, width: 300 },
    limits: { width: range(150, 600), depth: range(450, 700), height: range(600, 1000) },
  },
  glassWall: {
    kind: 'glassWall', labelPrefix: 'GW',
    defaults: { width: 600, depth: WALL_DEPTH, height: WALL_HEIGHT, elevation: WALL_ELEVATION },
    limits: { width: range(300, 1200), depth: range(200, 500), height: range(300, 1200) },
  },
  ovenTower: {
    kind: 'ovenTower', labelPrefix: 'OT',
    defaults: { ...base, height: TALL_HEIGHT },
    limits: { width: range(560, 900), depth: range(500, 800), height: range(1600, 2600) },
  },
  integratedFridge: {
    kind: 'integratedFridge', labelPrefix: 'IF',
    defaults: { ...base, depth: 600, height: TALL_HEIGHT },
    limits: { width: range(560, 900), depth: range(550, 800), height: range(1800, 2600) },
  },
  hood: {
    kind: 'hood', labelPrefix: 'EH',
    defaults: { width: 600, depth: 450, height: 500, elevation: 1550 },
    limits: { width: range(500, 1200), depth: range(300, 650), height: range(150, 900) },
  },
  hob: {
    kind: 'hob', labelPrefix: 'HB', defaults: base, limits: baseLimits,
  },
  bar: {
    kind: 'bar', labelPrefix: 'BB',
    defaults: { width: 1500, depth: 650, height: 900, elevation: 0 },
    limits: { width: range(600, 2400), depth: range(350, 1000), height: range(600, 1200) },
  },
};

/** An element in the library; its tile shows the width, "Custom", or the kind's name. */
export interface LibraryPreset {
  id: string;
  kind: ItemKind;
  /** Overrides the kind's default width. */
  width?: number;
  /** "Custom" presets open the width field for editing right after they are added. */
  custom?: boolean;
  options?: Partial<Pick<KitchenItem, 'depth' | 'height' | 'elevation' | 'doors' | 'drawers' | 'shelves' | 'drawerLayout'>>;
  placement?: 'centre';
  name?: 'island';
}

export interface LibrarySection {
  id: 'base' | 'wall' | 'other' | 'storage' | 'appliances' | 'islands';
  layout: 'compact' | 'regular';
  presets: LibraryPreset[];
}

const widths = (kind: ItemKind, values: number[]): LibraryPreset[] => values.map((width) => ({ id: `${kind}-${width}`, kind, width }));

export const LIBRARY: LibrarySection[] = [
  {
    id: 'base',
    layout: 'compact',
    presets: [...widths('base', [300, 400, 450, 500, 600, 800, 900]), { id: 'base-custom', kind: 'base', custom: true }],
  },
  {
    id: 'wall',
    layout: 'compact',
    presets: [...widths('wall', [300, 400, 500, 600, 800]), { id: 'wall-custom', kind: 'wall', custom: true }],
  },
  {
    id: 'other',
    layout: 'regular',
    presets: (['sink', 'oven', 'dishwasher', 'fridge', 'drawer', 'corner', 'tall', 'shelf', 'filler', 'endPanel'] as const).map((kind) => ({
      id: kind,
      kind,
    })),
  },
  {
    id: 'storage', layout: 'regular',
    presets: [
      ...widths('drawer', [800, 900, 1200]),
      ...widths('pullOut', [300, 450, 600]),
      ...widths('tall', [450, 600, 800]),
      ...widths('glassWall', [600, 800, 900]),
      ...widths('shelf', [600, 900, 1200]),
    ],
  },
  {
    id: 'appliances', layout: 'regular',
    presets: (['hob', 'ovenTower', 'integratedFridge', 'hood'] as const).map((kind) => ({ id: kind, kind })),
  },
  {
    id: 'islands', layout: 'regular',
    presets: [
      { id: 'island-1200', kind: 'drawer', width: 1200, options: { depth: 700, drawerLayout: 'shallowTop' }, placement: 'centre', name: 'island' },
      { id: 'bar-1500', kind: 'bar', width: 1500, placement: 'centre' },
      { id: 'bar-1800', kind: 'bar', width: 1800, placement: 'centre' },
    ],
  },
];

const PRESETS = new Map(LIBRARY.flatMap((s) => s.presets).map((p) => [p.id, p]));

export function findPreset(id: string): LibraryPreset | undefined {
  return PRESETS.get(id);
}

/** Next free code for a kind, e.g. "B3" when B1 and B2 exist. */
export function nextLabel(kind: ItemKind, items: readonly KitchenItem[], prefixes?: LabelPrefixes): string {
  const prefix = prefixes?.[kind] ?? KIND_SPECS[kind].labelPrefix;
  const pattern = new RegExp(`^${prefix}(\\d+)$`);
  let max = 0;
  for (const item of items) {
    const match = pattern.exec(item.label);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${prefix}${max + 1}`;
}

export function createItem(
  kind: ItemKind,
  existing: readonly KitchenItem[],
  overrides: Partial<KitchenItem> = {},
  prefixes?: LabelPrefixes,
): KitchenItem {
  const { defaults } = KIND_SPECS[kind];
  return {
    id: newId(),
    kind,
    label: nextLabel(kind, existing, prefixes),
    x: 0,
    y: 0,
    rotation: 0,
    width: defaults.width,
    depth: defaults.depth,
    height: defaults.height,
    elevation: defaults.elevation,
    ...(defaults.width2 !== undefined ? { width2: defaults.width2 } : {}),
    ...MODULE_MATERIAL_DEFAULTS[kind],
    ...overrides,
  };
}

export function itemFromPreset(preset: LibraryPreset, existing: readonly KitchenItem[], prefixes?: LabelPrefixes): KitchenItem {
  return createItem(preset.kind, existing, { ...preset.options, ...(preset.width !== undefined ? { width: preset.width } : {}) }, prefixes);
}

/** Allowed range for a dimension, taking the item's other dimensions into account. */
export function sizeLimits(
  item: Pick<KitchenItem, 'kind' | 'width' | 'depth' | 'width2'>,
  field: SizeField,
): Range {
  const { limits } = KIND_SPECS[item.kind];
  const base = field === 'width2' ? (limits.width2 ?? limits.width) : limits[field];
  if (item.kind === 'corner') {
    if (field === 'width' || field === 'width2') {
      return { min: Math.max(base.min, item.depth + CORNER_MIN_OPENING), max: base.max };
    }
    if (field === 'depth') {
      const shortestArm = Math.min(item.width, item.width2 ?? item.width);
      return { min: base.min, max: Math.max(base.min, Math.min(base.max, shortestArm - CORNER_MIN_OPENING)) };
    }
  }
  return base;
}
