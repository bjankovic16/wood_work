import { beforeEach, describe, expect, it } from 'vitest';
import { createItem } from '../domain/catalog';
import * as ops from '../domain/designOps';
import { useDesignStore } from './designStore';
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
    const second = createProject('Second kitchen');
    expect(projects().activeId).toBe(second);
    expect(design().name).toBe('Second kitchen');
    expect(design().items).toHaveLength(0);

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

  it('duplicates and deletes projects', () => {
    initProjects();
    const original = projects().activeId;
    const copy = duplicateProject(original)!;
    expect(projects().projects.find((p) => p.id === copy)?.name).toBe('My kitchen (copy)');
    deleteProject(original);
    expect(projects().projects.map((p) => p.id)).toEqual([copy]);
    expect(projects().activeId).toBe(copy);
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
