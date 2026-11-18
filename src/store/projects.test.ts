import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createItem } from '../domain/catalog';
import * as ops from '../domain/designOps';
import { KITCHEN_DESIGNS } from '../domain/kitchens';
import { useDesignStore } from './designStore';
import { useUiStore } from './uiStore';
import { applyKitchenDesign, openKitchenOriginal } from './actions';
import {
  createProject,
  deleteProject,
  duplicateProject,
  flushSave,
  finishRoom,
  importProject,
  initProjects,
  openProject,
  resetProjectsForTests,
  useProjectsStore,
} from './projects';

const projects = () => useProjectsStore.getState();
const design = () => useDesignStore.getState().design;

beforeEach(() => {
  localStorage.clear();
  resetProjectsForTests();
  useUiStore.setState({ language: 'sr' });
  useDesignStore.getState().load(ops.createDesign());
});

describe('projects', () => {
  it('does not save a paused or interrupted drag, including a forced save on page hide', () => {
    vi.useFakeTimers();
    try {
      initProjects();
      const store = useDesignStore.getState();
      const item = createItem('base', [], { x: 100 });
      store.apply((d) => ops.addItem(d, item)); // A pending save that started before the drag.
      const storedX = () => JSON.parse(localStorage.getItem(`kitchen-designer:project:${projects().activeId}`)!).items[0].x;
      store.beginGesture();
      store.apply((d) => ops.updateItem(d, item.id, { x: 300 }));
      vi.advanceTimersByTime(600);
      expect(storedX()).toBe(100);
      flushSave();
      expect(storedX()).toBe(100);
      store.cancelGesture();
      expect(design().items[0].x).toBe(100);
      store.beginGesture();
      store.apply((d) => ops.updateItem(d, item.id, { x: 400 }));
      store.endGesture();
      vi.advanceTimersByTime(600);
      expect(storedX()).toBe(400);
    } finally { vi.useRealTimers(); }
  });

  it('brings over the design saved by earlier versions', () => {
    const old = { ...ops.createDesign('Petrović'), items: [createItem('base', [])] };
    localStorage.setItem('kitchen-designer:design', JSON.stringify({ state: { design: old }, version: 1 }));
    initProjects();
    expect(projects().projects).toHaveLength(1);
    expect(design().name).toBe('Petrović');
    expect(design().items).toHaveLength(1);
    expect(useUiStore.getState().roomOpen).toBe(false);
  });

  it('creates, switches between and saves projects', () => {
    initProjects();
    expect(useUiStore.getState()).toMatchObject({ roomOpen: true, view: 'plan' });
    const first = projects().activeId;
    useDesignStore.getState().apply((d) => ops.addItem(d, createItem('base', [])));
    useUiStore.getState().setView('3d');
    const second = createProject('Second kitchen');
    expect(projects().activeId).toBe(second);
    expect(design().name).toBe('Second kitchen');
    expect(design().items).toHaveLength(0);
    expect(useUiStore.getState()).toMatchObject({ roomOpen: true, view: 'plan' });

    openProject(first);
    expect(useUiStore.getState().roomOpen).toBe(false);
    expect(design().items).toHaveLength(1);
    expect(useDesignStore.getState().past).toHaveLength(0);
    expect(projects().projects.find((p) => p.id === first)?.units).toBe(1);
  });

  it('keeps projects across a reload', () => {
    initProjects();
    useDesignStore.getState().apply((d) => ops.setName(d, 'Saved'));
    flushSave();
    resetProjectsForTests();
    useDesignStore.getState().load(ops.createDesign());
    initProjects();
    expect(design().name).toBe('Saved');
  });

  it('resumes a measured empty room on the plan, without skipping setup for a different new room', () => {
    initProjects();
    const measured = projects().activeId;
    useDesignStore.getState().apply((d) => ({ ...d, room: { ...d.room, width: 4100 } }));
    finishRoom();
    flushSave();
    resetProjectsForTests();
    initProjects();
    expect(design().room.width).toBe(4100);
    expect(useUiStore.getState()).toMatchObject({ roomOpen: false, view: 'plan', welcomeSeen: true });
    createProject('Another room');
    expect(useUiStore.getState().roomOpen).toBe(true);
    openProject(measured);
    expect(useUiStore.getState().roomOpen).toBe(false);
  });

  it('saves and restores a gallery look in place, while an explicit original uses a separate project', () => {
    initProjects();
    const activeId = projects().activeId;
    const cabinet = createItem('base', [], { x: 1200, y: 450 });
    useDesignStore.getState().apply((d) => ops.addItem(d, cabinet));
    const preset = KITCHEN_DESIGNS.find((kitchen) => kitchen.id === 'oak-frame-island')!;
    expect(applyKitchenDesign(preset)).toBe(true);
    const saved = design();
    flushSave();
    resetProjectsForTests();
    useDesignStore.getState().load(ops.createDesign());
    initProjects();
    expect(projects().activeId).toBe(activeId);
    expect(projects().projects).toHaveLength(1);
    expect(design()).toEqual(saved);
    openKitchenOriginal(preset);
    expect(projects().activeId).not.toBe(activeId);
    expect(design().room).toEqual(preset.room);
    expect(design().items.length).toBeGreaterThan(1);
    openProject(activeId);
    expect(design()).toEqual(saved);
  });

  it('duplicates and deletes projects', () => {
    initProjects();
    const original = projects().activeId;
    const copy = duplicateProject(original)!;
    expect(projects().projects.find((p) => p.id === copy)?.name).toBe('Moja kuhinja (kopija)');
    deleteProject(original);
    expect(projects().projects.map((p) => p.id)).toEqual([copy]);
    expect(projects().activeId).toBe(copy);
  });

  it('leaves nothing behind when the last project is deleted, and does not re-date unchanged projects', () => {
    initProjects();
    const only = projects().activeId;
    useDesignStore.getState().apply((d) => ops.setName(d, 'Unsaved change'));
    deleteProject(only);
    expect(localStorage.getItem(`kitchen-designer:project:${only}`)).toBeNull();
    expect(projects().projects.map((p) => p.name)).toEqual(['Moja kuhinja']);

    const meta = projects().projects[0];
    useProjectsStore.setState({ projects: [{ ...meta, updatedAt: 1 }] });
    flushSave();
    expect(projects().projects[0].updatedAt).toBe(1);
  });

  it('names new projects and copies in the selected interface language', () => {
    initProjects();
    expect(design().name).toBe('Moja kuhinja');
    useUiStore.getState().setLanguage('en');
    createProject();
    expect(design().name).toBe('Kitchen 1');
    duplicateProject(projects().activeId);
    useUiStore.getState().setLanguage('sr');
    createProject();
    expect(projects().projects.map((p) => p.name).sort()).toEqual(['Kitchen 1', 'Kitchen 1 (copy)', 'Kuhinja 1', 'Moja kuhinja']);
  });

  it('imports a design from a file and refuses anything else', () => {
    initProjects();
    expect(importProject({ nonsense: true })).toBe(false);
    const file = JSON.parse(JSON.stringify({ ...ops.createDesign('From file'), items: [createItem('wall', [])] }));
    expect(importProject(file)).toBe(true);
    expect(design().name).toBe('From file');
    expect(projects().projects).toHaveLength(2);
  });
});
