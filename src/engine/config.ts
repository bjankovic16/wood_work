import { clamp } from '../domain/math';
import type { KitchenStyle } from '../domain/style';
import type {
  ConstructionSettings,
  Design,
  DoorType,
  DrawerLayout,
  EdgeBand,
  ItemKind,
  KitchenItem,
  Material,
} from '../domain/types';

export interface CountRange {
  min: number;
  max: number;
}

/** What can be configured on each type of unit. */
export interface KindOptions {
  doors?: CountRange;
  drawers?: CountRange;
  shelves?: CountRange;
  /** Built from carcass board. */
  carcass: boolean;
  /** Has a back panel. */
  back: boolean;
  /** Has fronts made from the front material. */
  fronts: boolean;
  /** Can have inset doors (the others are always full overlay). */
  inset: boolean;
}

export const KIND_OPTIONS: Record<ItemKind, KindOptions> = {
  base: { doors: { min: 0, max: 4 }, drawers: { min: 0, max: 4 }, shelves: { min: 0, max: 4 }, carcass: true, back: true, fronts: true, inset: true },
  wall: { doors: { min: 0, max: 4 }, shelves: { min: 0, max: 5 }, carcass: true, back: true, fronts: true, inset: true },
  // Sink and oven units stay open at the back for pipes and ventilation.
  sink: { doors: { min: 0, max: 2 }, carcass: true, back: false, fronts: true, inset: true },
  oven: { drawers: { min: 0, max: 1 }, carcass: true, back: false, fronts: true, inset: true },
  dishwasher: { carcass: false, back: false, fronts: true, inset: false },
  fridge: { carcass: false, back: false, fronts: false, inset: false },
  drawer: { drawers: { min: 1, max: 6 }, carcass: true, back: true, fronts: true, inset: true },
  corner: { shelves: { min: 0, max: 3 }, carcass: true, back: true, fronts: true, inset: false },
  tall: { doors: { min: 0, max: 3 }, shelves: { min: 0, max: 8 }, carcass: true, back: true, fronts: true, inset: true },
  shelf: { shelves: { min: 0, max: 6 }, carcass: true, back: true, fronts: false, inset: false },
  filler: { carcass: false, back: false, fronts: true, inset: false },
  endPanel: { carcass: false, back: false, fronts: true, inset: false },
};

/** Settings, materials and edge bands, looked up by id. */
export interface BuildContext {
  settings: ConstructionSettings;
  materials: Map<string, Material>;
  edgeBands: Map<string, EdgeBand>;
  style?: KitchenStyle;
}

export function buildContext(design: Pick<Design, 'construction' | 'materials' | 'edgeBands'> & { style?: KitchenStyle }): BuildContext {
  return {
    settings: design.construction,
    materials: new Map(design.materials.map((m) => [m.id, m])),
    edgeBands: new Map(design.edgeBands.map((b) => [b.id, b])),
    style: design.style,
  };
}

/** A unit's configuration with every default filled in. */
export interface ResolvedConfig {
  doors: number;
  drawers: number;
  shelves: number;
  doorType: DoorType;
  hinge: 'left' | 'right';
  drawerLayout: DrawerLayout;
  carcass: Material;
  back: Material;
  front: Material;
}

/** Units this wide or wider get a pair of doors by default. */
const PAIR_OF_DOORS_FROM = 600;

function defaultCounts(item: KitchenItem): Pick<ResolvedConfig, 'doors' | 'drawers' | 'shelves'> {
  const doors = item.width >= PAIR_OF_DOORS_FROM ? 2 : 1;
  switch (item.kind) {
    case 'base':
      return { doors, drawers: 0, shelves: 1 };
    case 'wall':
      return { doors, drawers: 0, shelves: item.height >= 600 ? 2 : 1 };
    case 'sink':
      return { doors, drawers: 0, shelves: 0 };
    case 'oven':
      return { doors: 0, drawers: 1, shelves: 0 };
    case 'drawer':
      return { doors: 0, drawers: 3, shelves: 0 };
    case 'corner':
      return { doors: 2, drawers: 0, shelves: 1 };
    case 'tall':
      return { doors, drawers: 0, shelves: 4 };
    case 'shelf':
      return { doors: 0, drawers: 0, shelves: 2 };
    default:
      return { doors: 0, drawers: 0, shelves: 0 };
  }
}

/** A material that is missing from the library (should not happen with parsed designs). */
const UNKNOWN_MATERIAL: Material = { id: '', name: 'Unknown board', thickness: 18, sheetLength: 2800, sheetWidth: 2070, grain: false, price: 0 };

function material(ctx: BuildContext, override: string | undefined, kitchenWide: string): Material {
  return (override && ctx.materials.get(override)) || ctx.materials.get(kitchenWide) || UNKNOWN_MATERIAL;
}

export function resolveConfig(item: KitchenItem, ctx: BuildContext): ResolvedConfig {
  const { settings } = ctx;
  const options = KIND_OPTIONS[item.kind];
  const defaults = defaultCounts(item);
  const count = (key: 'doors' | 'drawers' | 'shelves'): number => {
    const range = options[key];
    if (!range) return key === 'doors' && item.kind === 'corner' ? 2 : 0;
    return Math.round(clamp(item[key] ?? defaults[key], range.min, range.max));
  };
  const doors = count('doors');
  const drawers = count('drawers');
  return {
    doors,
    drawers,
    // A unit filled with drawers has no room for shelves.
    shelves: doors === 0 && drawers > 0 ? 0 : count('shelves'),
    doorType: options.inset ? (item.doorType ?? settings.doorType) : 'overlay',
    hinge: item.hinge ?? 'left',
    drawerLayout: item.drawerLayout ?? 'equal',
    carcass: material(ctx, item.carcassMaterial, settings.carcassMaterial),
    back: material(ctx, item.backMaterial, settings.backMaterial),
    front: material(ctx, item.frontMaterial, settings.frontMaterial),
  };
}
