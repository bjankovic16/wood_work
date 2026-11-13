import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Guide } from '../domain/snapping';
import { safeStorage } from '../lib/platform';
import type { KitchenItem, Point, Wall } from '../domain/types';

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
  libraryDrag: LibraryDrag | null;
  /** A properties field to focus once it is on screen (used by "Custom" cabinets). */
  focusRequest: string | null;
  /** Main area: the plan, the 3D view, or the cutting list. */
  view: MainView;
  /** Which tab of the kitchen settings dialog is open, if any. */
  settingsTab: SettingsTab | null;
  layoutsOpen: boolean;

  select: (id: string | null) => void;
  setView: (view: MainView) => void;
  setSettingsTab: (tab: SettingsTab | null) => void;
  setLayoutsOpen: (open: boolean) => void;
  setViewport: (zoom: number, pan: Point) => void;
  setSnapEnabled: (enabled: boolean) => void;
  setGridSize: (size: number) => void;
  setShowDimensions: (show: boolean) => void;
  setViewFilter: (filter: ViewFilter) => void;
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
      viewFilter: 'all',
      libraryDrag: null,
      focusRequest: null,
      view: 'plan',
      settingsTab: null,
      layoutsOpen: false,

      select: (selectedId) => set({ selectedId }),
      setView: (view) => set({ view }),
      setSettingsTab: (settingsTab) => set({ settingsTab }),
      setLayoutsOpen: (layoutsOpen) => set({ layoutsOpen }),
      setViewport: (zoom, pan) => set({ zoom, pan }),
      setSnapEnabled: (snapEnabled) => set({ snapEnabled }),
      setGridSize: (gridSize) => set({ gridSize }),
      setShowDimensions: (showDimensions) => set({ showDimensions }),
      setViewFilter: (viewFilter) => set({ viewFilter }),
      setLibraryDrag: (libraryDrag) => set({ libraryDrag }),
      requestFocus: (focusRequest) => set({ focusRequest }),
    }),
    {
      name: 'kitchen-designer:preferences',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({
        snapEnabled: s.snapEnabled,
        gridSize: s.gridSize,
        showDimensions: s.showDimensions,
        viewFilter: s.viewFilter,
      }),
    },
  ),
);
