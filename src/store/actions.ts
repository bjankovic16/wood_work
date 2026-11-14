import { findPreset, itemFromPreset, nextLabel, type SizeField } from '../domain/catalog';
import * as ops from '../domain/designOps';
import { isWallMounted, rotateItem } from '../domain/geometry';
import { newId } from '../domain/ids';
import { centreOfRoom, findFreeSpot, placeCopy } from '../domain/placement';
import { computeDragPlacement } from '../domain/snapping';
import { buildLayout, type LayoutId } from '../domain/templates';
import type { KitchenStyle } from '../domain/style';
import { OPENING_DEFAULTS, wallLength } from '../domain/openings';
import type { ConstructionSettings, CustomPart, Design, EdgeBand, KitchenItem, Material, Opening, OpeningKind, PartEdit, Room } from '../domain/types';
import { DEFAULT_CONSTRUCTION } from '../engine/settings';
import { useDesignStore } from './designStore';
import { useUiStore } from './uiStore';
import { clientToPlan, snapSettings } from './viewport';

/** User-level commands that tie the pure design operations to the stores. */

const current = (): Design => useDesignStore.getState().design;
const apply = (recipe: (design: Design) => Design): void => useDesignStore.getState().apply(recipe);

function selectedItem(): KitchenItem | null {
  const id = useUiStore.getState().selectedId;
  return id ? (current().items.find((item) => item.id === id) ?? null) : null;
}

function editItem(id: string, edit: (item: KitchenItem, room: Room) => KitchenItem): void {
  apply((design) => {
    const item = design.items.find((i) => i.id === id);
    return item ? ops.replaceItem(design, edit(item, design.room)) : design;
  });
}

function insertAndSelect(item: KitchenItem, focusWidth = false): void {
  apply((design) => ops.addItem(design, item));
  const ui = useUiStore.getState();
  // A new unit hidden by the view filter would look as if nothing happened.
  if (ui.viewFilter !== 'all' && (ui.viewFilter === 'wall') !== isWallMounted(item)) ui.setViewFilter('all');
  ui.select(item.id);
  ui.requestFocus(focusWidth ? 'width' : null);
}

/** Click on a library element: put it in the first free spot along the walls. Returns whether it was added. */
export function addPresetToPlan(presetId: string): boolean {
  const preset = findPreset(presetId);
  if (!preset) return false;
  const { room, items, openings } = current();
  const item = itemFromPreset(preset, items);
  insertAndSelect({ ...item, ...(findFreeSpot(room, items, item, openings) ?? centreOfRoom(room, item)) }, preset.custom);
  return true;
}

/** Library drag in progress: work out where the element would land. */
export function updateLibraryDrag(presetId: string, clientX: number, clientY: number): void {
  const ui = useUiStore.getState();
  const preset = findPreset(presetId);
  const pointer = clientToPlan(clientX, clientY, true);
  const previous = ui.libraryDrag?.presetId === presetId ? ui.libraryDrag : null;
  if (!preset || !pointer) {
    ui.setLibraryDrag({ presetId, clientX, clientY, ghost: null, wall: null, guides: [] });
    return;
  }
  const { room, items } = current();
  const item = previous?.ghost ?? itemFromPreset(preset, items);
  const result = computeDragPlacement({
    room,
    others: items,
    item,
    pointer,
    grabOffset: null,
    previousWall: previous?.wall ?? null,
    snap: snapSettings(),
  });
  ui.setLibraryDrag({
    presetId,
    clientX,
    clientY,
    ghost: { ...item, x: result.x, y: result.y, rotation: result.rotation },
    wall: result.wall,
    guides: result.guides,
  });
}

/**
 * Library drag finished: add the element where its preview was, if it was over
 * the plan. Returns whether it was added.
 */
export function finishLibraryDrag(drop: boolean): boolean {
  const ui = useUiStore.getState();
  const drag = ui.libraryDrag;
  ui.setLibraryDrag(null);
  if (!drop || !drag?.ghost) return false;
  const { items } = current();
  const item = { ...drag.ghost, id: newId(), label: nextLabel(drag.ghost.kind, items) };
  insertAndSelect(item, findPreset(drag.presetId)?.custom);
  return true;
}

export function deleteSelected(): void {
  const item = selectedItem();
  if (!item) return;
  apply((design) => ops.removeItem(design, item.id));
  useUiStore.getState().select(null);
}

export function duplicateSelected(): void {
  const item = selectedItem();
  if (!item) return;
  const { room, items, openings } = current();
  const copy = { ...item, id: newId(), label: nextLabel(item.kind, items) };
  insertAndSelect({ ...copy, ...placeCopy(room, items, item, copy, openings) });
}

/** Rotates the selection in 90° steps; positive is clockwise. */
export function rotateSelected(steps: number): void {
  const item = selectedItem();
  if (item) editItem(item.id, (it, room) => rotateItem(it, steps, room));
}

export function nudgeSelected(dx: number, dy: number): void {
  const item = selectedItem();
  if (item) editItem(item.id, (it, room) => ops.withPosition(it, it.x + dx, it.y + dy, room));
}

export function setItemSize(id: string, field: SizeField, value: number): void {
  editItem(id, (item, room) => ops.withSize(item, field, value, room));
}

export function setItemElevation(id: string, value: number): void {
  editItem(id, (item) => ops.withElevation(item, value));
}

export function setItemPosition(id: string, x: number, y: number): void {
  editItem(id, (item, room) => ops.withPosition(item, x, y, room));
}

export function setItemLabel(id: string, label: string): void {
  const trimmed = label.trim().slice(0, 12);
  if (trimmed) editItem(id, (item) => ({ ...item, label: trimmed }));
}

export function setRoomSize(patch: Partial<Room>): void {
  apply((design) => ops.setRoom(design, patch));
}

/** Door, drawer or shelf count of one unit; undefined goes back to the default. */
export function setItemCount(id: string, key: 'doors' | 'drawers' | 'shelves', value: number | undefined): void {
  editItem(id, (item) => ops.withCount(item, key, value));
}

/** Door type, hinge side, drawer layout or material of one unit; undefined goes back to the kitchen setting. */
export function setItemOption<K extends 'doorType' | 'hinge' | 'drawerLayout' | 'carcassMaterial' | 'backMaterial' | 'frontMaterial'>(
  id: string,
  key: K,
  value: KitchenItem[K] | undefined,
): void {
  editItem(id, (item) => ops.withOption(item, key, value));
}

export function setConstruction(patch: Partial<ConstructionSettings>): void {
  apply((design) => ops.setConstruction(design, patch));
}

/** Puts the construction rules back to their defaults, keeping the chosen materials and edge bands. */
export function resetConstruction(): void {
  apply((design) => {
    const c = design.construction;
    return ops.setConstruction(design, {
      ...structuredClone(DEFAULT_CONSTRUCTION),
      carcassMaterial: c.carcassMaterial,
      backMaterial: c.backMaterial,
      frontMaterial: c.frontMaterial,
      carcassEdge: c.carcassEdge,
      frontEdge: c.frontEdge,
      subtractEdges: c.subtractEdges,
    });
  });
}

/** Adds a material to the library, starting as a copy of `template` (or a plain 18 mm board). */
export function addMaterial(template?: Material): string {
  const id = newId();
  const base: Material = template ?? { id, name: 'New board', thickness: 18, sheetLength: 2800, sheetWidth: 2070, grain: false, price: 0 };
  apply((design) => ops.addMaterial(design, { ...base, id, name: template ? `${template.name} (copy)` : base.name }));
  return id;
}

export function updateMaterial(id: string, patch: Partial<Omit<Material, 'id'>>): void {
  apply((design) => ops.updateMaterial(design, id, patch));
}

export function removeMaterial(id: string): void {
  apply((design) => ops.removeMaterial(design, id));
}

export function addEdgeBand(): string {
  const id = newId();
  apply((design) => ops.addEdgeBand(design, { id, name: 'New edge band', thickness: 1, price: 0 }));
  return id;
}

export function updateEdgeBand(id: string, patch: Partial<Omit<EdgeBand, 'id'>>): void {
  apply((design) => ops.updateEdgeBand(design, id, patch));
}

export function removeEdgeBand(id: string): void {
  apply((design) => ops.removeEdgeBand(design, id));
}

/** Adds a window or door in the middle of the top wall. */
export function addOpening(kind: OpeningKind): void {
  const defaults = OPENING_DEFAULTS[kind];
  apply((design) => {
    const length = wallLength(design.room, 'top');
    const opening: Opening = { id: newId(), kind, wall: 'top', offset: Math.round((length - defaults.width) / 2), ...defaults };
    return ops.addOpening(design, opening);
  });
}

export function updateOpening(id: string, patch: Partial<Omit<Opening, 'id' | 'kind'>>): void {
  apply((design) => ops.updateOpening(design, id, patch));
}

export function removeOpening(id: string): void {
  apply((design) => ops.removeOpening(design, id));
}

export function setProjectName(name: string): void {
  const trimmed = name.trim();
  if (trimmed) apply((design) => ops.setName(design, trimmed));
}

export function clearAllItems(): void {
  apply(ops.clearItems);
  useUiStore.getState().select(null);
}

export function undo(): void {
  useDesignStore.getState().undo();
}

export function redo(): void {
  useDesignStore.getState().redo();
}

export function setStyle(patch: Partial<KitchenStyle>): void {
  apply((design) => ops.setStyle(design, patch));
}

/** Replaces the plan with a ready-made layout for the current room (one undo step). */
export function applyLayout(id: LayoutId): void {
  apply((design) => ({ ...design, items: buildLayout(id, design.room), partEdits: {} }));
  useUiStore.getState().select(null);
}

/** Changes one part of a unit's cutting list by hand; undefined puts it back as the rules make it. */
export function setPartEdit(itemId: string, key: string, edit: PartEdit | undefined): void {
  apply((design) => ops.setPartEdit(design, itemId, key, edit));
}

/** Adds a piece to the cutting list by hand, cut from the carcass board. */
export function addCustomPart(): string {
  const id = newId();
  apply((design) =>
    ops.addCustomPart(design, {
      id,
      name: 'Extra piece',
      quantity: 1,
      length: 600,
      width: 100,
      materialId: design.construction.carcassMaterial,
      edgesLength: 0,
      edgesWidth: 0,
      edgeBandId: null,
      note: '',
    }),
  );
  return id;
}

export function updateCustomPart(id: string, patch: Partial<Omit<CustomPart, 'id'>>): void {
  apply((design) => ops.updateCustomPart(design, id, patch));
}

export function removeCustomPart(id: string): void {
  apply((design) => ops.removeCustomPart(design, id));
}
