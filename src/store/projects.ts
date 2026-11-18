import { create } from 'zustand';
import { createDesign, parseDesign } from '../domain/designOps';
import { newId } from '../domain/ids';
import type { Design } from '../domain/types';
import { currentMessages } from '../i18n';
import { safeStorage } from '../lib/platform';
import { committedDesign, useDesignStore } from './designStore';
import { useUiStore } from './uiStore';

/**
 * Projects: every kitchen is saved in this browser under its own key, with a
 * small index of names and dates. The open project is saved shortly after
 * every change. Where storage is blocked, projects simply live in memory.
 */

export interface ProjectMeta {
  id: string;
  name: string;
  /** Milliseconds since 1970. */
  updatedAt: number;
  units: number;
  roomMeasured?: boolean;
}

interface ProjectsState {
  activeId: string;
  projects: ProjectMeta[];
}

export const useProjectsStore = create<ProjectsState>(() => ({ activeId: '', projects: [] }));

const INDEX_KEY = 'kitchen-designer:projects';
const projectKey = (id: string) => `kitchen-designer:project:${id}`;
/** Where versions before projects kept their single design. */
const LEGACY_KEY = 'kitchen-designer:design';
const SAVE_DELAY = 400;

/** Session copies also cover browsers that can still read an old design but refuse new writes. */
const memory = new Map<string, { design: Design; written: boolean }>();

function read(key: string): unknown {
  const text = safeStorage.getItem(key);
  if (typeof text !== 'string') return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function saveIndex(): void {
  write(INDEX_KEY, useProjectsStore.getState());
}

function metaOf(id: string, design: Design): ProjectMeta {
  return { id, name: design.name, updatedAt: Date.now(), units: design.items.length };
}

function storeDesign(id: string, design: Design): void {
  const written = write(projectKey(id), design);
  memory.set(id, { design, written });
}

function loadDesign(id: string): Design | null {
  const cached = memory.get(id);
  if (cached && !cached.written) return cached.design;
  return parseDesign(read(projectKey(id))) ?? cached?.design ?? null;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
/** The open project's design as last written, so an unchanged design is not saved (or re-dated) again. */
let savedDesign: Design | null = null;

/** Writes the open project now (instead of after the short delay). */
export function flushSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  const { activeId } = useProjectsStore.getState();
  const design = committedDesign(useDesignStore.getState());
  if (!activeId || design === savedDesign) return;
  storeDesign(activeId, design);
  savedDesign = design;
  useProjectsStore.setState((state) => ({
    projects: state.projects.map((p) => (p.id === activeId ? { ...p, ...metaOf(activeId, design) } : p)),
  }));
  saveIndex();
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, SAVE_DELAY);
}

function parseIndex(raw: unknown): ProjectsState | null {
  const v = raw as { activeId?: unknown; projects?: unknown } | null;
  if (!v || !Array.isArray(v.projects)) return null;
  const projects = v.projects
    .filter((p): p is ProjectMeta => !!p && typeof p.id === 'string' && typeof p.name === 'string')
    .map((p) => ({ id: p.id, name: p.name, updatedAt: Number(p.updatedAt) || 0, units: Number(p.units) || 0, ...(p.roomMeasured === true ? { roomMeasured: true } : {}) }));
  if (projects.length === 0) return null;
  const activeId = typeof v.activeId === 'string' && projects.some((p) => p.id === v.activeId) ? v.activeId : projects[0].id;
  return { activeId, projects };
}

function needsRoomSetup(id: string, design: Design): boolean {
  return !design.items.length && !useProjectsStore.getState().projects.find((project) => project.id === id)?.roomMeasured;
}

export function finishRoom(): void {
  const { activeId, projects } = useProjectsStore.getState();
  if (projects.some((p) => p.id === activeId && !p.roomMeasured)) {
    useProjectsStore.setState({ projects: projects.map((p) => p.id === activeId ? { ...p, roomMeasured: true } : p) });
    saveIndex();
  }
  useUiStore.getState().finishRoom();
}

function show(id: string, design: Design): void {
  useDesignStore.getState().load(design);
  savedDesign = design;
  useProjectsStore.setState({ activeId: id });
  const ui = useUiStore.getState();
  ui.select(null);
  ui.setViewFilter('all');
  ui.setWallElevation(null);
  ui.setLibraryDrag(null);
  ui.setSelectedWallId(null);
  ui.setWallEditing(false);
  if (needsRoomSetup(id, design)) ui.setRoomOpen(true);
  else if (!design.items.length) ui.setView('plan');
  else ui.setRoomOpen(false);
  ui.setReferenceOpen(Boolean(design.referencePhoto));
  ui.requestCamera('perspective');
  saveIndex();
}

let started = false;

/** Opens the last project (or brings over the design saved by older versions) and starts saving. */
export function initProjects(): void {
  if (started) return;
  started = true;
  const index = parseIndex(read(INDEX_KEY));
  if (index) {
    useProjectsStore.setState(index);
    const stored = loadDesign(index.activeId);
    const design = stored ?? createDesign(index.projects.find((p) => p.id === index.activeId)?.name);
    useDesignStore.getState().load(design);
    // A design that had to be made up is written on the first save.
    savedDesign = stored;
  } else {
    const legacy = read(LEGACY_KEY) as { state?: { design?: unknown } } | null;
    const design = parseDesign(legacy?.state?.design) ?? createDesign(currentMessages().names.defaultProject);
    const id = newId();
    storeDesign(id, design);
    savedDesign = design;
    useProjectsStore.setState({ activeId: id, projects: [metaOf(id, design)] });
    useDesignStore.getState().load(design);
    saveIndex();
  }
  const active = useDesignStore.getState().design;
  const ui = useUiStore.getState();
  ui.setSelectedWallId(null);
  if (needsRoomSetup(useProjectsStore.getState().activeId, active)) ui.setRoomOpen(true);
  else ui.setView('plan');
  ui.setReferenceOpen(Boolean(active.referencePhoto));
  useDesignStore.subscribe((state, previous) => {
    if (committedDesign(state) !== committedDesign(previous)) scheduleSave();
  });
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flushSave);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushSave();
    });
  }
}

/** Creates a project and opens it. */
export function createProject(name?: string): string {
  flushSave();
  const id = newId();
  const design = createDesign(name ?? nextName());
  storeDesign(id, design);
  useProjectsStore.setState((state) => ({ projects: [metaOf(id, design), ...state.projects] }));
  show(id, design);
  return id;
}

export function openProject(id: string): void {
  const { activeId } = useProjectsStore.getState();
  if (id === activeId) return;
  flushSave();
  const design = loadDesign(id);
  if (!design) return;
  show(id, design);
}

export function duplicateProject(id: string): string | null {
  flushSave();
  const source = loadDesign(id);
  if (!source) return null;
  const copyId = newId();
  const design = { ...structuredClone(source), name: currentMessages().names.copyOf(source.name) };
  storeDesign(copyId, design);
  useProjectsStore.setState((state) => ({ projects: [{ ...metaOf(copyId, design), roomMeasured: state.projects.find((p) => p.id === id)?.roomMeasured }, ...state.projects] }));
  saveIndex();
  return copyId;
}

/** Deletes a project. Deleting the open one opens the most recent other, or a new empty one. */
export function deleteProject(id: string): void {
  const { activeId, projects } = useProjectsStore.getState();
  if (!projects.some((p) => p.id === id)) return;
  safeStorage.removeItem(projectKey(id));
  memory.delete(id);
  const rest = projects.filter((p) => p.id !== id);
  if (id !== activeId) {
    useProjectsStore.setState({ projects: rest });
    saveIndex();
    return;
  }
  // The open project goes, unsaved changes and all: nothing may write it back.
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  useProjectsStore.setState({ projects: rest, activeId: '' });
  const next = [...rest].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const design = next ? loadDesign(next.id) : null;
  if (next && design) show(next.id, design);
  else createProject(currentMessages().names.defaultProject);
}

/** Adds a design read from a file as a new project and opens it. */
export function importProject(raw: unknown): boolean {
  const design = parseDesign(raw);
  if (!design) return false;
  flushSave();
  const id = newId();
  storeDesign(id, design);
  useProjectsStore.setState((state) => ({ projects: [metaOf(id, design), ...state.projects] }));
  show(id, design);
  return true;
}

/** The design of a project, for exporting it. */
export function projectDesign(id: string): Design | null {
  if (id === useProjectsStore.getState().activeId) return committedDesign(useDesignStore.getState());
  return loadDesign(id);
}

function nextName(): string {
  const names = new Set(useProjectsStore.getState().projects.map((p) => p.name));
  for (let n = 1; ; n++) {
    const name = currentMessages().names.numberedProject(n);
    if (!names.has(name)) return name;
  }
}

/** For tests: forget everything in memory. */
export function resetProjectsForTests(): void {
  started = false;
  savedDesign = null;
  memory.clear();
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  useProjectsStore.setState({ activeId: '', projects: [] });
}
