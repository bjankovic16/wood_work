import { newId } from './ids';
import type { ItemKind, KitchenItem } from './types';

export interface Range {
  min: number;
  max: number;
}

export type SizeField = 'width' | 'depth' | 'height' | 'width2';

export interface KindSpec {
  kind: ItemKind;
  name: string;
  /** Prefix for the automatic item codes (B1, B2, W1, …). */
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

export const ELEVATION_LIMITS: Range = { min: 0, max: 2500 };

/** Minimum front opening of an L-shaped corner unit (arm length minus carcass depth). */
export const CORNER_MIN_OPENING = 200;

const range = (min: number, max: number): Range => ({ min, max });

const base = { width: 600, depth: BASE_DEPTH, height: BASE_HEIGHT, elevation: PLINTH_HEIGHT };
const baseLimits = { width: range(150, 1200), depth: range(250, 800), height: range(300, 1000) };

export const KIND_SPECS: Record<ItemKind, KindSpec> = {
  base: {
    kind: 'base',
    name: 'Base cabinet',
    labelPrefix: 'B',
    defaults: base,
    limits: baseLimits,
  },
  wall: {
    kind: 'wall',
    name: 'Wall cabinet',
    labelPrefix: 'W',
    defaults: { width: 600, depth: WALL_DEPTH, height: WALL_HEIGHT, elevation: WALL_ELEVATION },
    limits: { width: range(150, 1200), depth: range(150, 600), height: range(200, 1200) },
  },
  sink: {
    kind: 'sink',
    name: 'Sink cabinet',
    labelPrefix: 'S',
    defaults: { ...base, width: 800 },
    limits: { ...baseLimits, width: range(400, 1200) },
  },
  oven: {
    kind: 'oven',
    name: 'Oven cabinet',
    labelPrefix: 'O',
    defaults: base,
    limits: { ...baseLimits, width: range(560, 900) },
  },
  dishwasher: {
    kind: 'dishwasher',
    name: 'Dishwasher space',
    labelPrefix: 'DW',
    defaults: { width: 600, depth: BASE_DEPTH, height: PLINTH_HEIGHT + BASE_HEIGHT, elevation: 0 },
    limits: { width: range(450, 600), depth: range(500, 700), height: range(700, 950) },
  },
  fridge: {
    kind: 'fridge',
    name: 'Refrigerator space',
    labelPrefix: 'F',
    defaults: { width: 600, depth: 600, height: 2000, elevation: 0 },
    limits: { width: range(500, 1000), depth: range(500, 800), height: range(800, 2400) },
  },
  drawer: {
    kind: 'drawer',
    name: 'Drawer cabinet',
    labelPrefix: 'D',
    defaults: base,
    limits: { ...baseLimits, width: range(300, 1200) },
  },
  corner: {
    kind: 'corner',
    name: 'Corner cabinet',
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
    name: 'Tall pantry cabinet',
    labelPrefix: 'T',
    defaults: { ...base, height: TALL_HEIGHT },
    limits: { width: range(300, 1200), depth: range(250, 800), height: range(1200, 2600) },
  },
  shelf: {
    kind: 'shelf',
    name: 'Open shelves',
    labelPrefix: 'SH',
    defaults: { width: 800, depth: 300, height: WALL_HEIGHT, elevation: WALL_ELEVATION },
    limits: { width: range(200, 1600), depth: range(100, 600), height: range(100, 1200) },
  },
  filler: {
    kind: 'filler',
    name: 'Filler panel',
    labelPrefix: 'FP',
    defaults: { width: 50, depth: BASE_DEPTH, height: BASE_HEIGHT, elevation: PLINTH_HEIGHT },
    limits: { width: range(10, 300), depth: range(20, 800), height: range(100, 2600) },
  },
  endPanel: {
    kind: 'endPanel',
    name: 'End panel',
    labelPrefix: 'EP',
    // Covers the side of a base unit from the floor to the worktop, including the door thickness.
    defaults: { width: 18, depth: BASE_DEPTH + 20, height: PLINTH_HEIGHT + BASE_HEIGHT, elevation: 0 },
    limits: { width: range(10, 60), depth: range(100, 800), height: range(100, 2600) },
  },
};

export interface LibraryPreset {
  id: string;
  kind: ItemKind;
  title: string;
  /** Overrides the kind's default width. */
  width?: number;
  /** "Custom" presets open the width field for editing right after they are added. */
  custom?: boolean;
}

export interface LibrarySection {
  id: string;
  title: string;
  layout: 'compact' | 'regular';
  presets: LibraryPreset[];
}

const widths = (kind: ItemKind, values: number[]): LibraryPreset[] =>
  values.map((width) => ({ id: `${kind}-${width}`, kind, title: String(width), width }));

export const LIBRARY: LibrarySection[] = [
  {
    id: 'base',
    title: 'Base cabinets',
    layout: 'compact',
    presets: [
      ...widths('base', [300, 400, 450, 500, 600, 800, 900]),
      { id: 'base-custom', kind: 'base', title: 'Custom', custom: true },
    ],
  },
  {
    id: 'wall',
    title: 'Wall cabinets',
    layout: 'compact',
    presets: [
      ...widths('wall', [300, 400, 500, 600, 800]),
      { id: 'wall-custom', kind: 'wall', title: 'Custom', custom: true },
    ],
  },
  {
    id: 'other',
    title: 'Other elements',
    layout: 'regular',
    presets: (
      ['sink', 'oven', 'dishwasher', 'fridge', 'drawer', 'corner', 'tall', 'shelf', 'filler', 'endPanel'] as const
    ).map((kind) => ({ id: kind, kind, title: KIND_SPECS[kind].name })),
  },
];

const PRESETS = new Map(LIBRARY.flatMap((s) => s.presets).map((p) => [p.id, p]));

export function findPreset(id: string): LibraryPreset | undefined {
  return PRESETS.get(id);
}

/** Next free code for a kind, e.g. "B3" when B1 and B2 exist. */
export function nextLabel(kind: ItemKind, items: readonly KitchenItem[]): string {
  const prefix = KIND_SPECS[kind].labelPrefix;
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
): KitchenItem {
  const { defaults } = KIND_SPECS[kind];
  return {
    id: newId(),
    kind,
    label: nextLabel(kind, existing),
    x: 0,
    y: 0,
    rotation: 0,
    width: defaults.width,
    depth: defaults.depth,
    height: defaults.height,
    elevation: defaults.elevation,
    ...(defaults.width2 !== undefined ? { width2: defaults.width2 } : {}),
    ...overrides,
  };
}

export function itemFromPreset(preset: LibraryPreset, existing: readonly KitchenItem[]): KitchenItem {
  return createItem(preset.kind, existing, preset.width !== undefined ? { width: preset.width } : {});
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
