import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Guide } from '../domain/snapping';
import type { Design, KitchenItem, Point, Wall } from '../domain/types';
import type { CameraView } from '../domain/camera';
import type { KitchenDesignId } from '../domain/kitchens';
import type { LayoutId } from '../domain/templates';
import type { RoomObjectSelection } from '../domain/roomObjectPlacement';
import { browserLanguage, isLanguage, type Language } from '../i18n/language';
import { safeStorage } from '../lib/platform';

export type ViewFilter = 'all' | 'floor' | 'wall';
export type MainView = 'plan' | '3d' | 'list';
export type SettingsTab = 'materials' | 'construction';
export type CabinetTool = 'resize' | 'place' | null;
export type FitRequest = { type: 'idea'; id: KitchenDesignId } | { type: 'starter'; id: LayoutId };

export const GRID_SIZES = [10, 50, 100] as const;

export interface ViewAxes { right: [number, number]; up: [number, number] }
/** The plan's own directions: right is the right wall, up is the top wall. */
export const PLAN_AXES: ViewAxes = { right: [1, 0], up: [0, -1] };

export interface LibraryDrag {
  presetId: string;
  item: KitchenItem;
  clientX: number;
  clientY: number;
  /** Where the item would land if dropped now; null while the pointer is outside the plan. */
  ghost: KitchenItem | null;
  wall: Wall | null;
  guides: Guide[];
}

interface UiState {
  selectedId: string | null;
  /** An explicit edit/add request may target a cabinet hidden behind another tier. */
  planForegroundId: string | null;
  cabinetTool: CabinetTool;
  previewLockedIds: string[];
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
  /** One-shot focus target, consumed once its field or tab is on screen. */
  focusRequest: 'width' | 'parts' | 'library-search' | null;
  /** Main area: the plan, the 3D view, or the cutting list. */
  view: MainView;
  /** Which tab of the kitchen settings dialog is open, if any. */
  settingsTab: SettingsTab | null;
  layoutsOpen: boolean;
  fitRequest: FitRequest | null;
  fitNotice: { design: Design; changes: number } | null;
  projectPage: 'projects' | 'guide' | 'compare' | null;
  roomOpen: boolean;
  roomSelection: RoomObjectSelection | null;
  roomElevationOpen: boolean;
  selectedWallId: string | null;
  referenceOpen: boolean;
  hiddenKitchenWallIds: string[];
  cameraView: CameraView;
  cameraFocusId: string | null;
  /** The camera goes back to where it was before it went to look at a cabinet. */
  cameraReturn: boolean;
  cameraToken: number;
  /** The first-visit tip about navigating the 3D view has been seen. */
  moveHintSeen: boolean;
  /** Language of the interface and of everything exported. */
  language: Language;

  select: (id: string | null, source?: 'plan') => void;
  setCabinetTool: (tool: CabinetTool) => void;
  setPreviewLockedIds: (ids: string[]) => void;
  setLanguage: (language: Language) => void;
  setView: (view: MainView) => void;
  setSettingsTab: (tab: SettingsTab | null) => void;
  setLayoutsOpen: (open: boolean) => void;
  reviewFit: (request: FitRequest | null) => void;
  finishRoom: () => void;
  setProjectPage: (page: UiState['projectPage']) => void;
  setRoomOpen: (open: boolean) => void;
  openRoomPlan: () => void;
  setRoomView: (view: 'plan' | '3d') => void;
  setRoomElevationOpen: (open: boolean) => void;
  selectRoomObject: (selection: RoomObjectSelection | null, wallId?: string) => void;
  setSelectedWallId: (id: string | null) => void;
  setReferenceOpen: (open: boolean) => void;
  setHiddenKitchenWallIds: (ids: string[]) => void;
  requestCamera: (view: CameraView, focusId?: string) => void;
  /** Brings the camera to one cabinet; the chosen view stays the one to go back to. */
  focusCamera: (id: string) => void;
  returnCamera: () => void;
  setMoveHintSeen: () => void;
  setViewport: (zoom: number, pan: Point) => void;
  setSnapEnabled: (enabled: boolean) => void;
  setGridSize: (size: number) => void;
  setShowDimensions: (show: boolean) => void;
  setViewFilter: (filter: ViewFilter) => void;
  setWallElevation: (elevation: number | null) => void;
  setLibraryDrag: (drag: LibraryDrag | null) => void;
  requestFocus: (target: UiState['focusRequest']) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      selectedId: null,
      planForegroundId: null,
      cabinetTool: null,
      previewLockedIds: [],
      zoom: 0.2,
      pan: { x: 0, y: 0 },
      snapEnabled: true,
      gridSize: 50,
      showDimensions: true,
      viewFilter: 'all',
      wallElevation: null,
      libraryDrag: null,
      focusRequest: null,
      view: 'plan',
      settingsTab: null,
      layoutsOpen: false,
      fitRequest: null,
      fitNotice: null,
      projectPage: null,
      roomOpen: false,
      roomSelection: null,
      roomElevationOpen: false,
      selectedWallId: null,
      referenceOpen: false,
      hiddenKitchenWallIds: [],
      cameraView: 'perspective',
      cameraFocusId: null,
      cameraReturn: false,
      cameraToken: 0,
      moveHintSeen: false,
      language: browserLanguage(),

      select: (selectedId, source) => set((state) => ({
        selectedId, roomSelection: null, cabinetTool: selectedId === state.selectedId ? state.cabinetTool : null,
        planForegroundId: source === 'plan' && selectedId !== state.planForegroundId ? null : selectedId,
      })),
      setCabinetTool: (cabinetTool) => set((state) => ({
        cabinetTool: !state.roomOpen && state.selectedId && (
          cabinetTool === 'place' && state.view === 'plan' ||
          cabinetTool === 'resize' && state.view === '3d' && !state.previewLockedIds.includes(state.selectedId)
        ) ? cabinetTool : null,
        ...(cabinetTool === 'place' ? { focusRequest: null } : {}),
      })),
      setPreviewLockedIds: (previewLockedIds) => set((state) => {
        if (state.previewLockedIds.length === previewLockedIds.length && state.previewLockedIds.every((id, index) => id === previewLockedIds[index])) return state;
        return { previewLockedIds, cabinetTool: state.selectedId && previewLockedIds.includes(state.selectedId) ? null : state.cabinetTool };
      }),
      setLanguage: (language) => set({ language }),
      setView: (view) => set((state) => state.view === view && !state.roomOpen ? state : { view, roomOpen: false, cabinetTool: null, previewLockedIds: [] }),
      setSettingsTab: (settingsTab) => set({ settingsTab }),
      setLayoutsOpen: (layoutsOpen) => set({ layoutsOpen, fitRequest: null }),
      reviewFit: (fitRequest) => set({ layoutsOpen: true, fitRequest }),
      finishRoom: () => set({ roomOpen: false, view: 'plan', selectedId: null, cabinetTool: null,
        selectedWallId: null, roomElevationOpen: false, roomSelection: null }),
      setProjectPage: (projectPage) => set({ projectPage }),
      setRoomOpen: (roomOpen) => set(roomOpen
        ? { roomOpen, view: 'plan', selectedId: null, cabinetTool: null }
        : { roomOpen }),
      openRoomPlan: () => set({ roomOpen: true, view: 'plan', selectedId: null, selectedWallId: null,
        roomSelection: null, roomElevationOpen: false, cabinetTool: null, previewLockedIds: [] }),
      setRoomView: (view) => set((state) => state.view === view ? state : { view, cabinetTool: null, previewLockedIds: [] }),
      setRoomElevationOpen: (roomElevationOpen) => set({ roomElevationOpen }),
      selectRoomObject: (roomSelection, wallId) => set({ roomSelection, ...(roomSelection ? { selectedId: null, cabinetTool: null } : {}), ...(wallId ? { selectedWallId: wallId } : {}) }),
      setSelectedWallId: (selectedWallId) => set({ selectedWallId, roomSelection: null, selectedId: null, cabinetTool: null, ...(!selectedWallId ? { roomElevationOpen: false } : {}) }),
      setReferenceOpen: (referenceOpen) => set({ referenceOpen }),
      setHiddenKitchenWallIds: (hiddenKitchenWallIds) => set({ hiddenKitchenWallIds }),
      requestCamera: (cameraView, focusId) => set((state) => ({ cameraView, cameraFocusId: focusId ?? null, cameraReturn: false, cameraToken: state.cameraToken + 1 })),
      focusCamera: (cameraFocusId) => set((state) => ({ cameraFocusId, cameraReturn: false, cameraToken: state.cameraToken + 1 })),
      returnCamera: () => set((state) => ({ cameraFocusId: null, cameraReturn: true, cameraToken: state.cameraToken + 1 })),
      setMoveHintSeen: () => set({ moveHintSeen: true }),
      setViewport: (zoom, pan) => set({ zoom, pan }),
      setSnapEnabled: (snapEnabled) => set({ snapEnabled }),
      setGridSize: (gridSize) => set({ gridSize }),
      setShowDimensions: (showDimensions) => set({ showDimensions }),
      setViewFilter: (viewFilter) => set({ viewFilter }),
      setWallElevation: (wallElevation) => set({ wallElevation }),
      setLibraryDrag: (libraryDrag) => set({ libraryDrag }),
      requestFocus: (focusRequest) => set({ focusRequest }),
    }),
    {
      name: 'kitchen-designer:preferences',
      version: 3,
      migrate: (persisted) => (persisted ?? {}) as Partial<UiState>,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({
        snapEnabled: s.snapEnabled,
        gridSize: s.gridSize,
        showDimensions: s.showDimensions,
        language: s.language,
        moveHintSeen: s.moveHintSeen,
      }),
      // A stored language this version does not know falls back to the default.
      merge: (persisted, current) => {
        const stored = (persisted ?? {}) as Partial<UiState>;
        // Layers are a choice for the open kitchen, not a preference for the next visit.
        return { ...current, ...stored, viewFilter: current.viewFilter, wallElevation: current.wallElevation,
          language: isLanguage(stored.language) ? stored.language : current.language };
      },
    },
  ),
);

export function cabinetIsLocked(id: string): boolean {
  const ui = useUiStore.getState();
  return ui.view === '3d' && ui.previewLockedIds.includes(id);
}
