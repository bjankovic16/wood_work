import { isWallMounted } from '../domain/geometry';
import { HANDLE_STYLES } from '../domain/style';
import type { KitchenItem } from '../domain/types';
import { KIND_OPTIONS, resolveConfig, type BuildContext } from './config';
import { frontLayout } from './fronts';
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
  const options = KIND_OPTIONS[item.kind];
  const config = resolveConfig(item, ctx);
  const fronts = frontLayout(item, config, ctx.settings);
  const list = new Map<string, number>();
  const add = (name: string, quantity: number) => {
    if (quantity > 0) list.set(name, (list.get(name) ?? 0) + quantity);
  };

  const hinge = config.doorType === 'inset' ? 'Concealed hinge, inset' : 'Concealed hinge, full overlay';
  for (const front of fronts) {
    if (front.kind !== 'door') continue;
    if (item.kind === 'corner' && front.hinge === 'right') {
      // The second door of a corner unit hangs on the first one.
      add('Corner fold hinge', hingesPerDoor(front.h));
    } else {
      add(hinge, hingesPerDoor(front.h));
    }
  }

  const drawers = fronts.filter((f) => f.kind === 'drawer').length;
  if (drawers > 0) {
    const slide = slideLength(innerDepth(item, config, ctx));
    add(ctx.settings.drawerSystem === 'metal' ? `Metal drawer system set, ${slide} mm` : `Ball-bearing slides, ${slide} mm (pair)`, drawers);
  }

  const handleStyle = ctx.style ? HANDLE_STYLES[ctx.style.handles] : HANDLE_STYLES.steel;
  // Every door and drawer gets a handle; a corner unit's two folding doors share one.
  const handles = item.kind === 'corner' ? 1 : fronts.filter((f) => f.kind !== 'panel' || item.kind === 'dishwasher').length;
  if (handleStyle.color) add(`Handle, ${handleStyle.name.toLowerCase()}`, handles);

  add('Shelf support pin', config.shelves * PINS_PER_SHELF);

  if (options.carcass && isWallMounted(item)) {
    add('Wall cabinet hangers (pair)', 1);
  } else if (options.carcass && item.elevation >= 30) {
    add(`Adjustable leg, ${item.elevation} mm`, item.kind === 'corner' || item.width > SIX_LEGS_FROM ? 6 : 4);
  }

  return [...list].map(([name, quantity]) => ({ name, quantity }));
}
