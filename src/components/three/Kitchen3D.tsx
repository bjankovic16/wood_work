import { Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { Copy, Image, Move, Palette, Pencil, RotateCcw, RotateCw, Scan, Trash2, X } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentRef, type RefObject } from 'react';
import type * as THREE from 'three';
import { isWallMounted } from '../../domain/geometry';
import { CAMERA_FOV, kitchenCameraPose, type CameraView } from '../../domain/camera';
import { KIND_OPTIONS } from '../../engine/config';
import type { KitchenItem } from '../../domain/types';
import { useT } from '../../i18n';
import { useDesignStore } from '../../store/designStore';
import { useBuildContext, useIssues } from '../../store/derived';
import { deleteSelected, duplicateSelected, rotateSelected } from '../../store/actions';
import { useUiStore } from '../../store/uiStore';
import { Button, Dialog } from '../ui';
import { createMaterials, disposeMaterials, m } from './materials';
import { Room3D } from './Room3D';
import { StylePicker } from './StylePicker';
import { Unit3D } from './Unit3D';
import { PhotoReferencePanel } from '../references/PhotoReferences';
import { ItemFields } from '../properties/ItemPanel';
import { StackAboveButton } from '../properties/StackAboveButton';
import { exposedCabinetUnderside, inUpperRow, upperCabinetRows } from '../../domain/upperCabinets';

interface CameraRequest { view: CameraView; focusId?: string; token: number }
const CabinetTransform = lazy(() => import('./CabinetTransform').then((module) => ({ default: module.CabinetTransform })));

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
  }, [room, request, comparison, camera, controls, invalidate, size.width, size.height]);
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
  const referenceOpen = useUiStore((state) => state.referenceOpen);
  const cameraView = useUiStore((state) => state.cameraView);
  const cameraFocusId = useUiStore((state) => state.cameraFocusId);
  const cameraToken = useUiStore((state) => state.cameraToken);
  const request = useMemo<CameraRequest>(() => ({ view: cameraView, focusId: cameraFocusId ?? undefined, token: cameraToken }), [cameraView, cameraFocusId, cameraToken]);
  const issues = useIssues();
  const invalid = useMemo(() => new Set(issues.filter((issue) => issue.severity === 'error').flatMap((issue) => issue.itemIds)), [issues]);
  const selected = items.find((item) => item.id === selectedId);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const [styleOpen, setStyleOpen] = useState(false);
  const [moveMode, setMoveMode] = useState(false);
  const [moveReady, setMoveReady] = useState(false);
  const readyMove = useCallback(() => setMoveReady(true), []);
  const cancelMove = useCallback(() => { setMoveMode(false); setMoveReady(false); }, []);
  const [selectedObject, setSelectedObject] = useState<THREE.Group | null>(null);

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
  }, [selectedId]);
  useEffect(() => () => { if (import.meta.env.DEV) Reflect.deleteProperty(window, '__kitchen3D'); }, []);

  const select = useCallback((id: string) => {
    const ui = useUiStore.getState();
    const items = useDesignStore.getState().design.items;
    const item = items.find((candidate) => candidate.id === id);
    if (item && ui.wallElevation !== null) {
      if (isWallMounted(item)) {
        const row = upperCabinetRows(items).find((row) => row.elevation === ui.wallElevation);
        if (!row || !inUpperRow(item, row)) ui.setWallElevation(item.elevation);
      } else ui.setViewFilter('all');
    }
    ui.select(id);
  }, []);

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-[#ebe8e3] lg:flex-row">
      {referenceOpen && <PhotoReferencePanel />}
      <div className="relative min-h-0 min-w-0 flex-1 touch-none">
      <Canvas
        frameloop="demand"
        shadows={compact ? false : 'percentage'}
        dpr={[1, 2]}
        camera={{ fov: CAMERA_FOV, near: 0.05, far: 200 }}
        onCreated={({ camera, scene, gl }) => { if (import.meta.env.DEV) Object.assign(window, { __kitchen3D: { camera, scene, renderer: gl } }); }}
        onPointerMissed={(event) => {
          if (event.type === 'click' && !moveMode) useUiStore.getState().select(null);
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
        <Room3D room={room} openings={openings} items={items} materials={materials} />
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
          />
        ))}
        {moveMode && selected && selectedObject?.name === selected.id && <Suspense fallback={null}><CabinetTransform key={selected.id} item={selected} object={selectedObject} onReady={readyMove} onCancel={cancelMove} /></Suspense>}
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

      <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-col items-start gap-2">
        <div className="pointer-events-none flex max-w-full flex-wrap items-center gap-2">
          <Button variant="outline" active={styleOpen} className="pointer-events-auto shadow-sm" onClick={() => setStyleOpen((open) => !open)}>
            <Palette className="size-4" />
            {text.style.style}
          </Button>
          <Button variant="outline" className="pointer-events-auto" active={referenceOpen} onClick={() => useUiStore.getState().setReferenceOpen(!referenceOpen)}><Image className="size-4" />{text.references.toggle}</Button>
          <div role="group" aria-label={text.view3d.camera} className="pointer-events-auto flex rounded-lg border border-zinc-200 bg-white p-0.5 shadow-sm">
            {(['perspective', 'front', 'top'] as const).map((view) => <Button key={view} active={request.view === view && !request.focusId} onClick={() => useUiStore.getState().requestCamera(view)}>{text.view3d[view]}</Button>)}
          </div>
          <Button variant="outline" className="pointer-events-auto" aria-label={text.view3d.resetView} title={text.view3d.resetViewTitle} onClick={() => useUiStore.getState().requestCamera('perspective')}><RotateCcw className="size-4" /><span className="hidden sm:inline">{text.view3d.resetView}</span></Button>
        </div>
        {selected && <SelectedCabinetTools key={selected.id} item={selected} compact={compact} studio={referenceOpen} moving={moveMode} invalid={invalid.has(selected.id)} onMove={() => { setMoveReady(false); setMoveMode((active) => !active); }} onFocus={() => useUiStore.getState().requestCamera('perspective', selected.id)} />}
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

      {(!compact || (moveMode && selected)) && <div className={`pointer-events-none absolute inset-x-3 flex justify-center ${compact ? 'bottom-24' : 'bottom-3'}`}>
        <p role={moveMode && !moveReady ? 'status' : undefined} className="max-w-xl rounded-lg border border-zinc-200 bg-white/95 px-3 py-2 text-center text-xs leading-relaxed text-zinc-600 shadow-sm">{moveMode && selected ? moveReady ? text.view3d.moveHint : text.view3d.loadingMove : text.view3d.selectHint}</p>
      </div>}

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

function SelectedCabinetTools({ item, compact, studio, moving, invalid, onMove, onFocus }: {
  item: KitchenItem; compact: boolean; studio: boolean; moving: boolean; invalid: boolean; onMove: () => void; onFocus: () => void;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  return (
    <div className="pointer-events-auto max-w-full space-y-1">
      <div role="group" aria-label={t.view3d.selectedActions} className="flex max-w-full flex-wrap items-center gap-1 rounded-lg border border-zinc-200 bg-white p-1 shadow-sm">
        <span className="px-2 text-xs font-semibold text-zinc-800">{item.label}</span>
        <Button active={moving} aria-label={t.view3d.move} title={t.view3d.move} onClick={onMove}><Move className="size-4" /></Button>
        <Button aria-label={t.view3d.rotateSelected} title={t.view3d.rotateSelected} onClick={() => rotateSelected(1)}><RotateCw className="size-4" /></Button>
        <Button aria-label={t.view3d.focusSelection} title={t.view3d.focusSelection} onClick={onFocus}><Scan className="size-4" /></Button>
        <Button aria-label={t.view3d.copySelected} title={t.view3d.copySelected} onClick={duplicateSelected}><Copy className="size-4" /></Button>
        <StackAboveButton key={item.id} item={item} iconOnly />
        {(compact || studio) && <Button aria-label={t.view3d.editSelected} title={t.view3d.editSelected} onClick={() => setEditing(true)}><Pencil className="size-4" /></Button>}
        <Button aria-label={t.view3d.deleteSelected} title={t.view3d.deleteSelected} onClick={deleteSelected}><Trash2 className="size-4" /></Button>
      </div>
      {invalid && <p role="status" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">{t.view3d.invalidSelection}</p>}
      <Dialog open={editing} title={`${t.kinds[item.kind]} ${item.label}`} sheet={compact} onClose={() => setEditing(false)} footer={<Button variant="primary" onClick={() => setEditing(false)}>{t.common.done}</Button>}>
        <ItemFields item={item} />
      </Dialog>
    </div>
  );
}
