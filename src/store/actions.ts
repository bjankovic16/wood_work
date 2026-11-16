import { createItem, findPreset, itemFromPreset, nextLabel, type SizeField } from '../domain/catalog';
import * as ops from '../domain/designOps';
import { isWallMounted, rotateItem, aabbSize, clampToRoom } from '../domain/geometry';
import { newId } from '../domain/ids';
import { createKitchenDesign, type KitchenPreset } from '../domain/kitchens';
import { centreOfRoom, findFreeSpot, placeCopy } from '../domain/placement';
import { computeDragPlacement } from '../domain/snapping';
import { planCabinetAbove, planThreeTier, type StackPlan, type ThreeTierOptions, type ThreeTierPlan } from '../domain/upperCabinets';
import { buildLayout, type LayoutId } from '../domain/templates';
import type { KitchenStyle } from '../domain/style';
import { OPENING_DEFAULTS, wallLength } from '../domain/openings';
import type { ConstructionSettings, CustomPart, Design, EdgeBand, KitchenItem, Material, Opening, OpeningKind, PartEdit, Room, RoomCutout, RoomFeature, RoomFeatureKind } from '../domain/types';
import { MAX_ROOM_FEATURES, roomContainsRect } from '../domain/roomGeometry';
import { createRoomExample, type RoomExampleId } from '../domain/roomExamples';
import { createPhotoDesign } from '../domain/photoDesigns';
import type { PhotoReference, PhotoReferenceId } from '../domain/photoReferences';
import { createProject } from './projects';
import { DEFAULT_CONSTRUCTION } from '../engine/settings';
import { currentMessages } from '../i18n';
import { useDesignStore } from './designStore';
import { useUiStore } from './uiStore';
import { clientToPlan, snapSettings } from './viewport';
import { normalizeAngle } from '../domain/polygons';
import { roomOutline } from '../domain/roomGeometry';
import { roomSegments } from '../domain/walls';
import type { RoomVertex } from '../domain/types';

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

function insertAndSelect(item: KitchenItem, focusWidth = false, partEdits?: Record<string, PartEdit>): void {
  apply((design) => {
    const next = ops.addItem(design, item);
    return partEdits ? { ...next, partEdits: { ...next.partEdits, [item.id]: partEdits } } : next;
  });
  const ui = useUiStore.getState();
  // A new unit hidden by the view filter would look as if nothing happened.
  if (ui.viewFilter !== 'all' && (ui.viewFilter === 'wall') !== isWallMounted(item)) ui.setViewFilter('all');
  if (ui.wallElevation !== null && isWallMounted(item)) ui.setWallElevation(item.elevation);
  ui.select(item.id);
  ui.requestFocus(focusWidth ? 'width' : null);
}

/** Click on a library element: put it in the first free spot along the walls. Returns whether it was added. */
export function addPresetToPlan(presetId: string): boolean {
  const preset = findPreset(presetId);
  if (!preset) return false;
  const { room, items, openings } = current();
  const item = itemFromPreset(preset, items, currentMessages().labelPrefix, room);
  insertAndSelect({ ...item, ...(findFreeSpot(room, items, item, openings, preset.placement === 'centre') ?? centreOfRoom(room, item)) }, preset.custom);
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
  const item = previous?.ghost ?? itemFromPreset(preset, items, currentMessages().labelPrefix, room);
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
  const item = { ...drag.ghost, id: newId(), label: nextLabel(drag.ghost.kind, items, currentMessages().labelPrefix) };
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
  const { room, items, openings, partEdits } = current();
  const copy = { ...item, id: newId(), label: nextLabel(item.kind, items, currentMessages().labelPrefix) };
  // The copy keeps any pieces changed by hand in the cutting list.
  insertAndSelect({ ...copy, ...placeCopy(room, items, item, copy, openings) }, false, partEdits[item.id]);
}

export function stackCabinetAbove(id: string): StackPlan {
  const { room, items, openings } = current();
  const source = items.find((item) => item.id === id);
  if (!source) return { ok: false, reason: 'noSelection' };
  const plan = planCabinetAbove(room, items, source, openings);
  if (!plan.ok) return plan;
  const cabinet = createItem(plan.cabinet.kind, items, { ...plan.cabinet, shelves: 0 }, currentMessages().labelPrefix);
  useUiStore.getState().setViewFilter('wall');
  useUiStore.getState().setWallElevation(cabinet.elevation);
  insertAndSelect(cabinet);
  return plan;
}

/** Rotates the selection in 90° steps; positive is clockwise. */
export function rotateSelected(steps: number): void {
  const item = selectedItem();
  if (item) editItem(item.id, (it, room) => rotateItem(it, steps, room));
}

export function setItemAngle(id: string, angle: number): void {
  if (!Number.isFinite(angle)) throw new RangeError('Invalid cabinet angle.');
  editItem(id, (item, room) => {
    const before = aabbSize(item);
    const next = { ...item, rotation: normalizeAngle(angle) };
    const after = aabbSize(next);
    return clampToRoom({ ...next, x: item.x + (before.w - after.w) / 2, y: item.y + (before.h - after.h) / 2 }, room);
  });
}

export function addThreeTierRun(id: string, options: ThreeTierOptions): ThreeTierPlan {
  const design = current();
  const source = design.items.find((item) => item.id === id);
  if (!source) return { ok: false, reason: 'noSelection' };
  const plan = planThreeTier(design.room, design.items, source, options, design.openings);
  if (!plan.ok) return plan;
  const items = [...design.items];
  for (const placement of plan.cabinets) items.push(createItem(placement.kind, items, placement, currentMessages().labelPrefix));
  apply((value) => ({ ...value, items }));
  const selected = items.at(-1)!;
  useUiStore.getState().setViewFilter('wall');
  useUiStore.getState().setWallElevation(selected.elevation);
  useUiStore.getState().select(selected.id);
  return plan;
}

export function editableRoomVertices(room: Room): RoomVertex[] {
  return room.vertices?.map((v) => ({ ...v })) ?? roomOutline(room).map((point, index) => ({ ...point, id: roomSegments(room, false)[index].id }));
}

export function setRoomVertices(vertices: RoomVertex[]): void {
  apply((design) => {
    const oldSegments = roomSegments(design.room, false);
    const openings = design.openings.map((opening) => {
      if (opening.wallId) return opening;
      const segment = oldSegments.find((s) => s.id === opening.wall);
      if (!segment) return opening;
      return { ...opening, wallId: segment.id,
        offset: opening.wall === 'bottom' || opening.wall === 'left' ? segment.length - opening.offset - opening.width : opening.offset };
    });
    const ids = new Set(vertices.map((v) => v.id));
    if (openings.some((o) => o.wallId && !ids.has(o.wallId) && !design.room.partitions?.some((p) => o.wallId?.startsWith(`${p.id}:`)))
      || design.room.treatments?.some((t) => !ids.has(t.wallId) && !design.room.partitions?.some((p) => t.wallId.startsWith(`${p.id}:`)))) {
      throw new RangeError('Remove wall attachments before removing their wall.');
    }
    const width = Math.max(design.room.width, ...vertices.map((p) => Math.ceil(p.x)));
    const depth = Math.max(design.room.depth, ...vertices.map((p) => Math.ceil(p.y)));
    return ops.setRoom({ ...design, openings }, { vertices, cutout: undefined, width, depth });
  });
}

export function editRoomWall(id: string, length: number, angle: number): void {
  const room = current().room;
  const vertices = editableRoomVertices(room);
  const index = vertices.findIndex((v) => v.id === id);
  if (index < 0) throw new RangeError('Wall not found.');
  const frame = roomSegments({ ...room, vertices }, false)[index];
  const radians = angle * Math.PI / 180;
  const end = { x: Math.round(frame.start.x + length * Math.cos(radians)), y: Math.round(frame.start.y + length * Math.sin(radians)) };
  const next = vertices.map((v, i) => i === (index + 1) % vertices.length ? { ...v, ...end } : v);
  setRoomVertices(next);
}

export function splitRoomWall(id: string): void {
  const vertices = editableRoomVertices(current().room);
  const index = vertices.findIndex((v) => v.id === id);
  if (index < 0) throw new RangeError('Wall not found.');
  const end = vertices[(index + 1) % vertices.length];
  vertices.splice(index + 1, 0, { id: newId(), x: Math.round((vertices[index].x + end.x) / 2), y: Math.round((vertices[index].y + end.y) / 2) });
  setRoomVertices(vertices);
}

export function removeRoomCorner(id: string): void {
  setRoomVertices(editableRoomVertices(current().room).filter((v) => v.id !== id));
}

export function addPartition(): void {
  const room = current().room;
  const start = { x: Math.round(room.width * 0.4), y: Math.round(room.depth * 0.65) };
  const end = { x: Math.round(room.width * 0.7), y: start.y };
  setRoomSize({ partitions: [...(room.partitions ?? []), { id: newId(), start, end, thickness: 100, height: 1100 }] });
}

export function addWallTreatment(wallId: string): void {
  const room = current().room;
  const segment = roomSegments(room).find((s) => s.id === wallId);
  if (!segment) throw new RangeError('Wall not found.');
  setRoomSize({ treatments: [...(room.treatments ?? []), { id: newId(), wallId, offset: 0, width: Math.min(1200, segment.length), elevation: 0, height: Math.min(2400, segment.height), finish: 'oak' }] });
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

export function setRoomCutout(cutout: RoomCutout | undefined): void {
  apply((design) => {
    const next = ops.setRoom(design, { cutout, vertices: undefined });
    const ids = new Set(roomSegments(next.room).map((s) => s.id));
    if (next.openings.some((o) => o.wallId && !ids.has(o.wallId))) throw new RangeError('Remove wall attachments before changing the room shape.');
    return next;
  });
}

export function addRoomFeature(kind: RoomFeatureKind): void {
  apply((design) => {
    const { room } = design;
    if ((room.features?.length ?? 0) >= MAX_ROOM_FEATURES) throw new RangeError('This room already has the maximum number of fixed structures.');
    const width = Math.min(kind === 'column' ? 400 : 500, room.width);
    const depth = Math.min(kind === 'projection' ? 900 : 450, room.depth);
    const positions = [
      { x: Math.round((room.width - width) / 2), y: 0 }, { x: 0, y: 0 },
      { x: room.width - width, y: 0 }, { x: 0, y: room.depth - depth },
      { x: room.width - width, y: room.depth - depth },
    ];
    const position = positions.find((point) => roomContainsRect({ ...point, w: width, h: depth }, room));
    if (!position) throw new Error('The room has no usable space for this structure.');
    return ops.setRoom(design, { features: [...(room.features ?? []), { id: newId(), kind, ...position, width, depth }] });
  });
}

export function updateRoomFeature(id: string, patch: Partial<Pick<RoomFeature, 'x' | 'y' | 'width' | 'depth'>>): void {
  apply((design) => ops.updateRoomFeature(design, id, patch));
}

export function removeRoomFeature(id: string): void {
  apply((design) => {
    const features = design.room.features;
    return features?.some((feature) => feature.id === id) ? ops.setRoom(design, { features: features.filter((feature) => feature.id !== id) }) : design;
  });
}

export function openRoomExample(id: RoomExampleId): void {
  const messages = currentMessages();
  const design = createRoomExample(id, messages.roomStructure.examples[id], messages.labelPrefix);
  createProject(design.name);
  useDesignStore.getState().load(design);
  const ui = useUiStore.getState();
  ui.setView('plan');
  ui.setRoomOpen(false);
  ui.setLayoutsOpen(false);
}

export function setItemPlacement(id: string, placement: Pick<KitchenItem, 'x' | 'y' | 'rotation'>): void {
  editItem(id, (item, room) => ops.withPosition({ ...item, rotation: placement.rotation }, placement.x, placement.y, room));
}

/** Door, drawer or shelf count of one unit; undefined goes back to the default. */
export function setItemCount(id: string, key: 'doors' | 'drawers' | 'shelves', value: number | undefined): void {
  editItem(id, (item) => ops.withCount(item, key, value));
}

/** Door type, hinge side, drawer layout or material of one unit; undefined goes back to the kitchen setting. */
export function setItemOption<K extends 'doorType' | 'hinge' | 'drawerLayout' | 'carcassMaterial' | 'backMaterial' | 'frontMaterial' | 'frontFinish' | 'carcassFinish'>(
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
  const t = currentMessages();
  const base: Material = template ?? { id, name: t.names.newBoard, thickness: 18, sheetLength: 2800, sheetWidth: 2070, grain: false, price: 0 };
  // A copy is named after the board as it is shown, so a built-in board's copy reads in the same language.
  apply((design) => ops.addMaterial(design, { ...base, id, name: template ? t.names.copyOf(t.engine.material(template)) : base.name }));
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
  apply((design) => ops.addEdgeBand(design, { id, name: currentMessages().names.newEdgeBand, thickness: 1, price: 0 }));
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
    const frame = design.room.vertices ? roomSegments(design.room, false)[0] : null;
    const length = frame?.length ?? wallLength(design.room, 'top');
    const opening: Opening = { id: newId(), kind, wall: 'top', ...(frame ? { wallId: frame.id } : {}), offset: Math.round((length - defaults.width) / 2), ...defaults };
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
  apply((design) => ({ ...design, items: buildLayout(id, design.room, currentMessages().labelPrefix), partEdits: {} }));
  useUiStore.getState().select(null);
}

/** Opens exactly the kitchen shown in its preview, replacing the whole design in one undo step. */
export function applyKitchenDesign(preset: KitchenPreset): void {
  apply((design) => createKitchenDesign(preset, design.name, currentMessages().labelPrefix));
  const ui = useUiStore.getState();
  ui.select(null);
  ui.setViewFilter('all');
  ui.setView('3d');
  ui.setReferenceOpen(false);
  ui.requestCamera(preset.framed ? 'front' : 'perspective');
}

export function openPhotoDesign(id: PhotoReferenceId): void {
  const messages = currentMessages();
  const design = createPhotoDesign(id, messages.references.names[id], messages.labelPrefix);
  createProject(design.name);
  useDesignStore.getState().load(design);
  const ui = useUiStore.getState();
  ui.select(null);
  ui.setViewFilter('all');
  ui.setView('3d');
  ui.setReferenceOpen(true);
  ui.requestCamera('perspective');
}

export function setReferencePhoto(reference: PhotoReference | undefined): void {
  apply((design) => {
    if (JSON.stringify(design.referencePhoto) === JSON.stringify(reference)) return design;
    const { referencePhoto: _photo, ...rest } = design;
    return reference ? { ...rest, referencePhoto: reference } : rest;
  });
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
      name: currentMessages().names.extraPiece,
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
