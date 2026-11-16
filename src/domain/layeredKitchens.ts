import { CEILING_GAP, PLINTH_HEIGHT, createItem, type LabelPrefixes } from './catalog';
import { createDesign } from './designOps';
import type { FrontFinish, KitchenStyle } from './style';
import type { Design, ItemKind, KitchenItem, Room } from './types';
import { withModuleMaterials } from '../engine/settings';

export type LayeredKitchen = 'greige' | 'ivory' | 'olive' | 'graphite';

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
