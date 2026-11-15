import { OrbitControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { Palette, RotateCcw, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentRef, type RefObject } from 'react';
import { backWall, isWallMounted, WALLS } from '../../domain/geometry';
import { KIND_OPTIONS } from '../../engine/config';
import type { KitchenItem, Room, Wall } from '../../domain/types';
import { useT } from '../../i18n';
import { useDesignStore } from '../../store/designStore';
import { useBuildContext } from '../../store/derived';
import { useUiStore } from '../../store/uiStore';
import { Button, Dialog } from '../ui';
import { createMaterials, disposeMaterials, m } from './materials';
import { Room3D } from './Room3D';
import { StylePicker } from './StylePicker';
import { Unit3D } from './Unit3D';

type Vec3 = [number, number, number];

const FOV = 45;

/**
 * A starting view that faces the wall with the most units, from a little to
 * one side, far enough back for that wall to fit the screen's shape.
 */
function homeView(room: Room, items: KitchenItem[], aspect: number): { position: Vec3; target: Vec3 } {
  const W = m(room.width);
  const D = m(room.depth);
  const counts = new Map<Wall, number>(WALLS.map((w) => [w, 0]));
  for (const item of items) counts.set(backWall(item.rotation), (counts.get(backWall(item.rotation)) ?? 0) + 1);
  const facing = [...counts].sort((a, b) => b[1] - a[1])[0][0];
  const facingTopOrBottom = facing === 'top' || facing === 'bottom';
  const span = facingTopOrBottom ? W : D;
  const reach = facingTopOrBottom ? D : W;
  const tanHalf = Math.tan(((FOV / 2) * Math.PI) / 180);
  const fitHeight = (m(room.height) / 2 + 0.4) / tanHalf;
  // Far enough back that the near ends of the side runs stay in view too.
  const fitWidth = span / 2 / (tanHalf * aspect) + reach * 0.35;
  const distance = Math.max(3, fitHeight, fitWidth);
  const height = 1.4 + distance * 0.18;
  const target: Vec3 = [W / 2, 0.95, D / 2];
  const position: Record<Wall, Vec3> = {
    top: [W / 2 + W * 0.18, height, D / 2 + distance],
    bottom: [W / 2 - W * 0.18, height, D / 2 - distance],
    left: [W / 2 + distance, height, D / 2 - D * 0.18],
    right: [W / 2 - distance, height, D / 2 + D * 0.18],
  };
  return { position: position[facing], target };
}

/** Puts the camera at the starting view when the room changes size or the viewer asks for it. */
function CameraRig({ resetToken, controls }: { resetToken: number; controls: RefObject<ComponentRef<typeof OrbitControls> | null> }) {
  const room = useDesignStore((s) => s.design.room);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const aspect = useRef(1);
  aspect.current = size.width / Math.max(1, size.height);

  useLayoutEffect(() => {
    const home = homeView(room, useDesignStore.getState().design.items, aspect.current);
    camera.position.set(...home.position);
    const c = controls.current;
    if (c) {
      c.target.set(...home.target);
      c.update();
    } else {
      camera.lookAt(...home.target);
    }
  }, [room, resetToken, camera, controls]);
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
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const [styleOpen, setStyleOpen] = useState(!compact);
  const [resetToken, setResetToken] = useState(0);

  const materials = useMemo(() => createMaterials(style), [style]);
  const litUnits = useMemo(() => new Set(items.filter((item) => isWallMounted(item) && KIND_OPTIONS[item.kind].carcass).slice(0, 3).map((item) => item.id)), [items]);
  useEffect(() => () => disposeMaterials(materials), [materials]);

  const select = useCallback((id: string) => useUiStore.getState().select(id), []);

  return (
    <div className="relative h-full w-full touch-none bg-[#ebe8e3]">
      <Canvas
        shadows={compact ? false : 'percentage'}
        dpr={[1, 2]}
        camera={{ fov: FOV, near: 0.05, far: 200 }}
        onPointerMissed={(event) => {
          if (event.type === 'click') useUiStore.getState().select(null);
        }}
      >
        <color attach="background" args={['#ebe8e3']} />
        <hemisphereLight args={[style.lighting ? '#fff6e8' : '#ffffff', '#cbc2b4', style.lighting ? 1.15 : 0.9]} />
        <ambientLight intensity={0.25} />
        {style.lighting && <directionalLight position={[-3, 4, 1]} color="#fff4e2" intensity={0.45} />}
        <directionalLight
          position={[m(room.width) / 2 + 2.5, 5.5, m(room.depth) + 3]}
          intensity={1.7}
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
          />
        ))}
        <OrbitControls
          ref={controls}
          makeDefault
          enableDamping
          maxPolarAngle={Math.PI / 2 - 0.04}
          minDistance={0.6}
          maxDistance={30}
        />
        <CameraRig resetToken={resetToken} controls={controls} />
      </Canvas>

      <div className="absolute left-3 top-3 flex flex-col items-start gap-2">
        {compact ? (
          <Button variant="outline" className="shadow-sm" onClick={() => setStyleOpen(true)}>
            <Palette className="size-4" />
            {text.style.style}
          </Button>
        ) : styleOpen ? (
          <div className="max-h-[calc(100dvh-120px)] w-64 overflow-y-auto rounded-xl border border-zinc-200 bg-white/95 p-3 shadow-lg backdrop-blur">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{text.style.style}</span>
              <Button aria-label={text.style.hide} className="-my-1 -mr-1 h-6 min-w-6 px-1" onClick={() => setStyleOpen(false)}>
                <X className="size-3.5" />
              </Button>
            </div>
            <StylePicker />
          </div>
        ) : (
          <Button variant="outline" className="shadow-sm" onClick={() => setStyleOpen(true)}>
            <Palette className="size-4" />
            {text.style.style}
          </Button>
        )}
      </div>

      <div className="absolute right-3 top-3">
        <Button variant="outline" className="shadow-sm" title={text.view3d.resetViewTitle} onClick={() => setResetToken((t) => t + 1)}>
          <RotateCcw className="size-4" />
          {text.view3d.resetView}
        </Button>
      </div>

      {!compact && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <div className="rounded-full border border-zinc-200 bg-white/90 px-3 py-1.5 text-xs text-zinc-600 shadow-sm">{text.view3d.hint}</div>
        </div>
      )}

      {compact && (
        <Dialog open={styleOpen} title={text.style.style} sheet onClose={() => setStyleOpen(false)}>
          <div className="p-4 pb-[max(env(safe-area-inset-bottom),16px)]">
            <StylePicker />
          </div>
        </Dialog>
      )}
    </div>
  );
}
