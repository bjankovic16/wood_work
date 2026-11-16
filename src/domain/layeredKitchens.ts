import { BASE_HEIGHT, CEILING_GAP, PLINTH_HEIGHT, WORKTOP_THICKNESS, createItem, type LabelPrefixes } from './catalog';
import { createDesign } from './designOps';
import type { FrontFinish, KitchenStyle } from './style';
import type { Design, ItemKind, KitchenItem, Room } from './types';
import { withModuleMaterials } from '../engine/settings';

export type LayeredKitchen = 'greige' | 'ivory' | 'olive' | 'graphite';
export type FramedKitchen = 'walnut' | 'oak' | 'stone' | 'island' | 'walnut-island' | 'ash-island' | 'chimney';

/** Dimensioned interpretations of a recessed timber niche inside a full-depth cabinet frame. */
export function createFramedKitchen(variant: FramedKitchen, room: Room, style: KitchenStyle, name: string, prefixes?: LabelPrefixes): Design {
  const design = createDesign(name);
  const items: KitchenItem[] = [];
  const top = room.height - CEILING_GAP;
  const canopy = top - 400;
  const middle = 1700;
  const worktop = PLINTH_HEIGHT + BASE_HEIGHT + WORKTOP_THICKNESS;
  const returnWidth = 18;
  const start = variant === 'chimney' ? 600 : 0;
  const span = room.width - start;
  const island = variant === 'island' || variant === 'walnut-island' || variant === 'ash-island';
  const frameFinish = variant === 'stone' ? 'cashmere' : style.front;
  const timber: FrontFinish = variant === 'ash-island' ? 'ash' : variant === 'walnut' || variant === 'walnut-island' || variant === 'chimney' ? 'walnut' : 'oak';
  const middleFinish = variant === 'stone' ? 'cream' : timber;
  const exposedFridge = variant === 'walnut';
  const ovenOnLeft = exposedFridge;
  const add = (kind: ItemKind, patch: Partial<KitchenItem>) => {
    const item = createItem(kind, items, { frontFinish: style.front, carcassFinish: style.front, ...patch }, prefixes);
    items.push(item);
    return item;
  };
  add('ovenTower', {
    x: ovenOnLeft ? start : room.width - 600, y: 0, width: 600, depth: 600, height: canopy - PLINTH_HEIGHT,
    frontFinish: frameFinish, carcassFinish: frameFinish,
  });
  if (exposedFridge) {
    add('fridge', { x: room.width - 600, y: 0, width: 600, height: 2000 });
    add('wall', { x: room.width - 600, y: 0, width: 600, depth: 600, elevation: 2000, height: canopy - 2000, doors: 1 });
  } else {
    add('integratedFridge', {
      x: start, y: 0, width: 600, depth: 600, height: canopy - PLINTH_HEIGHT,
      frontFinish: frameFinish, carcassFinish: frameFinish,
    });
  }

  let x = start + 600;
  for (const [kind, width] of [['drawer', 900], ['hob', 600], ['dishwasher', 600], ['sink', 900]] as const) {
    add(kind, { x, y: 0, width, ...(['drawer', 'hob'].includes(kind) ? { doors: 0, drawers: 2, drawerLayout: 'equal' as const } : {}) });
    x += width;
  }
  if (span > 4200) add('drawer', { x, y: 0, width: span - 4200, doors: 0, drawers: 2, drawerLayout: 'equal' });

  for (const side of [start + 600, room.width - 600 - returnWidth]) {
    add('endPanel', { x: side, y: 0, width: returnWidth, depth: 600, elevation: worktop, height: canopy - worktop, frontFinish: timber, carcassFinish: timber });
  }
  const innerStart = start + 600 + returnWidth;
  const innerWidth = span - 1200 - 2 * returnWidth;
  for (let index = 0; index < 6; index++) {
    add('wall', {
      x: innerStart + index * innerWidth / 6, y: 0, width: innerWidth / 6, depth: 320,
      elevation: middle, height: canopy - middle, doors: 1, shelves: 1,
      frontFinish: middleFinish, carcassFinish: middleFinish,
    });
  }
  for (let along = start; along < room.width; along += 600) {
    add('wall', {
      x: along, y: 0, width: 600, depth: 600, elevation: canopy, height: 400, doors: 1, shelves: 1,
      frontFinish: frameFinish, carcassFinish: frameFinish,
    });
  }
  add('hood', { x: start + 1500, y: 0, width: 600, depth: 320, elevation: middle - 150, height: 150 });
  if (island) {
    for (let along = 0; along < 1800; along += 600) {
      add('drawer', {
        x: (room.width - 1800) / 2 + along, y: 2200, width: 600, depth: 800, doors: 0, drawers: 2, drawerLayout: 'equal',
        frontFinish: timber, carcassFinish: timber,
      });
    }
  }
  return {
    ...design, room: structuredClone(room), items, style: { ...style },
    construction: { ...design.construction, baseTop: 'full', frontGap: 4 },
    materials: withModuleMaterials(design.materials, items),
  };
}

/** Original, dimensioned interpretations of layered contemporary cabinetry. */
export function createLayeredKitchen(variant: LayeredKitchen, room: Room, style: KitchenStyle, name: string, prefixes?: LabelPrefixes): Design {
  const design = createDesign(name);
  const items: KitchenItem[] = [];
  const top = room.height - CEILING_GAP;
  const rowHeight = 490;
  const lower = top - rowHeight * 2;
  const upper = lower + rowHeight;
  const straight = variant === 'ivory';
  const middleFinish: FrontFinish = variant === 'ivory' ? 'oak' : variant === 'graphite' ? 'walnut' : style.front;
  const topDepth = variant === 'greige' ? 320 : 560;
  const add = (kind: ItemKind, patch: Partial<KitchenItem>) => {
    const item = createItem(kind, items, { frontFinish: style.front, carcassFinish: style.front, ...patch }, prefixes);
    items.push(item);
    return item;
  };
  const tower = (kind: 'ovenTower' | 'integratedFridge', x: number, y: number, rotation: KitchenItem['rotation'] = 0) =>
    add(kind, { x, y, rotation, width: 600, depth: 600, height: top - PLINTH_HEIGHT });

  if (straight) {
    tower('ovenTower', 0, 0);
    let x = 600;
    for (const [kind, width] of [['sink', 800], ['drawer', 600], ['hob', 600], ['dishwasher', 600], ['drawer', 400]] as const) {
      add(kind, { x, y: 0, width, drawerLayout: 'shallowTop' });
      x += width;
    }
  } else {
    add('corner', { x: 0, y: 0 });
    add('sink', { x: 0, y: 900, rotation: 270, width: 600 });
    tower('ovenTower', 0, 1500, 270);
    let x = 900;
    const widths = room.width === 3900 ? [600, 600, 600, 600] : [600, 600, 900, 600];
    widths.forEach((width, index) => {
      add(index === 1 ? 'hob' : 'drawer', { x, y: 0, width, drawerLayout: 'shallowTop' });
      x += width;
    });
    for (const elevation of [lower, upper]) {
      const depth = elevation === lower ? 320 : topDepth;
      const frontFinish = elevation === lower ? middleFinish : style.front;
      add('corner', { x: 0, y: 0, depth, height: rowHeight, elevation, frontFinish, carcassFinish: frontFinish });
      add('wall', { x: 0, y: 900, rotation: 270, width: 600, depth, height: rowHeight, elevation, frontFinish, carcassFinish: frontFinish, shelves: 1 });
    }
  }
  tower('integratedFridge', room.width - 600, 0);

  const start = straight ? 600 : 900;
  const span = room.width - 600 - start;
  const glassWidth = span === 2400 ? 400 : 450;
  for (const x of [start, room.width - 600 - glassWidth]) {
    add('glassWall', { x, y: 0, width: glassWidth, height: rowHeight * 2, elevation: lower, doors: 1, shelves: 3, carcassFinish: 'espresso' });
  }
  const centreStart = start + glassWidth;
  const centreWidth = span - glassWidth * 2;
  const count = centreWidth === 1600 ? 2 : 3;
  for (const elevation of [lower, upper]) {
    const frontFinish = elevation === lower ? middleFinish : style.front;
    for (let index = 0; index < count; index++) {
      add('wall', {
        x: centreStart + index * centreWidth / count, y: 0, width: centreWidth / count,
        depth: elevation === lower ? 320 : topDepth, height: rowHeight, elevation,
        frontFinish, carcassFinish: frontFinish, shelves: 1,
      });
    }
  }
  const hob = items.find((item) => item.kind === 'hob');
  if (!hob) throw new Error('A layered kitchen must include a hob.');
  add('hood', { x: hob.x, y: 0, width: hob.width, elevation: lower - 190, height: 190 });

  return {
    ...design, room: structuredClone(room), items, style: { ...style },
    construction: { ...design.construction, baseTop: 'full' },
    materials: withModuleMaterials(design.materials, items),
  };
}
