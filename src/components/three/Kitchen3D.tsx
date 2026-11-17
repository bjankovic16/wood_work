import { Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Copy, DoorClosed, DoorOpen, Hand, Image, Move, Palette, PanelsTopLeft, Pencil, RotateCcw, RotateCw, Ruler, Scan, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ComponentRef, type RefObject } from 'react';
import * as THREE from 'three';
import { isWallMounted } from '../../domain/geometry';
import { sizeLimits, type SizeField } from '../../domain/catalog';
import { blendPoses, CAMERA_FOV, kitchenCameraPose, type CameraPose, type CameraView } from '../../domain/camera';
import { screenPlanAxes } from '../../domain/drag3d';
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
import { CabinetDragController, type CabinetDragApi } from './CabinetDrag';
import { CabinetMoveControls } from './CabinetMoveControls';
import { MoveClearances, SelectionOverlay } from './SelectionOverlay';
import { StylePicker } from './StylePicker';
import { Unit3D } from './Unit3D';
import { PhotoReferencePanel } from '../references/PhotoReferences';
import { ItemFields } from '../properties/ItemPanel';
import { StackAboveButton } from '../properties/StackAboveButton';
import { exposedCabinetUnderside, inUpperRow, upperCabinetRows } from '../../domain/upperCabinets';

interface CameraRequest { view: CameraView; focusId?: string; back: boolean; token: number }
const CabinetTransform = lazy(() => import('./CabinetTransform').then((module) => ({ default: module.CabinetTransform })));
const RoomObjectTransform = lazy(() => import('./RoomObjectTransform').then((module) => ({ default: module.RoomObjectTransform })));
const CabinetResize = lazy(() => import('./CabinetResize').then((module) => ({ default: module.CabinetResize })));

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

/** Tells the rest of the interface which room directions the screen's arrows stand for. */
function ViewAxes() {
  const camera = useThree((s) => s.camera);
  const last = useRef('');
  useFrame(() => {
    const forward = camera.getWorldDirection(new THREE.Vector3());
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const axes = screenPlanAxes([forward.x, forward.y, forward.z], [up.x, up.y, up.z]);
    const key = `${axes.right}|${axes.up}`;
    if (key === last.current) return;
    last.current = key;
    useUiStore.getState().setViewAxes(axes);
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
  const precisionMove = useUiStore((s) => s.precisionMove);
  const moveHintSeen = useUiStore((s) => s.moveHintSeen);
  const togglePrecisionMove = useCallback(() => {
    const ui = useUiStore.getState();
    ui.setPrecisionMove(!ui.precisionMove);
  }, []);
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
  const dragApi = useRef<CabinetDragApi>(null);
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
    setOpenedCabinets(allOpen ? new Set() : new Set(openable.map((item) => item.id)));
    if (allOpen) useUiStore.getState().returnCamera();
  };

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const startDrag = useCallback((id: string) => {
    const ui = useUiStore.getState();
    ui.select(id);
    ui.setMoveHintSeen();
    setHoveredId(null);
    setDraggingId(id);
  }, []);
  const endDrag = useCallback(() => setDraggingId(null), []);
  const [moveMode, setMoveMode] = useState(false);
  const [moveReady, setMoveReady] = useState(false);
  const readyMove = useCallback(() => setMoveReady(true), []);
  const cancelMove = useCallback(() => { setMoveMode(false); setMoveReady(false); }, []);
  const [resizeMode, setResizeMode] = useState(false);
  const [resizeField, setResizeField] = useState<SizeField>('width');
  const [resizeReady, setResizeReady] = useState(false);
  const [resizeBlocked, setResizeBlocked] = useState(false);
  const readyResize = useCallback(() => setResizeReady(true), []);
  const cancelResize = useCallback(() => { setResizeMode(false); setResizeReady(false); setResizeBlocked(false); }, []);
  const [selectedObject, setSelectedObject] = useState<THREE.Group | null>(null);
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
    setMoveMode(false);
    setResizeMode(false);
    setResizeBlocked(false);
    setResizeField('width');
    if (selection) useUiStore.getState().select(null);
  }, []);
  const closeTools = useCallback(() => {
    setToolsOpen(false);
    cancelMove();
    cancelResize();
    cancelRoomMove();
  }, [cancelMove, cancelResize, cancelRoomMove]);
  const roomOptions = [
    ...openings.map((opening, index) => ({ type: 'opening' as const, id: opening.id, name: `${text.room.opening(opening.kind)} ${openings.slice(0, index + 1).filter((entry) => entry.kind === opening.kind).length}` })),
    ...(room.features ?? []).map((feature, index) => ({ type: 'feature' as const, id: feature.id, name: `${text.engine.roomFeatures[feature.kind]} ${index + 1}` })),
  ];
  const activeRoomSelection = roomSelection && roomOptions.some((option) => option.type === roomSelection.type && option.id === roomSelection.id) ? roomSelection : null;
  const dragging = draggingId !== null;
  const directResize = !!selected && !toolsOpen && !dragging && !moveMode && !roomMoving && !precisionMove;
  const moving = !!((moveMode || resizeMode) && selected || roomMoving && activeRoomSelection);
  const loadingMove = moving && (roomMoving ? !roomMoveReady : resizeMode ? !resizeReady : !moveReady);
  const moveHint = resizeMode ? compact ? text.view3d.resizeTouchHint : text.view3d.resizeHint : roomMoving && activeRoomSelection
    ? activeRoomSelection.type === 'opening' ? text.view3d.moveOpeningHint : text.view3d.moveFeatureHint
    : text.view3d.moveHint;
  const showTip = !moveHintSeen && !tipTimedOut && items.length > 0 && !selected && !activeRoomSelection && !toolsOpen;

  const materials = useMemo(() => createMaterials(style), [style]);
  const exposedUnits = useMemo(() => new Set(items.filter((item) => isWallMounted(item) && KIND_OPTIONS[item.kind].carcass && exposedCabinetUnderside(item, items)).map((item) => item.id)), [items]);
  const litUnits = useMemo(() => new Set([
    ...items.filter((item) => item.kind === 'glassWall' && exposedUnits.has(item.id)),
    ...items.filter((item) => item.kind === 'wall' && item.rotation === 0 && exposedUnits.has(item.id)),
    ...items.filter((item) => item.kind !== 'glassWall' && !(item.kind === 'wall' && item.rotation === 0) && exposedUnits.has(item.id)),
  ].slice(0, 4).map((item) => item.id)), [items, exposedUnits]);
  useEffect(() => () => disposeMaterials(materials), [materials]);
  useEffect(() => {
    if (!selectedId) { setMoveMode(false); setMoveReady(false); }
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
  const interiorButton = (
    <Button variant="outline" active={interior} onClick={() => setInterior((shown) => !shown)}>
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
        {!compact && selected && <SelectedCabinetTools key={selected.id} item={selected} compact={compact} moving={moveMode} resizing={resizeMode} resizeField={resizeField} resizeBlocked={resizeBlocked}
          onResizeField={(field) => { if (field !== resizeField) { setResizeReady(false); setResizeBlocked(false); setResizeField(field); } }}
          onResize={() => { setMoveMode(false); setResizeReady(false); setResizeBlocked(false); setResizeMode((active) => !active); }}
          invalid={invalid.has(selected.id)} onMove={() => { cancelResize(); setMoveReady(false); setMoveMode((active) => !active); }} onFocus={() => useUiStore.getState().focusCamera(selected.id)} />}
        {interior && <p className="max-w-xl text-xs leading-relaxed text-zinc-600">{text.view3d.interiorHint}</p>}
        <p role={loadingMove ? 'status' : undefined} className="max-w-xl text-xs leading-relaxed text-zinc-600">{moving ? loadingMove ? text.view3d.loadingMove : moveHint : text.view3d.selectHint}</p>
      </div>}

      <div className="relative min-h-0 flex-1 touch-none overflow-hidden" data-testid="three-viewport">
      <Canvas
        frameloop="demand"
        shadows={compact ? false : 'percentage'}
        dpr={[1, 2]}
        camera={{ fov: CAMERA_FOV, near: 0.05, far: 200 }}
        onCreated={({ camera, scene, gl }) => { if (import.meta.env.DEV) Object.assign(window, { __kitchen3D: { camera, scene, renderer: gl } }); }}
        onPointerMissed={(event) => {
          if (event.type === 'click' && !moveMode && !resizeMode && !roomMoving) {
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
            objectRef={item.id === selectedId ? setSelectedObject : undefined}
            interior={interior}
            opened={openedCabinets.has(item.id)}
            onToggleOpening={!interior && canOpen(item) ? toggleOpening : undefined}
            hovered={item.id === hoveredId && !dragging}
            onHover={setHoveredId}
          />
        ))}
        <CabinetDragController api={dragApi} onDragStart={startDrag} onDragEnd={endDrag} onSelect={select} onHandleClick={togglePrecisionMove} />
        {selected && !moveMode && !resizeMode && !roomMoving && <SelectionOverlay item={selected} overlay={handlesRef} />}
        {selected && (dragging || precisionMove) && <MoveClearances room={room} items={items} item={selected} />}
        {moveMode && selected && selectedObject?.name === selected.id && <Suspense fallback={null}><CabinetTransform key={selected.id} item={selected} object={selectedObject} onReady={readyMove} onCancel={cancelMove} /></Suspense>}
        {(resizeMode || directResize) && selected && <Suspense fallback={null}>
          <CabinetResize key={`${selected.id}-${resizeField}-${directResize}`} item={selected} field={resizeField} allAxes={directResize} onReady={readyResize} onCancel={cancelResize} onBlocked={setResizeBlocked} />
        </Suspense>}
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
        <ViewAxes />
      </Canvas>

      {selected && !moveMode && !resizeMode && !roomMoving && <div ref={handlesRef} className="studio-panel absolute left-0 top-0 z-10 flex items-center gap-1 rounded-2xl border p-1 shadow-[0_6px_24px_#332f2826]" style={{ visibility: 'hidden' }}>
        <button type="button" aria-label={text.view3d.dragHandle} title={text.view3d.dragHandle}
          aria-expanded={precisionMove} onPointerDown={(event) => dragApi.current?.beginFromHandle(event.nativeEvent, event.currentTarget)}
          onClick={(event) => { if (event.detail === 0) togglePrecisionMove(); }}
          className="flex h-11 touch-none cursor-grab items-center justify-center gap-2 rounded-xl bg-studio-accent px-3 text-white shadow-sm transition-colors hover:bg-[#40533d] active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-studio-accent">
          <Hand className="size-5" aria-hidden="true" />
          <span className="text-[13px] font-semibold">{text.view3d.moveShort}</span>
        </button>
        {!interior && canOpen(selected) && <button type="button"
          aria-label={selectedOpen ? text.view3d.closeCabinet : text.view3d.openCabinet}
          title={selectedOpen ? text.view3d.closeCabinet : text.view3d.openCabinet}
          aria-pressed={selectedOpen} onClick={() => toggleOpening(selected.id)}
          className="flex h-11 touch-manipulation items-center justify-center gap-2 rounded-xl px-3 text-studio-ink transition-colors hover:bg-[#ece8df] aria-pressed:bg-[#e6ecdf] aria-pressed:text-[#3e5539] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-studio-accent">
          {selectedOpen ? <DoorClosed className="size-5" aria-hidden="true" /> : <DoorOpen className="size-5" aria-hidden="true" />}
          <span className="text-[13px] font-semibold">{selectedOpen ? text.view3d.closeShort : text.view3d.openShort}</span>
        </button>}
      </div>}

      {showTip && <p role="status" className="pointer-events-none absolute inset-x-3 top-3 z-10 mx-auto w-fit max-w-full rounded-full bg-studio-ink/85 px-4 py-2 text-center text-xs font-medium leading-snug text-white shadow-lg backdrop-blur-sm">
        {compact ? text.view3d.tipTouch : text.view3d.tipMouse}
      </p>}

      {resizeBlocked && !(toolsOpen && !compact) && <p role="status" className="pointer-events-none absolute inset-x-3 bottom-20 z-10 mx-auto w-fit max-w-sm rounded-xl bg-amber-50 px-3 py-2 text-center text-xs leading-snug text-amber-900 shadow-lg ring-1 ring-amber-200">
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

      {!compact && selected && precisionMove && <div className="studio-panel absolute bottom-4 left-1/2 z-10 w-80 max-w-[calc(100%-24px)] -translate-x-1/2 overflow-hidden rounded-2xl border shadow-xl">
        <CabinetMoveControls key={selected.id} />
      </div>}
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

function SelectedCabinetTools({ item, compact, moving, resizing, resizeField, resizeBlocked, invalid, onMove, onResize, onResizeField, onFocus }: {
  item: KitchenItem; compact: boolean; moving: boolean; resizing: boolean; resizeField: SizeField; resizeBlocked: boolean;
  invalid: boolean; onMove: () => void; onResize: () => void; onResizeField: (field: SizeField) => void; onFocus: () => void;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const limits = sizeLimits(item, resizeField);
  return (
    <div className="pointer-events-auto max-w-full space-y-1">
      <div role="group" aria-label={t.view3d.selectedActions} className="flex max-w-full flex-wrap items-center gap-1 rounded-lg border border-zinc-200 bg-white p-1 shadow-sm">
        <span className="px-2 text-xs font-semibold text-zinc-800">{item.label}</span>
        <Button active={moving} aria-pressed={moving} aria-label={t.view3d.move} title={t.view3d.move} className={compact ? 'min-h-11' : undefined} onClick={onMove}><Move className="size-4" />{t.view3d.moveShort}</Button>
        <Button active={resizing} aria-pressed={resizing} aria-label={t.view3d.resize} title={t.view3d.resize} className={compact ? 'min-h-11' : undefined} onClick={onResize}><Ruler className="size-4" />{t.view3d.resizeShort}</Button>
        {(!compact || !resizing) && <div className={`flex items-center gap-1 ${compact ? 'basis-full border-t border-zinc-100 pt-1 [&>button]:min-h-11 [&>button]:min-w-11' : ''}`}>
          <Button aria-label={t.view3d.rotateSelected} title={t.view3d.rotateSelected} onClick={() => rotateSelected(1)}><RotateCw className="size-4" /></Button>
          <Button aria-label={t.view3d.focusSelection} title={t.view3d.focusSelection} onClick={onFocus}><Scan className="size-4" /></Button>
          <Button aria-label={t.view3d.copySelected} title={t.view3d.copySelected} onClick={duplicateSelected}><Copy className="size-4" /></Button>
          <StackAboveButton key={item.id} item={item} iconOnly />
          <Button aria-label={t.view3d.editSelected} title={t.view3d.editSelected} onClick={() => setEditing(true)}><Pencil className="size-4" /></Button>
          <Button aria-label={t.view3d.deleteSelected} title={t.view3d.deleteSelected} onClick={deleteSelected}><Trash2 className="size-4" /></Button>
        </div>}
      </div>
      {resizing && <div className="max-w-sm rounded-lg border border-zinc-200 bg-white p-2 shadow-sm">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="px-1 text-xs font-medium text-zinc-700">{t.view3d.resizeChoose}</p>
          {compact && <Button className="min-h-11 shrink-0" variant="outline" onClick={onResize}>{t.common.done}</Button>}
        </div>
        <div role="group" aria-label={t.view3d.resizeChoose} className="flex flex-wrap gap-1">
          {(['width', 'height', 'depth', ...(item.kind === 'corner' ? ['width2'] as const : [])] as const).map((field) => {
            const label = field === 'width2' ? t.item.widthWallB : field === 'width' && item.kind === 'corner' ? t.item.widthWallA : t.item[field];
            const limits = sizeLimits(item, field);
            return <Button key={field} active={resizeField === field} aria-pressed={resizeField === field} title={`${label}: ${limits.min}-${limits.max} mm`} onClick={() => onResizeField(field)}
              className="min-h-11 flex-col gap-0.5 px-3 py-1">
              <span className="text-[11px]">{label}</span>
              <span className="font-semibold tabular-nums">{t.mm(field === 'width2' ? item.width2 ?? item.width : item[field])} mm</span>
            </Button>;
          })}
        </div>
        <p className="mt-1 px-1 text-[11px] tabular-nums text-zinc-500">{t.view3d.resizeRange}: {t.mm(limits.min)}–{t.mm(limits.max)} mm</p>
        {!compact && <>
          <p className="mt-2 px-1 text-xs leading-relaxed text-zinc-600">{t.view3d.resizeGuidance}</p>
          <Button className="mt-2 w-full" variant="outline" onClick={onResize}>{t.common.done}</Button>
        </>}
      </div>}
      {resizeBlocked && <p role="status" className="max-w-sm rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">{t.view3d.resizeBlocked}</p>}
      {invalid && <p role="status" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">{t.view3d.invalidSelection}</p>}
      <Dialog open={editing} title={`${t.kinds[item.kind]} ${item.label}`} sheet={compact} onClose={() => setEditing(false)} footer={<Button variant="primary" onClick={() => setEditing(false)}>{t.common.done}</Button>}>
        <ItemFields item={item} />
      </Dialog>
    </div>
  );
}
