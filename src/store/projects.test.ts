import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createItem } from '../domain/catalog';
import * as ops from '../domain/designOps';
import { KITCHEN_DESIGNS } from '../domain/kitchens';
import { useDesignStore } from './designStore';
import { useUiStore } from './uiStore';
import { applyKitchenDesign, openKitchenOriginal, undo } from './actions';
import { undoFeedback, useFeedback } from './feedback';
import * as backupFile from '../lib/backupFile';
import {
  backupStatus,
  createProject,
  deleteProject,
  duplicateProject,
  editLayoutVariant,
  flushSave,
  finishRoom,
  importProject,
  initProjects,
  openProject,
  projectDesign,
  resetProjectsForTests,
  saveProjectBackup,
  startFresh,
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
  it('does not save 3D wall visibility or carry it into another project', () => {
    initProjects();
    const original = projects().activeId;
    useUiStore.getState().setHiddenKitchenWallIds(['top']);
    expect(JSON.parse(localStorage.getItem('kitchen-designer:preferences')!).state).not.toHaveProperty('hiddenKitchenWallIds');
    createProject();
    expect(useUiStore.getState().hiddenKitchenWallIds).toEqual([]);
    useUiStore.getState().setHiddenKitchenWallIds(['bottom']);
    openProject(original);
    expect(useUiStore.getState().hiddenKitchenWallIds).toEqual([]);
  });

  it('undoes only the last Start fresh, by opening its actual predecessor without deleting either kitchen', () => {
    initProjects();
    const original = projects().activeId;
    const second = startFresh();
    const obsolete = useFeedback.getState().notice!;
    const third = startFresh();
    expect(undoFeedback(obsolete)).toBe(false);
    undo(); // Same command used by Ctrl/Cmd+Z and toolbar Undo.
    expect(projects().activeId).toBe(second);
    expect(projects().projects.map((p) => p.id)).toEqual([third, second, original]);

    const fourth = startFresh();
    const stale = useFeedback.getState().notice!;
    useDesignStore.getState().apply((d) => ops.setName(d, 'New work'));
    expect(undoFeedback(stale)).toBe(false);
    expect(projects().activeId).toBe(fourth);
    openProject(original);
    expect(projectDesign(fourth)?.name).toBe('New work');
    expect(undoFeedback(stale)).toBe(false);
    startFresh();
    const missing = useFeedback.getState().notice!;
    deleteProject(original);
    expect(undoFeedback(missing)).toBe(false);
  });

  it('records only the exported project/revision after a successful save, including across reload', async () => {
    initProjects();
    const original = projects().activeId;
    let finish!: (value: backupFile.BackupOutcome) => void;
    const write = vi.spyOn(backupFile, 'saveBackupFile').mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    try {
      const saving = saveProjectBackup(original);
      expect(write).toHaveBeenCalledOnce();
      const rev = projects().projects[0].updatedAt;
      useDesignStore.getState().apply((d) => ops.setName(d, 'Edited during save'));
      const other = createProject();
      finish('saved');
      await saving;
      const meta = projects().projects.find((p) => p.id === original)!;
      expect(meta.backupUpdatedAt).toBe(rev);
      expect(backupStatus(meta)).toBe('changed');
      expect(projects().projects.find((p) => p.id === other)?.lastBackupAt).toBeUndefined();
      const previous = meta.lastBackupAt;
      for (const outcome of ['declined', 'format', 'busy', 'unavailable'] as const) {
        write.mockResolvedValueOnce(outcome);
        expect(await saveProjectBackup(original)).toEqual({ outcome });
      }
      write.mockRejectedValueOnce(new Error('disk full'));
      expect((await saveProjectBackup(original)).outcome).toBe('unavailable');
      write.mockResolvedValueOnce('download-started');
      const started = await saveProjectBackup(original);
      expect(projects().projects.find((p) => p.id === original)?.lastBackupAt).toBe(previous);
      if (started.outcome !== 'download-started') throw new Error('Expected unconfirmed download');
      started.confirm();
      resetProjectsForTests();
      initProjects();
      const saved = projects().projects.find((p) => p.id === original)!;
      expect(backupStatus(saved)).toBe('current');
      expect(backupStatus(saved, saved.lastBackupAt! + 7 * 86400_000)).toBe('old');
      const copy = duplicateProject(original);
      expect(projects().projects.find((p) => p.id === copy)?.lastBackupAt).toBeUndefined();
    } finally { write.mockRestore(); }
  });

  it('opens a uniquely named editable variant of the committed kitchen without changing the source', () => {
    initProjects();
    const original = projects().activeId;
    finishRoom();
    const store = useDesignStore.getState();
    store.apply((d) => ops.addItem(ops.setName(d, 'Kuhinja A'), createItem('base', [])));
    const starting = design();
    store.beginGesture();
    store.apply((d) => ops.updateItem(d, d.items[0].id, { x: 900 }));
    const first = editLayoutVariant()!;
    expect(projects().activeId).toBe(first);
    expect(design()).toEqual({ ...starting, name: 'Kuhinja A · Varijanta 1' });
    expect(useDesignStore.getState().past).toHaveLength(0);
    store.apply((d) => ops.setRoom(d, { width: 4600 }));
    expect(projectDesign(original)).toEqual(starting);
    openProject(original);
    expect(projectDesign(first)?.room.width).toBe(4600);
    expect(editLayoutVariant()).not.toBe(first);
    expect(design().name).toBe('Kuhinja A · Varijanta 2');
    expect(projectDesign(original)).toEqual(starting);
  });

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

  it('starts fresh from the last committed edit, not a pending drag or a stale project name', () => {
    initProjects();
    const previous = projects().activeId;
    const store = useDesignStore.getState();
    const ui = useUiStore.getState();
    ui.setLanguage('en');
    finishRoom();
    ui.setRoomOpen(true);
    ui.setRoomView('3d');
    const preferences = localStorage.getItem('kitchen-designer:preferences');

    const item = createItem('base', [], { x: 100 });
    store.apply((d) => ops.addItem(ops.setName(d, 'Kitchen 1'), item));
    const committed = design();
    store.beginGesture();
    store.apply((d) => ops.updateItem(d, item.id, { x: 400 }));
    const fresh = createProject(); // Before the pending rename and item edits have autosaved.

    expect(projects().projects.map((p) => p.id)).toEqual([fresh, previous]);
    expect(projects().activeId).toBe(fresh);
    expect(design()).toEqual(ops.createDesign('Kitchen 2'));
    expect(useDesignStore.getState()).toMatchObject({ gestureBase: null, past: [], future: [] });
    expect(useUiStore.getState()).toMatchObject({ roomOpen: true, view: 'plan' });
    expect(localStorage.getItem('kitchen-designer:preferences')).toBe(preferences);

    resetProjectsForTests();
    initProjects();
    expect(projects().activeId).toBe(fresh);
    openProject(previous);
    expect(design()).toEqual(committed);
    expect(projects().projects.find((p) => p.id === previous)).toMatchObject({ name: 'Kitchen 1', units: 1, roomMeasured: true });
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

  it('keeps the previous kitchen in Projects if a full store refuses its last edit', () => {
    initProjects();
    const previous = projects().activeId;
    const full = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('Storage full'); });
    try {
      useDesignStore.getState().apply((d) => ops.setRoom(d, { width: 4300 }));
      createProject();
      openProject(previous);
      expect(design().room.width).toBe(4300);
    } finally { full.mockRestore(); }
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
    expect(useUiStore.getState()).toMatchObject({ roomOpen: false, view: 'plan' });
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
