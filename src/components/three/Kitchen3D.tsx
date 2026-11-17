import { Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Copy, DoorClosed, DoorOpen, Hand, Image, Palette, PanelsTopLeft, Pencil, RotateCcw, RotateCw, Ruler, Scan, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ComponentRef, type RefObject } from 'react';
import * as THREE from 'three';
import { isWallMounted } from '../../domain/geometry';
import { blendPoses, CAMERA_FOV, kitchenCameraPose, type CameraPose, type CameraView } from '../../domain/camera';
import { KIND_OPTIONS } from '../../engine/config';
import type { KitchenItem } from '../../domain/types';
import type { RoomObjectSelection } from '../../domain/roomObjectPlacement';
import { useT } from '../../i18n';
import { cn } from '../../lib/cn';
import { useDesignStore } from '../../store/designStore';
import { useBuildContext, useIssues } from '../../store/derived';
import { deleteSelected, duplicateSelected, rotateSelected } from '../../store/actions';
import { useUiStore } from '../../store/uiStore';
import { Button, Dialog } from '../ui';
import { createMaterials, disposeMaterials, m } from './materials';
import { Room3D } from './Room3D';
import { RoomObjectTools } from './RoomObjectTools';
import { CabinetDragController } from './CabinetDrag';
import { CabinetResizeGrips, CabinetResizeTool, ResizeFeedback } from './CabinetResizeTool';
import type { ResizeGripApi } from './CabinetResize';
import { MoveClearances, SelectionOverlay } from './SelectionOverlay';
import { StylePicker } from './StylePicker';
import { Unit3D } from './Unit3D';
import { PhotoReferencePanel } from '../references/PhotoReferences';
import { ItemFields } from '../properties/ItemPanel';
import { StackAboveButton } from '../properties/StackAboveButton';
import { exposedCabinetUnderside, inUpperRow, upperCabinetRows } from '../../domain/upperCabinets';

interface CameraRequest { view: CameraView; focusId?: string; back: boolean; token: number }
const RoomObjectTransform = lazy(() => import('./RoomObjectTransform').then((module) => ({ default: module.RoomObjectTransform })));

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
 * The kitchen in 3D: walls facing the camera are hidden, units are moved by
 * dragging them and opened with a double-click, and fronts, worktop and
 * handles can be restyled.
 */
export default function Kitchen3D({ compact = false }: { compact?: boolean }) {
  const text = useT();
  const toolsId = useId();
  const room = useDesignStore((s) => s.design.room);
  const items = useDesignStore((s) => s.design.items);
  const openings = useDesignStore((s) => s.design.openings);
  const ctx = useBuildContext();
  const style = useDesignStore((s) => s.design.style);
  const selectedId = useUiStore((s) => s.selectedId);
  const cabinetTool = useUiStore((s) => s.cabinetTool);
  const previewLockedIds = useUiStore((s) => s.previewLockedIds);
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
  const resizeGripsRef = useRef<HTMLDivElement>(null);
  const resizeApi = useRef<ResizeGripApi>(null);
  const stopCamera = useCallback(() => {
    if (controls.current) controls.current.dispatchEvent({ type: 'start', target: controls.current });
  }, []);
  const [styleOpen, setStyleOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [interior, setInterior] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [tipTimedOut, setTipTimedOut] = useState(false);

  const [openedCabinets, setOpenedCabinets] = useState<Set<string>>(() => new Set());
  const opened = useRef(openedCabinets);
  opened.current = openedCabinets;
  /** Opens one cabinet and brings the camera to it, or closes it and takes the camera back. */
  const toggleOpening = useCallback((id: string) => {
    const existing = new Set(useDesignStore.getState().design.items.map((item) => item.id));
    const next = new Set([...opened.current].filter((entry) => existing.has(entry)));
    const ui = useUiStore.getState();
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
  const openable = useMemo(() => items.filter(canOpen), [items]);
  const allOpen = openable.length > 0 && openable.every((item) => openedCabinets.has(item.id));
  const toggleAll = () => {
    useUiStore.getState().setCabinetTool(null);
    setOpenedCabinets(allOpen ? new Set() : new Set(openable.map((item) => item.id)));
    if (allOpen) useUiStore.getState().returnCamera();
  };

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const startDrag = useCallback((id: string) => {
    stopCamera();
    const ui = useUiStore.getState();
    ui.select(id);
    ui.setMoveHintSeen();
    setHoveredId(null);
    setDraggingId(id);
  }, [stopCamera]);
  const endDrag = useCallback(() => setDraggingId(null), []);
  const [resizeBlocked, setResizeBlocked] = useState(false);
  const [resizeStatus, setResizeStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const readyResize = useCallback(() => setResizeStatus('ready'), []);
  const loadingResize = useCallback(() => setResizeStatus('loading'), []);
  const failedResize = useCallback(() => setResizeStatus('error'), []);
  const cancelResize = useCallback(() => { useUiStore.getState().setCabinetTool(null); setResizeBlocked(false); }, []);
  const [roomSelection, setRoomSelection] = useState<RoomObjectSelection | null>(null);
  const [roomObject, setRoomObject] = useState<THREE.Group | null>(null);
  const [roomMoving, setRoomMoving] = useState(false);
  const [roomMoveReady, setRoomMoveReady] = useState(false);
  const [roomBlocked, setRoomBlocked] = useState(false);
  const readyRoomMove = useCallback(() => setRoomMoveReady(true), []);
  const cancelRoomMove = useCallback(() => { setRoomMoving(false); setRoomMoveReady(false); setRoomBlocked(false); }, []);
  const selectRoomObject = useCallback((selection: RoomObjectSelection | null) => {
    setRoomMoving(false);
    setRoomMoveReady(false);
    setRoomBlocked(false);
    setRoomSelection(selection);
    setResizeBlocked(false);
    if (selection) useUiStore.getState().select(null);
  }, []);
  const closeTools = useCallback(() => {
    setToolsOpen(false);
    cancelRoomMove();
  }, [cancelRoomMove]);
  const roomOptions = [
    ...openings.map((opening, index) => ({ type: 'opening' as const, id: opening.id, name: `${text.room.opening(opening.kind)} ${openings.slice(0, index + 1).filter((entry) => entry.kind === opening.kind).length}` })),
    ...(room.features ?? []).map((feature, index) => ({ type: 'feature' as const, id: feature.id, name: `${text.engine.roomFeatures[feature.kind]} ${index + 1}` })),
  ];
  const activeRoomSelection = roomSelection && roomOptions.some((option) => option.type === roomSelection.type && option.id === roomSelection.id) ? roomSelection : null;
  const dragging = draggingId !== null;
  const selectedLocked = !!selected && previewLockedIds.includes(selected.id);
  const canResize = !!selected && cabinetTool === 'resize' && !selectedLocked && !roomMoving;
  const loadingMove = roomMoving && !roomMoveReady;
  const moveHint = roomMoving && activeRoomSelection
    ? activeRoomSelection.type === 'opening' ? text.view3d.moveOpeningHint : text.view3d.moveFeatureHint
    : '';
  const showTip = !moveHintSeen && !tipTimedOut && items.length > 0 && !selected && !activeRoomSelection && !toolsOpen;

  const materials = useMemo(() => createMaterials(style), [style]);
  const exposedUnits = useMemo(() => new Set(items.filter((item) => isWallMounted(item) && KIND_OPTIONS[item.kind].carcass && exposedCabinetUnderside(item, items)).map((item) => item.id)), [items]);
  const litUnits = useMemo(() => new Set([
    ...items.filter((item) => item.kind === 'glassWall' && exposedUnits.has(item.id)),
    ...items.filter((item) => item.kind === 'wall' && item.rotation === 0 && exposedUnits.has(item.id)),
    ...items.filter((item) => item.kind !== 'glassWall' && !(item.kind === 'wall' && item.rotation === 0) && exposedUnits.has(item.id)),
  ].slice(0, 4).map((item) => item.id)), [items, exposedUnits]);
  useEffect(() => () => disposeMaterials(materials), [materials]);
  useLayoutEffect(() => {
    useUiStore.getState().setPreviewLockedIds(items.filter((item) => interior || openedCabinets.has(item.id)).map((item) => item.id));
  }, [items, interior, openedCabinets]);
  useEffect(() => {
    if (!selectedId) useUiStore.getState().setCabinetTool(null);
    else selectRoomObject(null);
  }, [selectedId, selected?.kind, selectRoomObject]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.target instanceof HTMLElement && (event.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName))) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
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
    if (ui.selectedId === id) return;
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
  const toggleTool = (tool: 'move' | 'resize') => {
    const ui = useUiStore.getState();
    ui.setCabinetTool(ui.cabinetTool === tool ? null : tool);
    setResizeBlocked(false);
    if (tool === 'resize' && ui.selectedId && useUiStore.getState().cabinetTool === 'resize') ui.focusCamera(ui.selectedId);
  };
  const interiorButton = (
    <Button variant="outline" active={interior} onClick={() => { useUiStore.getState().setCabinetTool(null); setInterior((shown) => !shown); }}>
      <PanelsTopLeft className="size-4" />{text.view3d.interior}
    </Button>
  );
  const photoButton = (
    <Button variant="outline" active={referenceOpen} onClick={() => useUiStore.getState().setReferenceOpen(!referenceOpen)}>
      <Image className="size-4" />{text.references.toggle}
    </Button>
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-[#ebe8e3] lg:flex-row">
      {referenceOpen && <PhotoReferencePanel />}
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <div role="toolbar" aria-label={text.view3d.toolbar} data-testid="three-toolbar" className="studio-panel flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5 border-b px-3 py-2">
        <Button variant="outline" active={styleOpen} aria-label={text.style.style} title={text.style.style} onClick={() => setStyleOpen((open) => !open)}>
          <Palette className="size-4" />
          <span className={cn(compact && 'sr-only')}>{text.style.style}</span>
        </Button>
        <div role="group" aria-label={text.view3d.camera} className="flex rounded-lg border border-studio-line bg-studio-paper p-0.5 shadow-xs">
          {(['perspective', 'front', 'top'] as const).map((view) => <Button key={view} active={request.view === view && !request.focusId} onClick={() => useUiStore.getState().requestCamera(view)}>{text.view3d[view]}</Button>)}
        </div>
        {!compact && <Button variant="outline" aria-label={text.view3d.resetView} title={text.view3d.resetViewTitle} onClick={() => useUiStore.getState().requestCamera('perspective')}>
          <RotateCcw className="size-4" />
        </Button>}
        <Button variant="outline" active={allOpen} disabled={interior || openable.length === 0} aria-label={allOpen ? text.view3d.closeAll : text.view3d.openAll} title={allOpen ? text.view3d.closeAll : text.view3d.openAll} onClick={toggleAll}>
          {allOpen ? <DoorClosed className="size-4" /> : <DoorOpen className="size-4" />}
          <span className={cn(compact && 'sr-only')}>{allOpen ? text.view3d.closeAll : text.view3d.openAll}</span>
        </Button>
        {!compact && interiorButton}
        {!compact && photoButton}
        <div className="min-w-0 flex-1" />
        <Button data-testid="three-tools-toggle" aria-expanded={toolsOpen} aria-controls={toolsId} aria-label={text.view3d.tools} title={text.view3d.tools}
          active={toolsOpen} onClick={() => (toolsOpen ? closeTools() : setToolsOpen(true))}>
          <SlidersHorizontal className="size-4" />
          <span className={cn(compact && 'sr-only')}>{text.view3d.toolsShort}</span>
        </Button>
      </div>

      {activeRoomSelection && <div className="studio-panel shrink-0 border-b px-3 py-2">
        <RoomObjectTools key={`${activeRoomSelection.type}-${activeRoomSelection.id}`} selection={activeRoomSelection} compact={compact} moving={roomMoving} blocked={roomBlocked}
          onMove={() => { setRoomMoveReady(false); setRoomBlocked(false); setRoomMoving((active) => !active); }} onClose={() => selectRoomObject(null)} />
      </div>}

      {toolsOpen && <div id={toolsId} data-testid="three-tools" className="flex max-h-[35dvh] shrink-0 flex-col items-start gap-2 overflow-y-auto overscroll-contain border-b border-studio-line bg-[#f7f5f0] px-3 py-3">
        {(compact || roomOptions.length > 0) && <div className="flex max-w-full flex-wrap items-center gap-2">
          {compact && interiorButton}
          {compact && photoButton}
          {compact && <Button variant="outline" title={text.view3d.resetViewTitle} onClick={() => useUiStore.getState().requestCamera('perspective')}>
            <RotateCcw className="size-4" />{text.view3d.resetView}
          </Button>}
          {roomOptions.length > 0 && <select aria-label={text.view3d.roomObjects} value={activeRoomSelection ? `${activeRoomSelection.type}:${activeRoomSelection.id}` : ''}
            className="min-h-9 min-w-0 max-w-full rounded-lg border border-zinc-200 bg-white px-2 text-xs text-zinc-800 shadow-sm"
            onChange={(event) => {
              const option = roomOptions.find((option) => `${option.type}:${option.id}` === event.target.value);
              selectRoomObject(option ? { type: option.type, id: option.id } : null);
            }}>
            <option value="">{text.view3d.roomObjects}</option>
            {roomOptions.map((option) => <option key={`${option.type}:${option.id}`} value={`${option.type}:${option.id}`}>{option.name}</option>)}
          </select>}
        </div>}
        {!compact && selected && <SelectedCabinetTools key={selected.id} item={selected} locked={selectedLocked}
          invalid={invalid.has(selected.id)} onFocus={() => useUiStore.getState().focusCamera(selected.id)} />}
        {interior && <p className="max-w-xl text-xs leading-relaxed text-zinc-600">{text.view3d.interiorHint}</p>}
        {/* Closed by default: its text changes with the tool in use, and an open paragraph would resize the kitchen each time. */}
        <details className="text-xs text-zinc-600">
          <summary className="cursor-pointer py-1">{text.view3d.help}</summary>
          <p role={loadingMove ? 'status' : undefined} className="max-w-xl py-2 leading-relaxed">{roomMoving ? loadingMove ? text.view3d.loadingMove : moveHint : text.view3d.selectHint}</p>
        </details>
      </div>}

      <div className="relative min-h-0 flex-1 touch-none overflow-hidden" data-testid="three-viewport">
      <Canvas
        frameloop="demand"
        shadows={compact ? false : 'percentage'}
        dpr={[1, 2]}
        camera={{ fov: CAMERA_FOV, near: 0.05, far: 200 }}
        onCreated={({ camera, scene, gl }) => { if (import.meta.env.DEV) Object.assign(window, { __kitchen3D: { camera, scene, renderer: gl } }); }}
        onPointerMissed={(event) => {
          if (event.type === 'click' && !dragging && !roomMoving) {
            useUiStore.getState().select(null);
            selectRoomObject(null);
          }
        }}
      >
        <color attach="background" args={['#ebe8e3']} />
        <hemisphereLight args={[style.lighting ? '#fff6e8' : '#ffffff', '#cbc2b4', 0.75]} />
        <ambientLight intensity={0.15} />
        <Environment resolution={128} frames={1} environmentIntensity={0.55}>
          <color attach="background" args={['#d4d0c7']} />
          <Lightformer intensity={3} color="#fff5e7" position={[0, 5, -5]} rotation={[Math.PI / 4, 0, 0]} scale={[8, 6, 1]} />
          <Lightformer intensity={2} color="#ffffff" position={[-5, 2, 0]} rotation={[0, Math.PI / 2, 0]} scale={[6, 4, 1]} />
          <Lightformer intensity={1.5} color="#fffaf0" position={[5, 3, 2]} rotation={[0, -Math.PI / 2, 0]} scale={[5, 3, 1]} />
        </Environment>
        {style.lighting && <directionalLight position={[-3, 4, 1]} color="#fff4e2" intensity={0.45} />}
        <directionalLight
          position={[m(room.width) / 2 + 2.5, 5.5, m(room.depth) + 3]}
          intensity={1.35}
          castShadow={!compact}
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-left={-8}
          shadow-camera-right={8}
          shadow-camera-top={8}
          shadow-camera-bottom={-8}
          shadow-bias={-0.0004}
        />
        <Room3D room={room} openings={openings} items={items} materials={materials} selection={activeRoomSelection} onSelect={selectRoomObject} objectRef={setRoomObject} />
        {items.map((item) => (
          <Unit3D
            key={item.id}
            item={item}
            ctx={ctx}
            materials={materials}
            selected={item.id === selectedId}
            onSelect={select}
            accentLight={litUnits.has(item.id)}
            underLighting={exposedUnits.has(item.id)}
            invalid={invalid.has(item.id)}
            interior={interior}
            opened={openedCabinets.has(item.id)}
            onToggleOpening={!interior && canOpen(item) ? toggleOpening : undefined}
            hovered={item.id === hoveredId && !dragging}
            onHover={setHoveredId}
          />
        ))}
        <CabinetDragController onDragStart={startDrag} onDragEnd={endDrag} onSelect={select} />
        {selected && !roomMoving && <SelectionOverlay item={selected} overlay={handlesRef} />}
        {selected && dragging && <MoveClearances room={room} items={items} item={selected} />}
        {canResize && selected && <CabinetResizeTool key={selected.id} item={selected} overlay={resizeGripsRef} api={resizeApi} onStart={stopCamera}
          onLoading={loadingResize} onError={failedResize} onReady={readyResize} onCancel={cancelResize} onBlocked={setResizeBlocked} />}
        {roomMoving && activeRoomSelection && roomObject?.name === `room-${activeRoomSelection.type}-${activeRoomSelection.id}` && <Suspense fallback={null}>
          <RoomObjectTransform key={`${activeRoomSelection.type}-${activeRoomSelection.id}`} selection={activeRoomSelection} object={roomObject} onReady={readyRoomMove} onCancel={cancelRoomMove} onBlocked={setRoomBlocked} />
        </Suspense>}
        <OrbitControls
          ref={controls}
          makeDefault
          enableDamping
          maxPolarAngle={Math.PI / 2 - 0.04}
          minDistance={0.6}
          maxDistance={30}
        />
        <CameraRig request={request} comparison={referenceOpen} controls={controls} />
      </Canvas>

      {canResize && selected && <>
        {resizeStatus !== 'error' && <CabinetResizeGrips item={selected} overlay={resizeGripsRef} api={resizeApi} />}
        {resizeStatus !== 'ready' && <ResizeFeedback failed={resizeStatus === 'error'} />}
      </>}

      {selected && !roomMoving && <div ref={handlesRef} data-testid="cabinet-tools" className="studio-panel absolute left-0 top-0 z-10 flex items-center gap-1 rounded-2xl border p-1 shadow-[0_6px_24px_#332f2826]" style={{ visibility: 'hidden' }}>
        <Button disabled={selectedLocked} active={cabinetTool === 'move'} aria-pressed={cabinetTool === 'move'} aria-label={text.view3d.move} title={selectedLocked ? text.view3d.previewLocked : text.view3d.moveModeHint}
          onClick={() => toggleTool('move')} className="h-11 min-w-11 rounded-xl px-2">
          <Hand className="size-5" aria-hidden="true" />
          <span className={cn('text-[13px] font-semibold', compact && 'sr-only')}>{text.view3d.moveShort}</span>
        </Button>
        <Button disabled={selectedLocked} active={cabinetTool === 'resize'} aria-pressed={cabinetTool === 'resize'} aria-label={text.view3d.resize} title={selectedLocked ? text.view3d.previewLocked : text.view3d.resizeModeHint}
          onClick={() => toggleTool('resize')} className="h-11 min-w-11 rounded-xl px-2">
          <Ruler className="size-5" aria-hidden="true" /><span className={cn('text-[13px] font-semibold', compact && 'sr-only')}>{text.view3d.resizeShort}</span>
        </Button>
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
        {selectedLocked ? text.view3d.previewLocked : cabinetTool === 'move' ? text.view3d.moveModeHint : text.view3d.resizeModeHint}
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

function SelectedCabinetTools({ item, locked, invalid, onFocus }: {
  item: KitchenItem; locked: boolean; invalid: boolean; onFocus: () => void;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  return (
    <div className="pointer-events-auto max-w-full space-y-1">
      <div role="group" aria-label={t.view3d.selectedActions} className="flex max-w-full flex-wrap items-center gap-1 rounded-lg border border-zinc-200 bg-white p-1 shadow-sm">
        <span className="px-2 text-xs font-semibold text-zinc-800">{item.label}</span>
        <div className="flex items-center gap-1">
          <Button disabled={locked} aria-label={t.view3d.rotateSelected} title={t.view3d.rotateSelected} onClick={() => rotateSelected(1)}><RotateCw className="size-4" /></Button>
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
