import { describe, expect, it } from 'vitest';
import { checkDesign } from '../engine/checks';
import { buildCuttingList } from '../engine/cuttingList';
import { cuttingListDocument } from '../export/pdf';
import { planSvg } from '../export/planSvg';
import { en } from '../i18n/en';
import { sr } from '../i18n/sr';
import { stackCabinetAbove, addThreeTierRun, addPresetToPlan } from '../store/actions';
import { useDesignStore } from '../store/designStore';
import { useUiStore } from '../store/uiStore';
import { CEILING_GAP, createItem, findPreset, hasWorktop, itemFromPreset } from './catalog';
import { createDesign, parseDesign } from './designOps';
import { localToRoom, verticalOverlap } from './geometry';
import { createKitchenDesign, KITCHEN_DESIGNS } from './kitchens';
import type { Opening } from './types';
import { backsplashTop, canStackCabinet, editableUpperRows, inUpperRow, planCabinetAbove, upperCabinetRows, planThreeTier, DEFAULT_THREE_TIER } from './upperCabinets';

const room = { width: 4000, depth: 3200, height: 2600 };

describe('stacked upper cabinetry', () => {
  it('selects an added ceiling cupboard without changing the chosen upper row', () => {
    const source = createItem('wall', []);
    useDesignStore.getState().load({ ...createDesign(), room, items: [source] });
    useUiStore.getState().setViewFilter('wall');
    useUiStore.getState().setWallElevation(source.elevation);
    expect(addPresetToPlan('ceiling-600')).toBe(true);
    const added = useDesignStore.getState().design.items.at(-1)!;
    expect(useUiStore.getState()).toMatchObject({ viewFilter: 'wall', wallElevation: source.elevation, selectedId: added.id });
  });
  it('adds a full connected base run as two independent upper rows in one undo step', () => {
    const first = createItem('base', [], { x: 600 });
    const second = createItem('drawer', [first], { x: 1200 });
    const initial = { ...createDesign(), room, items: [first, second] };
    useDesignStore.getState().load(initial);
    const before = useDesignStore.getState().past.length;
    expect(addThreeTierRun(first.id, DEFAULT_THREE_TIER).ok).toBe(true);
    const state = useDesignStore.getState();
    expect(state.design.items).toHaveLength(6);
    expect(upperCabinetRows(state.design.items)).toHaveLength(2);
    expect(state.past).toHaveLength(before + 1);
    expect(checkDesign(state.design).filter((issue) => issue.severity === 'error')).toEqual([]);
    state.undo();
    expect(useDesignStore.getState().design).toEqual(initial);
  });

  it('does not insert partial rows when the ceiling or another cupboard blocks the proposal', () => {
    const source = createItem('base', []);
    expect(planThreeTier({ ...room, height: 2200 }, [source], source, DEFAULT_THREE_TIER)).toEqual({ ok: false, reason: 'noSpace' });
    const blocker = createItem('wall', [source], { elevation: 2170, height: 400 });
    const design = { ...createDesign(), room, items: [source, blocker] };
    useDesignStore.getState().load(design);
    expect(addThreeTierRun(source.id, DEFAULT_THREE_TIER)).toEqual({ ok: false, reason: 'blocked' });
    expect(useDesignStore.getState().design).toBe(design);
  });

  it('keeps both angled upper rows aligned to their base back anchor', () => {
    const source = createItem('base', [], { rotation: 30, x: 1200, y: 1200 });
    const plan = planThreeTier(room, [source], source, DEFAULT_THREE_TIER);
    if (!plan.ok) throw new Error(plan.reason);
    for (const cabinet of plan.cabinets) {
      expect(localToRoom({ ...source, ...cabinet }, 0, 0).x).toBeCloseTo(localToRoom(source, 0, 0).x);
      expect(localToRoom({ ...source, ...cabinet }, 0, 0).y).toBeCloseTo(localToRoom(source, 0, 0).y);
    }
  });
  it.each([0, 90, 180, 270] as const)('aligns a second row with the same back anchor at %i degrees', (rotation) => {
    const source = createItem('wall', [], { x: 1000, y: 1000, rotation });
    const plan = planCabinetAbove(room, [source], source);
    expect(plan.ok).toBe(true);
    if (!plan.ok) throw new Error(plan.reason);
    expect(plan.cabinet.elevation).toBe(2170);
    expect(plan.cabinet.height).toBe(400);
    expect(localToRoom({ ...source, ...plan.cabinet }, 0, 0)).toEqual(localToRoom(source, 0, 0));
    expect(verticalOverlap(source, plan.cabinet)).toBe(false);
    expect(plan.cabinet.elevation + plan.cabinet.height).toBe(room.height - CEILING_GAP);
  });

  it.each([0, 90, 180, 270] as const)('keeps a deep tall unit against its back surface at %i degrees', (rotation) => {
    const source = createItem('tall', [], { x: 1000, y: 1000, depth: 800, rotation });
    const plan = planCabinetAbove(room, [source], source);
    if (!plan.ok) throw new Error(plan.reason);
    expect(plan.cabinet.depth).toBe(600);
    expect(localToRoom({ ...source, ...plan.cabinet }, 0, 0)).toEqual(localToRoom(source, 0, 0));
  });

  it.each([0, 90, 180, 270] as const)('preserves both arms of an upper corner cabinet at %i degrees', (rotation) => {
    const source = createItem('corner', [], { x: 1000, y: 1000, rotation, width: 900, width2: 1000, depth: 320, elevation: 1500, height: 400 });
    const plan = planCabinetAbove(room, [source], source);
    if (!plan.ok) throw new Error(plan.reason);
    expect(plan.cabinet).toMatchObject({ kind: 'corner', width: 900, width2: 1000, depth: 320, elevation: 1900 });
    const upper = createItem(plan.cabinet.kind, [source], plan.cabinet);
    expect(localToRoom(upper, 0, 0)).toEqual(localToRoom(source, 0, 0));
    const design = { ...createDesign(), room, items: [source, upper] };
    expect(checkDesign(design).filter((issue) => issue.severity === 'error')).toEqual([]);
    expect(buildCuttingList(design).pieceCount).toBeGreaterThan(0);
    expect(canStackCabinet(createItem('corner', []))).toBe(false);
  });

  it('uses the available height without creating an undersized cabinet or crossing the ceiling', () => {
    const source = createItem('wall', []);
    const fits = planCabinetAbove({ ...room, height: 2400 }, [source], source);
    expect(fits).toMatchObject({ ok: true, cabinet: { height: 200, elevation: 2170 } });
    expect(planCabinetAbove({ ...room, height: 2399 }, [source], source)).toEqual({ ok: false, reason: 'noSpace' });
  });

  it('rejects a second cabinet occupying the target row', () => {
    const source = createItem('wall', []);
    const other = createItem('wall', [source], { elevation: 2170, height: 400 });
    expect(planCabinetAbove(room, [source, other], source)).toEqual({ ok: false, reason: 'blocked' });
  });

  it('reserves windows and full-height room structures', () => {
    const source = createItem('wall', []);
    const window: Opening = { id: 'window', kind: 'window', wall: 'top', offset: 0, width: 600, sill: 2200, height: 300 };
    expect(planCabinetAbove(room, [source], source, [window])).toEqual({ ok: false, reason: 'blocked' });
    expect(planCabinetAbove({ ...room, features: [{ id: 'column', kind: 'column', x: 0, y: 0, width: 300, depth: 300 }] }, [source], source))
      .toEqual({ ok: false, reason: 'blocked' });
  });

  it('does not silently turn base units or extra-wide open shelves into overhead cupboards', () => {
    expect(canStackCabinet(createItem('base', []))).toBe(false);
    expect(planCabinetAbove(room, [], createItem('shelf', [], { width: 1600 }))).toEqual({ ok: false, reason: 'unsupported' });
  });

  it('preserves independent finishes, but uses closed-board fronts above a glass cupboard', () => {
    const source = createItem('glassWall', [], { frontFinish: 'taupe', carcassFinish: 'walnut' });
    const design = { ...createDesign(), room, items: [source] };
    useDesignStore.getState().load(design);
    expect(stackCabinetAbove(source.id).ok).toBe(true);
    const added = useDesignStore.getState().design.items[1];
    expect(added).toMatchObject({ kind: 'wall', frontFinish: 'taupe', carcassFinish: 'walnut' });
    expect(added.frontMaterial).toBeUndefined();
  });

  it('selects the stacked cabinet in one undoable change without copying edited cut parts or switching layers', () => {
    const source = createItem('wall', []);
    const design = { ...createDesign(), room, items: [source], partEdits: { [source.id]: { 'side-0': { quantity: 0 } } } };
    useDesignStore.getState().load(design);
    useUiStore.getState().setViewFilter('floor');
    expect(stackCabinetAbove(source.id).ok).toBe(true);
    const after = useDesignStore.getState().design;
    expect(after.items).toHaveLength(2);
    expect(useUiStore.getState().selectedId).toBe(after.items[1].id);
    expect(useUiStore.getState().viewFilter).toBe('floor');
    expect(after.partEdits[after.items[1].id]).toBeUndefined();
    useDesignStore.getState().undo();
    expect(useDesignStore.getState().design).toEqual(design);
    useDesignStore.getState().redo();
    expect(useDesignStore.getState().design).toEqual(after);
  });

  it('inserts a real L-shaped corner above an upper corner instead of replacing its shape with a rectangle', () => {
    const source = createItem('corner', [], { depth: 320, width: 900, width2: 1000, elevation: 1500, height: 400 });
    const design = { ...createDesign(), room, items: [source] };
    useDesignStore.getState().load(design);
    expect(stackCabinetAbove(source.id).ok).toBe(true);
    expect(useDesignStore.getState().design.items[1]).toMatchObject({ kind: 'corner', width: 900, width2: 1000, depth: 320, elevation: 1900 });
    useDesignStore.getState().undo();
    expect(useDesignStore.getState().design).toEqual(design);
  });

  it('does not change the design or history when stacking is blocked', () => {
    const source = createItem('wall', []);
    const design = { ...createDesign(), room: { ...room, height: 2200 }, items: [source] };
    useDesignStore.getState().load(design);
    expect(stackCabinetAbove(source.id)).toEqual({ ok: false, reason: 'noSpace' });
    expect(useDesignStore.getState().design).toBe(design);
    expect(stackCabinetAbove('missing')).toEqual({ ok: false, reason: 'noSelection' });
  });

  it('supports upper tiers above 2500 mm and preserves them on import', () => {
    const source = createItem('wall', [], { elevation: 2500, height: 400 });
    const tallRoom = { ...room, height: 3600 };
    const plan = planCabinetAbove(tallRoom, [source], source);
    if (!plan.ok) throw new Error(plan.reason);
    const upper = createItem('wall', [source], plan.cabinet);
    const design = { ...createDesign(), room: tallRoom, items: [source, upper] };
    expect(upper.elevation).toBe(2900);
    expect(parseDesign(JSON.parse(JSON.stringify(design)))).toEqual(design);
  });

  it('places ceiling library units relative to short and tall room ceilings', () => {
    const preset = findPreset('ceiling-600');
    if (!preset) throw new Error('Ceiling cupboard preset is missing.');
    for (const height of [2000, 2600, 3600, 4000]) {
      const item = itemFromPreset(preset, [], undefined, { height });
      expect(item).toMatchObject({ width: 600, height: 400, depth: 560 });
      expect(item.elevation + item.height).toBe(height - CEILING_GAP);
    }
  });
});

describe('upper row visibility and backsplashes', () => {
  const lower = createItem('wall', [], { elevation: 1600, height: 600 });
  const upper = createItem('wall', [lower], { elevation: 2200, height: 400 });
  const display = createItem('glassWall', [], { x: 600, elevation: 1600, height: 1000 });

  it('does not render a worktop or its backsplash above an upper corner unit', () => {
    const corner = createItem('corner', []);
    expect(hasWorktop(corner)).toBe(true);
    expect(hasWorktop({ ...corner, elevation: 1500, height: 490 })).toBe(false);
    expect(hasWorktop({ ...corner, elevation: 2180, height: 490 })).toBe(false);
  });

  it('derives two rows, ignores the hood as a separate row and retains full-height displays in both', () => {
    const rows = upperCabinetRows([upper, display, lower, createItem('hood', [])]);
    expect(rows).toEqual([{ elevation: 1600, top: 2200 }, { elevation: 2200, top: 2600 }]);
    expect(inUpperRow(lower, rows[1])).toBe(false);
    expect(inUpperRow(upper, rows[0])).toBe(false);
    expect(rows.every((row) => inUpperRow(display, row))).toBe(true);
  });

  it('lets the layout select a hood below a ceiling-only run without inventing a report row', () => {
    const hood = createItem('hood', [], { elevation: 1500, height: 300 });
    const items = [upper, hood];
    expect(upperCabinetRows(items)).toEqual([{ elevation: 2200, top: 2600 }]);
    expect(editableUpperRows(items)).toEqual([{ elevation: 1500, top: 1800 }, { elevation: 2200, top: 2600 }]);
    expect(editableUpperRows([lower, upper, { ...hood, elevation: 1700 }])).toEqual(upperCabinetRows([lower, upper]));
  });

  it('extends the backsplash to the real lowest cupboard rather than the hood or top tier', () => {
    const base = createItem('hob', []);
    const lower = createItem('wall', [], { elevation: 1690, height: 490 });
    const upper = createItem('wall', [], { elevation: 2180, height: 490 });
    expect(backsplashTop(base, [base, lower, upper, createItem('hood', [])], 'top')).toBe(1690);
    expect(backsplashTop(base, [base, upper], 'top')).toBe(2180);
    expect(backsplashTop(base, [base], 'top')).toBe(1458);
  });

  it('keeps each arm of an L-shaped backsplash tied to its own mounting wall', () => {
    const corner = createItem('corner', []);
    const top = createItem('wall', [], { x: 320, width: 580, height: 400, elevation: 1600 });
    const left = createItem('wall', [], { y: 320, width: 580, rotation: 270, height: 400, elevation: 1800 });
    expect(backsplashTop(corner, [corner, top, left], 'top')).toBe(1600);
    expect(backsplashTop(corner, [corner, top, left], 'left')).toBe(1800);
    expect(backsplashTop(corner, [corner, { ...top, y: 100 }], 'top')).toBe(1458);
  });
});

describe('layered premium designs and reports', () => {
  for (const preset of KITCHEN_DESIGNS.filter((preset) => 'layered' in preset)) {
    it(`${preset.id} has two independent, buildable rows with matching reports`, () => {
      const design = createKitchenDesign(preset, preset.id);
      const rows = upperCabinetRows(design.items);
      expect(rows).toHaveLength(2);
      expect(checkDesign(design).filter((issue) => issue.severity === 'error')).toEqual([]);
      expect(design.items.every((item) => [item.x, item.y, item.width, item.height, item.elevation].every(Number.isInteger))).toBe(true);
      expect(parseDesign(JSON.parse(JSON.stringify(design)))).toEqual(design);
      const list = buildCuttingList(design);
      expect(list.units.length).toBe(design.items.length);
      for (const messages of [en, sr]) {
        const document = JSON.stringify(cuttingListDocument(design, list, [], new Date('2026-01-01'), messages));
        expect(document).toContain(messages.stacking.floorPlan);
        rows.forEach((row, index) => {
          expect(document).toContain(messages.stacking.exportRow(index + 1, messages.mm(row.elevation), messages.mm(row.top)));
          const svg = planSvg(design, messages.engine, design.items.filter((item) => inUpperRow(item, row))).svg;
          const other = design.items.find((item) => item.kind === 'wall' && !inUpperRow(item, row));
          if (!other) throw new Error('Each row needs independently selectable cupboards.');
          expect(svg).not.toContain(`>${other.label}</text>`);
        });
      }
    });
  }

  it('reports front construction cautions once, even without fixed room structures', () => {
    const design = { ...createDesign(), items: [createItem('wall', [])], style: { ...createDesign().style, handles: 'none' as const, frontProfile: 'shaker' as const } };
    expect(checkDesign(design).filter((issue) => issue.key === 'front-profile')).toHaveLength(1);
    expect(checkDesign(design).filter((issue) => issue.key === 'handleless')).toHaveLength(1);
  });
});
