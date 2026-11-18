import { createItem, type LabelPrefixes } from './catalog';
import { createDesign } from './designOps';
import { newId } from './ids';
import type { Design, ItemKind, KitchenItem } from './types';
import { withModuleMaterials } from '../engine/settings';
import type { PairedPhotoId } from './photoReferences';

/** Estimated, editable interpretations. The source photograph is never claimed to supply measurements. */
export function createPhotoDesign(id: PairedPhotoId, name: string, prefixes?: LabelPrefixes): Design {
  const design = createDesign(name);
  const items: KitchenItem[] = [];
  const add = (kind: ItemKind, values: Partial<KitchenItem>) => items.push(createItem(kind, items, values, prefixes));
  if (id === 'ivory-island') {
    design.room = { width: 5600, depth: 4200, height: 2700 };
    design.style = { front: 'white', worktop: 'stone', handles: 'steel', appliances: 'steel', frontProfile: 'shaker', backsplash: 'stone', decor: true };
    add('corner', { x: 0, y: 0 });
    add('corner', { x: 4700, y: 0, rotation: 90 });
    let x = 900;
    for (const [kind, width] of [['base', 600], ['drawer', 800], ['oven', 600], ['drawer', 800], ['base', 600], ['base', 400]] as const) {
      add(kind, { x, y: 0, width });
      x += width;
    }
    for (const [kind, along, width] of [['base', 900, 600], ['fridge', 1500, 900], ['base', 2400, 900]] as const) add(kind, { x: 0, y: along, width, rotation: 270 });
    for (const [kind, along, width] of [['base', 900, 600], ['sink', 1500, 800], ['dishwasher', 2300, 600], ['drawer', 2900, 800]] as const) add(kind, { x: 5040, y: along, width, rotation: 90 });
    for (const [kind, along, width] of [['wall', 900, 800], ['glassWall', 1700, 600], ['hood', 2300, 600], ['glassWall', 2900, 600], ['wall', 3500, 800], ['wall', 4300, 400]] as const) add(kind, { x: along, y: 0, width });
    add('wall', { x: 0, y: 900, width: 600, rotation: 270 });
    add('wall', { x: 0, y: 2400, width: 900, rotation: 270 });
    add('wall', { x: 5280, y: 900, width: 600, rotation: 90 });
    add('wall', { x: 5280, y: 2900, width: 800, rotation: 90 });
    add('bar', { x: 1900, y: 2100, width: 1800, depth: 850 });
    design.openings = [{ id: newId(), kind: 'window', wall: 'right', offset: 1500, width: 1400, height: 1300, sill: 1000 }];
  } else if (id === 'warm-island') {
    design.room = { width: 4200, depth: 5200, height: 2800 };
    design.style = { front: 'cream', worktop: 'marble', handles: 'brass', appliances: 'black', backsplash: 'marble', decor: true };
    add('corner', { x: 0, y: 0, carcassFinish: 'walnut' });
    add('base', { x: 900, y: 0, width: 800, carcassFinish: 'walnut' });
    add('drawer', { x: 1700, y: 0, width: 600, carcassFinish: 'walnut' });
    add('fridge', { x: 2300, y: 0, width: 700 });
    for (const [kind, along, width] of [['oven', 900, 600], ['sink', 1500, 800], ['dishwasher', 2300, 600], ['drawer', 2900, 600]] as const) add(kind, { x: 0, y: along, width, rotation: 270, carcassFinish: 'walnut' });
    add('base', { x: 0, y: 3500, width: 900, depth: 400, height: 900, rotation: 270, carcassFinish: 'walnut' });
    add('glassWall', { x: 0, y: 3500, width: 900, depth: 400, height: 1150, elevation: 1000, rotation: 270, carcassFinish: 'walnut', shelves: 3 });
    add('hood', { x: 0, y: 900, rotation: 270 });
    add('wall', { x: 0, y: 1500, width: 800, rotation: 270, carcassFinish: 'walnut' });
    add('wall', { x: 0, y: 2300, width: 600, rotation: 270, frontFinish: 'walnut', carcassFinish: 'walnut' });
    add('wall', { x: 0, y: 2900, width: 600, rotation: 270, carcassFinish: 'walnut' });
    add('wall', { x: 900, y: 0, width: 800, carcassFinish: 'walnut' });
    add('wall', { x: 1700, y: 0, width: 600, carcassFinish: 'walnut' });
    add('bar', { x: 600, y: 3500, width: 2000, depth: 700 });
    design.openings = [{ id: newId(), kind: 'door', wall: 'top', offset: 3200, width: 900, height: 2100, sill: 0 }];
  } else {
    throw new Error(`No paired photo design for ${id satisfies never}`);
  }
  return { ...design, items, materials: withModuleMaterials(design.materials, items), referencePhoto: { kind: 'builtin', id } };
}
