import { isWallMounted } from '../domain/geometry';
import { HANDLE_STYLES } from '../domain/style';
import type { KitchenItem } from '../domain/types';
import { KIND_OPTIONS, resolveConfig, type BuildContext } from './config';
import { frontLayout } from './fronts';
import type { HardwareItem } from './labels';
import { innerDepth, slideLength } from './parts';

/** One kind of fitting to buy. */
export interface Hardware {
  name: string;
  quantity: number;
}

/** Concealed hinges per door, by door height (as hinge makers recommend). */
export function hingesPerDoor(height: number): number {
  if (height <= 900) return 2;
  if (height <= 1600) return 3;
  if (height <= 2000) return 4;
  return 5;
}

/** Units wider than this stand on six legs instead of four. */
const SIX_LEGS_FROM = 900;
/** Adjustable shelves rest on four pins each. */
const PINS_PER_SHELF = 4;

/** Fittings for one unit: hinges, drawer slides, handles, shelf pins, legs and wall hangers. */
export function unitHardware(item: KitchenItem, ctx: BuildContext): Hardware[] {
  // Wall-specific concealed supports are specified separately, not shelf pins or cabinet hangers.
  if (item.kind === 'shelf' && item.shelfForm === 'floating') return [];
  const options = KIND_OPTIONS[item.kind];
  const config = resolveConfig(item, ctx);
  const fronts = frontLayout(item, config, ctx.settings);
  const list = new Map<string, number>();
  const add = (fitting: HardwareItem, quantity: number) => {
    const name = ctx.labels.hardware(fitting);
    if (quantity > 0) list.set(name, (list.get(name) ?? 0) + quantity);
  };

  for (const front of fronts) {
    if (front.kind !== 'door') continue;
    if (item.kind === 'glassWall') {
      add({ kind: 'glassHinge' }, hingesPerDoor(front.h));
    } else if (item.kind === 'corner' && front.hinge === 'right') {
      // The second door of a corner unit hangs on the first one.
      add({ kind: 'cornerHinge' }, hingesPerDoor(front.h));
    } else {
      add({ kind: 'hinge', inset: config.doorType === 'inset' }, hingesPerDoor(front.h));
    }
  }

  const drawers = fronts.filter((f) => f.kind === 'drawer').length;
  if (drawers > 0) {
    const slide = slideLength(innerDepth(item, config, ctx));
    add(ctx.settings.drawerSystem === 'metal' ? { kind: 'metalDrawer', slide } : { kind: 'slides', slide }, drawers);
  }

  const handleStyle = ctx.style?.handles ?? 'steel';
  // Every door and drawer gets a handle; a corner unit's two folding doors share one.
  const handles = item.kind === 'corner' ? 1 : fronts.filter((f) => f.kind !== 'panel' || item.kind === 'dishwasher' || item.kind === 'pullOut').length;
  if (HANDLE_STYLES[handleStyle].color) add({ kind: 'handle', style: handleStyle }, handles);

  add({ kind: 'shelfPin' }, config.shelves * PINS_PER_SHELF);
  if (item.kind === 'pullOut') add({ kind: 'pullOut', width: item.width }, 1);
  if (item.kind === 'bar') add({ kind: 'barLeg', height: item.height - config.carcass.thickness }, 4);
  if (item.kind === 'oven' || item.kind === 'ovenTower') add({ kind: 'appliance', appliance: 'oven', width: item.width }, 1);
  if (item.kind === 'fridge' || item.kind === 'integratedFridge') add({ kind: 'appliance', appliance: 'fridge', width: item.width }, 1);
  if (item.kind === 'hob' || item.kind === 'oven') add({ kind: 'appliance', appliance: 'hob', width: item.width }, 1);
  if (item.kind === 'hood' || item.kind === 'dishwasher') add({ kind: 'appliance', appliance: item.kind, width: item.width }, 1);

  if (options.carcass && isWallMounted(item)) {
    add({ kind: 'hangers' }, 1);
  } else if (options.carcass && item.elevation >= 30) {
    add({ kind: 'leg', height: item.elevation }, item.kind === 'corner' || item.width > SIX_LEGS_FROM ? 6 : 4);
  }

  return [...list].map(([name, quantity]) => ({ name, quantity }));
}
