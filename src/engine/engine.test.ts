import { describe, expect, it } from 'vitest';
import { createItem } from '../domain/catalog';
import { createDesign, parseDesign, removeMaterial } from '../domain/designOps';
import type { ConstructionSettings, Design, ItemKind, KitchenItem } from '../domain/types';
import { buildContext, resolveConfig, type BuildContext } from './config';
import { buildCuttingList, cuttingListCsv } from './cuttingList';
import { frontLayout } from './fronts';
import { hingesPerDoor, unitHardware } from './hardware';
import { nest } from './nesting';
import { slideLength, unitParts } from './parts';
import { DEFAULT_CONSTRUCTION, parseConstruction, parseEdgeBands, parseMaterials } from './settings';

const base = createDesign();

function context(settings: Partial<ConstructionSettings> = {}, design: Design = base): BuildContext {
  return buildContext({ ...design, construction: { ...design.construction, ...settings } });
}

function unit(kind: ItemKind, over: Partial<KitchenItem> = {}): KitchenItem {
  return createItem(kind, [], over);
}

/** [name, quantity, length, width, thickness] for compact comparisons. */
function sizes(item: KitchenItem, ctx = context()) {
  return unitParts(item, ctx).map((p) => [p.name, p.quantity, p.length, p.width, p.thickness, ...(p.note ? [p.note] : [])]);
}

describe('base cabinet', () => {
  it('matches the example in the specification', () => {
    expect(sizes(unit('base', { width: 600, height: 720, depth: 560 }))).toEqual([
      ['Side', 2, 720, 560, 18],
      ['Bottom', 1, 564, 560, 18],
      ['Front rail', 1, 564, 100, 18],
      ['Back rail', 1, 564, 100, 18],
      ['Back', 1, 716, 596, 3],
      ['Shelf', 1, 564, 540, 18],
      ['Door', 2, 717, 297, 18],
    ]);
  });

  it('takes each part from the right material', () => {
    const parts = unitParts(unit('base'), context());
    expect(Object.fromEntries(parts.map((p) => [p.name, p.materialId]))).toMatchObject({
      Side: 'particleboard-white-18',
      Back: 'hdf-white-3',
      Door: 'mdf-18',
    });
  });

  it('follows the joints: sides on the bottom, full top over the sides', () => {
    expect(sizes(unit('base'), context({ bottomJoint: 'under', baseTop: 'full', topJoint: 'over' })).slice(0, 3)).toEqual([
      ['Side', 2, 684, 560, 18],
      ['Bottom', 1, 600, 560, 18],
      ['Top', 1, 600, 560, 18],
    ]);
  });

  it('sizes a grooved back and shortens the shelves to clear it', () => {
    const parts = sizes(unit('base'), context({ backMount: 'groove' }));
    expect(parts).toContainEqual(['Back', 1, 708, 578, 3, 'Set into grooves']);
    expect(parts).toContainEqual(['Shelf', 1, 564, 527, 18]);
    expect(sizes(unit('wall'), context({ backMount: 'groove' }))).toContainEqual(['Back', 1, 698, 578, 3, 'Set into grooves']);
  });

  it('puts a drawer above the doors, with its box', () => {
    expect(sizes(unit('base', { drawers: 1 })).slice(6)).toEqual([
      ['Drawer front', 1, 597, 140, 18],
      ['Door', 2, 574, 297, 18],
      ['Drawer side', 2, 550, 100, 18, 'Drawer box, 550 mm slides'],
      ['Drawer front/back', 2, 502, 100, 18, 'Drawer box, 550 mm slides'],
      ['Drawer bottom', 1, 550, 538, 3, 'Drawer box, 550 mm slides'],
    ]);
  });

  it('uses the unit’s own material when it has one', () => {
    expect(sizes(unit('base', { carcassMaterial: 'particleboard-white-16' })).slice(0, 2)).toEqual([
      ['Side', 2, 720, 560, 16],
      ['Bottom', 1, 568, 560, 16],
    ]);
  });
});

describe('doors and drawers', () => {
  it('fits inset doors inside the carcass opening', () => {
    const item = unit('base', { doorType: 'inset' });
    expect(frontLayout(item, resolveConfig(item, context()), context().settings)).toEqual([
      { kind: 'door', x: 21, y: 21, w: 277.5, h: 678, hinge: 'left' },
      { kind: 'door', x: 301.5, y: 21, w: 277.5, h: 678, hinge: 'right' },
    ]);
  });

  it('puts the hinges of a single door on the chosen side', () => {
    const item = unit('base', { width: 400, hinge: 'right' });
    expect(frontLayout(item, resolveConfig(item, context()), context().settings)[0].hinge).toBe('right');
  });

  it('can make the top drawer shallow', () => {
    const item = unit('drawer', { drawerLayout: 'shallowTop' });
    expect(frontLayout(item, resolveConfig(item, context()), context().settings).map((f) => f.h)).toEqual([285.5, 285.5, 140]);
  });

  it('cuts only the bottom and back of drawers on a metal system', () => {
    const parts = sizes(unit('drawer'), context({ drawerSystem: 'metal' }));
    expect(parts).toContainEqual(['Drawer bottom', 3, 540, 489, 18, 'Metal drawer system, 550 mm']);
    expect(parts).toContainEqual(['Drawer back', 3, 477, 197, 18, 'Metal drawer system, 550 mm']);
    expect(parts.some(([name]) => name === 'Drawer side')).toBe(false);
  });

  it('splits drawer cabinets, tall units and corner units as before', () => {
    expect(sizes(unit('drawer'))).toContainEqual(['Drawer front', 3, 597, 237, 18]);
    const tall = sizes(unit('tall'));
    expect(tall).toContainEqual(['Fixed shelf', 1, 564, 560, 18]);
    expect(tall).toContainEqual(['Door', 2, 1347, 297, 18]);
    expect(sizes(unit('corner'))).toContainEqual(['Bottom', 1, 882, 882, 18, 'L-shaped: cut out 322 × 322 at the inner corner']);
  });
});

describe('edge banding', () => {
  it('bands the visible carcass edges', () => {
    const edges = Object.fromEntries(unitParts(unit('base'), context()).map((p) => [p.name, [p.edges.length, p.edges.width, p.edgeBandId]]));
    expect(edges).toEqual({
      Side: [1, 0, 'abs-1'],
      Bottom: [1, 0, 'abs-1'],
      'Front rail': [1, 0, 'abs-1'],
      'Back rail': [0, 0, null],
      Back: [0, 0, null],
      Shelf: [1, 0, 'abs-1'],
      // Painted MDF fronts get no edge band by default.
      Door: [0, 0, null],
    });
  });

  it('bands the bottom edge of wall unit sides too', () => {
    const side = unitParts(unit('wall'), context()).find((p) => p.name === 'Side')!;
    expect(side.edges).toEqual({ length: 1, width: 1 });
  });

  it('can cut parts smaller by the band thickness', () => {
    const parts = sizes(unit('base'), context({ subtractEdges: true, frontEdge: 'abs-2' }));
    expect(parts).toContainEqual(['Side', 2, 720, 559, 18]);
    expect(parts).toContainEqual(['Shelf', 1, 564, 539, 18]);
    expect(parts).toContainEqual(['Door', 2, 713, 293, 18]);
  });

  it('adds up the banding in metres, with a trimming allowance per edge', () => {
    const design = { ...createDesign(), items: [unit('base', { label: 'B1' })] };
    const list = buildCuttingList(design);
    // Sides 2 × 720, bottom 564, front rail 564, shelf 564, plus 30 mm on each of the 6 edges.
    expect(list.edges).toEqual([{ bandId: 'abs-1', name: 'ABS edge 1 mm', thickness: 1, metres: 3.3, cost: null }]);
  });
});

describe('hardware', () => {
  const ctx = context();
  it('counts hinges by door height', () => {
    expect([hingesPerDoor(717), hingesPerDoor(1347), hingesPerDoor(1900), hingesPerDoor(2100)]).toEqual([2, 3, 4, 5]);
  });

  it('lists the fittings of a base cabinet', () => {
    expect(unitHardware(unit('base'), ctx)).toEqual([
      { name: 'Concealed hinge, full overlay', quantity: 4 },
      { name: 'Handle, steel bar', quantity: 2 },
      { name: 'Shelf support pin', quantity: 4 },
      { name: 'Adjustable leg, 100 mm', quantity: 4 },
    ]);
  });

  it('lists slides for drawers, hangers for wall units and fold hinges for corner units', () => {
    expect(unitHardware(unit('drawer'), ctx)).toContainEqual({ name: 'Ball-bearing slides, 550 mm (pair)', quantity: 3 });
    expect(unitHardware(unit('drawer'), context({ drawerSystem: 'metal' }))).toContainEqual({ name: 'Metal drawer system set, 550 mm', quantity: 3 });
    expect(unitHardware(unit('wall'), ctx)).toContainEqual({ name: 'Wall cabinet hangers (pair)', quantity: 1 });
    expect(unitHardware(unit('corner'), ctx)).toEqual(
      expect.arrayContaining([
        { name: 'Corner fold hinge', quantity: 2 },
        { name: 'Handle, steel bar', quantity: 1 },
        { name: 'Adjustable leg, 100 mm', quantity: 6 },
      ]),
    );
    expect(unitHardware(unit('tall'), ctx)).toContainEqual({ name: 'Concealed hinge, full overlay', quantity: 10 });
  });
});

describe('sheet estimate', () => {
  const sheet = { sheetLength: 2800, sheetWidth: 2070, kerf: 4, trim: 10 };
  const square = { length: 1000, width: 1000, canRotate: true };

  it('fits four 1 m squares on one sheet and needs a second for the fifth', () => {
    expect(nest(Array(4).fill(square), sheet).sheets).toBe(1);
    expect(nest(Array(5).fill(square), sheet).sheets).toBe(2);
  });

  it('keeps grain along the sheet and reports pieces that cannot fit', () => {
    expect(nest([{ length: 2100, width: 500, canRotate: false }], sheet)).toMatchObject({ sheets: 1, oversize: 0 });
    expect(nest([{ length: 2900, width: 500, canRotate: false }], sheet)).toMatchObject({ sheets: 0, oversize: 1 });
  });

  it('lays a grain piece with its length along the sheet even when that is its shorter side', () => {
    // 2100 mm across a 2070 mm sheet does not fit, and the grain stops the piece being turned.
    expect(nest([{ length: 500, width: 2100, canRotate: false }], sheet)).toMatchObject({ sheets: 0, oversize: 1 });
    expect(nest([{ length: 500, width: 2100, canRotate: true }], sheet)).toMatchObject({ sheets: 1, oversize: 0 });
  });

  it('estimates sheets per material in the cutting list', () => {
    const design = { ...createDesign(), items: [unit('base', { label: 'B1' }), unit('tall', { label: 'T1' })] };
    const carcass = buildCuttingList(design).materials.find((m) => m.materialId === 'particleboard-white-18')!;
    // About 6.0 m² of parts: more than one 2800 × 2070 sheet (5.8 m²).
    expect(carcass.area).toBeCloseTo(6.02, 2);
    expect(carcass.sheets).toBe(2);
  });

  it('keeps priced lines, but totals only fully priced stock that the project actually uses', () => {
    const design = createDesign();
    design.items = [unit('base', { label: 'B1' })];
    expect(buildCuttingList(design)).toMatchObject({ hasCosts: false, cost: null });
    design.materials = design.materials.map((m) => (m.id === 'particleboard-white-18' ? { ...m, price: 60 } : m));
    design.edgeBands = design.edgeBands.map((b) => (b.id === 'abs-1' ? { ...b, price: 0.5 } : b));
    const partial = buildCuttingList(design);
    expect(partial.materials.find((m) => m.materialId === 'particleboard-white-18')!.cost).toBe(60);
    expect(partial.edges[0].cost).toBe(3.3 * 0.5);
    expect(partial).toMatchObject({ hasCosts: true, cost: null });

    design.materials = design.materials.map((m) => ['hdf-white-3', 'mdf-18'].includes(m.id) ? { ...m, price: 20 } : m);
    expect(buildCuttingList(design).cost).toBe(60 + 20 + 20 + 3.3 * 0.5);
    expect(buildCuttingList({ ...design, edgeBands: base.edgeBands }).cost).toBeNull();
    design.materials = design.materials.map((m) => ({ ...m, sheetLength: 300, sheetWidth: 300 }));
    expect(buildCuttingList(design).cost).toBeNull(); // Oversized pieces have no complete sheet estimate either.
  });
});

describe('cutting list', () => {
  const design = { ...createDesign(), items: [unit('base', { label: 'B1' }), unit('base', { label: 'B2' }), unit('wall', { label: 'W1', width: 800 })] };
  const list = buildCuttingList(design);

  it('groups identical pieces from different units', () => {
    expect(list.rows.find((r) => r.name === 'Side' && r.length === 720 && r.width === 560)).toMatchObject({
      quantity: 4,
      units: ['B1', 'B2'],
      materialName: 'White melamine particleboard 18 mm',
    });
  });

  it('adds up the hardware of all units', () => {
    expect(list.hardware.find((h) => h.name === 'Concealed hinge, full overlay')).toMatchObject({ quantity: 12, units: ['B1', 'B2', 'W1'] });
  });

  it('exports the grouped list as CSV with the edges', () => {
    const csv = cuttingListCsv(list).split('\r\n');
    expect(csv[0]).toBe('Piece;Quantity;Length (mm);Width (mm);Thickness (mm);Material;Edges;Edge band;Units;Note');
    expect(csv).toContain('Side;4;720;560;18;White melamine particleboard 18 mm;L1 W0;ABS edge 1 mm;B1, B2;');
  });
});

describe('settings', () => {
  it('defaults to a pair of doors from 600 mm and clamps counts to what the unit allows', () => {
    expect(resolveConfig(unit('base', { width: 500 }), context()).doors).toBe(1);
    expect(resolveConfig(unit('base', { width: 600 }), context()).doors).toBe(2);
    expect(resolveConfig(unit('sink', { doors: 7 }), context()).doors).toBe(2);
    expect(resolveConfig(unit('base', { doors: 0, drawers: 2 }), context()).shelves).toBe(0);
    expect(resolveConfig(unit('corner', { doorType: 'inset' }), context()).doorType).toBe('overlay');
  });

  it('picks the longest drawer slide that fits', () => {
    expect([slideLength(560), slideLength(500), slideLength(200)]).toEqual([550, 450, 250]);
  });

  it('fills in missing or invalid stored settings', () => {
    const materials = parseMaterials(undefined);
    const bands = parseEdgeBands(undefined);
    expect(parseConstruction(undefined, materials, bands)).toEqual(DEFAULT_CONSTRUCTION);
    expect(parseConstruction({ frontGap: 2, backMount: 'glued', frontMaterial: 'missing' }, materials, bands)).toMatchObject({
      frontGap: 2,
      backMount: 'nailed',
      frontMaterial: 'mdf-18',
    });
  });

  it('upgrades designs saved before the materials library', () => {
    const old = {
      name: 'Old',
      room: { width: 3600, depth: 3000, height: 2600 },
      construction: { carcass: { name: 'Particleboard', thickness: 18 }, back: { name: 'HDF', thickness: 3 }, front: { name: 'MDF', thickness: 18 } },
      items: [{ ...unit('base'), carcassThickness: 16 }],
    };
    const design = parseDesign(old)!;
    expect(design.construction.carcassMaterial).toBe('carcass-board');
    expect(design.materials.find((m) => m.id === 'carcass-board')).toMatchObject({ name: 'Particleboard', thickness: 18 });
    expect(design.items[0].carcassMaterial).toBe('carcass-board-16');
    expect(design.materials.find((m) => m.id === 'carcass-board-16')).toMatchObject({ name: 'Particleboard', thickness: 16 });
    expect(sizes(design.items[0], buildContext(design))[0]).toEqual(['Side', 2, 720, 560, 16]);
  });
});

describe('changes by hand', () => {
  it('applies an edit to one generated part, and drops it once the unit changes', () => {
    const shelf = unitParts(unit('base'), context()).find((p) => p.name === 'Shelf')!;
    const edits = { [shelf.key]: { width: 500, quantity: 2 } };
    const edited = unitParts(unit('base'), context(), edits).find((p) => p.name === 'Shelf')!;
    expect(edited).toMatchObject({ length: 564, width: 500, quantity: 2, edited: true });
    // A wider unit has a different shelf, so the old edit no longer applies.
    const wider = unitParts(unit('base', { width: 800 }), context(), edits).find((p) => p.name === 'Shelf')!;
    expect(wider).toMatchObject({ length: 764, width: 540, quantity: 1 });
    expect(wider.edited).toBeUndefined();
  });

  it('lists pieces added by hand with the rest, under Extra', () => {
    const design = createDesign();
    design.items = [unit('base', { label: 'B1' })];
    design.customParts = [
      { id: 'c1', name: 'Plinth', quantity: 2, length: 1800, width: 100, materialId: 'particleboard-white-18', edgesLength: 1, edgesWidth: 0, edgeBandId: 'abs-1', note: 'Under B1' },
    ];
    const list = buildCuttingList(design);
    expect(list.rows.find((r) => r.name === 'Plinth')).toMatchObject({ quantity: 2, length: 1800, width: 100, units: ['Extra'], edges: { length: 1, width: 0 } });
    expect(list.extra).toHaveLength(1);
    const board = list.materials.find((m) => m.materialId === 'particleboard-white-18')!;
    // The base unit has six particleboard pieces: two sides, bottom, two rails and a shelf.
    expect(board.pieces).toBe(6 + 2);
  });

  it('remembers the calculated size, keeps sizes as typed and leaves out pieces set to none', () => {
    const design = createDesign();
    design.items = [unit('base', { label: 'B1' })];
    const id = design.items[0].id;
    const parts = unitParts(design.items[0], buildContext(design));
    const shelf = parts.find((p) => p.name === 'Shelf')!;
    const bottom = parts.find((p) => p.name === 'Bottom')!;
    const before = buildCuttingList(design);
    design.partEdits = { [id]: { [shelf.key]: { width: 700 }, [bottom.key]: { quantity: 0 } } };
    const list = buildCuttingList(design);

    const unitShelf = list.units[0].parts.find((p) => p.name === 'Shelf')!;
    expect(unitShelf).toMatchObject({ length: 564, width: 700, edited: true, calculated: { length: 564, width: 540, quantity: 1 } });
    // The banded front edge stays on the side that was the length.
    expect(unitShelf.edges).toEqual(shelf.edges);
    expect(unitShelf.edgeLength).toBe(564);

    // A piece set to none stays under its unit but leaves the list and the totals.
    expect(list.units[0].parts.find((p) => p.name === 'Bottom')).toMatchObject({ quantity: 0, edited: true });
    expect(list.rows.some((r) => r.name === 'Bottom')).toBe(false);
    expect(list.pieceCount).toBe(before.pieceCount - bottom.quantity);

    const csv = cuttingListCsv(list).split('\r\n');
    expect(csv.find((line) => line.startsWith('Shelf;'))).toBe('Shelf;1;564;700;18;White melamine particleboard 18 mm;L1 W0;ABS edge 1 mm;B1;changed by hand');
  });

  it('cuts one piece from another board, and forgets that board once it is removed', () => {
    const design = createDesign();
    design.items = [unit('base', { label: 'B1' })];
    const id = design.items[0].id;
    const side = unitParts(design.items[0], buildContext(design)).find((p) => p.name === 'Side')!;
    design.partEdits = { [id]: { [side.key]: { materialId: 'mdf-oak-19' } } };

    const edited = unitParts(design.items[0], buildContext(design), design.partEdits[id]).find((p) => p.name === 'Side')!;
    expect(edited).toMatchObject({
      materialId: 'mdf-oak-19',
      thickness: 19,
      grain: true,
      length: side.length,
      width: side.width,
      calculated: { materialId: 'particleboard-white-18', thickness: 18 },
    });
    expect(buildCuttingList(design).materials.find((m) => m.materialId === 'mdf-oak-19')?.pieces).toBe(2);
    expect(parseDesign(JSON.parse(JSON.stringify(design)))!.partEdits).toEqual(design.partEdits);
    expect(removeMaterial(design, 'mdf-oak-19').partEdits).toEqual({});
  });
});
