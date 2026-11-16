import { DEFAULT_CONSTRUCTION, DEFAULT_EDGE_BANDS, DEFAULT_MATERIALS, parseConstruction, parseEdgeBands, parseMaterials, withModuleMaterials } from '../engine/settings';
import { BAR_MATERIAL_ID, ELEVATION_LIMITS, GLASS_MATERIAL_ID, KIND_SPECS, MODULE_MATERIAL_DEFAULTS, sizeLimits, type SizeField } from './catalog';
import { clampToRoom, resizeFromAnchor } from './geometry';
import { clamp } from './math';
import { clampOpening } from './openings';
import { normalizeRoom, parseRoom, ROOM_LIMITS } from './roomGeometry';
export { ROOM_LIMITS } from './roomGeometry';
import { DEFAULT_STYLE, FRONT_FINISHES, parseStyle, type FrontFinish, type KitchenStyle } from './style';
import { parsePhotoReference } from './photoReferences';
import type { ConstructionSettings, CustomPart, Design, EdgeBand, ItemKind, KitchenItem, Material, Opening, PartEdit, Room } from './types';
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

export function setConstruction(design: Design, patch: Partial<ConstructionSettings>): Design {
  const next = { ...design.construction, ...patch };
  const changed = (Object.keys(patch) as Array<keyof ConstructionSettings>).some(
    (key) => JSON.stringify(next[key]) !== JSON.stringify(design.construction[key]),
  );
  return changed ? { ...design, construction: next } : design;
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
    items: design.items.map((item) => clampToRoom(item, room)),
    openings: design.openings.map((opening) => clampOpening(opening, room)),
  };
}

export function addItem(design: Design, item: KitchenItem): Design {
  const items = [...design.items, item];
  return { ...design, items, materials: withModuleMaterials(design.materials, items) };
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
  return changed ? { ...design, items } : design;
}

/** Replaces a unit as a whole, so edits can also remove optional settings. */
export function replaceItem(design: Design, next: KitchenItem): Design {
  let changed = false;
  const items = design.items.map((item) => {
    if (item.id !== next.id || shallowEqual(item, next)) return item;
    changed = true;
    return next;
  });
  return changed ? { ...design, items } : design;
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

/** Per-unit thicknesses as designs saved before the materials library stored them. */
interface LegacyThickness {
  carcassThickness?: number;
  backThickness?: number;
}

function parseItem(raw: unknown): { item: KitchenItem; legacy: LegacyThickness } | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as Record<string, unknown>;
  if (typeof v.id !== 'string' || typeof v.kind !== 'string' || !(v.kind in KIND_SPECS)) return null;
  if (![v.x, v.y, v.width, v.depth, v.height, v.elevation].every(isNumber)) return null;
  if (!isNumber(v.rotation)) return null;
  const item: KitchenItem = {
    id: v.id,
    kind: v.kind as ItemKind,
    label: typeof v.label === 'string' ? v.label : '',
    x: v.x as number,
    y: v.y as number,
    rotation: normalizeAngle(v.rotation),
    width: v.width as number,
    depth: v.depth as number,
    height: v.height as number,
    elevation: v.elevation as number,
  };
  if (isNumber(v.width2)) item.width2 = v.width2;
  for (const key of ['doors', 'drawers', 'shelves'] as const) {
    if (isNumber(v[key])) item[key] = v[key];
  }
  if (v.doorType === 'overlay' || v.doorType === 'inset') item.doorType = v.doorType;
  if (v.hinge === 'left' || v.hinge === 'right') item.hinge = v.hinge;
  if (v.drawerLayout === 'equal' || v.drawerLayout === 'shallowTop') item.drawerLayout = v.drawerLayout;
  for (const key of ['carcassMaterial', 'backMaterial', 'frontMaterial'] as const) {
    if (typeof v[key] === 'string') item[key] = v[key];
  }
  for (const key of ['frontFinish', 'carcassFinish'] as const) {
    if (typeof v[key] === 'string' && Object.hasOwn(FRONT_FINISHES, v[key])) item[key] = v[key] as FrontFinish;
  }
  const legacy: LegacyThickness = {};
  if (isNumber(v.carcassThickness)) legacy.carcassThickness = v.carcassThickness;
  if (isNumber(v.backThickness)) legacy.backThickness = v.backThickness;
  return { item, legacy };
}

function parseOpening(raw: unknown, room: Room): Opening | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as Record<string, unknown>;
  if (typeof v.id !== 'string' || (v.kind !== 'window' && v.kind !== 'door')) return null;
  if (v.wall !== 'top' && v.wall !== 'right' && v.wall !== 'bottom' && v.wall !== 'left') return null;
  if (![v.offset, v.width, v.height].every(isNumber)) return null;
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
 * Validates data loaded from storage. Items that cannot be read are dropped,
 * and designs saved by earlier versions are brought up to date.
 */
export function parseDesign(raw: unknown): Design | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as Record<string, unknown>;
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
  const rawConstruction = (v.construction ?? {}) as Record<string, unknown>;
  const edgeBands = parseEdgeBands(v.edgeBands);
  const parsedItems = v.items.map(parseItem).filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  const startMaterials = parseMaterials(v.materials, rawConstruction);
  const construction = parseConstruction(v.construction, startMaterials, edgeBands);
  const migrated = migrateThicknesses(parsedItems, startMaterials, construction);
  const items = migrated.items;
  const materials = withModuleMaterials(migrated.materials, items);
  const materialIds = new Set(materials.map((m) => m.id));
  // Forget unit materials that are no longer in the library.
  const checkedItems = items.map((item) => {
    const next = { ...item };
    for (const key of ['carcassMaterial', 'backMaterial', 'frontMaterial'] as const) {
      if (next[key] !== undefined && !materialIds.has(next[key])) delete next[key];
    }
    return { ...MODULE_MATERIAL_DEFAULTS[next.kind], ...next };
  });
  const itemIds = new Set(checkedItems.map((item) => item.id));
  const referencePhoto = v.referencePhoto === undefined ? undefined : parsePhotoReference(v.referencePhoto);
  if (referencePhoto === null) return null;
  return {
    version: 5,
    name: typeof v.name === 'string' ? v.name : 'My kitchen',
    room,
    items: checkedItems,
    openings: Array.isArray(v.openings) ? v.openings.map((o) => parseOpening(o, room)).filter((o): o is Opening => o !== null) : [],
    materials,
    edgeBands,
    construction,
    style: parseStyle(v.style),
    customParts: Array.isArray(v.customParts)
      ? v.customParts.map((c) => parseCustomPart(c, materialIds, edgeBands, construction)).filter((c): c is CustomPart => c !== null)
      : [],
    partEdits: parsePartEdits(v.partEdits, itemIds, materialIds),
    ...(referencePhoto ? { referencePhoto } : {}),
  };
}

function parseCustomPart(raw: unknown, materialIds: Set<string>, edgeBands: EdgeBand[], construction: ConstructionSettings): CustomPart | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as Record<string, unknown>;
  if (typeof v.id !== 'string' || ![v.quantity, v.length, v.width].every(isNumber)) return null;
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

function parsePartEdits(raw: unknown, itemIds: Set<string>, materialIds: Set<string>): Record<string, Record<string, PartEdit>> {
  const result: Record<string, Record<string, PartEdit>> = {};
  if (!raw || typeof raw !== 'object') return result;
  for (const [itemId, edits] of Object.entries(raw as Record<string, unknown>)) {
    if (!itemIds.has(itemId) || !edits || typeof edits !== 'object') continue;
    const parsed: Record<string, PartEdit> = {};
    for (const [key, edit] of Object.entries(edits as Record<string, unknown>)) {
      const e = (edit ?? {}) as Record<string, unknown>;
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
  return { ...design, partEdits };
}

type CountKey = 'doors' | 'drawers' | 'shelves';
type OptionKey = 'doorType' | 'hinge' | 'drawerLayout' | 'carcassMaterial' | 'backMaterial' | 'frontMaterial' | 'frontFinish' | 'carcassFinish';

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
  return changed ? { ...design, materials } : design;
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
  return {
    ...design,
    materials: design.materials.filter((m) => m.id !== id),
    customParts: design.customParts.map((part) => (part.materialId === id ? { ...part, materialId: design.construction.carcassMaterial } : part)),
    items: design.items.map((item) =>
      (['carcassMaterial', 'backMaterial', 'frontMaterial'] as const).reduce((it, key) => (it[key] === id ? without(it, key) : it), item),
    ),
    partEdits,
  };
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
