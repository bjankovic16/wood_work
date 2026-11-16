import { CEILING_GAP, createItem, type LabelPrefixes } from './catalog';
import { backWall } from './geometry';
import type { KitchenPreset } from './kitchens';
import type { FrontFinish } from './style';
import type { KitchenItem, Room } from './types';

export type KitchenCollection = 'warm' | 'dark' | 'japandi';

const inspiration = {
  warm: 'https://www.pinterest.com/ideas/warm-contemporary-kitchen/955209864754/',
  dark: 'https://www.pinterest.com/ideas/oak-and-walnut-kitchen/919020592506/',
  japandi: 'https://www.pinterest.com/ideas/japandi-kitchen-ideas/943645865735/',
};

function premium(collection: KitchenCollection, front: FrontFinish, worktop: KitchenPreset['style']['worktop']): Pick<KitchenPreset, 'collection' | 'inspiration' | 'style'> {
  return {
    collection, inspiration: inspiration[collection],
    style: {
      front, worktop, handles: collection === 'warm' ? 'brass' : 'none',
      backsplash: worktop === 'black' ? 'black' : worktop === 'marble' ? 'marble' : 'travertine',
      lighting: true, decor: true, appliances: 'black', plinthLighting: collection === 'dark',
    },
  };
}

/** Original compositions; all cabinetry remains ordinary, individually editable modules. */
export const PREMIUM_KITCHENS = [
  { id: 'amber-atelier', layout: 'straight', room: { width: 4200, depth: 3200, height: 2800 }, ...premium('warm', 'cashmere', 'travertine'), middleFinish: 'oak', stacked: true, ovenTower: true, glassFronts: true },
  {
    id: 'travertine-courtyard', layout: 'l-shape',
    room: {
      width: 4600, depth: 3800, height: 2800,
      vertices: [
        { id: 'top', x: 0, y: 0 }, { id: 'right', x: 4600, y: 0 },
        { id: 'courtyard-southeast', x: 4600, y: 3450 }, { id: 'bottom', x: 4250, y: 3800 },
        { id: 'courtyard-southwest', x: 350, y: 3800 }, { id: 'left', x: 0, y: 3450 },
      ],
      treatments: [{ id: 'courtyard-stone', wallId: 'top', offset: 900, width: 2800, elevation: 900, height: 550, finish: 'travertine' }],
    },
    ...premium('warm', 'oak', 'travertine'), middleFinish: 'cream', stacked: true, drawerBases: true, openShelves: true, pantry: true,
  },
  {
    id: 'clay-social', layout: 'straight',
    room: {
      width: 5000, depth: 4400, height: 2800,
      partitions: [{ id: 'clay-screen', start: { x: 800, y: 3500 }, end: { x: 4200, y: 3500 }, thickness: 100, height: 1100 }],
      treatments: [{ id: 'clay-screen-oak', wallId: 'clay-screen:1', offset: 0, width: 3400, elevation: 0, height: 1100, finish: 'oak' }],
    },
    ...premium('warm', 'clay', 'marble'), middleFinish: 'walnut', stacked: true, islandWidth: 2400, glassFronts: true, ovenTower: true, drawerBases: true,
  },
  { id: 'honey-envelope', layout: 'u-shape', room: { width: 4400, depth: 3800, height: 2800 }, ...premium('warm', 'sand', 'marble'), middleFinish: 'oak', stacked: true, openShelves: true, glassFronts: true, pullOut: true },
  { id: 'noir-salon', layout: 'straight', room: { width: 4600, depth: 3600, height: 2900 }, ...premium('dark', 'anthracite', 'marble'), middleFinish: 'walnut', stacked: true, glassFronts: true, ovenTower: true, pantry: true },
  { id: 'espresso-court', layout: 'l-shape', room: { width: 4800, depth: 4000, height: 2900 }, ...premium('dark', 'espresso', 'travertine'), middleFinish: 'cashmere', stacked: true, openShelves: true, drawerBases: true, ovenTower: true },
  {
    id: 'obsidian-island', layout: 'l-shape',
    room: {
      width: 5600, depth: 4600, height: 2900,
      vertices: [
        { id: 'top', x: 0, y: 0 }, { id: 'right', x: 5600, y: 0 },
        { id: 'obsidian-southeast', x: 5600, y: 4150 }, { id: 'bottom', x: 5150, y: 4600 },
        { id: 'obsidian-southwest', x: 450, y: 4600 }, { id: 'left', x: 0, y: 4150 },
      ],
      treatments: [{ id: 'obsidian-marble', wallId: 'top', offset: 900, width: 3200, elevation: 900, height: 550, finish: 'marble' }],
    },
    ...premium('dark', 'anthracite', 'black'), middleFinish: 'walnut', stacked: true, islandWidth: 1800, glassFronts: true, ovenTower: true, pantry: true,
  },
  { id: 'bronze-library', layout: 'u-shape', room: { width: 4600, depth: 4000, height: 2900 }, ...premium('dark', 'walnut', 'black'), middleFinish: 'espresso', stacked: true, glassFronts: true, openShelves: true, drawerBases: true },
  { id: 'sumi-studio', layout: 'straight', room: { width: 3800, depth: 3200, height: 2700 }, ...premium('japandi', 'ash', 'stone'), middleFinish: 'cream', stacked: true, openShelves: true, drawerBases: true },
  { id: 'linen-corner', layout: 'l-shape', room: { width: 4200, depth: 3600, height: 2800 }, ...premium('japandi', 'cream', 'travertine'), middleFinish: 'oak', stacked: true, openShelves: true, pantry: true },
  {
    id: 'moss-pavilion', layout: 'straight',
    room: {
      width: 4800, depth: 4200, height: 2800,
      partitions: [{ id: 'moss-divider', start: { x: 3900, y: 1800 }, end: { x: 3900, y: 3300 }, thickness: 100, height: 1100 }],
      treatments: [{ id: 'moss-divider-ash', wallId: 'moss-divider:1', offset: 0, width: 1500, elevation: 0, height: 1100, finish: 'ash' }],
    },
    ...premium('japandi', 'olive', 'stone'), middleFinish: 'ash', stacked: true, openShelves: true, islandWidth: 1800, breakfastBar: true, ovenTower: true,
  },
  { id: 'shoji-retreat', layout: 'u-shape', room: { width: 4200, depth: 3800, height: 2700 }, ...premium('japandi', 'cashmere', 'travertine'), middleFinish: 'ash', stacked: true, glassFronts: true, openShelves: true, pullOut: true },
  { id: 'pearl-residence', layout: 'l-shape', room: { width: 4400, depth: 3600, height: 2800 }, ...premium('warm', 'cream', 'marble'), middleFinish: 'walnut', stacked: true, glassFronts: true, drawerBases: true, ovenTower: true },
  { id: 'saffron-loft', layout: 'straight', room: { width: 5000, depth: 4200, height: 2800 }, ...premium('warm', 'walnut', 'travertine'), middleFinish: 'cashmere', stacked: true, islandWidth: 1800, openShelves: true, pantry: true },
  { id: 'graphite-penthouse', layout: 'u-shape', room: { width: 4800, depth: 4200, height: 2900 }, ...premium('dark', 'anthracite', 'marble'), middleFinish: 'ash', stacked: true, drawerBases: true, glassFronts: true, ovenTower: true, pantry: true },
  { id: 'velvet-apartment', layout: 'straight', room: { width: 3400, depth: 2800, height: 2700 }, ...premium('dark', 'espresso', 'black'), middleFinish: 'sand', stacked: true, pullOut: true, glassFronts: true },
  { id: 'birch-alcove', layout: 'straight', room: { width: 3200, depth: 2600, height: 2600 }, ...premium('japandi', 'ash', 'stone'), middleFinish: 'white', stacked: true, openShelves: true, drawerBases: true },
  { id: 'serene-courtyard', layout: 'l-shape', room: { width: 5000, depth: 4200, height: 2800 }, ...premium('japandi', 'cashmere', 'travertine'), middleFinish: 'olive', stacked: true, openShelves: true, islandWidth: 1800, breakfastBar: true, pantry: true },
] as const satisfies readonly KitchenPreset[];

export function premiumUpperRows(items: KitchenItem[], room: Room, front: FrontFinish, middle: FrontFinish, prefixes?: LabelPrefixes): KitchenItem[] {
  const result: KitchenItem[] = [];
  for (const item of items) {
    if (item.kind !== 'wall' && item.kind !== 'glassWall' && item.kind !== 'shelf') {
      result.push(item);
      continue;
    }
    const height = 450;
    result.push({ ...item, height, frontFinish: middle, carcassFinish: middle, shelves: item.kind === 'shelf' ? 2 : 1 });
    const depth = 560;
    const wall = backWall(item.rotation);
    result.push(createItem('wall', result, {
      x: wall === 'right' ? room.width - depth : item.x,
      y: wall === 'bottom' ? room.depth - depth : item.y,
      rotation: item.rotation, width: item.width, depth,
      elevation: item.elevation + height, height: room.height - CEILING_GAP - item.elevation - height,
      frontFinish: front, carcassFinish: front, shelves: 1,
    }, prefixes));
  }
  return result;
}
