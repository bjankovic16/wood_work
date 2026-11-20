import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createItem } from '../domain/catalog';
import { localToRoom } from '../domain/geometry';
import * as ops from '../domain/designOps';
import { KITCHEN_DESIGNS } from '../domain/kitchens';
import { buildCuttingList } from '../engine/cuttingList';
import { DEFAULT_CONSTRUCTION } from '../engine/settings';
import * as actions from './actions';
import { useDesignStore } from './designStore';
import { prepareIdeaReview } from './ideaReview';
import { en } from '../i18n/en';
import { useUiStore } from './uiStore';
import { undoFeedback, useFeedback } from './feedback';

const store = () => useDesignStore.getState();

beforeEach(() => {
  useDesignStore.setState({ design: ops.createDesign(), past: [], future: [], gestureBase: null });
  useUiStore.setState({ selectedId: null, view: 'plan', cabinetTool: null, previewLockedIds: [], layoutsOpen: false, fitRequest: null, language: 'en' });
});

describe('choose a spot in Layout', () => {
  it('does not silently insert a corner cabinet over the chimney when no spot fits', () => {
    const original = ops.createDesign();
    original.room = { width: 1400, depth: 1300, height: 2600,
      features: [{ id: 'flue', kind: 'chimney', x: 300, y: 200, width: 750, depth: 750 }] };
    store().load(original);
    expect(actions.addPresetToPlan('corner')).toBe(false);
    expect(useFeedback.getState().notice?.message(en)).toBe(en.library.cornerNoSpace);
    expect(store().design).toBe(original);
    expect(store().past).toEqual([]);
  });
  it('moves a rotated island by its centre without snapping, resizing or losing its Undo step', () => {
    const item = createItem('drawer', [], { x: 1200, y: 1200, width: 900, depth: 600, rotation: 90 });
    const original = { ...ops.createDesign(), items: [item] };
    store().load(original);
    const ui = useUiStore.getState();
    ui.setView('plan'); ui.select(item.id); ui.setCabinetTool('place');
    expect(actions.placeCabinetAt(item.id, { x: 1107, y: 593 })).toBe('placed');
    expect(store().design.items).toEqual([{ ...item, x: 807, y: 143 }]);
    expect(useUiStore.getState().cabinetTool).toBeNull();
    expect(store().past).toEqual([original]);
    actions.undo();
    expect(store().design).toBe(original);
  });

  it('rejects blocked or outside destinations without editing, and never places in another workspace', () => {
    const item = createItem('base', [], { x: 1400, y: 1200 });
    const other = createItem('base', [item], { x: 400, y: 0 });
    const original = { ...ops.createDesign(), items: [item, other] };
    store().load(original);
    const ui = useUiStore.getState();
    ui.setView('plan'); ui.select(item.id); ui.setCabinetTool('place');
    for (const point of [{ x: 700, y: 300 }, { x: 0, y: 0 }]) expect(actions.placeCabinetAt(item.id, point)).toBe('blocked');
    expect(useUiStore.getState().cabinetTool).toBe('place');
    ui.setView('3d'); ui.setCabinetTool('place');
    expect(actions.placeCabinetAt(item.id, { x: 1900, y: 1500 })).toBe('inactive');
    expect(store().design).toBe(original);
    expect(store().past).toEqual([]);
  });
});

describe('explicit 3D cabinet tools', () => {
  it('allows only deliberate architectural sizes in the Room model, not position edits or kitchen 3D edits', () => {
    const original = ops.createDesign();
    original.room.features = [{ id: 'flue', wallId: 'top', kind: 'chimney', offset: 3100, x: 3100, y: 0, width: 500, depth: 450 }];
    original.openings = [{ id: 'window', kind: 'window', wall: 'bottom', offset: 300, width: 900, height: 800, sill: 900 }];
    store().load(original);
    const ui = useUiStore.getState();
    ui.setView('3d');
    expect(actions.setRoomFeatureSize('flue', 'width', 700)).toBe(false);
    expect(actions.setOpeningSize('window', 'width', 1100)).toBe(false);
    ui.setRoomOpen(true); ui.setRoomView('3d');
    actions.updateRoomFeature('flue', { offset: 100 });
    expect(store().design).toBe(original);
    actions.setRoomFeatureSize('flue', 'width', 700);
    expect(store().design.room.features![0]).toMatchObject({ width: 700, offset: 2900 });
    actions.setOpeningSize('window', 'width', 1100);
    expect(store().design.openings[0]).toMatchObject({ width: 1100, wallId: 'bottom', offset: 2400, sill: 900 });
    expect(actions.setOpeningSize('window', 'height', 2300)).toBe(false);
    expect(store().past).toHaveLength(2);
    actions.undo(); actions.undo();
    expect(store().design).toBe(original);
    ui.setRoomOpen(false);
  });
  it('disarms tools on selection/view changes and preview locks, without rearming when a preview closes', () => {
    const ui = () => useUiStore.getState();
    ui().setCabinetTool('resize');
    expect(ui().cabinetTool).toBeNull();
    ui().select('a');
    ui().setCabinetTool('resize');
    expect(ui().cabinetTool).toBeNull();
    ui().setView('3d');
    ui().setCabinetTool('resize');
    ui().select('a');
    expect(ui().cabinetTool).toBe('resize');
    ui().setPreviewLockedIds(['a', 'b']);
    ui().setView('3d');
    ui().setRoomView('3d');
    expect(ui().previewLockedIds).toEqual(['a', 'b']);
    expect(ui().cabinetTool).toBeNull();
    ui().setCabinetTool('resize');
    expect(ui().cabinetTool).toBeNull();
    ui().setPreviewLockedIds([]);
    expect(ui().cabinetTool).toBeNull();
    ui().setCabinetTool('resize');
    ui().select('b');
    expect(ui().cabinetTool).toBeNull();
    ui().setCabinetTool('resize');
    ui().setView('plan');
    expect(ui().cabinetTool).toBeNull();
    expect(ui().previewLockedIds).toEqual([]);
  });

  it('blocks size, position, elevation and rotation changes of preview-locked cabinets without adding history', () => {
    const item = createItem('base', [], { x: 1000, y: 1000 });
    store().load({ ...ops.createDesign(), items: [item] });
    const original = store().design;
    const ui = useUiStore.getState();
    ui.select(item.id);
    ui.setView('3d');
    ui.setPreviewLockedIds([item.id]);
    actions.setItemSize(item.id, 'width', 900);
    actions.setItemPosition(item.id, 500, 500);
    actions.setItemElevation(item.id, 200);
    actions.setItemAngle(item.id, 45);
    actions.rotateSelected(1);
    actions.nudgeSelected(100, 100);
    expect(store().design).toBe(original);
    expect(store().past).toHaveLength(0);
    ui.setPreviewLockedIds([]);
    actions.setItemSize(item.id, 'width', 900);
    expect(store().design.items[0].width).toBe(900);
    expect(store().past).toHaveLength(1);
  });

  it('keeps placement and Undo untouched in 3D, even in Resize, then edits the same cabinet in plan', () => {
    const item = createItem('base', [], { x: 1000, y: 1000 });
    store().load({ ...ops.createDesign(), items: [item] });
    const ui = useUiStore.getState();
    ui.select(item.id);
    ui.setView('3d');
    for (const tool of [null, 'resize'] as const) {
      ui.setCabinetTool(tool);
      actions.nudgeSelected(100, 0);
      actions.setItemPosition(item.id, 1200, 1000);
      actions.setItemElevation(item.id, 200);
      actions.setItemAngle(item.id, 45);
      actions.rotateSelected(-1);
    }
    expect(store().design.items[0]).toBe(item);
    expect(store().past).toHaveLength(0);
    actions.editCabinetPositionInPlan(item.id);
    expect(useUiStore.getState()).toMatchObject({ view: 'plan', selectedId: item.id, cabinetTool: null });
    expect(store().past).toHaveLength(0);
    actions.setItemPosition(item.id, 1200, 1000);
    expect(store().design.items[0].x).toBe(1200);
    actions.nudgeSelected(100, -100);
    expect(store().design.items[0]).toMatchObject({ x: 1300, y: 900 });
  });

  it('rejects a 3D numeric resize that would have to move the cabinet to fit', () => {
    const design = ops.createDesign();
    const item = createItem('base', [], { width: 600, x: design.room.width - 600, y: 0 });
    store().load({ ...design, items: [item] });
    useUiStore.getState().setView('3d');
    expect(actions.setItemSize(item.id, 'width', 900)).toBe(false);
    expect(store().design.items[0]).toBe(item);
    expect(store().past).toHaveLength(0);
    actions.setItemSize(item.id, 'width', 500);
    expect(store().design.items[0]).toMatchObject({ width: 500, x: item.x, y: item.y, elevation: item.elevation });
  });

  it('only changes room-object placement on the plan or wall elevation', () => {
    const chimney = actions.addRoomFeature('chimney', 'top');
    const window = actions.addOpening('window', 'bottom');
    const previous = store().design;
    const history = store().past.length;
    const ui = useUiStore.getState();
    ui.setRoomView('3d');
    expect(() => actions.addOpening('door', 'left')).toThrow(RangeError);
    expect(() => actions.addRoomFeature('column')).toThrow(RangeError);
    actions.removeRoomFeature(chimney);
    actions.removeOpening(window);
    actions.setRoomFeatureWall(chimney, 'left');
    actions.updateRoomFeature(chimney, { offset: 75 });
    actions.nudgeRoomFeature(chimney, 100, 0);
    actions.updateOpening(window, { offset: 100, sill: 600 });
    actions.editRoomWall('top', 4200, 0);
    expect(store().design).toBe(previous);
    expect(store().past).toHaveLength(history);

    ui.setRoomView('plan');
    actions.updateRoomFeature(chimney, { offset: 75 });
    actions.updateOpening(window, { offset: 100, sill: 600 });
    expect(store().design.room.features?.[0].offset).toBe(75);
    expect(store().design.openings[0]).toMatchObject({ offset: 100, sill: 600 });
  });
});

describe('shuffle kitchen', () => {
  it('cannot undo another edit or re-use a toast after keyboard Undo/Redo', () => {
    store().load({ ...ops.createDesign(), items: [createItem('base', [])] });
    const original = store().design;
    actions.shuffleKitchen();
    const first = useFeedback.getState().notice!;
    actions.undo();
    expect(store().design).toBe(original);
    actions.redo();
    expect(undoFeedback(first)).toBe(false);
    actions.shuffleKitchen();
    const second = useFeedback.getState().notice!;
    actions.setProjectName('Later');
    expect(undoFeedback(second)).toBe(false);
    expect(store().design.name).toBe('Later');
  });

  it('restores a deleted cabinet and its manual edits in one step but never mixes deletion or Undo into a drag', () => {
    vi.useFakeTimers();
    try {
      const item = createItem('base', []);
      const original = { ...ops.createDesign(), items: [item], partEdits: { [item.id]: { shelf: { quantity: 3 } } } };
      store().load(original);
      useUiStore.getState().select(item.id);
      store().beginGesture();
      actions.deleteSelected();
      expect(store().design).toBe(original);
      store().cancelGesture();
      actions.deleteSelected();
      const notice = useFeedback.getState().notice!;
      expect(store().design.partEdits[item.id]).toBeUndefined();
      store().beginGesture();
      store().apply((d) => ops.setName(d, 'Preview'));
      expect(undoFeedback(notice)).toBe(false);
      store().cancelGesture();
      vi.advanceTimersByTime(4999);
      expect(undoFeedback(notice)).toBe(true);
      expect(store().design).toBe(original);
      useUiStore.getState().select(item.id);
      actions.deleteSelected();
      const expired = useFeedback.getState().notice!;
      vi.advanceTimersByTime(5000);
      expect(useFeedback.getState().notice).toBeNull();
      expect(undoFeedback(expired)).toBe(false);
      expect(store().design.items).toHaveLength(0);
    } finally { vi.useRealTimers(); }
  });

  it('applies the next look to the existing sink and oven as one undoable change', () => {
    const original = {
      ...ops.createDesign(),
      items: [createItem('sink', [], { id: 'sink', x: 1000, y: 1000 }), createItem('oven', [], { id: 'oven', x: 2000, y: 1000 })],
    };
    store().load(original);
    expect(actions.shuffleKitchen()).toEqual({ ok: true, presetId: KITCHEN_DESIGNS[0].id });
    const result = store().design;
    expect(result.items).not.toEqual(original.items);
    expect(result.room).toBe(original.room);
    expect(result.style.front).toBe(KITCHEN_DESIGNS[0].style.front);
    expect(result.items).toMatchObject(original.items);
    expect(buildCuttingList(result).units.map((u) => u.parts)).toEqual(buildCuttingList(original).units.map((u) => u.parts));
    expect(result.name).toBe(original.name);
    expect(result.galleryPresetId).toBe(KITCHEN_DESIGNS[0].id);
    expect(store().past).toHaveLength(1);
    store().undo();
    expect(store().design).toBe(original);
    store().redo();
    expect(store().design).toBe(result);
  });

  it('rejects open previews, active tools and gestures without changing the layout or history', () => {
    const item = createItem('base', [], { x: 1000, y: 1000 });
    const original = { ...ops.createDesign(), items: [item] };
    store().load(original);
    useUiStore.setState({ view: '3d', selectedId: item.id, previewLockedIds: [item.id] });
    expect(actions.shuffleKitchen()).toEqual({ ok: false, reason: 'preview' });
    useUiStore.setState({ previewLockedIds: [], cabinetTool: 'resize' });
    expect(actions.shuffleKitchen()).toEqual({ ok: false, reason: 'busy' });
    useUiStore.setState({ cabinetTool: null });
    store().beginGesture();
    expect(actions.shuffleKitchen()).toEqual({ ok: false, reason: 'busy' });
    store().cancelGesture();
    expect(store().design).toBe(original);
    expect(store().past).toHaveLength(0);
  });

  it('visits the whole gallery before repeating and resumes after reload, gallery selection and Undo', () => {
    const seen = new Set<string>();
    const roomWithCabinet = { ...ops.createDesign(), items: [createItem('base', [])] };
    store().load(roomWithCabinet);
    for (const preset of KITCHEN_DESIGNS) {
      expect(actions.shuffleKitchen()).toEqual({ ok: true, presetId: preset.id });
      seen.add(store().design.galleryPresetId!);
    }
    expect(seen.size).toBe(KITCHEN_DESIGNS.length);
    expect(actions.shuffleKitchen()).toEqual({ ok: true, presetId: KITCHEN_DESIGNS[0].id });
    const loaded = ops.parseDesign(JSON.parse(JSON.stringify(store().design)))!;
    expect(loaded.galleryPresetId).toBe(KITCHEN_DESIGNS[0].id);
    store().load(loaded);
    expect(actions.shuffleKitchen()).toEqual({ ok: true, presetId: KITCHEN_DESIGNS[1].id });
    store().undo();
    expect(actions.shuffleKitchen()).toEqual({ ok: true, presetId: KITCHEN_DESIGNS[1].id });
    actions.applyKitchenDesign(KITCHEN_DESIGNS[15]);
    expect(actions.shuffleKitchen()).toEqual({ ok: true, presetId: KITCHEN_DESIGNS[16].id });
    store().load({ ...roomWithCabinet, galleryPresetId: 'removed-preset' });
    expect(actions.shuffleKitchen()).toEqual({ ok: true, presetId: KITCHEN_DESIGNS[0].id });
  });
});

describe('design history', () => {
  it('moves a structure as one undoable gesture without repositioning unrelated, already-invalid cabinetry', () => {
    const original = {
      ...ops.createDesign(),
      room: { width: 3600, depth: 3000, height: 2600, features: [{ id: 'chimney', kind: 'chimney' as const, x: 0, y: 0, width: 450, depth: 450 }] },
      items: [createItem('base', [], { x: -100 })],
    };
    store().load(original);
    actions.updateRoomFeature('chimney', { x: 0 });
    expect(store().past).toHaveLength(0);
    store().beginGesture();
    for (const x of [100, 200, 300]) actions.updateRoomFeature('chimney', { x });
    store().endGesture();
    expect(store().design.items).toBe(original.items);
    expect(store().design.room.features![0].x).toBe(300);
    expect(store().past).toHaveLength(1);
    store().undo();
    expect(store().design).toBe(original);
    store().redo();
    expect(store().design.room.features![0].x).toBe(300);
    store().beginGesture();
    actions.updateRoomFeature('chimney', { y: 800 });
    store().cancelGesture();
    expect(store().design.room.features![0]).toMatchObject({ x: 300, y: 0 });
    expect(store().past).toHaveLength(1);
  });

  it('undoes and redoes changes', () => {
    const item = createItem('base', []);
    store().apply((d) => ops.addItem(d, item));
    store().apply((d) => ops.updateItem(d, item.id, { x: 600 }));
    expect(store().design.items[0].x).toBe(600);

    store().undo();
    expect(store().design.items[0].x).toBe(0);
    store().undo();
    expect(store().design.items).toHaveLength(0);
    store().redo();
    store().redo();
    expect(store().design.items[0].x).toBe(600);
  });

  it('skips changes that change nothing', () => {
    const item = createItem('base', []);
    store().apply((d) => ops.addItem(d, item));
    store().apply((d) => ops.updateItem(d, item.id, { x: 0 }));
    expect(store().past).toHaveLength(1);
  });

  it('records a whole drag as one undo step', () => {
    const item = createItem('base', []);
    store().apply((d) => ops.addItem(d, item));
    store().beginGesture();
    for (const x of [10, 20, 30]) store().apply((d) => ops.updateItem(d, item.id, { x }));
    store().endGesture();
    expect(store().past).toHaveLength(2);
    store().undo();
    expect(store().design.items[0].x).toBe(0);
  });

  it('keeps redo and the exact saved revision when a drag returns to its starting placement', () => {
    const item = createItem('base', [], { x: 123 });
    store().load({ ...ops.createDesign(), items: [item] });
    store().apply((d) => ops.updateItem(d, item.id, { width: 850 }));
    store().undo();
    const { design, future } = store();
    store().beginGesture();
    for (const x of [350, 600, 123]) store().apply((d) => ops.updateItem(d, item.id, { x }));
    store().endGesture();
    expect(store().design).toBe(design);
    expect(store().past).toHaveLength(0);
    expect(store().future).toBe(future);
  });

  it('restores the design when a drag is cancelled', () => {
    const item = createItem('base', []);
    store().apply((d) => ops.addItem(d, item));
    store().beginGesture();
    store().apply((d) => ops.updateItem(d, item.id, { x: 500 }));
    store().cancelGesture();
    expect(store().design.items[0].x).toBe(0);
    expect(store().past).toHaveLength(1);
  });

  it('removes a per-unit override when it goes back to the kitchen setting', () => {
    const item = createItem('base', [], { carcassMaterial: 'particleboard-white-16', doors: 1 });
    store().apply((d) => ops.addItem(d, item));
    store().apply((d) => ops.replaceItem(d, ops.withOption(d.items[0], 'carcassMaterial', undefined)));
    store().apply((d) => ops.replaceItem(d, ops.withCount(d.items[0], 'doors', undefined)));
    expect(store().design.items[0]).not.toHaveProperty('carcassMaterial');
    expect(store().design.items[0]).not.toHaveProperty('doors');
  });

  it('gives a duplicated unit the pieces changed by hand, in one undo step', () => {
    const item = createItem('base', [], { label: 'B1' });
    store().apply((d) => ops.addItem(d, item));
    store().apply((d) => ops.setPartEdit(d, item.id, 'Shelf||564x540', { quantity: 2 }));
    useUiStore.getState().select(item.id);
    actions.duplicateSelected();
    const copy = store().design.items[1];
    expect(store().design.partEdits[copy.id]).toEqual({ 'Shelf||564x540': { quantity: 2 } });
    store().undo();
    expect(store().design.items).toHaveLength(1);
    expect(Object.keys(store().design.partEdits)).toEqual([item.id]);
  });

  it('pulls units back inside when the room shrinks', () => {
    const item = createItem('base', [], { x: 3000 });
    store().apply((d) => ops.addItem(d, item));
    store().apply((d) => ops.setRoom(d, { width: 2400 }));
    expect(store().design.items[0].x).toBe(1800);
    store().undo();
    expect(store().design.items[0].x).toBe(3000);
  });
});

describe('parseDesign', () => {
  it('rejects unreadable items atomically instead of dropping them', () => {
    const good = createItem('base', []);
    const parsed = ops.parseDesign({ name: 'Test', room: { width: 3000, depth: 2000, height: 2500 }, items: [good, { id: 1 }] });
    expect(parsed).toBeNull();
    expect(ops.parseDesign({ name: 'Test', room: { width: 3000, depth: 2000, height: 2500 }, items: [good] })?.items).toEqual([good]);
    expect(ops.parseDesign({ room: {} })).toBeNull();
    expect(ops.parseDesign(null)).toBeNull();
  });

  it.each(['constructor', '__proto__', 'toString', 'missing'])('rejects the unsupported item kind %s', (kind) => {
    expect(ops.parseDesign({ ...ops.createDesign(), items: [{ ...createItem('base', []), kind }] })).toBeNull();
  });

  it('rejects duplicate identities, bad records and future formats without changing valid legacy migration', () => {
    const d = ops.createDesign();
    const item = createItem('base', [], { id: 'same' });
    expect(ops.parseDesign({ ...d, items: [item, { ...item, x: 1000 }] })).toBeNull();
    expect(ops.parseDesign({ ...d, materials: [d.materials[0], d.materials[0]] })).toBeNull();
    expect(ops.parseDesign({ ...d, edgeBands: [d.edgeBands[0], d.edgeBands[0]] })).toBeNull();
    expect(ops.parseDesign({ ...d, customParts: [{ id: 'bad' }] })).toBeNull();
    expect(ops.parseDesign({ ...d, materials: d.materials.map((m) => ({ ...m, sheetLength: 20 })) })).toBeNull();
    expect(ops.parseDesign({ ...d, items: [item], partEdits: { same: { part: { quantity: 1000 } } } })).toBeNull();
    expect(ops.parseDesign({ ...d, version: 999 })).toBeNull();
    expect(ops.parseDesign({ room: d.room, items: [item] })?.version).toBe(5);
  });

  it('does not invent current-format stock, construction, grain or appearance settings from damaged records', () => {
    const d = ops.createDesign();
    expect(ops.parseDesign({ ...d, construction: undefined })).toBeNull();
    expect(ops.parseDesign({ ...d, construction: {} })).toBeNull();
    expect(ops.parseDesign({ ...d, materials: [] })).toBeNull();
    expect(ops.parseDesign({ ...d, materials: d.materials.map(({ grain: _grain, ...m }) => m) })).toBeNull();
    expect(ops.parseDesign({ ...d, style: {} })).toBeNull();
    expect(ops.parseDesign({ ...d, style: { ...d.style, front: 'constructor' } })).toBeNull();
  });

  it('keeps an explicitly empty edge library and retires custom-piece references when bands are removed', () => {
    let d = ops.addCustomPart(ops.createDesign(), {
      id: 'extra', name: 'Extra', quantity: 1, length: 600, width: 100,
      materialId: 'particleboard-white-18', edgesLength: 1, edgesWidth: 0, edgeBandId: 'abs-1', note: '',
    });
    for (const band of d.edgeBands) d = ops.removeEdgeBand(d, band.id);
    expect(d.edgeBands).toEqual([]);
    expect(d.customParts[0].edgeBandId).toBeNull();
    expect(d.construction.carcassEdge).toBeNull();
    expect(ops.parseDesign(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });
});

describe('end-panel stock thickness', () => {
  it.each([0, 90, 180, 270])('keeps the physical back anchor fixed through material changes at %s degrees', (rotation) => {
    const panel = createItem('endPanel', [], { x: 1000, y: 1000, rotation });
    const original = ops.addItem(ops.createDesign(), panel);
    const anchor = localToRoom(original.items[0], 0, 0);
    const thicker = ops.setConstruction(original, { frontMaterial: 'mdf-oak-19' });
    expect(thicker.items[0].width).toBe(19);
    expect(localToRoom(thicker.items[0], 0, 0)).toEqual(anchor);
    const changed = ops.updateMaterial(thicker, 'mdf-oak-19', { thickness: 50 });
    expect(changed.items[0].width).toBe(50);
    expect(localToRoom(changed.items[0], 0, 0)).toEqual(anchor);
    expect(buildCuttingList(changed).units[0].parts[0].thickness).toBe(changed.items[0].width);
    expect(ops.parseDesign(JSON.parse(JSON.stringify(changed)))?.items).toEqual(changed.items);
    expect(() => ops.withSize(changed.items[0], 'width', 30, changed.room)).toThrow(/stock thickness/);
  });

  it('follows per-unit and hand-edited stock and returns to the shared stock when an override is removed', () => {
    const item = createItem('endPanel', []);
    const original = ops.addItem(ops.createDesign(), item);
    const custom = ops.replaceItem(original, { ...item, frontMaterial: 'mdf-oak-19' });
    expect(custom.items[0].width).toBe(19);
    const restored = ops.removeMaterial(custom, 'mdf-oak-19');
    expect(restored.items[0].width).toBe(18);
    const part = buildCuttingList(original).units[0].parts[0];
    const edited = ops.setPartEdit(original, item.id, part.key, { materialId: 'mdf-oak-19' });
    expect(edited.items[0].width).toBe(19);
    expect(ops.setPartEdit(edited, item.id, part.key, undefined).items[0].width).toBe(18);
  });
});

describe('kitchen design gallery', () => {
    it('authentically stages an empty Studio idea without silently repainting existing rooms or changing their furniture', () => {
      const request = { type: 'idea', id: 'basil-studio' } as const;
      const blank = ops.createDesign();
      const untouched = prepareIdeaReview(blank, request, {}, en.engine);
      expect(untouched.candidate?.style).toMatchObject({ front: 'basil', worktop: 'graphite', floorPattern: 'tiles', decor: true });
      expect(untouched.candidate?.items.filter((i) => i.shelfForm === 'floating')).toHaveLength(2);
      const painted = { ...blank, style: { ...blank.style, wallColor: '#fefefe', decor: false } };
      expect(prepareIdeaReview(painted, request, {}, en.engine).candidate?.style).toMatchObject({ wallColor: '#fefefe', decor: false });
      const cabinet = createItem('wall', [], { x: 1500 });
      const existing = { ...painted, items: [cabinet] };
      const kept = prepareIdeaReview(existing, request, {}, en.engine);
      expect(kept.candidate?.style.wallColor).toBe('#fefefe');
      expect(kept.candidate?.items).toMatchObject([cabinet]);
      const optedIn = prepareIdeaReview(existing, request, { referenceRoomLook: true }, en.engine);
      store().load(existing);
      expect(actions.acceptFit(optedIn)).toBe(true);
      expect(store().design.style.wallColor).toBe(untouched.candidate!.style.wallColor);
      expect(store().design.items).toMatchObject([cabinet]);
      expect(useUiStore.getState().cameraView).toBe('studio');
      store().undo();
      expect(store().design).toBe(existing);
    });
    it('keeps the existing kitchen, window, construction settings and custom work when a gallery idea is applied', () => {
      const item = createItem('base', []);
      const original = {
        ...ops.createDesign('My existing project'),
        items: [item],
        openings: [{ id: 'window', kind: 'window' as const, wall: 'top' as const, offset: 100, width: 800, height: 1000, sill: 900 }],
        partEdits: { [item.id]: { 'Shelf||564x540': { quantity: 2 } } },
        construction: { ...DEFAULT_CONSTRUCTION, frontGap: 6 },
        customParts: [{ id: 'extra', name: 'Extra', quantity: 1, length: 600, width: 100, materialId: 'mdf-18', edgesLength: 0, edgesWidth: 0, edgeBandId: null, note: '' }],
      };
      store().load(original);
      useUiStore.setState({ selectedId: item.id, viewFilter: 'wall', view: 'list', language: 'en' });
      const preset = KITCHEN_DESIGNS.find((kitchen) => kitchen.id === 'oak-island')!;
      actions.applyKitchenDesign(preset);
      const loaded = store().design;
      expect(loaded.name).toBe(original.name);
      expect(loaded.room).toBe(original.room);
      expect(loaded.items).toMatchObject([item]);
      expect(loaded.style.worktop).toBe(preset.style.worktop);
      expect(loaded.openings).toBe(original.openings);
      expect(loaded.customParts).toBe(original.customParts);
      expect(loaded.partEdits).toBe(original.partEdits);
      expect(loaded.construction).toBe(original.construction);
      expect(store().past).toEqual([original]);
      expect(useUiStore.getState()).toMatchObject({ selectedId: null, viewFilter: 'wall', view: '3d' });
      store().undo();
      expect(store().design).toBe(original);
      store().redo();
      expect(store().design).toBe(loaded);
    });

    it('does not silently fill an empty room, and cannot commit a proposal after the room changes', () => {
      const source = store().design;
      const request = { type: 'idea', id: KITCHEN_DESIGNS[0].id } as const;
      expect(actions.shuffleKitchen()).toEqual({ ok: false, reason: 'review' });
      expect(useUiStore.getState()).toMatchObject({ layoutsOpen: true, fitRequest: request });
      expect(store().design).toBe(source);
      const review = prepareIdeaReview(source, request, {}, en.engine);
      actions.setRoomSize({ width: 4200 });
      expect(actions.acceptFit(review)).toBe(false);
      expect(store().design.items).toEqual([]);
    });

    it('uses the selected language for every cabinet code in an explicitly opened original', () => {
      for (const language of ['sr', 'en'] as const) {
        useUiStore.getState().setLanguage(language);
        actions.openKitchenOriginal(KITCHEN_DESIGNS.find((kitchen) => kitchen.id === 'sage-island')!);
        const labels = store().design.items.map((item) => item.label);
        expect(labels).toContain(language === 'sr' ? 'FI1' : 'D1');
        expect(labels).toContain(language === 'sr' ? 'P1' : 'SH1');
        expect(new Set(labels).size).toBe(labels.length);
      }
  });

  it('opens gallery originals in their finished Studio view even after a Front inspection', () => {
    for (const id of ['walnut-frame', 'nordic-light']) {
      useUiStore.getState().requestCamera('front');
      actions.openKitchenOriginal(KITCHEN_DESIGNS.find((kitchen) => kitchen.id === id)!);
      expect(useUiStore.getState().cameraView).toBe('studio');
    }
  });
});
