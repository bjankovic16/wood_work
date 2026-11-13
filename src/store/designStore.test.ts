import { beforeEach, describe, expect, it } from 'vitest';
import { createItem } from '../domain/catalog';
import * as ops from '../domain/designOps';
import { useDesignStore } from './designStore';

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
