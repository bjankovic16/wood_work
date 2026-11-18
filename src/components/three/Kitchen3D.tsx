import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Copy, DoorClosed, DoorOpen, Download, LayoutGrid, Palette, PanelsTopLeft, Pencil, RotateCcw, Ruler, Scan, Shuffle, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { lazy, memo, Suspense, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ComponentRef, type RefObject } from 'react';
import { isWallMounted } from '../../domain/geometry';
import { blendPoses, CAMERA_FOV, kitchenCameraPose, type CameraPose, type CameraView } from '../../domain/camera';
import { KIND_OPTIONS } from '../../engine/config';
import type { Design, KitchenItem } from '../../domain/types';
import { useCanSaveFiles } from '../../hooks/useCanSaveFiles';
import type { RoomObjectSelection } from '../../domain/roomObjectPlacement';
import { openingOnWall } from '../../domain/walls';
import { useT } from '../../i18n';
import { cn } from '../../lib/cn';
import { committedDesign, useDesignStore } from '../../store/designStore';
import { useBuildContext, useIssues } from '../../store/derived';
import { deleteSelected, duplicateSelected, editCabinetPositionInPlan, shuffleKitchen, type ShuffleResult } from '../../store/actions';
import { useUiStore } from '../../store/uiStore';
import { Button, Dialog, TooltipButton } from '../ui';
import { RoomPreviewToolbar, type RoomPreviewPanel } from '../room/RoomPreviewToolbar';
import { createMaterials, disposeMaterials } from './materials';
import { Room3D } from './Room3D';
import { RoomObjectAnchor, RoomObjectAnnotation, RoomObjectTools } from './RoomObjectTools';
import { CabinetResizeLabels, CabinetResizeTool, ResizeFeedback } from './CabinetResizeTool';
import { SelectionOverlay } from './SelectionOverlay';
import { StylePicker } from './StylePicker';
import { Unit3D } from './Unit3D';
import { PhotoReferencePanel } from '../references/PhotoReferences';
import { ItemFields } from '../properties/ItemPanel';
import { StackAboveButton } from '../properties/StackAboveButton';
import { inUpperRow, upperCabinetRows } from '../../domain/upperCabinets';

interface CameraRequest { view: CameraView; focusId?: string; back: boolean; token: number }
const SceneRoom = memo(Room3D);
const CustomerExport = lazy(() => import('./CustomerExport'));

/** How long the camera takes to glide to a new view. */
const CAMERA_MOVE_MS = 520;
/** The first-visit tip leaves by itself after this long. */
const TIP_MS = 12000;

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

const canOpen = (item: KitchenItem) => KIND_OPTIONS[item.kind].carcass && KIND_OPTIONS[item.kind].fronts;

/**
 * Puts the camera at the requested view. A view the user asks for glides into
 * place; the first view and a change of room size appear at once. Looking at
 * one cabinet remembers where the camera was, so it can go back afterwards.
 */
function CameraRig({ request, comparison, controls }: { request: CameraRequest; comparison: boolean; controls: RefObject<ComponentRef<typeof OrbitControls> | null> }) {
  const room = useDesignStore((s) => s.design.room);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const invalidate = useThree((state) => state.invalidate);
  const handled = useRef<number | null>(null);
  const roomSize = useRef('');
  const flight = useRef<{ from: CameraPose; to: CameraPose; start: number } | null>(null);
  const before = useRef<CameraPose | null>(null);
  /** The user has turned or zoomed the view since it was last set for them. */
  const moved = useRef(false);

  useLayoutEffect(() => {
    const c = controls.current;
    // A flick of the view keeps turning for a moment; finish that first so it cannot pull the new view off its mark.
    if (c?.enableDamping) {
      c.enableDamping = false;
      c.update();
      c.enableDamping = true;
    }
    const place = (pose: CameraPose) => {
      camera.position.set(...pose.position);
      if (c) {
        c.target.set(...pose.target);
        c.update();
      } else {
        camera.lookAt(...pose.target);
      }
    };
    const current = (): CameraPose => ({
      position: [camera.position.x, camera.position.y, camera.position.z],
      target: c ? [c.target.x, c.target.y, c.target.z] : [room.width / 2000, 0.95, room.depth / 2000],
    });
    const asked = handled.current !== null && handled.current !== request.token;
    const first = handled.current === null;
    handled.current = request.token;
    // A room of another size is another scene: show it at once rather than sliding across to it.
    const size3d = `${room.width}x${room.depth}x${room.height}`;
    const sameRoom = roomSize.current === size3d;
    roomSize.current = size3d;
    // The window changed size: keep a view the user set up themselves.
    if (!asked && !first && (moved.current || request.back)) return;

    const items = useDesignStore.getState().design.items;
    let pose: CameraPose;
    if (request.back) {
      if (!before.current) return;
      pose = before.current;
      before.current = null;
    } else {
      const focus = items.find((item) => item.id === request.focusId);
      pose = kitchenCameraPose(room, items, size.width / Math.max(1, size.height), request.view, focus);
      if (asked) {
        if (focus) before.current ??= current();
        else before.current = null;
      }
    }
    moved.current = false;
    const from = current();
    const travel = Math.max(...pose.position.map((value, index) => Math.abs(value - from.position[index])), ...pose.target.map((value, index) => Math.abs(value - from.target[index])));
    if (asked && sameRoom && travel > 0.001 && !prefersReducedMotion()) {
      flight.current = { from, to: pose, start: performance.now() };
    } else {
      flight.current = null;
      place(pose);
    }
    invalidate();
  }, [room.width, room.depth, room.height, request, comparison, camera, controls, invalidate, size.width, size.height]);

  // Turning the view by hand takes over from a glide in progress.
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const takeOver = () => { flight.current = null; moved.current = true; };
    c.addEventListener('start', takeOver);
    return () => c.removeEventListener('start', takeOver);
  }, [controls]);

  useFrame(() => {
    const move = flight.current;
    if (!move) return;
    const progress = Math.min(1, (performance.now() - move.start) / CAMERA_MOVE_MS);
    const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
    const pose = blendPoses(move.from, move.to, eased);
    camera.position.set(...pose.position);
    const c = controls.current;
    if (c) {
      c.target.set(...pose.target);
      c.update();
    } else {
      camera.lookAt(...pose.target);
    }
    if (progress >= 1) flight.current = null;
    else invalidate();
  });
  return null;
}

/**
 * The kitchen in 3D: body drags orbit the camera; placement belongs to the plan.
 */
export default function Kitchen3D({ compact = false, roomPreview = false }: { compact?: boolean; roomPreview?: boolean }) {
  const text = useT();
  const toolsId = useId();
  const canSave = useCanSaveFiles();
  const [exportDesign, setExportDesign] = useState<Design | null>(null);
  const [exportNotice, setExportNotice] = useState('');
  const exportFinished = useCallback((message: string) => { setExportDesign(null); setExportNotice(message); }, []);
  const room = useDesignStore((s) => s.design.room);
  const items = useDesignStore((s) => s.design.items);
  const committedItems = useDesignStore((s) => committedDesign(s).items);
  const openings = useDesignStore((s) => s.design.openings);
  const ctx = useBuildContext();
  const style = useDesignStore((s) => s.design.style);
  const selectedId = useUiStore((s) => s.selectedId);
  const cabinetTool = useUiStore((s) => s.cabinetTool);
  const previewLockedIds = useUiStore((s) => s.previewLockedIds);
  const editing = useDesignStore((s) => s.gestureBase !== null);
  const [shuffleResult, setShuffleResult] = useState<ShuffleResult | null>(null);
  const moveHintSeen = useUiStore((s) => s.moveHintSeen);
  const referenceOpen = useUiStore((state) => state.referenceOpen);
  const cameraView = useUiStore((state) => state.cameraView);
  const cameraFocusId = useUiStore((state) => state.cameraFocusId);
  const cameraReturn = useUiStore((state) => state.cameraReturn);
  const cameraToken = useUiStore((state) => state.cameraToken);
  const request = useMemo<CameraRequest>(() => ({ view: cameraView, focusId: cameraFocusId ?? undefined, back: cameraReturn, token: cameraToken }), [cameraView, cameraFocusId, cameraReturn, cameraToken]);
  const issues = useIssues();
  const invalid = useMemo(() => new Set(issues.filter((issue) => issue.severity === 'error').flatMap((issue) => issue.itemIds)), [issues]);
  const selected = items.find((item) => item.id === selectedId);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const handlesRef = useRef<HTMLDivElement>(null);
  const resizeLabelsRef = useRef<HTMLDivElement>(null);
  const roomLabelRef = useRef<HTMLDivElement>(null);
  const [resizeInset, setResizeInset] = useState(0);
  const stopCamera = useCallback(() => {
    if (controls.current) controls.current.dispatchEvent({ type: 'start', target: controls.current });
  }, []);
  const [styleOpen, setStyleOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [roomPanel, setRoomPanel] = useState<RoomPreviewPanel | null>(null);
  const [interior, setInterior] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [tipTimedOut, setTipTimedOut] = useState(false);

  const [openedCabinets, setOpenedCabinets] = useState<Set<string>>(() => new Set());
  const opened = useRef(openedCabinets);
  opened.current = openedCabinets;
  /** Opens one cabinet and brings the camera to it, or closes it and takes the camera back. */
  const toggleOpening = useCallback((id: string) => {
    const ui = useUiStore.getState();
    if (ui.cabinetTool === 'resize' && ui.selectedId !== id) return;
    const existing = new Set(useDesignStore.getState().design.items.map((item) => item.id));
    const next = new Set([...opened.current].filter((entry) => existing.has(entry)));
    ui.setCabinetTool(null);
    if (next.delete(id)) {
      if (next.size === 0) ui.returnCamera();
    } else {
      next.add(id);
      ui.focusCamera(id);
      ui.setMoveHintSeen();
    }
    opened.current = next;
    setOpenedCabinets(next);
  }, []);
  const openable = useMemo(() => committedItems.filter(canOpen), [committedItems]);
  const allOpen = openable.length > 0 && openable.every((item) => openedCabinets.has(item.id));
  const toggleAll = () => {
    useUiStore.getState().setCabinetTool(null);
    setOpenedCabinets(allOpen ? new Set() : new Set(openable.map((item) => item.id)));
    if (allOpen) useUiStore.getState().returnCamera();
  };

  const [resizeBlocked, setResizeBlocked] = useState(false);
  const [resizeStatus, setResizeStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const readyResize = useCallback(() => setResizeStatus('ready'), []);
  const loadingResize = useCallback(() => setResizeStatus('loading'), []);
  const failedResize = useCallback(() => setResizeStatus('error'), []);
  const cancelResize = useCallback(() => setResizeBlocked(false), []);
  const roomSelection = useUiStore((s) => s.roomSelection);
  const roomOpen = useUiStore((s) => s.roomOpen);
  const mobileRoomToolbar = compact && roomOpen && !roomPreview;
  const selectedWallId = useUiStore((s) => s.selectedWallId);
  const selectRoomObject = useCallback((selection: RoomObjectSelection | null) => {
    if (selection && useUiStore.getState().cabinetTool === 'resize') return;
    const { room, openings } = useDesignStore.getState().design;
    const opening = selection?.type === 'opening' && openings.find((o) => o.id === selection.id);
    const wallId = opening ? openingOnWall(room, opening)?.segment.id
      : selection?.type === 'feature' ? room.features?.find((f) => f.id === selection.id)?.wallId : undefined;
    useUiStore.getState().selectRoomObject(selection, wallId);
    setResizeBlocked(false);
  }, []);
  const roomOptions = [
    ...openings.map((opening, index) => ({ type: 'opening' as const, id: opening.id, name: `${text.room.opening(opening.kind)} ${openings.slice(0, index + 1).filter((entry) => entry.kind === opening.kind).length}` })),
    ...(room.features ?? []).map((feature, index) => ({ type: 'feature' as const, id: feature.id, name: `${text.engine.roomFeatures[feature.kind]} ${index + 1}` })),
  ];
  const activeRoomSelection = roomSelection && roomOptions.some((option) => option.type === roomSelection.type && option.id === roomSelection.id) ? roomSelection : null;
  const selectedLocked = !!selected && previewLockedIds.includes(selected.id);
  const canResize = !!selected && cabinetTool === 'resize' && !selectedLocked;
  useLayoutEffect(() => {
    if (!compact || !canResize) { setResizeInset(0); return; }
    const sheet = document.querySelector('[data-testid="item-sheet"]');
    if (!sheet) return;
    const measure = () => setResizeInset(sheet.getBoundingClientRect().height);
    const observer = new ResizeObserver(measure);
    observer.observe(sheet);
    measure();
    return () => observer.disconnect();
  }, [compact, canResize, selectedId]);
  const showTip = !moveHintSeen && !tipTimedOut && items.length > 0 && !selected && !activeRoomSelection && !toolsOpen && !roomPanel;

  const materials = useMemo(() => createMaterials(style), [style]);
  useEffect(() => () => disposeMaterials(materials), [materials]);
  useLayoutEffect(() => {
    useUiStore.getState().setPreviewLockedIds(committedItems.filter((item) => interior || openedCabinets.has(item.id)).map((item) => item.id));
  }, [committedItems, interior, openedCabinets]);
  useEffect(() => {
    if (!selectedId) useUiStore.getState().setCabinetTool(null);
    else selectRoomObject(null);
  }, [selectedId, selected?.kind, selectRoomObject]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.target instanceof HTMLElement && (event.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName))) return;
      if (document.querySelector('dialog:modal, [role="dialog"][aria-modal="true"]')) return;
      selectRoomObject(null);
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [selectRoomObject]);
  useEffect(() => () => { if (import.meta.env.DEV) Reflect.deleteProperty(window, '__kitchen3D'); }, []);
  useEffect(() => () => {
    document.body.style.cursor = '';
    // Cabinets close when the 3D view is left, so it should not come back zoomed in on one.
    const ui = useUiStore.getState();
    ui.setCabinetTool(null);
    ui.setPreviewLockedIds([]);
    if (ui.cameraFocusId) ui.requestCamera(ui.cameraView);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => setTipTimedOut(true), TIP_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const select = useCallback((id: string) => {
    const ui = useUiStore.getState();
    if (ui.selectedId === id || ui.cabinetTool === 'resize') return;
    selectRoomObject(null);
    const items = useDesignStore.getState().design.items;
    const item = items.find((candidate) => candidate.id === id);
    if (item && ui.wallElevation !== null) {
      if (isWallMounted(item)) {
        const row = upperCabinetRows(items).find((row) => row.elevation === ui.wallElevation);
        if (!row || !inUpperRow(item, row)) ui.setWallElevation(item.elevation);
      } else ui.setViewFilter('floor');
    }
    ui.select(id);
  }, [selectRoomObject]);

  const selectedOpen = !!selected && openedCabinets.has(selected.id);
  const startResize = () => {
    const ui = useUiStore.getState();
    if (ui.cabinetTool === 'resize') return;
    ui.setCabinetTool('resize');
    setResizeBlocked(false);
    if (ui.selectedId && useUiStore.getState().cabinetTool === 'resize') ui.focusCamera(ui.selectedId);
  };
  const interiorButton = (
    <TooltipButton tooltip={text.view3d.interiorHint} className="h-10" variant="outline" active={interior} onClick={() => {
      useUiStore.getState().setCabinetTool(null); setInterior((shown) => !shown); setRoomPanel(null);
    }}>
      <PanelsTopLeft className="size-4" />{text.view3d.interior}
    </TooltipButton>
  );
  const shuffleDisabled = previewLockedIds.length > 0 || Boolean(cabinetTool) || editing;
  const shuffleTitle = previewLockedIds.length > 0 ? text.shuffle.preview : cabinetTool || editing ? text.shuffle.busy : text.shuffle.hint;
  const kitchenName = shuffleResult?.ok ? text.kitchens.names[shuffleResult.presetId] : '';
  const openAllButton = <TooltipButton tooltip={allOpen ? text.view3d.closeAllHint : text.view3d.openAllHint} className="h-10 flex-1 whitespace-nowrap lg:flex-none"
    variant="outline" active={allOpen} disabled={interior || openable.length === 0} onClick={() => { toggleAll(); setRoomPanel(null); }}>
    {allOpen ? <DoorClosed className="size-4" /> : <DoorOpen className="size-4" />}
    {allOpen ? text.view3d.closeAll : text.view3d.openAll}
  </TooltipButton>;
  const nextKitchenButton = <TooltipButton tooltip={shuffleTitle} className="h-10 flex-1 whitespace-nowrap lg:flex-none" variant="outline" disabled={shuffleDisabled} onClick={() => {
    setRoomPanel(null);
    const result = shuffleKitchen();
    setShuffleResult(!result.ok && result.reason === 'review' ? null : result);
    if (result.ok) { selectRoomObject(null); setOpenedCabinets(new Set()); }
  }}>
    <Shuffle className="size-4" />{text.shuffle.title}
  </TooltipButton>;
  const customerExport = <div className="flex flex-wrap items-center gap-2">
    <Button variant="outline" disabled={!canSave || Boolean(exportDesign) || editing} title={!canSave ? text.files.unavailable : undefined} data-testid="customer-export"
      onClick={() => { setExportNotice(''); setExportDesign(useDesignStore.getState().design); }}>
      {mobileRoomToolbar && <Download className="size-4" />}{text.customerView.export}
    </Button>
    {(exportDesign || exportNotice) && <span role="status" className="text-xs text-studio-muted">{exportDesign ? text.customerView.busy : exportNotice}</span>}
  </div>;
  const toolsButton = <TooltipButton tooltip={text.view3d.toolsHint} data-testid="three-tools-toggle" aria-expanded={toolsOpen} aria-controls={toolsId} aria-label={text.view3d.tools}
    className="h-10 min-w-10" active={toolsOpen} onClick={() => setToolsOpen(!toolsOpen)}>
    <SlidersHorizontal className="size-4" />
    <span className={cn(compact && 'sr-only')}>{text.view3d.toolsShort}</span>
  </TooltipButton>;

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-[#ebe8e3] lg:flex-row">
      {referenceOpen && !roomOpen && <PhotoReferencePanel />}
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      {mobileRoomToolbar ? <RoomPreviewToolbar panel={roomPanel} onPanel={setRoomPanel} view={request.focusId ? null : request.view}
        previews={<>{openAllButton}{interiorButton}</>} nextKitchen={nextKitchenButton} shuffleHint={shuffleDisabled ? shuffleTitle : undefined} customerExport={customerExport} />
      : !roomPreview && <div role="toolbar" aria-label={text.view3d.toolbar} data-testid="three-toolbar" className="studio-panel flex shrink-0 flex-col gap-2 border-b px-3 py-2 lg:flex-row lg:flex-wrap lg:items-center lg:gap-3">
        <div className="flex items-center justify-between gap-2">
        <div role="group" aria-label={text.view3d.camera} className="flex shrink-0 rounded-xl border border-studio-line bg-[#efede5] p-0.5">
          {(['perspective', 'front', 'top'] as const).map((view) => <TooltipButton key={view} tooltip={text.view3d.cameraHints[view]}
            className="h-10 px-2.5" active={request.view === view && !request.focusId}
            onClick={() => useUiStore.getState().requestCamera(view)}>{text.view3d[view]}</TooltipButton>)}
        </div>
        <TooltipButton tooltip={text.view3d.appearanceHint} variant="outline" className="h-10 min-w-10" active={styleOpen} aria-label={text.style.style} onClick={() => setStyleOpen((open) => !open)}>
          <Palette className="size-4" />
          <span className={cn(compact && 'sr-only')}>{text.style.style}</span>
        </TooltipButton>
        {compact && toolsButton}
        </div>
        {!compact && <TooltipButton tooltip={text.view3d.resetViewTitle} className="h-10 min-w-10" variant="outline" aria-label={text.view3d.resetView} onClick={() => useUiStore.getState().requestCamera('perspective')}>
          <RotateCcw className="size-4" />
        </TooltipButton>}
        <div role="group" aria-label={text.view3d.kitchenActions} className="flex items-center gap-2 lg:border-l lg:border-studio-line lg:pl-3">
        {openAllButton}
        {nextKitchenButton}
        </div>
        {!compact && interiorButton}
        {!compact && <><div className="min-w-0 flex-1" />{toolsButton}</>}
      </div>}

      {shuffleResult && <div role={shuffleResult.ok ? 'status' : 'alert'} data-testid="shuffle-feedback"
        className="studio-panel flex shrink-0 items-center gap-3 border-b px-3 py-2 text-xs text-studio-ink">
        <span className="flex-1">{shuffleResult.ok ? text.shuffle.success(kitchenName) : text.shuffle[shuffleResult.reason]}</span>
        <Button aria-label={text.common.close} onClick={() => setShuffleResult(null)}><X className="size-4" /></Button>
      </div>}

      {activeRoomSelection && <div className="studio-panel shrink-0 border-b px-3 py-2">
        <RoomObjectTools selection={activeRoomSelection} onClose={() => selectRoomObject(null)} />
      </div>}

      {toolsOpen && <div id={toolsId} data-testid="three-tools" className="flex max-h-[35dvh] shrink-0 flex-col items-start gap-2 overflow-y-auto overscroll-contain border-b border-studio-line bg-[#f7f5f0] px-3 py-3">
        {customerExport}
        {(compact || roomOptions.length > 0) && <div className="flex max-w-full flex-wrap items-center gap-2">
          {compact && interiorButton}
          {compact && <Button variant="outline" title={text.view3d.resetViewTitle} onClick={() => useUiStore.getState().requestCamera('perspective')}>
            <RotateCcw className="size-4" />{text.view3d.resetView}
          </Button>}
          {!roomOpen && roomOptions.length > 0 && <select aria-label={text.view3d.roomObjects} value={activeRoomSelection ? `${activeRoomSelection.type}:${activeRoomSelection.id}` : ''}
            className="min-h-9 min-w-0 max-w-full rounded-lg border border-zinc-200 bg-white px-2 text-xs text-zinc-800 shadow-sm"
            onChange={(event) => {
              const option = roomOptions.find((option) => `${option.type}:${option.id}` === event.target.value);
              selectRoomObject(option ? { type: option.type, id: option.id } : null);
            }}>
            <option value="">{text.view3d.roomObjects}</option>
            {roomOptions.map((option) => <option key={`${option.type}:${option.id}`} value={`${option.type}:${option.id}`}>{option.name}</option>)}
          </select>}
        </div>}
        {!compact && selected && <SelectedCabinetTools key={selected.id} item={selected}
          invalid={invalid.has(selected.id)} onFocus={() => useUiStore.getState().focusCamera(selected.id)} />}
        {interior && <p className="max-w-xl text-xs leading-relaxed text-zinc-600">{text.view3d.interiorHint}</p>}
        {/* Closed by default: its text changes with the tool in use, and an open paragraph would resize the kitchen each time. */}
        <details className="text-xs text-zinc-600">
          <summary className="cursor-pointer py-1">{text.view3d.help}</summary>
          <p className="max-w-xl py-2 leading-relaxed">{text.view3d.selectHint}</p>
        </details>
      </div>}

      <div className="relative min-h-0 flex-1 touch-none overflow-hidden" data-testid="three-viewport">
      <Canvas
        style={{ height: resizeInset ? `calc(100% - ${resizeInset}px)` : '100%' }}
        flat
        frameloop="demand"
        dpr={[1, 2]}
        camera={{ fov: CAMERA_FOV, near: 0.05, far: 200 }}
        onCreated={({ camera, scene, gl }) => { if (import.meta.env.DEV) Object.assign(window, { __kitchen3D: { camera, scene, renderer: gl } }); }}
        onPointerMissed={(event) => {
          if (event.type === 'click' && useUiStore.getState().cabinetTool !== 'resize') {
            useUiStore.getState().select(null);
            selectRoomObject(null);
          }
        }}
      >
        <color attach="background" args={['#ebe8e3']} />
        {/* Unit diffuse exposure, without filmic tone mapping or directional sources. */}
        <ambientLight intensity={Math.PI} />
        <SceneRoom room={room} openings={openings} items={committedItems} materials={materials} selection={activeRoomSelection} onSelect={selectRoomObject}
          selectedWallId={roomOpen ? selectedWallId : null} onWallSelect={roomOpen ? useUiStore.getState().setSelectedWallId : undefined} />
        {items.map((item) => (
          <Unit3D
            key={item.id}
            item={item}
            ctx={ctx}
            materials={materials}
            selected={item.id === selectedId}
            onSelect={select}
            invalid={invalid.has(item.id)}
            interior={interior}
            opened={openedCabinets.has(item.id)}
            onToggleOpening={!interior && canOpen(item) ? toggleOpening : undefined}
            hovered={item.id === hoveredId}
            onHover={setHoveredId}
          />
        ))}
        {selected && <SelectionOverlay item={selected} overlay={handlesRef} />}
        {canResize && selected && <CabinetResizeTool key={selected.id} item={selected} overlay={resizeLabelsRef} onStart={stopCamera}
          onLoading={loadingResize} onError={failedResize} onReady={readyResize} onCancel={cancelResize} onBlocked={setResizeBlocked} />}
        {activeRoomSelection && <RoomObjectAnchor overlay={roomLabelRef} />}
        <OrbitControls
          ref={controls}
          makeDefault
          enableDamping
          maxPolarAngle={Math.PI / 2 - 0.04}
          minDistance={0.6}
          maxDistance={30}
        />
        <CameraRig request={request} comparison={referenceOpen} controls={controls} />
        {exportDesign && <Suspense fallback={null}><CustomerExport design={exportDesign} t={text} finish={exportFinished} /></Suspense>}
      </Canvas>
      {activeRoomSelection && <RoomObjectAnnotation overlay={roomLabelRef} />}

      {canResize && selected && <>
        {resizeStatus !== 'error' && <CabinetResizeLabels item={selected} overlay={resizeLabelsRef} />}
        {resizeStatus !== 'ready' && <ResizeFeedback failed={resizeStatus === 'error'} />}
      </>}

      {selected && <div ref={handlesRef} data-testid="cabinet-tools" className="studio-panel absolute left-0 top-0 z-10 flex items-center gap-1 rounded-2xl border p-1 shadow-[0_6px_24px_#332f2826]" style={{ visibility: 'hidden' }}>
        <Button aria-label={text.room.editIn2D} title={text.room.editIn2D}
          onClick={() => editCabinetPositionInPlan(selected.id)} className="h-11 min-w-11 rounded-xl px-2">
          <LayoutGrid className="size-5" aria-hidden="true" />
          <span className={cn('text-[13px] font-semibold', compact && 'sr-only')}>{text.view3d.planShort}</span>
        </Button>
        {!roomPreview && <Button disabled={selectedLocked} active={cabinetTool === 'resize'} aria-pressed={cabinetTool === 'resize'} aria-label={text.view3d.resize} title={selectedLocked ? text.view3d.previewLocked : text.view3d.resizeModeHint}
          onClick={startResize} className="h-11 min-w-11 rounded-xl px-2">
          <Ruler className="size-5" aria-hidden="true" /><span className={cn('text-[13px] font-semibold', compact && 'sr-only')}>{text.view3d.resizeShort}</span>
        </Button>}
        {!interior && canOpen(selected) && <button type="button"
          aria-label={selectedOpen ? text.view3d.closeCabinet : text.view3d.openCabinet}
          title={selectedOpen ? text.view3d.closeCabinet : text.view3d.openCabinet}
          aria-pressed={selectedOpen} onClick={() => toggleOpening(selected.id)}
          className="flex h-11 touch-manipulation items-center justify-center gap-2 rounded-xl px-3 text-studio-ink transition-colors hover:bg-[#ece8df] aria-pressed:bg-[#e6ecdf] aria-pressed:text-[#3e5539] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-studio-accent">
          {selectedOpen ? <DoorClosed className="size-5" aria-hidden="true" /> : <DoorOpen className="size-5" aria-hidden="true" />}
          <span className={cn('text-[13px] font-semibold', compact && 'sr-only')}>{selectedOpen ? text.view3d.closeShort : text.view3d.openShort}</span>
        </button>}
        {cabinetTool && <Button aria-label={text.common.done} title={text.common.done} onClick={() => useUiStore.getState().setCabinetTool(null)} className="h-11 min-w-11 rounded-xl"><X className="size-5" /></Button>}
      </div>}

      {selected && (selectedLocked || cabinetTool && (!canResize || resizeStatus === 'ready')) && <p role="status" data-testid="cabinet-mode-hint"
        className="pointer-events-none absolute inset-x-3 top-3 z-10 mx-auto w-fit max-w-sm rounded-xl bg-studio-ink/90 px-3 py-2 text-center text-xs leading-snug text-white shadow-lg">
        {selectedLocked ? text.view3d.previewLocked : text.view3d.resizeModeHint}
      </p>}

      {showTip && <p role="status" className="pointer-events-none absolute inset-x-3 top-3 z-10 mx-auto w-fit max-w-full rounded-full bg-studio-ink/85 px-4 py-2 text-center text-xs font-medium leading-snug text-white shadow-lg backdrop-blur-sm">
        {compact ? text.view3d.tipTouch : text.view3d.tipMouse}
      </p>}

      {canResize && resizeBlocked && <p role="status" className="pointer-events-none absolute inset-x-3 bottom-20 z-10 mx-auto w-fit max-w-sm rounded-xl bg-amber-50 px-3 py-2 text-center text-xs leading-snug text-amber-900 shadow-lg ring-1 ring-amber-200">
        {text.view3d.resizeBlocked}
      </p>}

      {!compact && styleOpen && (
        <div className="studio-panel absolute left-3 top-3 z-20 max-h-[calc(100%-24px)] w-64 max-w-full overflow-y-auto rounded-xl border p-3 shadow-xl">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[13px] font-semibold text-studio-ink">{text.style.style}</span>
            <Button aria-label={text.style.hide} className="-my-1 -mr-1 h-6 min-w-6 px-1" onClick={() => setStyleOpen(false)}>
              <X className="size-3.5" />
            </Button>
          </div>
          <StylePicker />
        </div>
      )}

      </div>

      {compact && (
        <Dialog open={styleOpen} title={text.style.style} sheet onClose={() => setStyleOpen(false)}>
          <div className="p-4 pb-[max(env(safe-area-inset-bottom),16px)]">
            <StylePicker />
          </div>
        </Dialog>
      )}
      </div>
    </div>
  );
}

function SelectedCabinetTools({ item, invalid, onFocus }: {
  item: KitchenItem; invalid: boolean; onFocus: () => void;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  return (
    <div className="pointer-events-auto max-w-full space-y-1">
      <div role="group" aria-label={t.view3d.selectedActions} className="flex max-w-full flex-wrap items-center gap-1 rounded-lg border border-zinc-200 bg-white p-1 shadow-sm">
        <span className="px-2 text-xs font-semibold text-zinc-800">{item.label}</span>
        <div className="flex items-center gap-1">
          <Button aria-label={t.view3d.focusSelection} title={t.view3d.focusSelection} onClick={onFocus}><Scan className="size-4" /></Button>
          <Button aria-label={t.view3d.copySelected} title={t.view3d.copySelected} onClick={duplicateSelected}><Copy className="size-4" /></Button>
          <StackAboveButton key={item.id} item={item} iconOnly />
          <Button aria-label={t.view3d.editSelected} title={t.view3d.editSelected} onClick={() => setEditing(true)}><Pencil className="size-4" /></Button>
          <Button aria-label={t.view3d.deleteSelected} title={t.view3d.deleteSelected} onClick={deleteSelected}><Trash2 className="size-4" /></Button>
        </div>
      </div>
      {invalid && <p role="status" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">{t.view3d.invalidSelection}</p>}
      <Dialog open={editing} title={`${t.kinds[item.kind]} ${item.label}`} onClose={() => setEditing(false)} footer={<Button variant="primary" onClick={() => setEditing(false)}>{t.common.done}</Button>}>
        <ItemFields item={item} />
      </Dialog>
    </div>
  );
}
