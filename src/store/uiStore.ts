import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Guide } from '../domain/snapping';
import type { KitchenItem, Point, Wall } from '../domain/types';
import type { CameraView } from '../domain/camera';
import { browserLanguage, isLanguage, type Language } from '../i18n/language';
import { safeStorage } from '../lib/platform';

export type ViewFilter = 'all' | 'floor' | 'wall';
export type MainView = 'plan' | '3d' | 'list';
export type SettingsTab = 'materials' | 'construction';

export const GRID_SIZES = [10, 50, 100] as const;

export interface LibraryDrag {
  presetId: string;
  clientX: number;
  clientY: number;
  /** Where the item would land if dropped now; null while the pointer is outside the plan. */
  ghost: KitchenItem | null;
  wall: Wall | null;
  guides: Guide[];
}

interface UiState {
  selectedId: string | null;
  /** Screen pixels per millimetre. */
  zoom: number;
  /** Screen position of the plan origin, in pixels from the canvas corner. */
  pan: Point;
  snapEnabled: boolean;
  gridSize: number;
  showDimensions: boolean;
  viewFilter: ViewFilter;
  wallElevation: number | null;
  libraryDrag: LibraryDrag | null;
  /** A properties field to focus once it is on screen (used by "Custom" cabinets). */
  focusRequest: string | null;
  /** Main area: the plan, the 3D view, or the cutting list. */
  view: MainView;
  /** Which tab of the kitchen settings dialog is open, if any. */
  settingsTab: SettingsTab | null;
  layoutsOpen: boolean;
  projectsOpen: boolean;
  roomOpen: boolean;
  wallEditing: boolean;
  selectedWallId: string | null;
  referenceOpen: boolean;
  cameraView: CameraView;
  cameraFocusId: string | null;
  cameraToken: number;
  /** Language of the interface and of everything exported. */
  language: Language;

  select: (id: string | null) => void;
  setLanguage: (language: Language) => void;
  setView: (view: MainView) => void;
  setSettingsTab: (tab: SettingsTab | null) => void;
  setLayoutsOpen: (open: boolean) => void;
  setProjectsOpen: (open: boolean) => void;
  setRoomOpen: (open: boolean) => void;
  setWallEditing: (editing: boolean) => void;
  setSelectedWallId: (id: string | null) => void;
  setReferenceOpen: (open: boolean) => void;
  requestCamera: (view: CameraView, focusId?: string) => void;
  setViewport: (zoom: number, pan: Point) => void;
  setSnapEnabled: (enabled: boolean) => void;
  setGridSize: (size: number) => void;
  setShowDimensions: (show: boolean) => void;
  setViewFilter: (filter: ViewFilter) => void;
  setWallElevation: (elevation: number | null) => void;
  setLibraryDrag: (drag: LibraryDrag | null) => void;
  requestFocus: (field: string | null) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      selectedId: null,
      zoom: 0.2,
      pan: { x: 0, y: 0 },
      snapEnabled: true,
      gridSize: 50,
      showDimensions: true,
      viewFilter: 'floor',
      wallElevation: null,
      libraryDrag: null,
      focusRequest: null,
      view: 'plan',
      settingsTab: null,
      layoutsOpen: false,
      projectsOpen: false,
      roomOpen: false,
      wallEditing: false,
      selectedWallId: null,
      referenceOpen: false,
      cameraView: 'perspective',
      cameraFocusId: null,
      cameraToken: 0,
      language: browserLanguage(),

      select: (selectedId) => set({ selectedId }),
      setLanguage: (language) => set({ language }),
      setView: (view) => set({ view }),
      setSettingsTab: (settingsTab) => set({ settingsTab }),
      setLayoutsOpen: (layoutsOpen) => set({ layoutsOpen }),
      setProjectsOpen: (projectsOpen) => set({ projectsOpen }),
      setRoomOpen: (roomOpen) => set({ roomOpen }),
      setWallEditing: (wallEditing) => set({ wallEditing, selectedId: null }),
      setSelectedWallId: (selectedWallId) => set({ selectedWallId }),
      setReferenceOpen: (referenceOpen) => set({ referenceOpen }),
      requestCamera: (cameraView, focusId) => set((state) => ({ cameraView, cameraFocusId: focusId ?? null, cameraToken: state.cameraToken + 1 })),
      setViewport: (zoom, pan) => set({ zoom, pan }),
      setSnapEnabled: (snapEnabled) => set({ snapEnabled }),
      setGridSize: (gridSize) => set({ gridSize }),
      setShowDimensions: (showDimensions) => set({ showDimensions }),
      setViewFilter: (viewFilter) => set({ viewFilter, wallElevation: null }),
      setWallElevation: (wallElevation) => set({ wallElevation }),
      setLibraryDrag: (libraryDrag) => set({ libraryDrag }),
      requestFocus: (focusRequest) => set({ focusRequest }),
    }),
    {
      name: 'kitchen-designer:preferences',
      version: 2,
      migrate: (persisted) => {
        const stored = (persisted ?? {}) as Partial<UiState>;
        return { ...stored, ...(stored.viewFilter === 'all' ? { viewFilter: 'floor' } : {}) };
      },
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({
        snapEnabled: s.snapEnabled,
        gridSize: s.gridSize,
        showDimensions: s.showDimensions,
        viewFilter: s.viewFilter,
        language: s.language,
      }),
      // A stored language this version does not know falls back to the default.
      merge: (persisted, current) => {
        const stored = (persisted ?? {}) as Partial<UiState>;
        return { ...current, ...stored, language: isLanguage(stored.language) ? stored.language : current.language };
      },
    },
  ),
);
