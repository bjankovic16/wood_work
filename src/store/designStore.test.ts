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
});

describe('design history', () => {
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
      expect(useUiStore.getState()).toMatchObject({ selectedId: null, viewFilter: 'all', view: '3d' });
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
