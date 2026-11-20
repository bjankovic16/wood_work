import { DEFAULT_CONSTRUCTION, DEFAULT_EDGE_BANDS, DEFAULT_MATERIALS, parseConstruction, parseEdgeBands, parseMaterials, SETTING_LIMITS, withModuleMaterials } from '../engine/settings';
import { buildContext } from '../engine/config';
import { withPanelThickness } from '../engine/parts';
import { SHEET_TRIM } from '../engine/nesting';
import { BAR_MATERIAL_ID, ELEVATION_LIMITS, GLASS_MATERIAL_ID, KIND_SPECS, MODULE_MATERIAL_DEFAULTS, sizeLimits, type SizeField } from './catalog';
import { clampToRoom, resizeFromAnchor } from './geometry';
import { clamp } from './math';
import { clampOpening } from './openings';
import { featureFitsRoom, normalizeRoom, parseRoom, ROOM_LIMITS } from './roomGeometry';
export { ROOM_LIMITS } from './roomGeometry';
import { DEFAULT_STYLE, FRONT_FINISHES, parseStyle, type FrontFinish, type KitchenStyle } from './style';
import { parsePhotoReference } from './photoReferences';
import type { ConstructionSettings, CustomPart, Design, EdgeBand, ItemKind, KitchenItem, Material, Opening, PartEdit, Room, RoomFeature } from './types';
import { normalizeAngle, validRoomPolygon } from './polygons';
import { roomSegments } from './walls';

/**
 * Pure operations on a design. Each returns the same object when nothing
 * changes, so callers can skip no-op history entries.
 */

export const DEFAULT_ROOM: Room = { width: 3600, depth: 3000, height: 2600 };

export function createDesign(name = 'My kitchen'): Design {
  return {
    version: 5,
    name,
    room: { ...DEFAULT_ROOM },
    items: [],
    openings: [],
    materials: structuredClone(DEFAULT_MATERIALS),
    edgeBands: structuredClone(DEFAULT_EDGE_BANDS),
    construction: structuredClone(DEFAULT_CONSTRUCTION),
    style: { ...DEFAULT_STYLE },
    customParts: [],
    partEdits: {},
  };
}

export function syncPanelWidths(design: Design): Design {
  if (!design.items.some((item) => item.kind === 'endPanel')) return design;
  const ctx = buildContext(design);
  const items = design.items.map((item) => withPanelThickness(item, ctx, design.partEdits[item.id]));
  return items.some((item, i) => item !== design.items[i]) ? { ...design, items } : design;
}

export function setConstruction(design: Design, patch: Partial<ConstructionSettings>): Design {
  const next = { ...design.construction, ...patch };
  const changed = (Object.keys(patch) as Array<keyof ConstructionSettings>).some(
    (key) => JSON.stringify(next[key]) !== JSON.stringify(design.construction[key]),
  );
  return changed ? syncPanelWidths({ ...design, construction: next }) : design;
}

function shallowEqual<T extends object>(a: T, b: T): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof T>;
  for (const key of keys) if (a[key] !== b[key]) return false;
  return true;
}

export function setName(design: Design, name: string): Design {
  return name === design.name ? design : { ...design, name };
}

/** Changes the room size and pulls any unit that would end up outside back in. */
export function setRoom(design: Design, patch: Partial<Room>): Design {
  if (design.room.vertices && !Object.hasOwn(patch, 'vertices')
    && (patch.width !== undefined && patch.width !== design.room.width
      || patch.depth !== undefined && patch.depth !== design.room.depth)) {
    throw new RangeError('Edit the walls or corners to resize a custom room outline.');
  }
  const room = normalizeRoom({
    ...design.room,
    ...patch,
    width: Math.round(clamp(patch.width ?? design.room.width, ROOM_LIMITS.width.min, ROOM_LIMITS.width.max)),
    depth: Math.round(clamp(patch.depth ?? design.room.depth, ROOM_LIMITS.depth.min, ROOM_LIMITS.depth.max)),
    height: Math.round(clamp(patch.height ?? design.room.height, ROOM_LIMITS.height.min, ROOM_LIMITS.height.max)),
  });
  if (room.vertices && (!validRoomPolygon(room.vertices) || room.vertices.some((p) => p.x < 0 || p.y < 0 || p.x > room.width || p.y > room.depth))) {
    throw new RangeError('Invalid room polygon.');
  }
  if ((room.partitions || room.treatments) && !parseRoom(room)) throw new RangeError('Invalid wall dimensions or position.');
  for (const treatment of room.treatments ?? []) {
    const frame = roomSegments(room).find((s) => s.id === treatment.wallId);
    if (!frame || treatment.offset + treatment.width > frame.length + 0.01 || treatment.elevation + treatment.height > frame.height)
      throw new RangeError('Wall finish does not fit its wall.');
  }
  const segmentIds = new Set(roomSegments(room).map((s) => s.id));
  if (design.openings.some((o) => o.wallId && !segmentIds.has(o.wallId))) throw new RangeError('Remove openings before removing their wall.');
  if (shallowEqual(room, design.room) || JSON.stringify(room) === JSON.stringify(design.room)) return design;
  return {
    ...design,
    room,
    items: room.vertices && !Object.hasOwn(patch, 'vertices') ? design.items : design.items.map((item) => clampToRoom(item, room)),
    openings: design.openings.map((opening) => clampOpening(opening, room)),
  };
}

export function addItem(design: Design, item: KitchenItem): Design {
  const items = [...design.items, item];
  return syncPanelWidths({ ...design, items, materials: withModuleMaterials(design.materials, items) });
}

export function updateItem(design: Design, id: string, patch: Partial<KitchenItem>): Design {
  let changed = false;
  const items = design.items.map((item) => {
    if (item.id !== id) return item;
    const next = { ...item, ...patch, id };
    if (shallowEqual(next, item)) return item;
    changed = true;
    return next;
  });
  return changed ? syncPanelWidths({ ...design, items }) : design;
}

/** Replaces a unit as a whole, so edits can also remove optional settings. */
export function replaceItem(design: Design, next: KitchenItem): Design {
  let changed = false;
  const items = design.items.map((item) => {
    if (item.id !== next.id || shallowEqual(item, next)) return item;
    changed = true;
    return next;
  });
  return changed ? syncPanelWidths({ ...design, items }) : design;
}

export function removeItem(design: Design, id: string): Design {
  const items = design.items.filter((item) => item.id !== id);
  if (items.length === design.items.length) return design;
  const partEdits = { ...design.partEdits };
  delete partEdits[id];
  return { ...design, items, partEdits };
}

export function clearItems(design: Design): Design {
  return design.items.length === 0 ? design : { ...design, items: [], partEdits: {} };
}

/** Sets one dimension, clamped to what the unit type allows. The back-left corner stays in place. */
export function withSize(item: KitchenItem, field: SizeField, value: number, room: Room): KitchenItem {
  if (item.kind === 'endPanel' && field === 'width') throw new RangeError('End-panel width comes from its stock thickness.');
  const limits = sizeLimits(item, field);
  const size = Math.round(clamp(value, limits.min, limits.max));
  if (field === 'height') return size === item.height ? item : { ...item, height: size };
  return clampToRoom(resizeFromAnchor(item, { [field]: size }), room);
}

export function withElevation(item: KitchenItem, value: number): KitchenItem {
  const elevation = Math.round(clamp(value, ELEVATION_LIMITS.min, ELEVATION_LIMITS.max));
  return elevation === item.elevation ? item : { ...item, elevation };
}

export function withPosition(item: KitchenItem, x: number, y: number, room: Room): KitchenItem {
  return clampToRoom({ ...item, x: Math.round(x), y: Math.round(y) }, room);
}

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const validId = (value: unknown): value is string => typeof value === 'string' && !!value.trim()
  && !['__proto__', 'constructor', 'prototype'].includes(value);
const isKind = (value: unknown): value is ItemKind => typeof value === 'string' && Object.hasOwn(KIND_SPECS, value);

function identifiedCollection(raw: unknown): boolean {
  if (raw === undefined) return true;
  if (!Array.isArray(raw)) return false;
  const ids = new Set<string>();
  return raw.every((entry) => {
    if (!isRecord(entry) || !validId(entry.id) || ids.has(entry.id)) return false;
    ids.add(entry.id);
    return true;
  });
}

function validStock(raw: unknown, sheet: boolean): boolean {
  if (raw === undefined) return true;
  return Array.isArray(raw) && raw.every((entry: unknown) => isRecord(entry)
    && (entry.name === undefined || typeof entry.name === 'string' && !!entry.name.trim())
    && ['thickness', ...(sheet ? ['sheetLength', 'sheetWidth'] : [])].every((key) =>
      entry[key] === undefined || isNumber(entry[key]) && entry[key] > (key === 'thickness' ? 0 : 2 * SHEET_TRIM))
    && (entry.price === undefined || isNumber(entry.price) && entry.price >= 0)
    && (!sheet || entry.grain === undefined || typeof entry.grain === 'boolean'));
}

/** Per-unit thicknesses as designs saved before the materials library stored them. */
interface LegacyThickness {
  carcassThickness?: number;
  backThickness?: number;
}

function parseItem(raw: unknown): { item: KitchenItem; legacy: LegacyThickness } | null {
  if (!isRecord(raw)) return null;
  const v = raw;
  if (!validId(v.id) || !isKind(v.kind)) return null;
  if (![v.x, v.y, v.width, v.depth, v.height, v.elevation].every(isNumber)) return null;
  if (!isNumber(v.rotation) || (v.width as number) <= 0 || (v.depth as number) <= 0 || (v.height as number) <= 0) return null;
  const item: KitchenItem = {
    id: v.id,
    kind: v.kind,
    label: typeof v.label === 'string' ? v.label : '',
    x: v.x as number,
    y: v.y as number,
    rotation: normalizeAngle(v.rotation),
    width: v.width as number,
    depth: v.depth as number,
    height: v.height as number,
    elevation: v.elevation as number,
  };
  if (v.width2 !== undefined) {
    if (!isNumber(v.width2) || v.width2 <= 0) return null;
    item.width2 = v.width2;
  }
  for (const key of ['doors', 'drawers', 'shelves'] as const) {
    if (v[key] === undefined) continue;
    const count = v[key];
    // Kind changes can retain dormant counts; the engine applies the current kind's ranges.
    if (!isNumber(count) || !Number.isInteger(count) || count < 0) return null;
    item[key] = count;
  }
  if (v.label !== undefined && typeof v.label !== 'string') return null;
  for (const [key, choices] of [
    ['doorType', ['overlay', 'inset']], ['hinge', ['left', 'right']],
    ['drawerLayout', ['equal', 'shallowTop']], ['shelfForm', ['floating']],
  ] as const) if (v[key] !== undefined && !choices.some((choice) => choice === v[key])) return null;
  if (['carcassThickness', 'backThickness'].some((key) => v[key] !== undefined && (!isNumber(v[key]) || v[key] <= 0))) return null;
  if (v.doorType === 'overlay' || v.doorType === 'inset') item.doorType = v.doorType;
  if (v.hinge === 'left' || v.hinge === 'right') item.hinge = v.hinge;
  if (v.drawerLayout === 'equal' || v.drawerLayout === 'shallowTop') item.drawerLayout = v.drawerLayout;
  if (item.kind === 'shelf' && v.shelfForm === 'floating') item.shelfForm = v.shelfForm;
  for (const key of ['carcassMaterial', 'backMaterial', 'frontMaterial'] as const) {
    if (v[key] !== undefined && !validId(v[key])) return null;
    if (typeof v[key] === 'string') item[key] = v[key];
  }
  for (const key of ['frontFinish', 'carcassFinish'] as const) {
    if (v[key] !== undefined && (typeof v[key] !== 'string' || !Object.hasOwn(FRONT_FINISHES, v[key]))) return null;
    if (typeof v[key] === 'string' && Object.hasOwn(FRONT_FINISHES, v[key])) item[key] = v[key] as FrontFinish;
  }
  const legacy: LegacyThickness = {};
  if (isNumber(v.carcassThickness)) legacy.carcassThickness = v.carcassThickness;
  if (isNumber(v.backThickness)) legacy.backThickness = v.backThickness;
  return { item, legacy };
}

function parseOpening(raw: unknown, room: Room): Opening | null {
  if (!isRecord(raw)) return null;
  const v = raw;
  if (!validId(v.id) || (v.kind !== 'window' && v.kind !== 'door')) return null;
  if (v.wall !== 'top' && v.wall !== 'right' && v.wall !== 'bottom' && v.wall !== 'left') return null;
  if (![v.offset, v.width, v.height].every(isNumber)) return null;
  if ((v.width as number) <= 0 || (v.height as number) <= 0 || v.sill !== undefined && !isNumber(v.sill)) return null;
  return clampOpening(
    {
      id: v.id,
      kind: v.kind,
      wall: v.wall,
      ...(typeof v.wallId === 'string' ? { wallId: v.wallId } : {}),
      offset: v.offset as number,
      width: v.width as number,
      height: v.height as number,
      sill: isNumber(v.sill) ? v.sill : 0,
    },
    room,
  );
}

/**
 * Designs from before the materials library could give a unit its own board
 * thickness. Those units now get a material of that thickness instead.
 */
function migrateThicknesses(
  parsed: Array<{ item: KitchenItem; legacy: LegacyThickness }>,
  materials: Material[],
  construction: ConstructionSettings,
): { items: KitchenItem[]; materials: Material[] } {
  const library = [...materials];
  const variant = (baseId: string, thickness: number): string => {
    const base = library.find((m) => m.id === baseId) ?? library[0];
    if (base.thickness === thickness) return base.id;
    const existing = library.find((m) => m.name === base.name && m.thickness === thickness);
    if (existing) return existing.id;
    const created = { ...base, id: `${base.id}-${thickness}`, thickness };
    library.push(created);
    return created.id;
  };
  const items = parsed.map(({ item, legacy }) => {
    const next = { ...item };
    if (legacy.carcassThickness !== undefined && !next.carcassMaterial) {
      const id = variant(construction.carcassMaterial, legacy.carcassThickness);
      if (id !== construction.carcassMaterial) next.carcassMaterial = id;
    }
    if (legacy.backThickness !== undefined && !next.backMaterial) {
      const id = variant(construction.backMaterial, legacy.backThickness);
      if (id !== construction.backMaterial) next.backMaterial = id;
    }
    return next;
  });
  return { items, materials: library };
}

/**
 * Validates the whole project before loading it and migrates supported older formats.
 */
export function parseDesign(raw: unknown): Design | null {
  if (!isRecord(raw)) return null;
  const v = raw;
  if (v.version !== undefined && (!isNumber(v.version) || !Number.isInteger(v.version) || v.version < 1 || v.version > 5)) return null;
  const currentFormat = isNumber(v.version) && v.version >= 4;
  if (currentFormat && ['name', 'openings', 'materials', 'edgeBands', 'construction', 'style', 'customParts', 'partEdits']
    .some((key) => !Object.hasOwn(v, key) || v[key] === undefined)) return null;
  if (v.name !== undefined && typeof v.name !== 'string') return null;
  if (![v.items, v.openings, v.customParts, v.materials, v.edgeBands].every(identifiedCollection)
    || !validStock(v.materials, true) || !validStock(v.edgeBands, false)) return null;
  const room = parseRoom(v.room);
  if (!room) return null;
  const segments = roomSegments(room);
  if (new Set(segments.map((s) => s.id)).size !== segments.length) return null;
  if (room.treatments?.some((t) => {
    const segment = segments.find((s) => s.id === t.wallId);
    return !segment || t.offset + t.width > segment.length + 0.01 || t.elevation + t.height > segment.height;
  })) return null;
  if (Array.isArray(v.openings) && v.openings.some((o) => o?.wallId !== undefined
    && (typeof o.wallId !== 'string' || !segments.some((s) => s.id === o.wallId)))) return null;
  if (!Array.isArray(v.items)) return null;
  if (v.construction !== undefined && !isRecord(v.construction)) return null;
  const rawConstruction = isRecord(v.construction) ? v.construction : {};
  if (currentFormat && (Object.keys(DEFAULT_CONSTRUCTION).some((key) => !Object.hasOwn(rawConstruction, key) || rawConstruction[key] === undefined)
    || !Array.isArray(v.materials) || !v.materials.length
    || !v.materials.every((entry: unknown) => isRecord(entry) && ['name', 'thickness', 'sheetLength', 'sheetWidth', 'grain', 'price']
      .every((key) => Object.hasOwn(entry, key) && entry[key] !== undefined))
    || !Array.isArray(v.edgeBands) || !v.edgeBands.every((entry: unknown) => isRecord(entry)
      && ['name', 'thickness', 'price'].every((key) => Object.hasOwn(entry, key) && entry[key] !== undefined)))) return null;
  if (v.style !== undefined && !isRecord(v.style)) return null;
  const storedStyle: Record<string, unknown> = isRecord(v.style) ? v.style : {};
  const style = parseStyle(storedStyle);
  if (currentFormat && Object.keys(DEFAULT_STYLE).some((key) => storedStyle[key] === undefined)) return null;
  if (currentFormat) {
    if (Object.keys(storedStyle).some((key) => storedStyle[key] !== undefined && !Object.hasOwn(style, key))
      || (Object.keys(style) as Array<keyof KitchenStyle>).some((key) => storedStyle[key] !== undefined && storedStyle[key] !== style[key])) return null;
  }
  if (rawConstruction.subtractEdges !== undefined && typeof rawConstruction.subtractEdges !== 'boolean') return null;
  for (const [key, choices] of [
    ['bottomJoint', ['between', 'under']], ['topJoint', ['between', 'over']], ['baseTop', ['rails', 'full']],
    ['backMount', ['nailed', 'groove']], ['doorType', ['overlay', 'inset']], ['drawerSystem', ['wooden', 'metal']],
  ] as const) if (rawConstruction[key] !== undefined && !choices.some((choice) => choice === rawConstruction[key])) return null;
  for (const key of ['carcass', 'back', 'front']) {
    const board = rawConstruction[key];
    if (board !== undefined && (!isRecord(board) || !validStock([board], false))) return null;
  }
  for (const key of Object.keys(SETTING_LIMITS) as Array<keyof typeof SETTING_LIMITS>) {
    const value = rawConstruction[key];
    if (value !== undefined && (!isNumber(value) || value < SETTING_LIMITS[key].min || value > SETTING_LIMITS[key].max)) return null;
  }
  const edgeBands = parseEdgeBands(v.edgeBands);
  const parsedItems = v.items.map(parseItem).filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  if (parsedItems.length !== v.items.length) return null;
  const startMaterials = parseMaterials(v.materials, rawConstruction);
  const construction = parseConstruction(v.construction, startMaterials, edgeBands);
  const migrated = migrateThicknesses(parsedItems, startMaterials, construction);
  const items = migrated.items;
  const materials = withModuleMaterials(migrated.materials, items);
  const materialIds = new Set(materials.map((m) => m.id));
  const bandIds = new Set(edgeBands.map((band) => band.id));
  if (['carcassMaterial', 'backMaterial', 'frontMaterial'].some((key) => rawConstruction[key] !== undefined
    && (typeof rawConstruction[key] !== 'string' || !materialIds.has(rawConstruction[key])))) return null;
  if (['carcassEdge', 'frontEdge'].some((key) => rawConstruction[key] !== undefined && rawConstruction[key] !== null
    && (typeof rawConstruction[key] !== 'string' || !bandIds.has(rawConstruction[key])))) return null;
  if (items.some((item) => (['carcassMaterial', 'backMaterial', 'frontMaterial'] as const)
    .some((key) => item[key] !== undefined && !materialIds.has(item[key])))) return null;
  const checkedItems = items.map((item) => ({ ...MODULE_MATERIAL_DEFAULTS[item.kind], ...item }));
  const itemIds = new Set(checkedItems.map((item) => item.id));
  const openings = Array.isArray(v.openings) ? v.openings.map((o) => parseOpening(o, room)) : [];
  const customParts = Array.isArray(v.customParts) ? v.customParts.map((c) => parseCustomPart(c, materialIds, edgeBands, construction)) : [];
  const partEdits = parsePartEdits(v.partEdits, itemIds, materialIds);
  if (openings.some((o) => o === null) || customParts.some((part) => part === null) || !partEdits) return null;
  const referencePhoto = v.referencePhoto === undefined ? undefined : parsePhotoReference(v.referencePhoto);
  if (referencePhoto === null) return null;
  return syncPanelWidths({
    version: 5,
    name: typeof v.name === 'string' ? v.name : 'My kitchen',
    ...(typeof v.galleryPresetId === 'string' && /^[a-z0-9-]{1,80}$/.test(v.galleryPresetId) ? { galleryPresetId: v.galleryPresetId } : {}),
    room,
    items: checkedItems,
    openings: openings.filter((o): o is Opening => o !== null),
    materials,
    edgeBands,
    construction,
    style,
    customParts: customParts.filter((c): c is CustomPart => c !== null),
    partEdits,
    ...(referencePhoto ? { referencePhoto } : {}),
  });
}

function parseCustomPart(raw: unknown, materialIds: Set<string>, edgeBands: EdgeBand[], construction: ConstructionSettings): CustomPart | null {
  if (!isRecord(raw)) return null;
  const v = raw;
  if (!validId(v.id) || ![v.quantity, v.length, v.width].every(isNumber)
    || !Number.isInteger(v.quantity) || (v.quantity as number) < 1 || (v.quantity as number) > 999
    || (v.length as number) <= 0 || (v.width as number) <= 0 || (v.length as number) > 6000 || (v.width as number) > 6000) return null;
  if (v.name !== undefined && (typeof v.name !== 'string' || !v.name.trim()) || v.note !== undefined && typeof v.note !== 'string') return null;
  if (v.materialId !== undefined && (typeof v.materialId !== 'string' || !materialIds.has(v.materialId))) return null;
  if (v.edgeBandId !== undefined && v.edgeBandId !== null
    && (typeof v.edgeBandId !== 'string' || !edgeBands.some((band) => band.id === v.edgeBandId))) return null;
  if (['edgesLength', 'edgesWidth'].some((key) => v[key] !== undefined
    && (!isNumber(v[key]) || !Number.isInteger(v[key]) || v[key] < 0 || v[key] > 2))) return null;
  const edges = (value: unknown) => (isNumber(value) ? Math.min(2, Math.max(0, Math.round(value))) : 0);
  return {
    id: v.id,
    name: typeof v.name === 'string' && v.name.trim() ? v.name : 'Piece',
    quantity: Math.max(1, Math.round(v.quantity as number)),
    length: Math.max(1, v.length as number),
    width: Math.max(1, v.width as number),
    materialId: typeof v.materialId === 'string' && materialIds.has(v.materialId) ? v.materialId : construction.carcassMaterial,
    edgesLength: edges(v.edgesLength),
    edgesWidth: edges(v.edgesWidth),
    edgeBandId: typeof v.edgeBandId === 'string' && edgeBands.some((b) => b.id === v.edgeBandId) ? v.edgeBandId : null,
    note: typeof v.note === 'string' ? v.note : '',
  };
}

function parsePartEdits(raw: unknown, itemIds: Set<string>, materialIds: Set<string>): Record<string, Record<string, PartEdit>> | null {
  const result: Record<string, Record<string, PartEdit>> = {};
  if (raw === undefined) return result;
  if (!isRecord(raw)) return null;
  for (const [itemId, edits] of Object.entries(raw)) {
    if (!itemIds.has(itemId) || !isRecord(edits)) return null;
    const parsed: Record<string, PartEdit> = {};
    for (const [key, edit] of Object.entries(edits)) {
      if (!validId(key) || !isRecord(edit)) return null;
      const e = edit;
      if (['length', 'width'].some((field) => e[field] !== undefined
        && (!isNumber(e[field]) || e[field] <= 0 || e[field] > 6000))) return null;
      if (e.quantity !== undefined && (!isNumber(e.quantity) || !Number.isInteger(e.quantity) || e.quantity < 0 || e.quantity > 999)) return null;
      if (e.materialId !== undefined && (typeof e.materialId !== 'string' || !materialIds.has(e.materialId))) return null;
      const clean: PartEdit = {};
      if (isNumber(e.length) && e.length > 0) clean.length = e.length;
      if (isNumber(e.width) && e.width > 0) clean.width = e.width;
      if (isNumber(e.quantity) && e.quantity >= 0) clean.quantity = Math.round(e.quantity);
      if (typeof e.materialId === 'string' && materialIds.has(e.materialId)) clean.materialId = e.materialId;
      if (Object.keys(clean).length > 0) parsed[key] = clean;
    }
    if (Object.keys(parsed).length > 0) result[itemId] = parsed;
  }
  return result;
}

export function addCustomPart(design: Design, part: CustomPart): Design {
  return { ...design, customParts: [...design.customParts, part] };
}

export function updateCustomPart(design: Design, id: string, patch: Partial<Omit<CustomPart, 'id'>>): Design {
  let changed = false;
  const customParts = design.customParts.map((part) => {
    if (part.id !== id) return part;
    const next = { ...part, ...patch };
    if (shallowEqual(next, part)) return part;
    changed = true;
    return next;
  });
  return changed ? { ...design, customParts } : design;
}

export function removeCustomPart(design: Design, id: string): Design {
  const customParts = design.customParts.filter((part) => part.id !== id);
  return customParts.length === design.customParts.length ? design : { ...design, customParts };
}

/** Changes one generated part of a unit by hand; undefined puts it back as the rules make it. */
export function setPartEdit(design: Design, itemId: string, key: string, edit: PartEdit | undefined): Design {
  const unitEdits = { ...(design.partEdits[itemId] ?? {}) };
  if (edit && Object.keys(edit).length > 0) {
    if (JSON.stringify(unitEdits[key]) === JSON.stringify(edit)) return design;
    unitEdits[key] = edit;
  } else {
    if (!(key in unitEdits)) return design;
    delete unitEdits[key];
  }
  const partEdits = { ...design.partEdits };
  if (Object.keys(unitEdits).length > 0) partEdits[itemId] = unitEdits;
  else delete partEdits[itemId];
  return syncPanelWidths({ ...design, partEdits });
}

type CountKey = 'doors' | 'drawers' | 'shelves';
type OptionKey = 'doorType' | 'hinge' | 'drawerLayout' | 'shelfForm' | 'carcassMaterial' | 'backMaterial' | 'frontMaterial' | 'frontFinish' | 'carcassFinish';

function without<K extends keyof KitchenItem>(item: KitchenItem, key: K): KitchenItem {
  if (item[key] === undefined) return item;
  const next = { ...item };
  delete next[key];
  return next;
}

/** Sets a door/drawer/shelf count; undefined returns it to the default for the unit. */
export function withCount(item: KitchenItem, key: CountKey, value: number | undefined): KitchenItem {
  if (value === undefined) return without(item, key);
  const count = Math.max(0, Math.round(value));
  return count === item[key] ? item : { ...item, [key]: count };
}

/** Sets a door, drawer or material choice; undefined returns it to the kitchen-wide setting. */
export function withOption<K extends OptionKey>(item: KitchenItem, key: K, value: KitchenItem[K] | undefined): KitchenItem {
  if (value === undefined) return without(item, key);
  return value === item[key] ? item : { ...item, [key]: value };
}

export function addMaterial(design: Design, material: Material): Design {
  return { ...design, materials: [...design.materials, material] };
}

export function updateMaterial(design: Design, id: string, patch: Partial<Omit<Material, 'id'>>): Design {
  let changed = false;
  const materials = design.materials.map((m) => {
    if (m.id !== id) return m;
    const next = { ...m, ...patch };
    if (shallowEqual(next, m)) return m;
    changed = true;
    return next;
  });
  return changed ? syncPanelWidths({ ...design, materials }) : design;
}

/** Whether the kitchen-wide settings use a material (such materials cannot be removed). */
export function materialInUse(design: Design, id: string): boolean {
  const c = design.construction;
  return c.carcassMaterial === id || c.backMaterial === id || c.frontMaterial === id ||
    design.items.some((item) =>
      (item.kind === 'glassWall' && (item.frontMaterial ?? GLASS_MATERIAL_ID) === id) ||
      (item.kind === 'bar' && (item.carcassMaterial ?? BAR_MATERIAL_ID) === id),
    );
}

/** Removes a material; units and pieces that used it go back to the kitchen-wide one. */
export function removeMaterial(design: Design, id: string): Design {
  if (materialInUse(design, id) || !design.materials.some((m) => m.id === id)) return design;
  const partEdits: Design['partEdits'] = {};
  for (const [itemId, edits] of Object.entries(design.partEdits)) {
    const kept: Record<string, PartEdit> = {};
    for (const [key, edit] of Object.entries(edits)) {
      const { materialId, ...rest } = edit;
      const next = materialId === id ? rest : edit;
      if (Object.keys(next).length > 0) kept[key] = next;
    }
    if (Object.keys(kept).length > 0) partEdits[itemId] = kept;
  }
  return syncPanelWidths({
    ...design,
    materials: design.materials.filter((m) => m.id !== id),
    customParts: design.customParts.map((part) => (part.materialId === id ? { ...part, materialId: design.construction.carcassMaterial } : part)),
    items: design.items.map((item) =>
      (['carcassMaterial', 'backMaterial', 'frontMaterial'] as const).reduce((it, key) => (it[key] === id ? without(it, key) : it), item),
    ),
    partEdits,
  });
}

export function addEdgeBand(design: Design, band: EdgeBand): Design {
  return { ...design, edgeBands: [...design.edgeBands, band] };
}

export function updateEdgeBand(design: Design, id: string, patch: Partial<Omit<EdgeBand, 'id'>>): Design {
  let changed = false;
  const edgeBands = design.edgeBands.map((b) => {
    if (b.id !== id) return b;
    const next = { ...b, ...patch };
    if (shallowEqual(next, b)) return b;
    changed = true;
    return next;
  });
  return changed ? { ...design, edgeBands } : design;
}

/** Removes an edge band; parts that used it are left unbanded. */
export function removeEdgeBand(design: Design, id: string): Design {
  if (!design.edgeBands.some((b) => b.id === id)) return design;
  const c = design.construction;
  return {
    ...design,
    edgeBands: design.edgeBands.filter((b) => b.id !== id),
    customParts: design.customParts.map((part) => part.edgeBandId === id ? { ...part, edgeBandId: null } : part),
    construction: {
      ...c,
      carcassEdge: c.carcassEdge === id ? null : c.carcassEdge,
      frontEdge: c.frontEdge === id ? null : c.frontEdge,
    },
  };
}

export function addOpening(design: Design, opening: Opening): Design {
  return { ...design, openings: [...design.openings, clampOpening(opening, design.room)] };
}

/** A structure edit must not reposition cabinets or openings, even when they already have errors. */
export function updateRoomFeature(design: Design, id: string, patch: Partial<Omit<RoomFeature, 'id' | 'kind'>>): Design {
  if (!design.room.features?.some((feature) => feature.id === id)) return design;
  const room = normalizeRoom({ ...design.room, features: design.room.features.map((feature) => feature.id === id ? { ...feature, ...patch } : feature) });
  const feature = room.features!.find((f) => f.id === id)!;
  if (!featureFitsRoom(room, feature)) throw new RangeError('Structure is outside the room.');
  return JSON.stringify(room) === JSON.stringify(design.room) ? design : { ...design, room };
}

export function updateOpening(design: Design, id: string, patch: Partial<Omit<Opening, 'id' | 'kind'>>): Design {
  let changed = false;
  const openings = design.openings.map((o) => {
    if (o.id !== id) return o;
    const next = clampOpening({ ...o, ...patch }, design.room);
    if (shallowEqual(next, o)) return o;
    changed = true;
    return next;
  });
  return changed ? { ...design, openings } : design;
}

export function removeOpening(design: Design, id: string): Design {
  const openings = design.openings.filter((o) => o.id !== id);
  return openings.length === design.openings.length ? design : { ...design, openings };
}

export function setStyle(design: Design, patch: Partial<KitchenStyle>): Design {
  const style = { ...design.style, ...patch };
  return shallowEqual(style, design.style) ? design : { ...design, style };
}
