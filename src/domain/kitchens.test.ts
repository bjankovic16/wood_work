import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkDesign } from '../engine/checks';
import { buildCuttingList } from '../engine/cuttingList';
import { createDesign, parseDesign, setPartEdit, setStyle } from './designOps';
import { applyKitchenLook, createKitchenDesign, FRAMED_KITCHENS, KITCHEN_DESIGNS, KITCHEN_LOOK_PRESETS, kitchenCategory, type KitchenPreset } from './kitchens';
import { kitchenLook } from './kitchenLook';
import type { Design, KitchenItem } from './types';
import { CEILING_GAP, createItem, hasWorktop, WORKTOP_THICKNESS } from './catalog';
import { PREMIUM_KITCHENS } from './premiumKitchens';
import { en } from '../i18n/en';
import { sr } from '../i18n/sr';
import { roomSegments } from './walls';
import { GREEN_KITCHENS } from './greenKitchens';
import { isFlushWith, isWallMounted, itemRect, mountingWalls } from './geometry';
import { alongWall } from './openings';
import { isUpperCabinet } from './upperCabinets';

describe('kitchen inspiration designs', () => {
  it('fills prepared upper runs through corners and around towers without covering intentional window openings', () => {
    // The Studio U intentionally leaves its short return open (checked separately below).
    for (const preset of KITCHEN_DESIGNS.filter((p) => p.id !== 'basil-studio')) {
      const design = createKitchenDesign(preset, preset.id);
      const level = Math.min(...design.items.filter(isUpperCabinet).map((item) => item.elevation)) + 1;
      for (const wall of ['top', 'left', 'right', 'bottom'] as const) {
        const mounted = design.items.filter((item) => mountingWalls(item).includes(wall) && isFlushWith(itemRect(item), wall, design.room));
        const bases = mounted.filter((item) => !isWallMounted(item));
        if (!bases.length) continue;
        const start = Math.min(...bases.map((item) => alongWall(itemRect(item), wall)[0]));
        const end = Math.max(...bases.map((item) => alongWall(itemRect(item), wall)[1]));
        const spans = [
          ...mounted.filter((item) => item.kind === 'hood' || item.elevation <= level && item.elevation + item.height > level).map((item) => alongWall(itemRect(item), wall)),
          ...design.openings.filter((opening) => opening.wall === wall && opening.sill <= level && opening.sill + opening.height > level).map((opening) => [opening.offset, opening.offset + opening.width]),
        ].sort((a, b) => a[0] - b[0]);
        let filled = start;
        for (const [from, to] of spans) {
          expect(from, `${preset.id}, ${wall}: gap after ${filled}`).toBeLessThanOrEqual(filled + 1);
          filled = Math.max(filled, to);
        }
        expect(filled, `${preset.id}, ${wall}: unfinished run`).toBeGreaterThanOrEqual(end - 1);
      }
    }
  });

  it('adds four reference-inspired models and four complementary designs with editable wood uppers, appliances and room colours', () => {
    expect(GREEN_KITCHENS).toHaveLength(8);
    for (const preset of GREEN_KITCHENS) {
      const design = createKitchenDesign(preset, preset.id);
      expect(en.kitchens.names[preset.id]).toBeTruthy();
      expect(sr.kitchens.names[preset.id]).toBeTruthy();
      expect(design.items.some((item) => isUpperCabinet(item) && item.frontFinish === preset.middleFinish)).toBe(true);
      for (const kind of ['ovenTower', 'integratedFridge', 'sink', 'hob', 'dishwasher']) expect(design.items.some((item) => item.kind === kind)).toBe(true);
      expect(design.style.wallColor).toMatch(/^#[a-f0-9]{6}$/);
      expect(design.style.floorColor).toMatch(/^#[a-f0-9]{6}$/);
      if (preset.green === 'vitrine' || preset.green === 'walnut') expect(design.items.filter((item) => item.kind === 'glassWall')).toHaveLength(3);
      if (preset.green === 'window' || preset.green === 'vitrine') expect(design.openings[0].kind).toBe('window');
    }
  });

  it('offers distinct kitchens, including stacked collections and all three wall layouts', () => {
    expect(KITCHEN_DESIGNS).toHaveLength(61);
    expect(new Set(KITCHEN_DESIGNS.map((kitchen) => kitchen.id)).size).toBe(KITCHEN_DESIGNS.length);
    expect(KITCHEN_DESIGNS.filter((kitchen) => 'layered' in kitchen)).toHaveLength(4);
    expect(new Set(KITCHEN_DESIGNS.map(kitchenCategory))).toEqual(new Set(['straight', 'l-shape', 'u-shape', 'island']));
  });

  it('keeps the Studio U’s open return, oak niche and freestanding shelf boards in the actual model and cut list', () => {
    const d = createKitchenDesign(KITCHEN_DESIGNS.find((p) => p.id === 'basil-studio')!, '');
    expect(d.items.filter((i) => i.rotation === 90).every((i) => !isWallMounted(i))).toBe(true);
    const row = d.items.filter((i) => !i.rotation && isWallMounted(i) && i.elevation === 1470).sort((a, b) => a.x - b.x);
    expect(row[0].x).toBe(0);
    expect(row.every((i, j) => !j || i.x === row[j - 1].x + row[j - 1].width)).toBe(true);
    expect(row.at(-1)!.x + row.at(-1)!.width).toBe(d.room.width);
    expect(row.some((i) => i.kind === 'shelf' && i.carcassFinish === 'oak')).toBe(true);
    const shelves = buildCuttingList(d).units.filter(({ item }) => item.shelfForm === 'floating');
    expect(shelves).toHaveLength(2);
    for (const { item, parts } of shelves) {
      expect(parts).toHaveLength(1);
      expect(parts[0]).toMatchObject({ name: 'Shelf', quantity: 2, length: item.width, width: item.depth });
    }
    expect(checkDesign(d).filter((i) => !i.category)).toEqual([]);
  });

  it('frames the reference-inspired work zones with continuous deep ceiling cupboards, recessed uppers and real timber side panels', () => {
    for (const preset of FRAMED_KITCHENS) {
      const design = createKitchenDesign(preset, preset.id);
      const ceiling = design.room.height - CEILING_GAP;
      const canopy = design.items.filter((item) => item.kind === 'wall' && item.elevation + item.height === ceiling).sort((a, b) => a.x - b.x);
      expect(canopy[0].x).toBe(Math.min(...design.items.filter((item) => item.kind === 'ovenTower' || item.kind === 'integratedFridge').map((item) => item.x)));
      expect(canopy.at(-1)!.x + canopy.at(-1)!.width).toBe(design.room.width);
      expect(canopy.every((item, index) => item.depth === 600 && (!index || item.x === canopy[index - 1].x + canopy[index - 1].width))).toBe(true);
      const middle = design.items.filter((item) => item.kind === 'wall' && item.elevation === 1700);
      expect(middle).toHaveLength(6);
      expect(middle.every((item) => item.depth === 320 && item.frontFinish === preset.middleFinish && item.elevation + item.height === canopy[0].elevation)).toBe(true);
      const panels = design.items.filter((item) => item.kind === 'endPanel');
      expect(panels).toHaveLength(2);
      const panelParts = buildCuttingList(design).units.filter(({ item }) => item.kind === 'endPanel');
      expect(panelParts.every(({ item, parts }) => parts.length === 1 && parts[0].thickness === item.width && parts[0].length === item.height && parts[0].width === item.depth)).toBe(true);
      expect(panels[0].x + panels[0].width).toBe(middle[0].x);
      expect(middle.at(-1)!.x + middle.at(-1)!.width).toBe(panels[1].x);
      const base = design.items.find((item) => hasWorktop(item))!;
      expect(panels.every((item) => item.elevation === base.elevation + base.height + WORKTOP_THICKNESS && item.elevation + item.height === canopy[0].elevation)).toBe(true);
      expect(design.items.some((item) => item.kind === 'ovenTower')).toBe(true);
      expect(design.items.some((item) => ['shelf', 'glassWall'].includes(item.kind))).toBe(false);
      expect(design.style.handles).toBe('none');
      expect(design.style.appliances).toBe('black');
      expect(en.kitchens.names[preset.id]).toBeTruthy();
      expect(sr.kitchens.names[preset.id]).toBeTruthy();
    }
  });

  it('keeps reference-specific appliance, wood-backsplash and island choices editable', () => {
    const designs = FRAMED_KITCHENS.map((preset) => createKitchenDesign(preset, preset.id));
    expect(designs[0].items.find((item) => item.kind === 'fridge')?.x).toBe(3600);
    expect(designs[1].items.find((item) => item.kind === 'ovenTower')?.x).toBe(3600);
    expect(designs[1].room.treatments?.[0].finish).toBe('oak');
    const island = designs[3].items.filter((item) => item.y === 2200);
    expect(island).toHaveLength(3);
    expect(island.reduce((width, item) => width + item.width, 0)).toBe(1800);
    expect(island.every((item) => item.frontFinish === 'oak' && item.depth === 800)).toBe(true);
  });

  it('adds contrasting walnut and ash islands with full working aisles', () => {
    for (const [id, finish] of [['walnut-frame-island', 'walnut'], ['ash-frame-island', 'ash']]) {
      const preset = FRAMED_KITCHENS.find((entry) => entry.id === id)!;
      const design = createKitchenDesign(preset, id);
      const island = design.items.filter((item) => item.y === 2200);
      expect(island).toHaveLength(3);
      expect(island.reduce((width, item) => width + item.width, 0)).toBe(1800);
      expect(island.every((item) => item.frontFinish === finish && item.depth === 800)).toBe(true);
      expect(island[0].y - 600).toBeGreaterThanOrEqual(1000);
      expect(design.room.depth - island[0].y - island[0].depth).toBeGreaterThanOrEqual(1000);
    }
  });

  it('keeps every cabinet clear of the chimney while preserving its warning and excluding it from cut parts', () => {
    const preset = FRAMED_KITCHENS.find((entry) => entry.id === 'chimney-frame')!;
    const design = createKitchenDesign(preset, preset.id);
    const chimney = design.room.features![0];
    expect(design.items.every((item) => item.x >= chimney.x + chimney.width + 150)).toBe(true);
    expect(checkDesign(design).filter((issue) => issue.severity === 'error')).toEqual([]);
    expect(checkDesign(design).some((issue) => issue.key === `chimney-clearance-${chimney.id}` && issue.severity === 'warning')).toBe(true);
    expect(buildCuttingList(design).pieceCount).toBe(buildCuttingList({ ...design, room: { ...design.room, features: [] } }).pieceCount);
    const second = createKitchenDesign(preset, preset.id);
    design.room.features![0].width = 900;
    expect(second.room.features![0].width).toBe(450);
  });

  it('cuts the framed drawer cabinet to its actual carcass thickness and four-millimetre front reveals', () => {
    const design = createKitchenDesign(FRAMED_KITCHENS[0], 'Cut-size check');
    const cabinet = buildCuttingList(design).units.find(({ item }) => item.kind === 'drawer' && item.width === 900)!;
    expect(cabinet.parts).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Side', quantity: 2, length: 720, width: 560, thickness: 18 }),
      expect.objectContaining({ name: 'Bottom', quantity: 1, length: 864, width: 560, thickness: 18 }),
      expect.objectContaining({ name: 'Top', quantity: 1, length: 864, width: 560, thickness: 18 }),
      expect.objectContaining({ name: 'Drawer front', quantity: 2, length: 896, width: 356, thickness: 18 }),
    ]));
  });

  it('adds six original designs per collection, with bilingual names, public references and independently editable upper rows', () => {
    expect(PREMIUM_KITCHENS).toHaveLength(18);
    for (const collection of ['warm', 'dark', 'japandi']) {
      expect(PREMIUM_KITCHENS.filter((preset) => preset.collection === collection)).toHaveLength(6);
    }
    for (const preset of PREMIUM_KITCHENS) {
      expect(en.kitchens.names[preset.id]).toBeTruthy();
      expect(sr.kitchens.names[preset.id]).toBeTruthy();
      expect(preset.inspiration).toMatch(/^https:\/\/www\.pinterest\.com\/ideas\//);
      const design = createKitchenDesign(preset, preset.id);
      const uppers = design.items.filter((item) => ['wall', 'glassWall', 'shelf'].includes(item.kind));
      expect(new Set(uppers.map((item) => item.elevation)).size).toBeGreaterThanOrEqual(2);
      expect(new Set(uppers.map((item) => item.depth)).size).toBeGreaterThan(1);
      expect(uppers.some((item) => item.frontFinish === preset.middleFinish)).toBe(true);
    }
  });

  it('includes every premium module and stone backsplashes without obsolete lighting options', () => {
    const kinds = new Set(KITCHEN_DESIGNS.flatMap((preset) => createKitchenDesign(preset, '').items.map((item) => item.kind)));
    for (const kind of ['pullOut', 'glassWall', 'ovenTower', 'integratedFridge', 'hood', 'hob', 'bar', 'tall'] as const) expect(kinds.has(kind)).toBe(true);
    for (const preset of KITCHEN_DESIGNS) {
      expect(preset.style).not.toHaveProperty('lighting');
      expect(preset.style).not.toHaveProperty('plinthLighting');
      expect(preset.style.backsplash).not.toBe('none');
    }
  });

  it('showcases multiple diagonal walls, half-height partitions and wall finishes without moving cabinetry or adding cut parts', () => {
    for (const id of ['travertine-courtyard', 'obsidian-island', 'clay-social', 'moss-pavilion']) {
      const preset = PREMIUM_KITCHENS.find((entry) => entry.id === id)!;
      const design = createKitchenDesign(preset, id);
      const { width, depth, height } = preset.room;
      const baseline = createKitchenDesign({ ...preset, room: { width, depth, height } }, id);
      expect(design.items.map(({ id: _id, ...item }) => item)).toEqual(baseline.items.map(({ id: _id, ...item }) => item));
      expect(checkDesign(design).filter((issue) => issue.severity === 'error')).toEqual([]);
      expect(buildCuttingList(design).pieceCount).toBe(buildCuttingList(baseline).pieceCount);
      expect(buildCuttingList(design).rows.map(({ length, width, quantity }) => ({ length, width, quantity })))
        .toEqual(buildCuttingList(baseline).rows.map(({ length, width, quantity }) => ({ length, width, quantity })));
      expect(design.room.treatments?.length).toBeGreaterThan(0);
      if (design.room.vertices) {
        expect(roomSegments(design.room, false).filter((wall) => wall.start.x !== wall.end.x && wall.start.y !== wall.end.y)).toHaveLength(2);
      } else {
        expect(design.room.partitions).toHaveLength(1);
        expect(design.room.partitions![0].height).toBe(1100);
      }
      expect(parseDesign(JSON.parse(JSON.stringify(design)))).toEqual(design);
      const second = createKitchenDesign(preset, id);
      design.room.treatments![0].width = 10;
      expect(second.room.treatments![0].width).not.toBe(10);
    }
  });

  for (const preset of KITCHEN_DESIGNS) {
    it(`${preset.id} is buildable and serializable`, () => {
      const design = createKitchenDesign(preset, 'My project');
      expect(design.room).toEqual(preset.room);
      expect(design.style).toEqual(preset.style);
      const options: KitchenPreset = preset;
      if (options.ovenTower) expect(design.items.some((item) => item.kind === 'ovenTower')).toBe(true);
      if (options.pantry) expect(design.items.some((item) => item.kind === 'tall')).toBe(true);
      if (options.pullOut) expect(design.items.some((item) => item.kind === 'pullOut')).toBe(true);
      if (options.breakfastBar) expect(design.items.some((item) => item.kind === 'bar')).toBe(true);
      expect(new Set(design.items.map((item) => item.id)).size).toBe(design.items.length);
      expect(new Set(design.items.map((item) => item.label)).size).toBe(design.items.length);
      expect(checkDesign(design).filter((issue) => issue.severity === 'error')).toEqual([]);
      const list = buildCuttingList(design);
      expect(list.pieceCount).toBeGreaterThan(0);
      expect(list.rows.every((row) => row.length > 0 && row.width > 0 && row.quantity > 0)).toBe(true);
      expect(list.pieceCount).toBe(list.units.flatMap((unit) => unit.parts).reduce((sum, part) => sum + part.quantity, 0));
      expect(list.materials.reduce((sum, material) => sum + material.pieces, 0)).toBe(list.pieceCount);
      expect(list.materials.reduce((sum, material) => sum + material.area, 0)).toBeCloseTo(list.units.flatMap((unit) => unit.parts).reduce((sum, part) => sum + part.area * part.quantity / 1_000_000, 0), 8);
      expect(parseDesign(JSON.parse(JSON.stringify(design)))).toEqual(design);
    });

    it(`${preset.id} has its own rendered image`, () => {
      const image = readFileSync(path.resolve('public', 'kitchens', `${preset.id}.jpg`));
      expect(image.length).toBeGreaterThan(8000);
      expect([...image.subarray(0, 2)]).toEqual([0xff, 0xd8]);
      expect([...image.subarray(-2)]).toEqual([0xff, 0xd9]);
    });
  }

  it('makes independent copies, with fresh unit IDs on every load', () => {
    const preset = KITCHEN_DESIGNS.find((kitchen) => kitchen.id === 'oak-island')!;
    const first = createKitchenDesign(preset, 'First');
    const second = createKitchenDesign(preset, 'Second');
    expect(first.items.map((item) => item.id).some((id) => second.items.some((item) => item.id === id))).toBe(false);
    first.room.width = 1000;
    first.items[0].width = 700;
    first.style.front = 'navy';
    expect(second.room).toEqual(preset.room);
    expect(second.style).toEqual(preset.style);
    expect(second.items[0].width).toBe(900);
  });
});

describe('looks for "Shuffle look"', () => {
  const preset = (id: string) => KITCHEN_DESIGNS.find((idea) => idea.id === id)!;
  const effective = (design: Design) => design.items.map((item) => [item.frontFinish ?? design.style.front, item.carcassFinish]);
  const nonVisual = ({ frontFinish: _front, carcassFinish: _carcass, ...item }: KitchenItem) => item;

  it('deals every distinct role palette once, not just distinct global fronts and worktops', () => {
    const key = (idea: KitchenPreset) => JSON.stringify(kitchenLook(idea));
    const allLooks = new Set(KITCHEN_DESIGNS.map(key));
    expect(KITCHEN_LOOK_PRESETS).toHaveLength(allLooks.size);
    expect(new Set(KITCHEN_LOOK_PRESETS.map(key))).toEqual(allLooks);
    const walnut = preset('noir-salon'), ash = preset('graphite-penthouse');
    expect(walnut.style.front).toBe(ash.style.front);
    expect(walnut.style.worktop).toBe(ash.style.worktop);
    expect(key(walnut)).not.toEqual(key(ash));
  });

  it('reproduces the actual finishes of every pictured model, even over pre-existing individual overrides', () => {
    for (const idea of KITCHEN_DESIGNS) {
      const original = createKitchenDesign(idea, 'Reference');
      expect(applyKitchenLook(original, idea), idea.id).toBe(original);
      const restyled = applyKitchenLook({
        ...original, items: original.items.map((item) => ({ ...item, frontFinish: 'navy', carcassFinish: 'clay' })),
      }, idea);
      expect(effective(restyled), idea.id).toEqual(effective(original));
      expect(applyKitchenLook(restyled, idea)).toBe(restyled);
    }
  });

  it('matches made-to-measure rows, tall units, islands and side panels without adding a missing row', () => {
    const design = createDesign('Different room');
    design.items = [
      createItem('base', [], { x: 700 }), createItem('ovenTower', [], { x: 1600 }),
      createItem('shelf', [], { x: 700, elevation: 1330, height: 515 }),
      createItem('wall', [], { x: 700, elevation: 1845, height: 600 }),
      createItem('endPanel', [], { x: 1300, elevation: 853, height: 992 }),
      createItem('drawer', [], { x: 1250, y: 1700, rotation: 30 }),
    ];
    const stone = applyKitchenLook(design, preset('stone-frame'));
    expect(effective(stone)).toEqual(['oak', 'cashmere', 'cream', 'cashmere', 'oak', 'oak'].map((f) => [f, f]));
    const ash = applyKitchenLook(stone, preset('ash-frame-island'));
    expect(effective(ash)).toEqual(['sand', 'sand', 'ash', 'sand', 'ash', 'ash'].map((f) => [f, f]));
    expect(ash.items.map(nonVisual)).toEqual(design.items.map(nonVisual));
    const singleRow = applyKitchenLook({ ...ash, items: ash.items.filter((item) => item.kind !== 'wall') }, preset('olive-window-wall'));
    expect(singleRow.items).toHaveLength(5);
    expect(effective(singleRow)[2]).toEqual(['oak', 'oak']);
    const glassStack = applyKitchenLook({ ...design, items: [
      createItem('glassWall', [], { elevation: 1300, height: 515 }), createItem('wall', [], { elevation: 1815 }),
    ] }, preset('stone-frame'));
    expect(effective(glassStack)).toEqual([['cream', 'cream'], ['cashmere', 'cashmere']]);
    const plain = applyKitchenLook(ash, preset('nordic-light'));
    expect(plain.items.every((item) => !item.frontFinish && !item.carcassFinish)).toBe(true);
    expect(effective(setStyle(plain, { front: 'navy' }))[0][0]).toBe('navy');
  });

  it('preserves room, openings, production rules, manual cut parts and project metadata', () => {
    const design = createKitchenDesign(preset('chimney-frame'), 'Measured kitchen');
    design.openings = [
      { id: 'my-door', kind: 'door', wall: 'left', offset: 1400, width: 900, height: 2100, sill: 0 },
      { id: 'my-window', kind: 'window', wall: 'bottom', offset: 123, width: 800, height: 900, sill: 871 },
    ];
    design.room.treatments = [{ id: 'my-cladding', wallId: 'bottom', offset: 0, width: 800, elevation: 900, height: 500, finish: 'ash' }];
    design.style = { ...design.style, wallColor: '#abd012', floorColor: '#bee123', floorPattern: 'tiles', floorTileSize: 400, floorGroutColor: '#666666', decor: false };
    const unit = design.items.find((item) => item.kind === 'drawer')!;
    unit.carcassMaterial = 'particleboard-white-16';
    unit.frontMaterial = 'mdf-oak-19';
    const part = buildCuttingList(design).units.find(({ item }) => item.id === unit.id)!.parts[0];
    design.customParts = [{ id: 'extra', name: 'Keep', length: 309, width: 122, quantity: 3, materialId: 'mdf-18', note: '', edgeBandId: null, edgesLength: 0, edgesWidth: 0 }];
    const before = setPartEdit(design, unit.id, part.key, { length: 629, quantity: 1 });
    const original = structuredClone(before);
    const idea = preset('olive-oak-vitrine');
    const after = applyKitchenLook(before, { ...idea, style: { ...idea.style, frontProfile: 'shaker', handles: 'brass', lighting: true, plinthLighting: true } });
    expect(before).toEqual(original);
    for (const key of ['name', 'room', 'openings', 'galleryPresetId', 'materials', 'edgeBands', 'construction', 'customParts', 'partEdits'] as const) {
      expect(after[key]).toBe(before[key]);
    }
    expect(after.items.map(nonVisual)).toEqual(before.items.map(nonVisual));
    expect(after.style).toMatchObject({ frontProfile: 'shaker', handles: 'brass', worktop: 'oak', windowFrame: 'oak', doorFrame: 'oak', doorLeaf: 'forest',
      wallColor: '#abd012', floorColor: '#bee123', floorPattern: 'tiles', floorTileSize: 400, floorGroutColor: '#666666', decor: false });
    expect(after.style.lighting || after.style.plinthLighting).toBeFalsy();
    const cuts = (d: Design) => {
      const { rows, units, extra, edges, materials, cost } = buildCuttingList(d);
      return { rows, units: units.map(({ parts }) => parts), extra, edges, materials, cost };
    };
    expect(cuts(after)).toEqual(cuts(before));
    expect(parseDesign(JSON.parse(JSON.stringify(after)))).toEqual(after);
    expect(applyKitchenLook(after, preset('ash-frame-island')).style.frontProfile).toBe('flat');
  });

  it('round-trips independently chosen joinery without imposing new finishes on old files', () => {
    const old = createDesign();
    expect(parseDesign(old)?.style).toEqual(old.style);
    const manual = setStyle(old, { windowFrame: 'navy', doorFrame: 'walnut', doorLeaf: 'eucalyptus' });
    expect(parseDesign(JSON.parse(JSON.stringify(manual)))).toEqual(manual);
    expect(parseDesign({ ...manual, style: { ...manual.style, windowFrame: 'not-a-finish', doorLeaf: 'constructor' } })?.style)
      .toEqual({ ...old.style, doorFrame: 'walnut' });
  });
});
