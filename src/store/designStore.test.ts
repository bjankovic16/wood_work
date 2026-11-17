import { beforeEach, describe, expect, it } from 'vitest';
import { createItem } from '../domain/catalog';
import * as ops from '../domain/designOps';
import { KITCHEN_DESIGNS } from '../domain/kitchens';
import { DEFAULT_CONSTRUCTION } from '../engine/settings';
import * as actions from './actions';
import { useDesignStore } from './designStore';
import { useUiStore } from './uiStore';

const store = () => useDesignStore.getState();

beforeEach(() => {
  useDesignStore.setState({ design: ops.createDesign(), past: [], future: [], gestureBase: null });
  useUiStore.setState({ selectedId: null, view: 'plan', cabinetTool: null, previewLockedIds: [] });
});

describe('explicit 3D cabinet tools', () => {
  it('disarms tools on selection/view changes and preview locks, without rearming when a preview closes', () => {
    const ui = () => useUiStore.getState();
    ui().setCabinetTool('move');
    expect(ui().cabinetTool).toBeNull();
    ui().select('a');
    ui().setCabinetTool('resize');
    expect(ui().cabinetTool).toBeNull();
    ui().setView('3d');
    ui().setCabinetTool('move');
    ui().select('a');
    expect(ui().cabinetTool).toBe('move');
    ui().setCabinetTool('resize');
    expect(ui().cabinetTool).toBe('resize');
    ui().setPreviewLockedIds(['a', 'b']);
    ui().setView('3d');
    expect(ui().previewLockedIds).toEqual(['a', 'b']);
    expect(ui().cabinetTool).toBeNull();
    ui().setCabinetTool('move');
    expect(ui().cabinetTool).toBeNull();
    ui().setPreviewLockedIds([]);
    expect(ui().cabinetTool).toBeNull();
    ui().setCabinetTool('move');
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
    actions.setItemPlacement(item.id, { x: 700, y: 700, rotation: 90 });
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

  it('removes 3D arrow nudges while preserving plan movement and normal numeric editing', () => {
    const item = createItem('base', [], { x: 1000, y: 1000 });
    store().load({ ...ops.createDesign(), items: [item] });
    const ui = useUiStore.getState();
    ui.select(item.id);
    ui.setView('3d');
    for (const tool of [null, 'move', 'resize'] as const) {
      ui.setCabinetTool(tool);
      actions.nudgeSelected(100, 0);
    }
    expect(store().design.items[0]).toBe(item);
    actions.setItemPosition(item.id, 1200, 1000);
    expect(store().design.items[0].x).toBe(1200);
    ui.setView('plan');
    actions.nudgeSelected(100, -100);
    expect(store().design.items[0]).toMatchObject({ x: 1300, y: 900 });
  });
});

describe('shuffle kitchen', () => {
  it('applies the complete arrangement as one undoable change while preserving design metadata', () => {
    const original = {
      ...ops.createDesign(),
      items: [createItem('sink', [], { id: 'sink', x: 1000, y: 1000 }), createItem('oven', [], { id: 'oven', x: 2000, y: 1000 })],
    };
    store().load(original);
    expect(actions.shuffleKitchen()).toEqual({ ok: true });
    const result = store().design;
    expect(result.items).not.toEqual(original.items);
    expect({ ...result, items: original.items }).toEqual(original);
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

  it('reports an unsuccessful search explicitly and leaves the entire design untouched', () => {
    const original = {
      ...ops.createDesign(),
      room: { width: 1000, depth: 1000, height: 2700 },
      items: [createItem('base', [], { width: 1200 })],
    };
    store().load(original);
    expect(actions.shuffleKitchen()).toEqual({ ok: false, reason: 'unavailable' });
    expect(store().design).toBe(original);
    expect(store().past).toHaveLength(0);
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
  it('drops unreadable items and rejects invalid designs', () => {
    const good = createItem('base', []);
    const parsed = ops.parseDesign({ name: 'Test', room: { width: 3000, depth: 2000, height: 2500 }, items: [good, { id: 1 }] });
    expect(parsed?.items).toEqual([good]);
    expect(ops.parseDesign({ room: {} })).toBeNull();
    expect(ops.parseDesign(null)).toBeNull();
  });
});

describe('kitchen design gallery', () => {
    it('loads the complete pictured kitchen as one undoable change and keeps the project name', () => {
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
      expect(loaded.room).toEqual(preset.room);
      expect(loaded.style).toEqual(preset.style);
      expect(loaded.openings).toEqual([]);
      expect(loaded.customParts).toEqual([]);
      expect(loaded.partEdits).toEqual({});
      expect(loaded.construction).toEqual(DEFAULT_CONSTRUCTION);
      expect(store().past).toEqual([original]);
      expect(useUiStore.getState()).toMatchObject({ selectedId: null, viewFilter: 'floor', view: '3d' });
      store().undo();
      expect(store().design).toBe(original);
      store().redo();
      expect(store().design).toBe(loaded);
    });

    it('uses the selected language for every cabinet code, including open shelves and islands', () => {
      for (const language of ['sr', 'en'] as const) {
        useUiStore.getState().setLanguage(language);
        actions.applyKitchenDesign(KITCHEN_DESIGNS.find((kitchen) => kitchen.id === 'sage-island')!);
        const labels = store().design.items.map((item) => item.label);
        expect(labels).toContain(language === 'sr' ? 'FI1' : 'D1');
        expect(labels).toContain(language === 'sr' ? 'P1' : 'SH1');
        expect(new Set(labels).size).toBe(labels.length);
      }
  });

  it('opens framed examples in their preview camera and resets other examples to perspective', () => {
    actions.applyKitchenDesign(KITCHEN_DESIGNS.find((kitchen) => kitchen.id === 'walnut-frame')!);
    expect(useUiStore.getState().cameraView).toBe('front');
    actions.applyKitchenDesign(KITCHEN_DESIGNS.find((kitchen) => kitchen.id === 'nordic-light')!);
    expect(useUiStore.getState().cameraView).toBe('perspective');
  });
});
