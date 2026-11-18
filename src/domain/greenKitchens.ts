import { CEILING_GAP, PLINTH_HEIGHT, createItem, type LabelPrefixes } from './catalog';
import { createDesign } from './designOps';
import { resizeFromAnchor } from './geometry';
import type { KitchenPreset } from './kitchens';
import type { CabinetPalette } from './kitchenLook';
import type { FrontFinish, KitchenStyle } from './style';
import type { Design, ItemKind, KitchenItem, Room } from './types';
import { withModuleMaterials } from '../engine/settings';

export type GreenKitchen = 'vitrine' | 'compact' | 'walnut' | 'window';

const palette = (front: FrontFinish, worktop: KitchenStyle['worktop'], wallColor: string, floorColor: string, tiled = false): KitchenStyle =>
  ({ front, worktop, handles: 'none', backsplash: worktop === 'marble' ? 'marble' : 'travertine', appliances: 'black', decor: true, wallColor, floorColor, ...(tiled ? { floorPattern: 'tiles' } : {}) });

/** Original editable interpretations of olive cabinetry, timber uppers and glass displays. */
export const GREEN_KITCHENS = [
  { id: 'olive-oak-vitrine', green: 'vitrine', layout: 'l-shape', collection: 'dark', stacked: true, middleFinish: 'oak', room: { width: 4200, depth: 3600, height: 2700 }, style: palette('forest', 'oak', '#77746c', '#c8b99f', true) },
  { id: 'olive-oak-compact', green: 'compact', layout: 'l-shape', collection: 'warm', stacked: true, middleFinish: 'oak', room: { width: 3900, depth: 3600, height: 2700 }, style: palette('olive', 'walnut', '#ece7dd', '#b9946e') },
  { id: 'eucalyptus-walnut', green: 'walnut', layout: 'l-shape', collection: 'dark', stacked: true, middleFinish: 'walnut', room: { width: 4200, depth: 3400, height: 2700 }, style: palette('eucalyptus', 'marble', '#d2cfc5', '#a77d55') },
  { id: 'olive-window-wall', green: 'window', layout: 'straight', collection: 'warm', stacked: true, middleFinish: 'oak', room: { width: 4500, depth: 3400, height: 2700 }, style: palette('olive', 'stone', '#f0ede7', '#d4c3a9', true) },
  { id: 'forest-walnut-vitrine', green: 'vitrine', layout: 'l-shape', collection: 'dark', stacked: true, middleFinish: 'walnut', room: { width: 4500, depth: 3600, height: 2800 }, style: palette('forest', 'marble', '#777c64', '#b8b4ac', true) },
  { id: 'sage-ash-compact', green: 'compact', layout: 'l-shape', collection: 'japandi', stacked: true, middleFinish: 'ash', room: { width: 4200, depth: 3600, height: 2800 }, style: palette('sage', 'travertine', '#f0ede7', '#c6ad8c') },
  { id: 'cashmere-walnut-corner', green: 'walnut', layout: 'l-shape', collection: 'warm', stacked: true, middleFinish: 'walnut', room: { width: 4500, depth: 3400, height: 2800 }, style: palette('cashmere', 'marble', '#d8d0c4', '#b9946e') },
  { id: 'clay-oak-window', green: 'window', layout: 'straight', collection: 'japandi', stacked: true, middleFinish: 'oak', room: { width: 4200, depth: 3400, height: 2700 }, style: palette('clay', 'travertine', '#f0ede7', '#d8d0c4', true) },
] as const satisfies readonly KitchenPreset[];

export function createGreenKitchen(variant: GreenKitchen, room: Room, style: KitchenStyle, palette: CabinetPalette, name: string, prefixes?: LabelPrefixes): Design {
  const design = createDesign(name);
  const items: KitchenItem[] = [];
  const ceiling = room.height - CEILING_GAP;
  const middle = 1500;
  const seam = ceiling - 450;
  const add = (kind: ItemKind, patch: Partial<KitchenItem>) => {
    const item = createItem(kind, items, { ...palette.base, ...patch }, prefixes);
    items.push(item);
    return item;
  };
  const tower = (kind: 'ovenTower' | 'integratedFridge', x: number, y: number, rotation = 0) => {
    add(kind, { x, y, rotation, width: 600, depth: 600, height: seam - PLINTH_HEIGHT });
    add('wall', { x, y, rotation, width: 600, depth: 600, elevation: seam, height: ceiling - seam, doors: 1 });
  };
  const display = (x: number, y: number, rotation = 0) => {
    const height = (ceiling - PLINTH_HEIGHT) / 3;
    for (let row = 0; row < 3; row++) add('glassWall', {
      x, y, rotation, width: 450, depth: 500, height, elevation: PLINTH_HEIGHT + row * height,
      doors: 1, shelves: 1, ...palette.display,
    });
  };
  const run = (kinds: readonly ItemKind[], start: number, end: number, rotation = 0) => {
    const fixedWidth = (kind: ItemKind) => kind === 'sink' ? 900 : kind === 'hob' || kind === 'dishwasher' ? 600 : 0;
    const remaining = end - start - kinds.reduce((sum, kind) => sum + fixedWidth(kind), 0);
    const adjustable = kinds.filter((kind) => !fixedWidth(kind)).length;
    let along = start;
    for (const kind of kinds) {
      const width = fixedWidth(kind) || remaining / adjustable;
      add(kind, {
        x: rotation ? 0 : along, y: rotation ? along : 0,
        rotation, width, ...(kind === 'drawer' || kind === 'hob' ? { drawers: 3, doors: 0, drawerLayout: 'shallowTop' as const } : {}),
      });
      along += width;
    }
  };
  const uppers = (start: number, end: number, rotation = 0, openCorner = false) => {
    for (const [elevation, height] of [[middle, seam - middle], [seam, ceiling - seam]]) {
      const depth = elevation === middle ? 320 : 560;
      const finish = elevation === middle ? palette.middle : palette.upper;
      const shelfWidth = openCorner ? 200 : 0;
      if (shelfWidth) add('shelf', { x: start, y: 0, width: shelfWidth, depth, elevation, height, shelves: 2, ...finish });
      const count = Math.ceil((end - start - shelfWidth) / 600);
      const width = (end - start - shelfWidth) / count;
      for (let index = 0; index < count; index++) add('wall', {
        x: rotation ? 0 : start + shelfWidth + index * width, y: rotation ? start + index * width : 0,
        rotation, width, depth, elevation, height, doors: 1, shelves: 1, ...finish,
      });
    }
  };

  if (variant === 'window') {
    tower('integratedFridge', 0, 0);
    tower('ovenTower', 600, 0);
    run(['sink', 'dishwasher', 'hob', 'drawer'], 1200, room.width);
    uppers(1200, room.width);
  } else {
    add('corner', { x: 0, y: 0 });
    for (const [elevation, height] of [[middle, seam - middle], [seam, ceiling - seam]]) add('corner', {
      x: 0, y: 0, width: 900, width2: 900, depth: elevation === middle ? 320 : 560,
      elevation, height, ...(elevation === middle ? palette.middle : palette.upper),
    });
    if (variant === 'walnut') {
      tower('ovenTower', 0, 900, 270);
      tower('integratedFridge', 0, 1500, 270);
      display(0, 2100, 270);
      run(['sink', 'drawer', 'hob', 'dishwasher', 'drawer'], 900, room.width);
      uppers(900, room.width);
    } else {
      const end = room.width - (variant === 'vitrine' ? 1050 : 600);
      run(['drawer', 'hob', 'drawer'], 900, end);
      tower('ovenTower', end, 0);
      if (variant === 'vitrine') display(end + 600, 0);
      add('sink', { x: 0, y: 900, rotation: 270, width: 900 });
      add('dishwasher', { x: 0, y: 1800, rotation: 270, width: 600 });
      tower('integratedFridge', 0, 2400, 270);
      uppers(900, end, 0, variant === 'compact');
      if (variant === 'compact') uppers(900, 2400, 270);
    }
  }
  const hob = items.find((item) => item.kind === 'hob')!;
  const hood = resizeFromAnchor(hob, { depth: 320 });
  add('hood', { x: hood.x, y: hood.y, rotation: hob.rotation, elevation: middle - 150, height: 150, width: hob.width, depth: 320 });
  const openings = variant === 'vitrine' || variant === 'window'
    ? [{ id: 'green-kitchen-window', kind: 'window' as const, wall: 'left' as const, offset: 900, width: 1500, sill: 1000, height: 1200 }]
    : [];
  return {
    ...design, room: structuredClone(room), items, openings, style: { ...style },
    construction: { ...design.construction, baseTop: 'full', frontGap: 4 },
    materials: withModuleMaterials(design.materials, items),
  };
}
