import { createItem, nextLabel, type LabelPrefixes } from './catalog';
import { createDesign } from './designOps';
import { backWall, footprintsOverlap, isWallMounted, verticalOverlap } from './geometry';
import type { BacksplashFinish, FrontFinish, HandleStyle, KitchenStyle, WorktopFinish } from './style';
import { buildLayout, type LayoutId } from './templates';
import type { Design, KitchenItem, Room } from './types';
import { withModuleMaterials } from '../engine/settings';
import { createLayeredKitchen, type LayeredKitchen } from './layeredKitchens';
import { PREMIUM_KITCHENS, premiumUpperRows, type KitchenCollection } from './premiumKitchens';

export interface KitchenPreset {
  id: string;
  layout: LayoutId;
  room: Room;
  style: KitchenStyle;
  openShelves?: boolean;
  drawerBases?: boolean;
  islandWidth?: number;
  glassFronts?: boolean;
  ovenTower?: boolean;
  pantry?: boolean;
  pullOut?: boolean;
  breakfastBar?: boolean;
  layered?: LayeredKitchen;
  collection?: KitchenCollection;
  inspiration?: string;
  stacked?: boolean;
  middleFinish?: FrontFinish;
}

function warmStyle(front: FrontFinish, worktop: WorktopFinish, handles: HandleStyle = 'brass', backsplash: BacksplashFinish = 'travertine'): KitchenStyle {
  return { front, worktop, handles, backsplash, lighting: true, decor: true };
}

export const KITCHEN_DESIGNS = [
  { id: 'nordic-light', layout: 'straight', room: { width: 3600, depth: 2800, height: 2600 }, style: warmStyle('ash', 'marble', 'brass', 'marble'), glassFronts: true },
  { id: 'oak-studio', layout: 'straight', room: { width: 3800, depth: 2800, height: 2600 }, style: warmStyle('oak', 'travertine', 'bronze'), openShelves: true, glassFronts: true, ovenTower: true },
  { id: 'soft-sage', layout: 'straight', room: { width: 3400, depth: 2600, height: 2600 }, style: warmStyle('sage', 'stone'), glassFronts: true, pullOut: true },
  { id: 'city-graphite', layout: 'straight', room: { width: 3200, depth: 2600, height: 2600 }, style: warmStyle('anthracite', 'oak', 'bronze'), drawerBases: true },
  { id: 'cream-and-oak', layout: 'straight', room: { width: 4000, depth: 2800, height: 2600 }, style: warmStyle('cashmere', 'oak'), openShelves: true, glassFronts: true, pantry: true },
  { id: 'warm-minimal', layout: 'l-shape', room: { width: 3800, depth: 3200, height: 2600 }, style: warmStyle('cream', 'marble', 'none', 'marble'), glassFronts: true, ovenTower: true },
  { id: 'sage-and-black', layout: 'l-shape', room: { width: 4000, depth: 3400, height: 2600 }, style: warmStyle('olive', 'black', 'bronze'), drawerBases: true, glassFronts: true, ovenTower: true, pantry: true },
  { id: 'coastal-blue', layout: 'l-shape', room: { width: 4200, depth: 3200, height: 2600 }, style: warmStyle('navy', 'travertine'), openShelves: true, glassFronts: true, pantry: true, pullOut: true },
  { id: 'walnut-retreat', layout: 'l-shape', room: { width: 4200, depth: 3400, height: 2600 }, style: warmStyle('walnut', 'marble', 'brass', 'marble'), glassFronts: true, ovenTower: true, pantry: true },
  { id: 'white-and-stone', layout: 'l-shape', room: { width: 3600, depth: 3000, height: 2600 }, style: warmStyle('white', 'travertine', 'bronze'), glassFronts: true, pullOut: true },
  { id: 'urban-oak', layout: 'l-shape', room: { width: 4400, depth: 3400, height: 2600 }, style: warmStyle('oak', 'black', 'bronze'), drawerBases: true, glassFronts: true, ovenTower: true, pantry: true },
  { id: 'soft-grey', layout: 'l-shape', room: { width: 3800, depth: 3200, height: 2600 }, style: warmStyle('taupe', 'marble', 'bronze'), openShelves: true, glassFronts: true, pantry: true },
  { id: 'midnight-brass', layout: 'u-shape', room: { width: 4000, depth: 3400, height: 2600 }, style: warmStyle('espresso', 'marble', 'brass', 'marble'), glassFronts: true, ovenTower: true, pantry: true },
  { id: 'scandi-u', layout: 'u-shape', room: { width: 3600, depth: 3200, height: 2600 }, style: warmStyle('white', 'oak'), openShelves: true, glassFronts: true },
  { id: 'slate-and-stone', layout: 'u-shape', room: { width: 4200, depth: 3600, height: 2600 }, style: warmStyle('sand', 'stone', 'bronze'), drawerBases: true, glassFronts: true, ovenTower: true, pantry: true },
  { id: 'warm-walnut', layout: 'u-shape', room: { width: 4000, depth: 3400, height: 2600 }, style: warmStyle('walnut', 'travertine'), glassFronts: true, pantry: true },
  { id: 'calm-cream', layout: 'u-shape', room: { width: 3800, depth: 3400, height: 2600 }, style: warmStyle('cashmere', 'marble', 'bronze', 'marble'), glassFronts: true, ovenTower: true, pullOut: true },
  { id: 'oak-island', layout: 'l-shape', room: { width: 4800, depth: 4000, height: 2600 }, style: warmStyle('oak', 'marble', 'brass', 'marble'), drawerBases: true, islandWidth: 1800, glassFronts: true, ovenTower: true, pantry: true, pullOut: true },
  { id: 'sage-island', layout: 'straight', room: { width: 4800, depth: 4000, height: 2600 }, style: warmStyle('sage', 'oak'), openShelves: true, islandWidth: 2400, glassFronts: true, pantry: true, breakfastBar: true },
  { id: 'monochrome-island', layout: 'l-shape', room: { width: 5000, depth: 4200, height: 2600 }, style: warmStyle('cream', 'black', 'bronze'), drawerBases: true, islandWidth: 1800, glassFronts: true, ovenTower: true, pantry: true },
  { id: 'greige-gallery', layout: 'l-shape', room: { width: 3900, depth: 3000, height: 2700 }, style: { ...warmStyle('taupe', 'marble', 'none', 'marble'), appliances: 'black', plinthLighting: true }, layered: 'greige' },
  { id: 'ivory-oak-gallery', layout: 'straight', room: { width: 4200, depth: 3000, height: 2700 }, style: { ...warmStyle('cream', 'travertine', 'none'), appliances: 'black', plinthLighting: true }, layered: 'ivory' },
  { id: 'olive-stone-gallery', layout: 'l-shape', room: { width: 4200, depth: 3200, height: 2700 }, style: { ...warmStyle('olive', 'stone', 'none', 'stone'), appliances: 'black', plinthLighting: true }, layered: 'olive' },
  { id: 'walnut-noir-gallery', layout: 'l-shape', room: { width: 4200, depth: 3200, height: 2700 }, style: { ...warmStyle('anthracite', 'black', 'none', 'black'), appliances: 'black', plinthLighting: true }, layered: 'graphite' },
  ...PREMIUM_KITCHENS,
] as const satisfies readonly KitchenPreset[];

export type KitchenDesignId = (typeof KITCHEN_DESIGNS)[number]['id'];
export type KitchenCategory = LayoutId | 'island';

export function kitchenCategory(preset: KitchenPreset): KitchenCategory {
  return preset.islandWidth ? 'island' : preset.layout;
}

/** Both the gallery images and the editor use this complete, independently editable design. */
export function createKitchenDesign(preset: KitchenPreset, name: string, prefixes?: LabelPrefixes): Design {
  if (preset.layered) return createLayeredKitchen(preset.layered, preset.room, preset.style, name, prefixes);
  const room = structuredClone(preset.room);
  let upperIndex = 0;
  let items = buildLayout(preset.layout, room, prefixes).map((item): KitchenItem => {
    const position = { x: item.x, y: item.y, rotation: item.rotation, width: item.width, depth: item.depth };
    if (item.kind === 'fridge') return createItem('integratedFridge', [], position, prefixes);
    if (item.kind === 'wall') {
      const index = upperIndex++;
      if (preset.openShelves && index % 3 === 0) return createItem('shelf', [], { ...position, shelves: 2 }, prefixes);
      if (preset.glassFronts && index % 2 === 1) return createItem('glassWall', [], position, prefixes);
    }
    if (item.kind === 'base' && preset.drawerBases) {
      return { ...item, kind: 'drawer', doors: 0, drawers: 3, shelves: 0, drawerLayout: 'shallowTop' };
    }
    return item;
  });

  const replaceModule = (kind: 'ovenTower' | 'tall' | 'pullOut', accepts: (item: KitchenItem) => boolean) => {
    const baseIndex = items.findIndex((item) => item.kind === 'base' && accepts(item));
    const index = baseIndex >= 0 ? baseIndex : items.findIndex(accepts);
    if (index < 0) throw new Error(`Kitchen ${preset.id} has no space for ${kind}.`);
    const source = items[index];
    items[index] = createItem(kind, [], { x: source.x, y: source.y, rotation: source.rotation, width: source.width, depth: source.depth }, prefixes);
  };
  if (preset.ovenTower) {
    replaceModule('ovenTower', (item) => (item.kind === 'base' || item.kind === 'drawer') && item.width === 600);
    items = items.map((item) => item.kind === 'oven' ? createItem('hob', [], { x: item.x, y: item.y, rotation: item.rotation, width: item.width, depth: item.depth, drawerLayout: 'shallowTop' }, prefixes) : item);
  }
  if (preset.pantry) replaceModule('tall', (item) => (item.kind === 'base' || item.kind === 'drawer') && item.width >= 600);
  if (preset.pullOut) replaceModule('pullOut', (item) => (item.kind === 'base' || item.kind === 'filler' || (preset.drawerBases === true && item.kind === 'drawer')) && item.width >= 150 && item.width <= 600);
  const tallUnits = items.filter((item) => item.kind === 'tall' || item.kind === 'ovenTower' || item.kind === 'integratedFridge');
  items = items.filter((item) => !isWallMounted(item) || !tallUnits.some((tall) => footprintsOverlap(item, tall) && verticalOverlap(item, tall)));

  for (const hob of items.filter((item) => item.kind === 'oven' || item.kind === 'hob')) {
    const hood = createItem('hood', items, { rotation: hob.rotation, width: hob.width, x: hob.x, y: hob.y }, prefixes);
    const wall = backWall(hob.rotation);
    if (wall === 'right') hood.x = room.width - hood.depth;
    if (wall === 'bottom') hood.y = room.depth - hood.depth;
    items.push(hood);
  }

  if (preset.islandWidth) {
    const x = (room.width - preset.islandWidth) / 2;
    if (preset.breakfastBar) {
      items.push(createItem('bar', items, { x, y: room.depth / 2, width: preset.islandWidth }, prefixes));
    } else {
      for (let offset = 0; offset < preset.islandWidth; offset += 600) {
        items.push(createItem('drawer', items, { x: x + offset, y: room.depth / 2, drawerLayout: 'shallowTop' }, prefixes));
      }
    }
  }

  // Changing a cabinet's kind must also give it the right, unique code in the chosen language.
  if (preset.stacked) items = premiumUpperRows(items, room, preset.style.front, preset.middleFinish ?? preset.style.front, prefixes);
  const labelled: KitchenItem[] = [];
  for (const item of items) labelled.push({ ...item, label: nextLabel(item.kind, labelled, prefixes) });

  const design = createDesign(name);
  return { ...design, room, items: labelled, style: { ...preset.style }, materials: withModuleMaterials(design.materials, labelled) };
}
