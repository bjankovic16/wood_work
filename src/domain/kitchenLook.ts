import { setStyle, withOption } from './designOps';
import { attachedSegment, footprintsOverlap, isWallMounted } from './geometry';
import type { KitchenPreset } from './kitchens';
import type { FrontFinish, KitchenStyle } from './style';
import type { Design, KitchenItem } from './types';

type CabinetFinish = Pick<KitchenItem, 'frontFinish' | 'carcassFinish'>;
const matching = (finish: FrontFinish): CabinetFinish => ({ frontFinish: finish, carcassFinish: finish });

/** The same palette dresses the original model and a different set of cabinets. */
export function kitchenLook(preset: KitchenPreset) {
  const { style, framed, layered, green, stacked } = preset;
  const front = style.front;
  // The simpler references use the standard neutral carcass, not a front-coloured one.
  const base: CabinetFinish = framed || layered || green ? matching(front) : {};
  let tall = base, middle = base, upper = base, endPanel = base, island = base;
  let display: CabinetFinish | undefined;
  if (framed) {
    tall = upper = framed === 'stone' ? matching('cashmere') : base;
    const timber = framed === 'ash-island' ? 'ash' : ['walnut', 'walnut-island', 'chimney'].includes(framed) ? 'walnut' : 'oak';
    endPanel = matching(timber);
    middle = matching(preset.middleFinish ?? (framed === 'stone' ? 'cream' : timber));
    if (['island', 'walnut-island', 'ash-island'].includes(framed)) island = endPanel;
  } else if (layered) {
    middle = matching(preset.middleFinish ?? (layered === 'ivory' ? 'oak' : layered === 'graphite' ? 'walnut' : front));
    display = { frontFinish: front, carcassFinish: 'espresso' };
  } else if (green) {
    upper = middle = matching(preset.middleFinish ?? 'oak');
    if (green === 'vitrine' || green === 'walnut') display = { frontFinish: front, carcassFinish: middle.carcassFinish };
  } else if (stacked) {
    middle = matching(preset.middleFinish ?? front);
    upper = matching(front);
  }
  const trim = (framed ? endPanel : middle).frontFinish ?? front;
  return {
    cabinets: { base, tall, middle, upper, towerCap: green ? base : upper, endPanel, island, display },
    style: {
      front, frontProfile: style.frontProfile ?? 'flat', worktop: style.worktop, handles: style.handles,
      backsplash: style.backsplash ?? 'none', appliances: style.appliances ?? 'white',
      windowFrame: style.windowFrame ?? trim, doorFrame: style.doorFrame ?? trim, doorLeaf: style.doorLeaf ?? tall.frontFinish ?? front,
    } satisfies Partial<KitchenStyle>,
  };
}

export type CabinetPalette = ReturnType<typeof kitchenLook>['cabinets'];

const isTower = (item: KitchenItem) => ['tall', 'ovenTower', 'integratedFridge', 'fridge'].includes(item.kind);
const isUpper = (item: KitchenItem) => ['wall', 'glassWall', 'shelf'].includes(item.kind) ||
  (isWallMounted(item) && (item.kind === 'corner' || item.kind === 'filler'));

function finishesForRoom(design: Design, palette: CabinetPalette) {
  const towers = design.items.filter(isTower);
  const uppers = design.items.filter(isUpper);
  const caps = new Set(uppers.filter((item) => towers.some((tower) =>
    item.elevation >= tower.elevation + tower.height - 1 && footprintsOverlap(tower, item))));
  // Use actual mounting levels, not the reference's dimensions. A separate
  // floor-to-ceiling display or a cap over a tower needn't mark a cabinet row.
  const rows = uppers.filter((item) => !caps.has(item) && isWallMounted(item));
  const solid = rows.filter((item) => item.kind !== 'glassWall' && item.kind !== 'filler');
  const first = Math.min(...(solid.length ? solid : rows).map((item) => item.elevation));
  const onLowerGlass = (item: KitchenItem) => rows.some((lower) => lower.kind === 'glassWall'
    && lower.elevation + lower.height <= item.elevation + 1 && footprintsOverlap(lower, item));
  return (item: KitchenItem): CabinetFinish => {
    if (item.kind === 'endPanel') return palette.endPanel;
    if (item.kind === 'glassWall' && palette.display) return palette.display;
    if (isTower(item)) return palette.tall;
    if (isUpper(item)) {
      if (caps.has(item)) return palette.towerCap;
      return item.elevation > first + 1 || onLowerGlass(item) ? palette.upper : palette.middle;
    }
    if (palette.island !== palette.base && item.kind !== 'hood' && !attachedSegment(item, design.room)) return palette.island;
    return palette.base;
  };
}

/** Transfer appearance only. No reference layout, IDs or manufacturing data are generated or copied. */
export function applyKitchenLook(design: Design, preset: KitchenPreset): Design {
  const { cabinets, style } = kitchenLook(preset);
  const finishFor = finishesForRoom(design, cabinets);
  let visibleChange = false;
  const items = design.items.map((item) => {
    const finish = finishFor(item);
    if ((item.frontFinish ?? design.style.front) !== (finish.frontFinish ?? style.front)
      || item.carcassFinish !== finish.carcassFinish) visibleChange = true;
    // Let ordinary fronts (and their plinths) follow subsequent kitchen-wide edits.
    const front = finish.frontFinish === style.front ? undefined : finish.frontFinish;
    return withOption(withOption(item, 'frontFinish', front), 'carcassFinish', finish.carcassFinish);
  });
  const styled = setStyle(design, style);
  // A pictured original can store its matching fronts explicitly. Don't deal
  // the user that same look just because the equivalent inherited form is smaller.
  if (!visibleChange && styled === design) return design;
  return items.some((item, index) => item !== design.items[index]) ? { ...styled, items } : styled;
}
