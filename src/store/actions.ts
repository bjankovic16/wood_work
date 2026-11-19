import { createItem, findPreset, itemFromPreset, nextLabel, type SizeField } from '../domain/catalog';
import { cabinetResize } from '../domain/cabinetResize';
import * as ops from '../domain/designOps';
import { rotateItem, aabbSize, clampToRoom } from '../domain/geometry';
import { newId } from '../domain/ids';
import { createKitchenDesign, KITCHEN_DESIGNS, originalView, type KitchenDesignId, type KitchenPreset } from '../domain/kitchens';
import type { CameraView } from '../domain/camera';
import { applyKitchenLook } from '../domain/kitchenLook';
import type { IdeaReview } from './ideaReview';
import { canPlaceItem, centreOfRoom, findFreeSpot, placeCopy } from '../domain/placement';
import { computeDragPlacement } from '../domain/snapping';
import { planCabinetAbove, planThreeTier, type StackPlan, type ThreeTierOptions, type ThreeTierPlan } from '../domain/upperCabinets';
import type { KitchenStyle } from '../domain/style';
import { OPENING_DEFAULTS } from '../domain/openings';
import type { ConstructionSettings, CustomPart, Design, EdgeBand, KitchenItem, Material, Opening, OpeningKind, PartEdit, Point, Room, RoomCutout, RoomFeature, RoomFeatureKind } from '../domain/types';
import { MAX_ROOM_FEATURES, featureFitsRoom, roomFeaturePose } from '../domain/roomGeometry';
import { attachFeature, featureDragPlacement, freeFeature } from '../domain/roomObjectPlacement';
import { createRoomExample, type RoomExampleId } from '../domain/roomExamples';
import { createPhotoDesign } from '../domain/photoDesigns';
import type { PairedPhotoId, PhotoReference } from '../domain/photoReferences';
import { createProject, finishRoom } from './projects';
import { DEFAULT_CONSTRUCTION } from '../engine/settings';
import { currentMessages } from '../i18n';
import { useDesignStore } from './designStore';
import { offerUndo, undoFeedback, useFeedback } from './feedback';
import { cabinetIsLocked, useUiStore } from './uiStore';
import { clientToPlan, snapSettings } from './viewport';
import { normalizeAngle } from '../domain/polygons';
import { openingOnWall, openingsOnSegment, roomSegments, wallCoordinates } from '../domain/walls';
import type { RoomVertex } from '../domain/types';

/** User-level commands that tie the pure design operations to the stores. */

const current = (): Design => useDesignStore.getState().design;
const apply = (recipe: (design: Design) => Design): void => useDesignStore.getState().apply(recipe);

export type ShuffleResult = { ok: true; presetId: KitchenDesignId } | { ok: false; reason: 'preview' | 'busy' | 'review' };
type GalleryKitchen = (typeof KITCHEN_DESIGNS)[number];

export function shuffleKitchen(): ShuffleResult {
  const ui = useUiStore.getState();
  const store = useDesignStore.getState();
  if (ui.previewLockedIds.length > 0) return { ok: false, reason: 'preview' };
  if (ui.cabinetTool || store.gestureBase) return { ok: false, reason: 'busy' };
  const index = KITCHEN_DESIGNS.findIndex((preset) => preset.id === store.design.galleryPresetId);
  const preset = KITCHEN_DESIGNS[(index + 1) % KITCHEN_DESIGNS.length];
  if (!applyKitchenDesign(preset)) return { ok: false, reason: 'review' };
  if (current() !== store.design) offerUndo('style', (t) => t.shuffle.success(t.kitchens.names[preset.id]));
  return { ok: true, presetId: preset.id };
}

function selectedItem(): KitchenItem | null {
  const id = useUiStore.getState().selectedId;
  return id ? (current().items.find((item) => item.id === id) ?? null) : null;
}

export function editCabinetPositionInPlan(id: string): void {
  const item = current().items.find((candidate) => candidate.id === id);
  if (!item) return;
  const ui = useUiStore.getState();
  ui.setView('plan');
  ui.select(id);
}

/** A deliberate pick of the cabinet centre, not a wall-snapping drag. */
export function placeCabinetAt(id: string, point: Point): 'placed' | 'blocked' | 'inactive' {
  const ui = useUiStore.getState(), { design, gestureBase } = useDesignStore.getState();
  const item = design.items.find((i) => i.id === id);
  if (!item || gestureBase || ui.cabinetTool !== 'place' || ui.selectedId !== id || ui.view !== 'plan' || ui.roomOpen) return 'inactive';
  const { w, h } = aabbSize(item);
  const moved = { ...item, x: Math.round(point.x - w / 2), y: Math.round(point.y - h / 2) };
  if (!canPlaceItem(design.room, design.items, moved, design.openings)) return 'blocked';
  apply((d) => ops.replaceItem(d, moved));
  ui.setCabinetTool(null);
  return 'placed';
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
  if (!preset) { ui.setLibraryDrag(null); return; }
  const { room, items } = current();
  const pointer = clientToPlan(clientX, clientY, true);
  const previous = ui.libraryDrag?.presetId === presetId ? ui.libraryDrag : null;
  const source = previous?.item ?? itemFromPreset(preset, items, currentMessages().labelPrefix, room);
  if (!pointer) {
    ui.setLibraryDrag({ presetId, item: source, clientX, clientY, ghost: null, wall: null, guides: [] });
    return;
  }
  const item = previous?.ghost ?? source;
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
    item: source,
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
  if (!item || useDesignStore.getState().gestureBase) return;
  apply((design) => ops.removeItem(design, item.id));
  useUiStore.getState().select(null);
  offerUndo('cabinet', (t) => t.feedback.deleted(item.label));
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
  insertAndSelect(cabinet);
  return plan;
}

/** Rotates the selection in 90° steps; positive is clockwise. */
export function rotateSelected(steps: number): void {
  if (useUiStore.getState().view !== 'plan') return;
  const item = selectedItem();
  if (item) editItem(item.id, (it, room) => rotateItem(it, steps, room));
}

export function setItemAngle(id: string, angle: number): void {
  if (useUiStore.getState().view !== 'plan') return;
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
  useUiStore.getState().select(selected.id);
  return plan;
}

export function editableRoomVertices(room: Room): RoomVertex[] {
  return roomSegments(room, false).map((s) => ({ ...s.start, id: s.id }));
}

export function setRoomVertices(vertices: RoomVertex[]): void {
  if (useUiStore.getState().view !== 'plan') return;
  apply((design) => {
    const openings = design.openings.map((opening) => {
      if (opening.wallId) return opening;
      const onWall = openingOnWall(design.room, opening);
      if (!onWall) throw new RangeError('Opening does not fit a room segment.');
      return { ...opening, wallId: onWall.segment.id, offset: onWall.offset };
    });
    const ids = new Set(vertices.map((v) => v.id));
    if (openings.some((o) => o.wallId && !ids.has(o.wallId) && !design.room.partitions?.some((p) => o.wallId?.startsWith(`${p.id}:`)))
      || design.room.treatments?.some((t) => !ids.has(t.wallId) && !design.room.partitions?.some((p) => t.wallId.startsWith(`${p.id}:`)))) {
      throw new RangeError('Remove wall attachments before removing their wall.');
    }
    const width = Math.max(ops.ROOM_LIMITS.width.min, ...vertices.map((p) => Math.ceil(p.x)));
    const depth = Math.max(ops.ROOM_LIMITS.depth.min, ...vertices.map((p) => Math.ceil(p.y)));
    return ops.setRoom({ ...design, openings }, { vertices, cutout: undefined, width, depth });
  });
}

export function editRoomWall(id: string, length: number, angle: number): void {
  const room = current().room;
  const vertices = editableRoomVertices(room);
  const index = vertices.findIndex((v) => v.id === id);
  if (index < 0) throw new RangeError('Wall not found.');
  const frame = roomSegments({ ...room, vertices }, false)[index];
  if (!Number.isFinite(length) || !Number.isFinite(angle) || length < 100 || length > 20000)
    throw new RangeError('Invalid wall measurement.');
  if (normalizeAngle(angle) === frame.angle) {
    if (Math.abs(length - frame.length) < 0.001) return;
    const rectangle = vertices.length === 4 && vertices.every((v, i) => {
      const next = vertices[(i + 1) % 4];
      return next.x === v.x || next.y === v.y;
    });
    if (rectangle) {
      const horizontal = frame.start.y === frame.end.y;
      const dim = horizontal ? 'width' : 'depth';
      if (length < ops.ROOM_LIMITS[dim].min) throw new RangeError('Room is too small.');
      if (!room.vertices) { setRoomSize({ [dim]: length }); return; }
      const axis = horizontal ? 'x' : 'y';
      const oldMax = Math.max(...vertices.map((p) => p[axis]));
      setRoomVertices(vertices.map((p) => p[axis] === oldMax ? { ...p, [axis]: oldMax + Math.round(length - frame.length) } : p));
      return;
    }
  }
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
  if (useUiStore.getState().view !== 'plan') return;
  const item = selectedItem();
  if (item) editItem(item.id, (it, room) => ops.withPosition(it, it.x + dx, it.y + dy, room));
}

export function setItemSize(id: string, field: SizeField, value: number): void | false {
  if (cabinetIsLocked(id)) return false;
  if (useUiStore.getState().view !== '3d') {
    editItem(id, (item, room) => ops.withSize(item, field, value, room));
    return;
  }
  // Like the 3D handles, numeric resizing must never slide the cabinet to make it fit.
  const design = current();
  const item = design.items.find((candidate) => candidate.id === id);
  const next = item && cabinetResize(item, field, value, design.room, 0);
  if (!next) return false;
  apply((design) => ops.replaceItem(design, next));
}

export function setItemElevation(id: string, value: number): void {
  if (useUiStore.getState().view !== 'plan') return;
  editItem(id, (item) => ops.withElevation(item, value));
}

export function setItemPosition(id: string, x: number, y: number): void {
  if (useUiStore.getState().view !== 'plan') return;
  editItem(id, (item, room) => ops.withPosition(item, x, y, room));
}

export function setItemLabel(id: string, label: string): void {
  const trimmed = label.trim().slice(0, 12);
  if (trimmed) editItem(id, (item) => ({ ...item, label: trimmed }));
}

export function setRoomSize(patch: Partial<Room>): void {
  if (useUiStore.getState().view !== 'plan') return;
  apply((design) => ops.setRoom(design, patch));
}

export function setRoomCutout(cutout: RoomCutout | undefined): void {
  if (useUiStore.getState().view !== 'plan') return;
  apply((design) => {
    const next = ops.setRoom(design, { cutout, vertices: undefined });
    const ids = new Set(roomSegments(next.room).map((s) => s.id));
    if (next.openings.some((o) => o.wallId && !ids.has(o.wallId))) throw new RangeError('Remove wall attachments before changing the room shape.');
    return next;
  });
}

export function addRoomFeature(kind: RoomFeatureKind, wallId?: string): string {
  if (useUiStore.getState().view !== 'plan') throw new RangeError('Room objects can only be placed in 2D.');
  const { room } = current();
  const id = newId();
  const walls = roomSegments(room);
  const wall = wallId ? walls.find((s) => s.id === wallId) : undefined;
  if (wallId && !wall) throw new RangeError('Wall not found.');
  apply((design) => {
    if ((room.features?.length ?? 0) >= MAX_ROOM_FEATURES) throw new RangeError('This room already has the maximum number of fixed structures.');
    const width = Math.min(kind === 'column' ? 400 : 500, room.width);
    const depth = Math.min(kind === 'projection' ? 900 : 450, room.depth);
    const positions = [
      { x: Math.round((room.width - width) / 2), y: 0 }, { x: 0, y: 0 },
      { x: room.width - width, y: 0 }, { x: 0, y: room.depth - depth },
      { x: room.width - width, y: room.depth - depth },
    ];
    const feature: RoomFeature = { id, kind, width, depth, x: 0, y: 0 };
    const placed = wall ? attachFeature(room, feature, wall) : positions.map((p) => ({ ...feature, ...p })).find((f) => featureFitsRoom(room, f))
      ?? freeFeature(room, attachFeature(room, feature, walls.filter((s) => !s.partitionId).reduce((a, b) => a.length > b.length ? a : b)));
    return { ...design, room: { ...room, features: [...(room.features ?? []), placed] } };
  });
  useUiStore.getState().selectRoomObject({ type: 'feature', id }, wallId);
  if (!wall) useUiStore.getState().setRoomElevationOpen(false);
  return id;
}

export function updateRoomFeature(id: string, patch: Partial<Omit<RoomFeature, 'id' | 'kind'>>): void {
  if (useUiStore.getState().view !== 'plan') return;
  apply((design) => ops.updateRoomFeature(design, id, patch));
}

export function setRoomFeatureWall(id: string, wallId: string | null): void {
  if (useUiStore.getState().view !== 'plan') return;
  const { room } = current();
  const f = room.features?.find((f) => f.id === id);
  if (!f) return;
  const wall = roomSegments(room).find((s) => s.id === wallId);
  if (wallId && !wall) throw new RangeError('Wall not found.');
  const next = wall ? attachFeature(room, f, wall, wallCoordinates(wall, roomFeaturePose(room, f).centre).x - f.width / 2) : freeFeature(room, f);
  updateRoomFeature(id, { ...next, wallId: next.wallId, offset: next.offset });
  useUiStore.getState().selectRoomObject({ type: 'feature', id }, wallId ?? undefined);
  if (!wall) useUiStore.getState().setRoomElevationOpen(false);
}

export function nudgeRoomFeature(id: string, dx: number, dy: number): void {
  const { room } = current();
  const feature = room.features?.find((f) => f.id === id);
  if (!feature) return;
  const centre = roomFeaturePose(room, feature).centre;
  const wall = feature.wallId && roomSegments(room).find((s) => s.id === feature.wallId);
  const delta = dx || dy;
  const next = featureDragPlacement(room, feature, { x: centre.x + (wall ? delta * wall.tangent.x : dx), y: centre.y + (wall ? delta * wall.tangent.y : dy) }, 0);
  if (next) updateRoomFeature(id, next);
}

export function removeRoomFeature(id: string): void {
  if (useUiStore.getState().view !== 'plan') return;
  apply((design) => {
    const features = design.room.features;
    return features?.some((feature) => feature.id === id) ? ops.setRoom(design, { features: features.filter((feature) => feature.id !== id) }) : design;
  });
  if (useUiStore.getState().roomSelection?.id === id) useUiStore.getState().selectRoomObject(null);
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

/** Door, drawer or shelf count of one unit; undefined goes back to the default. */
export function setItemCount(id: string, key: 'doors' | 'drawers' | 'shelves', value: number | undefined): void {
  editItem(id, (item) => ops.withCount(item, key, value));
}

/** Door type, hinge side, drawer layout or material of one unit; undefined goes back to the kitchen setting. */
export function setItemOption<K extends 'doorType' | 'hinge' | 'drawerLayout' | 'shelfForm' | 'carcassMaterial' | 'backMaterial' | 'frontMaterial' | 'frontFinish' | 'carcassFinish'>(
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

/** New openings are always measured from a real segment's marked start. */
export function addOpening(kind: OpeningKind, wallId = useUiStore.getState().selectedWallId): string {
  if (useUiStore.getState().view !== 'plan') throw new RangeError('Room objects can only be placed in 2D.');
  const defaults = OPENING_DEFAULTS[kind];
  const design = current();
  const segments = roomSegments(design.room);
  const wall = segments.find((s) => s.id === wallId) ?? segments[0];
  const id = newId();
  // Prefer a free span rather than putting the second opening on top of the first.
  const holes = openingsOnSegment(design.room, wall, design.openings).sort((a, b) => a.from - b.from);
  const gaps: Array<[number, number]> = [];
  let end = 0;
  for (const hole of holes) {
    if (hole.from > end) gaps.push([end, hole.from]);
    end = Math.max(end, hole.to);
  }
  gaps.push([end, wall.length]);
  const [a, b] = gaps.sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]))[0];
  if (b - a < 100) throw new RangeError('No space for another opening.');
  const width = Math.min(defaults.width, Math.floor(b - a));
  const cardinal = (['top', 'right', 'bottom', 'left'] as const)[Math.round(wall.angle / 90) % 4];
  apply((design) => {
    const opening: Opening = { id, kind, wall: cardinal, wallId: wall.id, ...defaults, width, offset: Math.round((a + b - width) / 2) };
    return ops.addOpening(design, opening);
  });
  useUiStore.getState().selectRoomObject({ type: 'opening', id }, wall.id);
  return id;
}

export function updateOpening(id: string, patch: Partial<Omit<Opening, 'id' | 'kind'>>): void {
  if (useUiStore.getState().view !== 'plan') return;
  apply((design) => ops.updateOpening(design, id, patch));
}

export function removeOpening(id: string): void {
  if (useUiStore.getState().view !== 'plan') return;
  apply((design) => ops.removeOpening(design, id));
  if (useUiStore.getState().roomSelection?.id === id) useUiStore.getState().selectRoomObject(null);
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
  const { notice } = useFeedback.getState();
  if (notice?.action?.kind === 'fresh' && undoFeedback(notice)) return;
  useDesignStore.getState().undo();
}

export function redo(): void {
  useDesignStore.getState().redo();
}

export function setStyle(patch: Partial<KitchenStyle>): void {
  apply((design) => ops.setStyle(design, patch));
}

function showKitchen(view: 'plan' | '3d', camera: CameraView = 'perspective'): void {
  const ui = useUiStore.getState();
  finishRoom();
  ui.select(null);
  ui.setLayoutsOpen(false);
  ui.setView(view);
  ui.setReferenceOpen(false);
  ui.requestCamera(camera);
}

/** Furniture is never relocated by a gallery idea. In an empty room, review a fit first. */
export function applyKitchenDesign(preset: GalleryKitchen): boolean {
  if (!current().items.length) {
    useUiStore.getState().reviewFit({ type: 'idea', id: preset.id });
    return false;
  }
  apply((design) => {
    const styled = applyKitchenLook(design, preset);
    return styled.galleryPresetId === preset.id ? styled : { ...styled, galleryPresetId: preset.id };
  });
  const { previewView }: KitchenPreset = preset;
  showKitchen('3d', previewView);
  return true;
}

/** Commit exactly what was drawn, never a stale preview from another room or project. */
export function acceptFit({ source, request, fit, candidate }: IdeaReview): boolean {
  if (!candidate || current() !== source || useDesignStore.getState().gestureBase) return false;
  apply(() => candidate);
  const preset: KitchenPreset | undefined = request.type === 'idea' ? KITCHEN_DESIGNS.find((p) => p.id === request.id) : undefined;
  showKitchen(request.type === 'idea' ? '3d' : 'plan', preset?.previewView);
  useUiStore.setState({ fitNotice: candidate !== source ? { design: candidate, changes: fit?.changes.length ?? 0 } : null });
  return true;
}

/** The original, including its prepared room, opens only as an explicitly separate project. */
export function openKitchenOriginal(preset: GalleryKitchen): void {
  const t = currentMessages();
  const name = t.kitchens.names[preset.id];
  createProject(name);
  useDesignStore.getState().load(createKitchenDesign(preset, name, t.labelPrefix));
  showKitchen('3d', originalView(preset));
}

export function openPhotoDesign(id: PairedPhotoId): void {
  const messages = currentMessages();
  const design = createPhotoDesign(id, messages.references.names[id], messages.labelPrefix);
  createProject(design.name);
  useDesignStore.getState().load(design);
  const ui = useUiStore.getState();
  ui.select(null);
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
