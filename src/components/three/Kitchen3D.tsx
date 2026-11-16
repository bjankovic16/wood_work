import { Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { Copy, DoorClosed, DoorOpen, Hand, Image, Move, Palette, Pencil, RotateCcw, RotateCw, Ruler, Scan, Trash2, X } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentRef, type RefObject } from 'react';
import type * as THREE from 'three';
import { isWallMounted } from '../../domain/geometry';
import { sizeLimits, type SizeField } from '../../domain/catalog';
import { CAMERA_FOV, kitchenCameraPose, type CameraView } from '../../domain/camera';
import { KIND_OPTIONS } from '../../engine/config';
import type { KitchenItem } from '../../domain/types';
import type { RoomObjectSelection } from '../../domain/roomObjectPlacement';
import { useT } from '../../i18n';
import { useDesignStore } from '../../store/designStore';
import { useBuildContext, useIssues } from '../../store/derived';
import { deleteSelected, duplicateSelected, rotateSelected } from '../../store/actions';
import { useUiStore } from '../../store/uiStore';
import { Button, Dialog } from '../ui';
import { createMaterials, disposeMaterials, m } from './materials';
import { Room3D } from './Room3D';
import { RoomObjectTools } from './RoomObjectTools';
import { DirectCabinetDrag } from './DirectCabinetDrag';
import { CabinetMoveControls } from './CabinetMoveControls';
import { StylePicker } from './StylePicker';
import { Unit3D } from './Unit3D';
import { PhotoReferencePanel } from '../references/PhotoReferences';
import { ItemFields } from '../properties/ItemPanel';
import { StackAboveButton } from '../properties/StackAboveButton';
import { exposedCabinetUnderside, inUpperRow, upperCabinetRows } from '../../domain/upperCabinets';

interface CameraRequest { view: CameraView; focusId?: string; token: number }
const CabinetTransform = lazy(() => import('./CabinetTransform').then((module) => ({ default: module.CabinetTransform })));
const RoomObjectTransform = lazy(() => import('./RoomObjectTransform').then((module) => ({ default: module.RoomObjectTransform })));
const CabinetResize = lazy(() => import('./CabinetResize').then((module) => ({ default: module.CabinetResize })));

/** Puts the camera at the starting view when the room changes size or the viewer asks for it. */
function CameraRig({ request, comparison, controls }: { request: CameraRequest; comparison: boolean; controls: RefObject<ComponentRef<typeof OrbitControls> | null> }) {
  const room = useDesignStore((s) => s.design.room);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const invalidate = useThree((state) => state.invalidate);

  useLayoutEffect(() => {
    const items = useDesignStore.getState().design.items;
    const home = kitchenCameraPose(room, items, size.width / Math.max(1, size.height), request.view, items.find((item) => item.id === request.focusId));
    camera.position.set(...home.position);
    const c = controls.current;
    if (c) {
      c.target.set(...home.target);
      c.update();
    } else {
      camera.lookAt(...home.target);
    }
    invalidate();
  }, [room.width, room.depth, room.height, request, comparison, camera, controls, invalidate, size.width, size.height]);
  return null;
}

/**
 * The kitchen in 3D: walls facing the camera are hidden, units can be
 * clicked to select them, and fronts, worktop and handles can be restyled.
 */
export default function Kitchen3D({ compact = false }: { compact?: boolean }) {
  const text = useT();
  const room = useDesignStore((s) => s.design.room);
  const items = useDesignStore((s) => s.design.items);
  const openings = useDesignStore((s) => s.design.openings);
  const ctx = useBuildContext();
  const style = useDesignStore((s) => s.design.style);
  const selectedId = useUiStore((s) => s.selectedId);
  const precisionMove = useUiStore((s) => s.precisionMove);
  const togglePrecisionMove = useCallback(() => {
    const ui = useUiStore.getState();
    ui.setPrecisionMove(!ui.precisionMove);
  }, []);
  const referenceOpen = useUiStore((state) => state.referenceOpen);
  const cameraView = useUiStore((state) => state.cameraView);
  const cameraFocusId = useUiStore((state) => state.cameraFocusId);
  const cameraToken = useUiStore((state) => state.cameraToken);
  const request = useMemo<CameraRequest>(() => ({ view: cameraView, focusId: cameraFocusId ?? undefined, token: cameraToken }), [cameraView, cameraFocusId, cameraToken]);
  const issues = useIssues();
  const invalid = useMemo(() => new Set(issues.filter((issue) => issue.severity === 'error').flatMap((issue) => issue.itemIds)), [issues]);
  const selected = items.find((item) => item.id === selectedId);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const handRef = useRef<HTMLButtonElement>(null);
  const handlesRef = useRef<HTMLDivElement>(null);
  const [styleOpen, setStyleOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [interior, setInterior] = useState(false);
  const [openedCabinets, setOpenedCabinets] = useState<Set<string>>(() => new Set());
  const toggleOpening = (id: string) => {
    if (!openedCabinets.has(id)) useUiStore.getState().requestCamera('perspective', id);
    setOpenedCabinets((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const [directDragging, setDirectDragging] = useState(false);
  const startDirectDrag = useCallback((id: string) => {
    useUiStore.getState().select(id);
    setDirectDragging(true);
  }, []);
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
  const roomOptions = [
    ...openings.map((opening, index) => ({ type: 'opening' as const, id: opening.id, name: `${text.room.opening(opening.kind)} ${openings.slice(0, index + 1).filter((entry) => entry.kind === opening.kind).length}` })),
    ...(room.features ?? []).map((feature, index) => ({ type: 'feature' as const, id: feature.id, name: `${text.engine.roomFeatures[feature.kind]} ${index + 1}` })),
  ];
  const activeRoomSelection = roomSelection && roomOptions.some((option) => option.type === roomSelection.type && option.id === roomSelection.id) ? roomSelection : null;
  const directResize = !!selected && !toolsOpen && !directDragging && !moveMode && !roomMoving;
  const moving = !!((moveMode || resizeMode) && selected || roomMoving && activeRoomSelection);
  const loadingMove = moving && (roomMoving ? !roomMoveReady : resizeMode ? !resizeReady : !moveReady);
  const moveHint = resizeMode ? compact ? text.view3d.resizeTouchHint : text.view3d.resizeHint : roomMoving && activeRoomSelection
    ? activeRoomSelection.type === 'opening' ? text.view3d.moveOpeningHint : text.view3d.moveFeatureHint
    : text.view3d.moveHint;

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
  useEffect(() => useDesignStore.subscribe((state) => {
    if (!state.gestureBase) setDirectDragging(false);
  }), []);

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

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-[#ebe8e3] lg:flex-row">
      {referenceOpen && <PhotoReferencePanel />}
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
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
          <DirectCabinetDrag key={item.id} item={item} onStart={startDirectDrag} onSelect={select} onHandleClick={togglePrecisionMove}
            handleRef={item.id === selectedId ? handRef : undefined} overlayRef={item.id === selectedId ? handlesRef : undefined}>
          <Unit3D
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
            onToggleOpening={!interior && KIND_OPTIONS[item.kind].carcass && KIND_OPTIONS[item.kind].fronts ? () => toggleOpening(item.id) : undefined}
          />
          </DirectCabinetDrag>
        ))}
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
      </Canvas>
      {selected && !moveMode && !resizeMode && !roomMoving && <div ref={handlesRef} className="absolute left-0 top-0 flex items-center gap-2 rounded-2xl border border-white/80 bg-white/95 p-1.5 shadow-lg backdrop-blur-sm" style={{ visibility: 'hidden' }}>
        <button ref={handRef} type="button" aria-label={text.view3d.dragHandle} title={text.view3d.dragHandle}
          aria-expanded={precisionMove} onClick={(event) => { if (event.detail === 0) togglePrecisionMove(); }}
          className="group flex h-12 touch-none cursor-grab items-center justify-center gap-2 rounded-xl bg-studio-accent px-3 text-white shadow-sm transition-colors hover:bg-studio-accent/90 active:cursor-grabbing active:bg-studio-accent/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-studio-accent">
          <Hand className="size-7 stroke-[1.75]" aria-hidden="true" />
          <span className="text-xs font-semibold">{text.view3d.moveShort}</span>
        </button>
        {!interior && KIND_OPTIONS[selected.kind].carcass && KIND_OPTIONS[selected.kind].fronts && <button type="button"
          aria-label={openedCabinets.has(selected.id) ? text.view3d.closeCabinet : text.view3d.openCabinet}
          title={openedCabinets.has(selected.id) ? text.view3d.closeCabinet : text.view3d.openCabinet}
          aria-pressed={openedCabinets.has(selected.id)} onClick={() => toggleOpening(selected.id)}
          className="flex size-12 touch-none items-center justify-center rounded-xl text-studio-accent transition-colors hover:bg-studio-accent/10 aria-pressed:bg-studio-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-studio-accent">
          {openedCabinets.has(selected.id) ? <DoorClosed className="size-6" aria-hidden="true" /> : <DoorOpen className="size-6" aria-hidden="true" />}
        </button>}
      </div>}
      </div>

      <details data-testid="three-tools" className="order-first shrink-0 border-b border-zinc-200 bg-[#f7f5f0]"
        onToggle={(event) => {
          setToolsOpen(event.currentTarget.open);
          if (!event.currentTarget.open) { cancelMove(); cancelResize(); cancelRoomMove(); }
        }}>
        <summary className="min-h-11 cursor-pointer px-4 py-3 text-xs font-medium text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-studio-accent">
          {text.view3d.tools}
          {interior && <span className="ml-2 text-studio-accent">{text.view3d.interior}</span>}
          {resizeBlocked && <span role="status" className="ml-2 text-amber-800">{text.view3d.roomObjectChecks}</span>}
        </summary>
      <div className="flex max-h-[35dvh] flex-col items-start gap-2 overflow-y-auto overscroll-contain px-3 pb-3">
        <div className="flex max-w-full flex-wrap items-center gap-2">
          <Button variant="outline" active={styleOpen} className="pointer-events-auto shadow-sm" onClick={() => setStyleOpen((open) => !open)}>
            <Palette className="size-4" />
            {text.style.style}
          </Button>
          <Button variant="outline" active={interior} aria-pressed={interior} onClick={() => setInterior((shown) => !shown)}>{text.view3d.interior}</Button>
          <Button variant="outline" className="pointer-events-auto" active={referenceOpen} onClick={() => useUiStore.getState().setReferenceOpen(!referenceOpen)}><Image className="size-4" />{text.references.toggle}</Button>
          <div role="group" aria-label={text.view3d.camera} className="pointer-events-auto flex rounded-lg border border-zinc-200 bg-white p-0.5 shadow-sm">
            {(['perspective', 'front', 'top'] as const).map((view) => <Button key={view} active={request.view === view && !request.focusId} onClick={() => useUiStore.getState().requestCamera(view)}>{text.view3d[view]}</Button>)}
          </div>
          <Button variant="outline" className="pointer-events-auto" aria-label={text.view3d.resetView} title={text.view3d.resetViewTitle} onClick={() => useUiStore.getState().requestCamera('perspective')}><RotateCcw className="size-4" /><span className="hidden sm:inline">{text.view3d.resetView}</span></Button>
          {roomOptions.length > 0 && <select aria-label={text.view3d.roomObjects} value={activeRoomSelection ? `${activeRoomSelection.type}:${activeRoomSelection.id}` : ''}
            className="pointer-events-auto min-h-9 min-w-0 max-w-full rounded-lg border border-zinc-200 bg-white px-2 text-xs text-zinc-800 shadow-sm"
            onChange={(event) => {
              const option = roomOptions.find((option) => `${option.type}:${option.id}` === event.target.value);
              selectRoomObject(option ? { type: option.type, id: option.id } : null);
            }}>
            <option value="">{text.view3d.roomObjects}</option>
            {roomOptions.map((option) => <option key={`${option.type}:${option.id}`} value={`${option.type}:${option.id}`}>{option.name}</option>)}
          </select>}
        </div>
        {!compact && selected && <SelectedCabinetTools key={selected.id} item={selected} compact={compact} moving={moveMode} resizing={resizeMode} resizeField={resizeField} resizeBlocked={resizeBlocked}
          onResizeField={(field) => { if (field !== resizeField) { setResizeReady(false); setResizeBlocked(false); setResizeField(field); } }}
          onResize={() => { setMoveMode(false); setResizeReady(false); setResizeBlocked(false); setResizeMode((active) => !active); }}
          invalid={invalid.has(selected.id)} onMove={() => { cancelResize(); setMoveReady(false); setMoveMode((active) => !active); }} onFocus={() => useUiStore.getState().requestCamera('perspective', selected.id)} />}
        {activeRoomSelection && <RoomObjectTools key={`${activeRoomSelection.type}-${activeRoomSelection.id}`} selection={activeRoomSelection} compact={compact} moving={roomMoving} blocked={roomBlocked}
          onMove={() => { setRoomMoveReady(false); setRoomBlocked(false); setRoomMoving((active) => !active); }} onClose={() => selectRoomObject(null)} />}
        {!compact && styleOpen && (
          <div className="pointer-events-auto max-h-[60dvh] w-64 max-w-full overflow-y-auto rounded-xl border border-zinc-200 bg-white p-3 shadow-lg">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{text.style.style}</span>
              <Button aria-label={text.style.hide} className="-my-1 -mr-1 h-6 min-w-6 px-1" onClick={() => setStyleOpen(false)}>
                <X className="size-3.5" />
              </Button>
            </div>
            <StylePicker />
          </div>
        )}
      </div>
      {interior && <p className="px-3 pb-3 text-xs leading-relaxed text-zinc-600">{text.view3d.interiorHint}</p>}

      <details className="px-3 pb-3 text-xs text-zinc-600">
        <summary className="cursor-pointer py-1">{text.view3d.help}</summary>
        <p role={loadingMove ? 'status' : undefined} className="max-w-xl py-2 leading-relaxed">{moving ? loadingMove ? text.view3d.loadingMove : moveHint : text.view3d.selectHint}</p>
      </details>
      </details>
      {!compact && selected && precisionMove && <CabinetMoveControls key={selected.id} />}

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
