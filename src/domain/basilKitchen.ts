import { createItem, type LabelPrefixes } from './catalog';
import { createDesign } from './designOps';
import type { KitchenPreset } from './kitchens';
import type { ItemKind, KitchenItem } from './types';

export const BASIL_KITCHEN = {
  id: 'basil-studio', layout: 'u-shape', collection: 'dark', previewView: 'studio', shelfFinish: 'oak',
  room: { width: 3600, depth: 3000, height: 2600 },
  style: {
    front: 'basil', frontProfile: 'shaker', handles: 'black', worktop: 'graphite', backsplash: 'black',
    appliances: 'steel', decor: true, wallColor: '#343336', floorColor: '#3e4042', floorPattern: 'tiles',
    floorTileSize: 450, floorGroutColor: '#57585a',
  },
} as const satisfies KitchenPreset;

/** Estimated dimensions; every run, hood and open shelf belongs to the editable plan. */
export function createBasilKitchen(name: string, prefixes?: LabelPrefixes) {
  const design = createDesign(name);
  const room = { ...BASIL_KITCHEN.room };
  const items: KitchenItem[] = [];
  function add(kind: ItemKind, x: number, y: number, values: Partial<KitchenItem> = {}) {
    items.push(createItem(kind, items, { x, y, carcassFinish: 'basil', ...values }, prefixes));
  }
  add('corner', 0, 0);
  add('corner', room.width - 900, 0, { rotation: 90 });
  add('drawer', 900, 0, { width: 400, drawers: 2 });
  add('sink', 1300, 0, { width: 800 });
  add('dishwasher', 2100, 0);
  add('base', 0, 900, { rotation: 270, width: 550, doors: 1 });
  add('oven', 0, 1450, { rotation: 270 });
  add('drawer', 0, 2050, { rotation: 270, width: 800, drawerLayout: 'shallowTop' });
  for (const y of [900, 1600]) add('base', room.width - 560, y, { rotation: 90, width: 700 });

  const elevation = 1470, height = 800;
  for (const x of [0, 600, 2400, 3000]) add('wall', x, 0, { width: 600, elevation, height, doors: 1 });
  add('shelf', 1200, 0, { width: 1200, depth: 320, elevation, height: 320, shelves: 0, carcassFinish: 'oak', frontFinish: 'oak' });
  add('wall', 1200, 0, { width: 1200, elevation: elevation + 320, height: height - 320, doors: 2 });
  for (const [y, width] of [[320, 1130], [2050, 800]]) {
    add('shelf', 0, y, { rotation: 270, width, depth: 260, elevation, height: 445, shelves: 0,
      shelfForm: 'floating', carcassFinish: 'oak', frontFinish: 'oak' });
  }
  add('hood', 0, 1450, { rotation: 270, elevation: 1510, height: 720 });
  return { ...design, room, items, style: { ...BASIL_KITCHEN.style },
    construction: { ...design.construction, frontGap: 4 } };
}
