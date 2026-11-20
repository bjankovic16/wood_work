import { create } from 'zustand';
import { createDesign, parseDesign } from '../domain/designOps';
import { newId } from '../domain/ids';
import type { Design } from '../domain/types';
import { currentMessages } from '../i18n';
import { safeFileName, safeStorage } from '../lib/platform';
import { saveBackupFile, type BackupOutcome } from '../lib/backupFile';
import { committedDesign, useDesignStore } from './designStore';
import { checkFeedbackScope, offerUndo } from './feedback';
import { useUiStore, type MainView } from './uiStore';

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
  lastBackupAt?: number;
  /** The committed revision exported, not the revision open when the file chooser finished. */
  backupUpdatedAt?: number;
}

interface ProjectIndex {
  activeId: string;
  projects: ProjectMeta[];
}

export const useProjectsStore = create<ProjectIndex & { writeFailed: boolean; readFailed: boolean }>(() => ({
  activeId: '', projects: [], writeFailed: false, readFailed: false,
}));
useProjectsStore.subscribe(checkFeedbackScope);

const INDEX_KEY = 'kitchen-designer:projects';
const projectKey = (id: string) => `kitchen-designer:project:${id}`;
/** Where versions before projects kept their single design. */
const LEGACY_KEY = 'kitchen-designer:design';
const SAVE_DELAY = 400;
let indexUnreadable = false;

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
  const { activeId, projects, writeFailed } = useProjectsStore.getState();
  const failed = indexUnreadable || !write(INDEX_KEY, { activeId, projects }) || [...memory.values()].some((entry) => !entry.written);
  if (failed !== writeFailed) useProjectsStore.setState({ writeFailed: failed });
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
    projects: state.projects.map((p) => (p.id === activeId
      ? { ...p, name: design.name, units: design.items.length, updatedAt: Math.max(Date.now(), p.updatedAt + 1) } : p)),
  }));
  saveIndex();
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, SAVE_DELAY);
}

function parseIndex(raw: unknown): ProjectIndex | null {
  const v = raw as { activeId?: unknown; projects?: unknown } | null;
  if (!v || !Array.isArray(v.projects)) return null;
  const projects = v.projects
    .filter((p): p is ProjectMeta => !!p && typeof p.id === 'string' && typeof p.name === 'string')
    .map((p) => ({ id: p.id, name: p.name, updatedAt: Number(p.updatedAt) || 0, units: Number(p.units) || 0,
      ...(p.roomMeasured === true ? { roomMeasured: true } : {}),
      ...(typeof p.lastBackupAt === 'number' && Number.isFinite(p.lastBackupAt) && p.lastBackupAt > 0 ? { lastBackupAt: p.lastBackupAt } : {}),
      ...(Number.isFinite(p.backupUpdatedAt) ? { backupUpdatedAt: p.backupUpdatedAt } : {}) }));
  if (projects.length !== v.projects.length
    || projects.some((p) => !p.id.trim()) || new Set(projects.map((p) => p.id)).size !== projects.length) return null;
  const activeId = typeof v.activeId === 'string' && projects.some((p) => p.id === v.activeId) ? v.activeId : projects[0]?.id ?? '';
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

export function openWorkspace(view: MainView | 'room'): void {
  const ui = useUiStore.getState();
  if (view === 'room') { ui.openRoomPlan(); return; }
  if (ui.roomOpen) finishRoom();
  ui.setView(view);
}

function show(id: string, design: Design): void {
  useDesignStore.getState().load(design);
  savedDesign = design;
  useProjectsStore.setState({ activeId: id });
  const ui = useUiStore.getState();
  ui.select(null);
  ui.setViewFilter('all');
  ui.setWallElevation(null);
  ui.setHiddenKitchenWallIds([]);
  ui.setLibraryDrag(null);
  ui.setSelectedWallId(null);
  ui.setRoomPlanAngle(0);
  ui.setRoomAddMenuOpen(false);
  ui.setRoomWallRequest(null);
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
  indexUnreadable = typeof safeStorage.getItem(INDEX_KEY) === 'string' && !index;
  if (index && index.projects.length) {
    useProjectsStore.setState(index);
    const stored = loadDesign(index.activeId);
    const design = stored ?? createDesign(nextName());
    useDesignStore.getState().load(design);
    savedDesign = design;
    if (!stored) {
      const id = newId();
      storeDesign(id, design);
      useProjectsStore.setState({ activeId: id, projects: [metaOf(id, design), ...index.projects], readFailed: true });
      saveIndex();
    }
  } else {
    const legacy = read(LEGACY_KEY) as { state?: { design?: unknown } } | null;
    const migrated = parseDesign(legacy?.state?.design);
    const design = migrated ?? createDesign(currentMessages().names.defaultProject);
    const id = newId();
    storeDesign(id, design);
    savedDesign = design;
    useProjectsStore.setState({ activeId: id, projects: [metaOf(id, design)],
      readFailed: indexUnreadable || typeof safeStorage.getItem(LEGACY_KEY) === 'string' && !migrated });
    useDesignStore.getState().load(design);
    saveIndex();
  }
  const active = useDesignStore.getState().design;
  const ui = useUiStore.getState();
  ui.setSelectedWallId(null);
  if (needsRoomSetup(useProjectsStore.getState().activeId, active)) ui.setRoomOpen(true);
  else ui.setView('plan');
  ui.setReferenceOpen(Boolean(active.referencePhoto));
  if (useProjectsStore.getState().readFailed) ui.setProjectPage('projects');
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

/** Unlike creating an example or importing a file, Start fresh offers a short way back. Never delete either project. */
export function startFresh(): string {
  const previous = useProjectsStore.getState().activeId;
  const name = committedDesign(useDesignStore.getState()).name;
  const { roomOpen, view, cameraView } = useUiStore.getState();
  const fresh = createProject();
  offerUndo('fresh', (t) => t.feedback.fresh(name), () => {
    openProject(previous);
    if (useProjectsStore.getState().activeId !== previous) return;
    const ui = useUiStore.getState();
    if (roomOpen) {
      ui.setRoomOpen(true);
      ui.setRoomView(view === '3d' ? '3d' : 'plan');
    } else ui.setView(view);
    if (view === '3d') ui.requestCamera(cameraView);
  }, () => {
    const { activeId, projects } = useProjectsStore.getState();
    return activeId === fresh && projects.some((p) => p.id === previous);
  });
  return fresh;
}

export function openProject(id: string): boolean {
  const { activeId } = useProjectsStore.getState();
  if (id === activeId) return true;
  const design = loadDesign(id);
  if (!design) { useProjectsStore.setState({ readFailed: true }); return false; }
  flushSave();
  show(id, design);
  return true;
}

export function duplicateProject(id: string, name?: string): string | null {
  const source = projectDesign(id);
  if (!source) { useProjectsStore.setState({ readFailed: true }); return null; }
  flushSave();
  const copyId = newId();
  const design = { ...structuredClone(source), name: name ?? currentMessages().names.copyOf(source.name) };
  storeDesign(copyId, design);
  useProjectsStore.setState((state) => ({ projects: [{ ...metaOf(copyId, design), roomMeasured: state.projects.find((p) => p.id === id)?.roomMeasured }, ...state.projects] }));
  saveIndex();
  return copyId;
}

/** Start editing an independent alternative; copying from Projects alone still leaves the original open. */
export function editLayoutVariant(): string | null {
  const { activeId, projects } = useProjectsStore.getState();
  const source = committedDesign(useDesignStore.getState());
  const names = new Set(projects.map((p) => p.name));
  let name = '', n = 1;
  do {
    const suffix = ` · ${currentMessages().planner.variant} ${n++}`;
    name = source.name.slice(0, 60 - suffix.length) + suffix;
  } while (names.has(name));
  const id = duplicateProject(activeId, name);
  if (id) {
    openProject(id);
    if (!useUiStore.getState().roomOpen) useUiStore.getState().setView('plan');
  }
  return id;
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

/** Read without switching: the latest committed active design or a saved/session project. */
export function projectDesign(id: string): Design | null {
  if (id === useProjectsStore.getState().activeId) return committedDesign(useDesignStore.getState());
  return loadDesign(id);
}

export function backupStatus(project: ProjectMeta, now = Date.now()): 'missing' | 'changed' | 'old' | 'current' {
  if (!project.lastBackupAt) return 'missing';
  if (project.backupUpdatedAt !== project.updatedAt) return 'changed';
  return now - project.lastBackupAt >= 7 * 86400_000 ? 'old' : 'current';
}

export type BackupResult = { outcome: Exclude<BackupOutcome, 'download-started'> } | { outcome: 'download-started'; confirm: () => void };

export async function saveProjectBackup(id: string): Promise<BackupResult> {
  flushSave();
  const meta = useProjectsStore.getState().projects.find((p) => p.id === id);
  const design = meta && projectDesign(id);
  const raw = !design ? safeStorage.getItem(projectKey(id)) : null;
  if (!meta || !design && typeof raw !== 'string') return { outcome: 'unavailable' };
  let recorded = false;
  const confirm = () => {
    const { projects } = useProjectsStore.getState();
    if (!design || recorded || !projects.some((p) => p.id === id)) return;
    recorded = true;
    useProjectsStore.setState({ projects: projects.map((p) => p.id === id
      ? { ...p, lastBackupAt: Date.now(), backupUpdatedAt: meta.updatedAt } : p) });
    saveIndex();
  };
  try {
    const data = new Blob([design ? JSON.stringify(design, null, 2) : String(raw)], { type: 'application/json' });
    const filename = design ? `${safeFileName(design.name)}.kitchen.json` : currentMessages().projects.recoveryFile(safeFileName(meta.name));
    const outcome = await saveBackupFile(filename, data);
    if (outcome === 'download-started') return { outcome, confirm };
    if (outcome === 'saved') confirm();
    return { outcome };
  } catch {
    return { outcome: 'unavailable' };
  }
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
  indexUnreadable = false;
  savedDesign = null;
  memory.clear();
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  useProjectsStore.setState({ activeId: '', projects: [], writeFailed: false, readFailed: false });
}
