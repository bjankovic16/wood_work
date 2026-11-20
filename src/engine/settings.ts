import { BAR_MATERIAL_ID, GLASS_MATERIAL_ID } from '../domain/catalog';
import type {
  BackMount,
  BaseTop,
  BottomJoint,
  ConstructionSettings,
  DoorType,
  DrawerSystem,
  EdgeBand,
  Material,
  TopJoint,
  KitchenItem,
} from '../domain/types';

/** The usual 2800 × 2070 mm board. */
const SHEET = { sheetLength: 2800, sheetWidth: 2070 };

/** A starter library; every entry can be edited, removed or added to. */
export const DEFAULT_MATERIALS: Material[] = [
  { id: 'particleboard-white-18', name: 'White melamine particleboard', thickness: 18, ...SHEET, grain: false, price: 0 },
  { id: 'particleboard-white-16', name: 'White melamine particleboard', thickness: 16, ...SHEET, grain: false, price: 0 },
  { id: 'particleboard-oak-18', name: 'Oak-decor melamine particleboard', thickness: 18, ...SHEET, grain: true, price: 0 },
  { id: 'hdf-white-3', name: 'White HDF', thickness: 3, ...SHEET, grain: false, price: 0 },
  { id: 'mdf-18', name: 'MDF for painting', thickness: 18, ...SHEET, grain: false, price: 0 },
  { id: 'mdf-oak-19', name: 'Oak-veneered MDF', thickness: 19, ...SHEET, grain: true, price: 0 },
];

export const MODULE_MATERIALS: Material[] = [
  { id: GLASS_MATERIAL_ID, name: 'Clear cabinet glass', thickness: 4, sheetLength: 2400, sheetWidth: 1600, grain: false, price: 0 },
  { id: BAR_MATERIAL_ID, name: 'Worktop blank (choose finish)', thickness: 38, sheetLength: 4100, sheetWidth: 900, grain: true, price: 0 },
];

/** Older projects gain only the specialist stock that a newly added module needs. */
export function withModuleMaterials(materials: Material[], items: readonly KitchenItem[]): Material[] {
  const required = new Set<string>();
  if (items.some((item) => item.kind === 'glassWall')) required.add(GLASS_MATERIAL_ID);
  if (items.some((item) => item.kind === 'bar')) required.add(BAR_MATERIAL_ID);
  const missing = MODULE_MATERIALS.filter((material) => required.has(material.id) && !materials.some((existing) => existing.id === material.id));
  return missing.length ? [...materials, ...structuredClone(missing)] : materials;
}

export const DEFAULT_EDGE_BANDS: EdgeBand[] = [
  { id: 'abs-1', name: 'ABS edge 1 mm', thickness: 1, price: 0 },
  { id: 'abs-2', name: 'ABS edge 2 mm', thickness: 2, price: 0 },
  { id: 'pvc-04', name: 'PVC edge 0.4 mm', thickness: 0.4, price: 0 },
];

/**
 * Defaults: frameless European construction as most workshops build it —
 * 18 mm white melamine carcass with 1 mm edges, 3 mm HDF back nailed on,
 * bottom between the sides, two rails under the worktop, painted MDF fronts
 * with full overlay and 3 mm gaps, wooden drawer boxes on side slides.
 * The metal-system deductions are those of the common Blum TANDEMBOX.
 */
export const DEFAULT_CONSTRUCTION: ConstructionSettings = {
  carcassMaterial: 'particleboard-white-18',
  backMaterial: 'hdf-white-3',
  frontMaterial: 'mdf-18',
  carcassEdge: 'abs-1',
  frontEdge: null,
  subtractEdges: false,
  bottomJoint: 'between',
  topJoint: 'between',
  baseTop: 'rails',
  railWidth: 100,
  backMount: 'nailed',
  backInset: 2,
  grooveDepth: 8,
  grooveOffset: 10,
  shelfSetback: 20,
  doorType: 'overlay',
  frontGap: 3,
  drawerFrontHeight: 140,
  drawerSystem: 'wooden',
  slideClearance: 13,
  drawerBoxGap: 40,
  metalBottomDeduction: 75,
  metalBackDeduction: 87,
  metalDepthDeduction: 10,
};

export type NumericSetting = {
  [K in keyof ConstructionSettings]: ConstructionSettings[K] extends number ? K : never;
}[keyof ConstructionSettings];

export const SETTING_LIMITS: Record<NumericSetting, { min: number; max: number }> = {
  railWidth: { min: 40, max: 300 },
  backInset: { min: 0, max: 10 },
  grooveDepth: { min: 4, max: 15 },
  grooveOffset: { min: 4, max: 40 },
  shelfSetback: { min: 0, max: 150 },
  frontGap: { min: 0, max: 10 },
  drawerFrontHeight: { min: 80, max: 400 },
  slideClearance: { min: 0, max: 40 },
  drawerBoxGap: { min: 10, max: 150 },
  metalBottomDeduction: { min: 0, max: 200 },
  metalBackDeduction: { min: 0, max: 200 },
  metalDepthDeduction: { min: 0, max: 60 },
};

export const MATERIAL_LIMITS = {
  thickness: { min: 2, max: 50 },
  sheetLength: { min: 300, max: 6000 },
  sheetWidth: { min: 300, max: 3000 },
  price: { min: 0, max: 1_000_000 },
} as const;

export const EDGE_LIMITS = {
  thickness: { min: 0.1, max: 5 },
  price: { min: 0, max: 10_000 },
} as const;

const oneOf = <T extends string>(value: unknown, options: readonly T[], fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback;

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const positive = (value: unknown, fallback: number) => (isNumber(value) && value > 0 ? value : fallback);
const text = (value: unknown, fallback: string) => (typeof value === 'string' && value.trim() ? value : fallback);

function parseMaterial(raw: unknown): Material | null {
  const v = (raw ?? {}) as Record<string, unknown>;
  if (typeof v.id !== 'string' || !v.id) return null;
  return {
    id: v.id,
    name: text(v.name, 'Board'),
    thickness: positive(v.thickness, 18),
    sheetLength: positive(v.sheetLength, SHEET.sheetLength),
    sheetWidth: positive(v.sheetWidth, SHEET.sheetWidth),
    grain: v.grain === true,
    price: isNumber(v.price) && v.price >= 0 ? v.price : 0,
  };
}

function parseEdgeBand(raw: unknown): EdgeBand | null {
  const v = (raw ?? {}) as Record<string, unknown>;
  if (typeof v.id !== 'string' || !v.id) return null;
  return {
    id: v.id,
    name: text(v.name, 'Edge band'),
    thickness: positive(v.thickness, 1),
    price: isNumber(v.price) && v.price >= 0 ? v.price : 0,
  };
}

function uniqueById<T extends { id: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  return list.filter((entry) => !seen.has(entry.id) && seen.add(entry.id));
}

/** Designs saved before the materials library kept one board per role, with a name and a thickness. */
interface LegacyBoards {
  carcass?: { name?: unknown; thickness?: unknown };
  back?: { name?: unknown; thickness?: unknown };
  front?: { name?: unknown; thickness?: unknown };
}

const LEGACY_IDS = { carcass: 'carcass-board', back: 'back-board', front: 'front-board' } as const;

export function parseMaterials(raw: unknown, legacy?: LegacyBoards): Material[] {
  const parsed = Array.isArray(raw) ? uniqueById(raw.map(parseMaterial).filter((m): m is Material => m !== null)) : [];
  if (parsed.length > 0) return parsed;
  if (!legacy?.carcass && !legacy?.back && !legacy?.front) return structuredClone(DEFAULT_MATERIALS);
  // Keep the boards the design already used, and offer the rest of the library alongside them.
  const d = DEFAULT_CONSTRUCTION;
  const fromLegacy = (role: keyof typeof LEGACY_IDS, fallbackId: string): Material => {
    const base = DEFAULT_MATERIALS.find((m) => m.id === fallbackId)!;
    const board = legacy[role];
    return { ...base, id: LEGACY_IDS[role], name: text(board?.name, base.name), thickness: positive(board?.thickness, base.thickness) };
  };
  const replaced = new Set([d.carcassMaterial, d.backMaterial, d.frontMaterial]);
  return [
    fromLegacy('carcass', d.carcassMaterial),
    fromLegacy('back', d.backMaterial),
    fromLegacy('front', d.frontMaterial),
    ...structuredClone(DEFAULT_MATERIALS.filter((m) => !replaced.has(m.id))),
  ];
}

export function parseEdgeBands(raw: unknown): EdgeBand[] {
  if (Array.isArray(raw) && raw.length === 0) return [];
  const parsed = Array.isArray(raw) ? uniqueById(raw.map(parseEdgeBand).filter((b): b is EdgeBand => b !== null)) : [];
  return parsed.length > 0 ? parsed : structuredClone(DEFAULT_EDGE_BANDS);
}

/**
 * Reads stored settings against the design's materials and edge bands, falling
 * back to sensible values for anything missing or invalid.
 */
export function parseConstruction(raw: unknown, materials: Material[], edgeBands: EdgeBand[]): ConstructionSettings {
  const v = (raw ?? {}) as Record<string, unknown>;
  const d = DEFAULT_CONSTRUCTION;
  const number = (key: NumericSetting) => (isNumber(v[key]) ? v[key] : d[key]);
  const materialIds = materials.map((m) => m.id);
  const material = (key: 'carcassMaterial' | 'backMaterial' | 'frontMaterial', legacyRole: keyof typeof LEGACY_IDS) => {
    if (typeof v[key] === 'string' && materialIds.includes(v[key])) return v[key];
    if (materialIds.includes(LEGACY_IDS[legacyRole])) return LEGACY_IDS[legacyRole];
    return materialIds.includes(d[key]) ? d[key] : materialIds[0];
  };
  const edge = (key: 'carcassEdge' | 'frontEdge') => {
    if (v[key] === null) return null;
    if (typeof v[key] === 'string' && edgeBands.some((b) => b.id === v[key])) return v[key];
    return d[key] !== null && edgeBands.some((b) => b.id === d[key]) ? d[key] : null;
  };
  // Same key order as the defaults, so saved and loaded designs compare equal.
  return {
    carcassMaterial: material('carcassMaterial', 'carcass'),
    backMaterial: material('backMaterial', 'back'),
    frontMaterial: material('frontMaterial', 'front'),
    carcassEdge: edge('carcassEdge'),
    frontEdge: edge('frontEdge'),
    subtractEdges: v.subtractEdges === true,
    bottomJoint: oneOf<BottomJoint>(v.bottomJoint, ['between', 'under'], d.bottomJoint),
    topJoint: oneOf<TopJoint>(v.topJoint, ['between', 'over'], d.topJoint),
    baseTop: oneOf<BaseTop>(v.baseTop, ['rails', 'full'], d.baseTop),
    railWidth: number('railWidth'),
    backMount: oneOf<BackMount>(v.backMount, ['nailed', 'groove'], d.backMount),
    backInset: number('backInset'),
    grooveDepth: number('grooveDepth'),
    grooveOffset: number('grooveOffset'),
    shelfSetback: number('shelfSetback'),
    doorType: oneOf<DoorType>(v.doorType, ['overlay', 'inset'], d.doorType),
    frontGap: number('frontGap'),
    drawerFrontHeight: number('drawerFrontHeight'),
    drawerSystem: oneOf<DrawerSystem>(v.drawerSystem, ['wooden', 'metal'], d.drawerSystem),
    slideClearance: number('slideClearance'),
    drawerBoxGap: number('drawerBoxGap'),
    metalBottomDeduction: number('metalBottomDeduction'),
    metalBackDeduction: number('metalBackDeduction'),
    metalDepthDeduction: number('metalDepthDeduction'),
  };
}
