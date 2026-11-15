import { beforeEach, describe, expect, it } from 'vitest';
import { createItem } from '../domain/catalog';
import * as ops from '../domain/designOps';
import { KITCHEN_DESIGNS } from '../domain/kitchens';
import { DEFAULT_LANGUAGE } from '../i18n/language';
import { useDesignStore } from './designStore';
import { useUiStore } from './uiStore';
import { applyKitchenDesign } from './actions';
import {
  createProject,
  deleteProject,
  duplicateProject,
  flushSave,
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
  useUiStore.setState({ language: DEFAULT_LANGUAGE });
  useDesignStore.getState().load(ops.createDesign());
});

describe('projects', () => {
  it('brings over the design saved by earlier versions', () => {
    const old = { ...ops.createDesign('Petrović'), items: [createItem('base', [])] };
    localStorage.setItem('kitchen-designer:design', JSON.stringify({ state: { design: old }, version: 1 }));
    initProjects();
    expect(projects().projects).toHaveLength(1);
    expect(design().name).toBe('Petrović');
    expect(design().items).toHaveLength(1);
  });

  it('creates, switches between and saves projects', () => {
    initProjects();
    const first = projects().activeId;
    useDesignStore.getState().apply((d) => ops.addItem(d, createItem('base', [])));
    useUiStore.getState().setRoomOpen(true);
    const second = createProject('Second kitchen');
    expect(projects().activeId).toBe(second);
    expect(design().name).toBe('Second kitchen');
    expect(design().items).toHaveLength(0);
    expect(useUiStore.getState().roomOpen).toBe(false);

    openProject(first);
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

  it('saves and restores an entire gallery kitchen without changing the open project', () => {
    initProjects();
    const activeId = projects().activeId;
    applyKitchenDesign(KITCHEN_DESIGNS[19]);
    const saved = design();
    flushSave();
    resetProjectsForTests();
    useDesignStore.getState().load(ops.createDesign());
    initProjects();
    expect(projects().activeId).toBe(activeId);
    expect(projects().projects).toHaveLength(1);
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

  it('names new projects and copies in the interface language, Serbian by default', () => {
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
