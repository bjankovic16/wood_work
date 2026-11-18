import { describe, expect, it } from 'vitest';
import { BAR_MATERIAL_ID, createItem, GLASS_MATERIAL_ID } from '../domain/catalog';
import { addItem, createDesign, materialInUse, parseDesign, removeMaterial } from '../domain/designOps';
import { BACKSPLASH_FINISHES, DEFAULT_STYLE, FRONT_FINISHES, HANDLE_STYLES, parseStyle, WORKTOP_FINISHES } from '../domain/style';
import type { ItemKind } from '../domain/types';
import { checkDesign } from './checks';
import { buildContext, resolveConfig } from './config';
import { buildCuttingList } from './cuttingList';
import { frontLayout, OVEN_NICHE_HEIGHT, TOWER_OVEN_BOTTOM } from './fronts';
import { unitHardware } from './hardware';
import { unitParts } from './parts';
import { DEFAULT_MATERIALS } from './settings';

const module = (kind: ItemKind) => {
  const item = createItem(kind, []);
  const design = addItem(createDesign(), item);
  const ctx = buildContext(design);
  return { item, design, ctx, parts: unitParts(item, ctx), hardware: unitHardware(item, ctx) };
};

describe('premium kitchen modules', () => {
  it('distinguishes overlapping floating boards from the normal supplier note about supports', () => {
    const shelf = createItem('shelf', [], { shelfForm: 'floating', height: 100, shelves: 4 });
    const design = addItem(createDesign(), shelf);
    expect(unitHardware(shelf, buildContext(design))).toEqual([]);
    expect(checkDesign(design)).toContainEqual(expect.objectContaining({ severity: 'error', key: `shelf-spacing-${shelf.id}` }));
    const spaced = checkDesign({ ...design, items: [{ ...shelf, height: 500 }] });
    expect(spaced.filter((i) => !i.category)).toEqual([]);
    expect(spaced.some((i) => i.key === `supports-${shelf.id}` && i.category === 'precut')).toBe(true);
  });
  for (const kind of ['pullOut', 'glassWall', 'ovenTower', 'integratedFridge', 'hood', 'hob', 'bar'] as const) {
    it(`${kind} has valid geometry, parts, purchased fittings and a lossless project round trip`, () => {
      const { design, hardware } = module(kind);
      expect(checkDesign(design).filter((issue) => issue.severity === 'error')).toEqual([]);
      expect(hardware.length).toBeGreaterThan(0);
      const list = buildCuttingList(design);
      expect(list.rows.every((row) => row.length > 0 && row.width > 0 && row.thickness > 0)).toBe(true);
      expect(parseDesign(JSON.parse(JSON.stringify(design)))).toEqual(design);
    });
  }

  it('cuts unbanded glass blanks from glass stock, not MDF, and lists glass hinges', () => {
    const { parts, hardware } = module('glassWall');
    const glass = parts.find((part) => part.materialId === GLASS_MATERIAL_ID);
    expect(glass).toMatchObject({ name: 'Glass door blank', thickness: 4, quantity: 2, length: 717, width: 297, edgeBandId: null });
    expect(glass?.note).toContain('Supplier');
    expect(hardware.some((item) => item.name.startsWith('Glass door hinge'))).toBe(true);
    expect(hardware.some((item) => item.name.startsWith('Concealed hinge'))).toBe(false);
  });

  it('uses a purchased basket system, not fictional wooden drawers or door hinges, for a pull-out', () => {
    const { parts, hardware } = module('pullOut');
    expect(parts.find((part) => part.name === 'Pull-out front')?.quantity).toBe(1);
    expect(parts.some((part) => part.name.startsWith('Drawer'))).toBe(false);
    expect(hardware.some((item) => /hinge|Ball-bearing/.test(item.name))).toBe(false);
    expect(hardware.find((item) => item.name.startsWith('Pull-out basket'))?.quantity).toBe(1);
  });

  it('keeps a 600 mm oven niche between two support shelves without a back panel', () => {
    const { item, ctx, parts } = module('ovenTower');
    expect(parts.find((part) => part.name === 'Oven shelf')?.quantity).toBe(2);
    expect(parts.some((part) => part.name === 'Back')).toBe(false);
    const fronts = frontLayout(item, resolveConfig(item, ctx), ctx.settings);
    expect(fronts).toHaveLength(2);
    expect(fronts.every((front) => front.y + front.h <= TOWER_OVEN_BOTTOM || front.y >= TOWER_OVEN_BOTTOM + OVEN_NICHE_HEIGHT)).toBe(true);
  });

  it('leaves integrated fridge housings open at the back and lists the refrigerator separately', () => {
    const { parts, hardware } = module('integratedFridge');
    expect(parts.some((part) => part.name === 'Back' || part.name === 'Shelf')).toBe(false);
    expect(parts.filter((part) => part.name === 'Door').reduce((sum, part) => sum + part.quantity, 0)).toBe(2);
    expect(hardware.some((item) => item.name.startsWith('Refrigerator'))).toBe(true);
  });

  it('cuts one real 38 mm breakfast-bar top and lists four correctly sized purchased support legs', () => {
    const { parts, hardware } = module('bar');
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({ name: 'Breakfast bar top', quantity: 1, length: 1500, width: 650, thickness: 38, materialId: BAR_MATERIAL_ID });
    expect(hardware.find((item) => item.name.includes('862 mm'))?.quantity).toBe(4);
  });

  it('treats extractor hoods as purchased appliances, with no fabricated cabinet panels', () => {
    const { parts, hardware } = module('hood');
    expect(parts).toEqual([]);
    expect(hardware).toHaveLength(1);
    expect(hardware[0].name).toContain('Extractor hood');
  });

  it('adds specialist stock to older material libraries only when a module requires it', () => {
    const legacy = createDesign();
    expect(parseDesign(JSON.parse(JSON.stringify(legacy)))?.materials).toEqual(DEFAULT_MATERIALS);
    for (const kind of ['glassWall', 'bar'] as const) {
      const saved = module(kind).design;
      const parsed = parseDesign({ ...saved, materials: DEFAULT_MATERIALS });
      expect(parsed).not.toBeNull();
      expect(parsed?.materials.map((material) => material.id)).toContain(kind === 'glassWall' ? GLASS_MATERIAL_ID : BAR_MATERIAL_ID);
      expect(parsed && buildCuttingList(parsed).pieceCount).toBeGreaterThan(0);
    }
  });

  it('protects the glass and tabletop stock while their modules use it', () => {
    for (const kind of ['glassWall', 'bar'] as const) {
      const { design } = module(kind);
      const id = kind === 'glassWall' ? GLASS_MATERIAL_ID : BAR_MATERIAL_ID;
      expect(materialInUse(design, id)).toBe(true);
      expect(removeMaterial(design, id)).toBe(design);
    }
  });

  it('keeps old styles unchanged and preserves all premium finishes and visual options', () => {
    expect(parseStyle(DEFAULT_STYLE)).toEqual(DEFAULT_STYLE);
    expect(parseStyle({ front: 'constructor', worktop: 'toString', appliances: '__proto__', backsplash: 'constructor' })).toEqual(DEFAULT_STYLE);
    const style = { front: 'cashmere', worktop: 'marble', handles: 'bronze', backsplash: 'travertine', lighting: true, decor: true } as const;
    expect(parseStyle(style)).toEqual(style);
    const layeredStyle = { ...style, backsplash: 'black', plinthLighting: true } as const;
    expect(parseStyle(layeredStyle)).toEqual(layeredStyle);
    expect(Object.keys(FRONT_FINISHES)).toHaveLength(18);
    expect(Object.keys(WORKTOP_FINISHES)).toHaveLength(8);
    expect(Object.keys(HANDLE_STYLES)).toHaveLength(6);
    expect(Object.keys(BACKSPLASH_FINISHES)).toHaveLength(5);
  });

  it('persists safe wall and floor colours without changing the cutting list', () => {
    const { design } = module('base');
    const style = { ...design.style, wallColor: '#123ABC', floorColor: '#d8d0c4', floorPattern: 'tiles', floorTileSize: 450, floorGroutColor: '#494c48' } as const;
    expect(parseStyle(style)).toEqual(style);
    expect(parseStyle({ ...design.style, wallColor: 'red; invalid', floorColor: '#fff' })).toEqual(design.style);
    const before = buildCuttingList(design);
    const after = buildCuttingList({ ...design, style });
    expect(after).toEqual(before);
    for (const floorTileSize of [0, 99, 1201, Infinity, NaN, '600']) {
      expect(parseStyle({ ...design.style, floorTileSize, floorPattern: 'invalid', floorGroutColor: 'red' })).toEqual(design.style);
    }
  });
});
