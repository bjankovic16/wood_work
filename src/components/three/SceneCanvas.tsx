import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useRef, type ComponentRef, type ReactNode, type RefObject } from 'react';
import { blendPoses, CAMERA_FOV, kitchenCameraPose, roomCameraPose, STUDIO_BACKDROP, STUDIO_FOV, type CameraPose, type CameraView } from '../../domain/camera';
import { useDesignStore } from '../../store/designStore';
import { overlayTopInset } from './overlayInset';

export interface CameraRequest { view: CameraView; focusId?: string; back?: boolean; token: number }
export type OrbitRef = RefObject<ComponentRef<typeof OrbitControls> | null>;

/** Glides between presets, but yields to a manual orbit and restores the previous pose after cabinet focus. */
function CameraRig({ request, controls, roomOnly }: { request: CameraRequest; controls: OrbitRef; roomOnly: boolean }) {
  const room = useDesignStore((s) => s.design.room);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const canvas = useThree((s) => s.gl.domElement);
  const invalidate = useThree((s) => s.invalidate);
  const handled = useRef<number | null>(null);
  const roomSize = useRef('');
  const flight = useRef<{ from: CameraPose; to: CameraPose; start: number } | null>(null);
  const before = useRef<CameraPose | null>(null);
  const moved = useRef(false);

  useLayoutEffect(() => {
    const c = controls.current;
    if (c?.enableDamping) {
      c.enableDamping = false;
      c.update();
      c.enableDamping = true;
    }
    const first = handled.current === null, asked = !first && handled.current !== request.token;
    handled.current = request.token;
    const size3d = `${room.width}x${room.depth}x${room.height}`;
    const sameRoom = roomSize.current === size3d;
    roomSize.current = size3d;
    if (!asked && !first && sameRoom && (moved.current || request.back)) return;

    if ('fov' in camera) {
      camera.fov = request.view === 'studio' && !request.focusId ? STUDIO_FOV : CAMERA_FOV;
      camera.updateProjectionMatrix();
    }
    const from: CameraPose = {
      position: [camera.position.x, camera.position.y, camera.position.z],
      target: c ? [c.target.x, c.target.y, c.target.z] : [room.width / 2000, 0.95, room.depth / 2000],
    };
    let pose: CameraPose;
    if (request.back) {
      if (!before.current) return;
      pose = before.current;
      before.current = null;
    } else {
      const items = useDesignStore.getState().design.items;
      const focus = items.find((item) => item.id === request.focusId);
      const height = Math.max(1, size.height), aspect = size.width / height;
      pose = roomOnly
        ? roomCameraPose(room, aspect, request.view, overlayTopInset(canvas, canvas.getBoundingClientRect().top) / height)
        : kitchenCameraPose(room, items, aspect, request.view, focus);
      if (asked) {
        if (focus) before.current ??= from;
        else before.current = null;
      }
    }
    moved.current = false;
    const travel = Math.max(...pose.position.map((v, i) => Math.abs(v - from.position[i])), ...pose.target.map((v, i) => Math.abs(v - from.target[i])));
    if (asked && sameRoom && travel > 0.001 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      flight.current = { from, to: pose, start: performance.now() };
    } else {
      flight.current = null;
      camera.position.set(...pose.position);
      if (c) { c.target.set(...pose.target); c.update(); }
      else camera.lookAt(...pose.target);
    }
    invalidate();
  }, [room.width, room.depth, room.height, roomOnly, request, camera, canvas, controls, invalidate, size.width, size.height]);

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
    const progress = Math.min(1, (performance.now() - move.start) / 520);
    const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
    const pose = blendPoses(move.from, move.to, eased);
    camera.position.set(...pose.position);
    const c = controls.current;
    if (c) { c.target.set(...pose.target); c.update(); }
    else camera.lookAt(...pose.target);
    if (progress >= 1) flight.current = null;
    else invalidate();
  });
  return null;
}

export function SceneCanvas({ children, request, controls, roomOnly = false, inset = 0, onReady, onMiss }: {
  children: ReactNode; request: CameraRequest; controls: OrbitRef; roomOnly?: boolean; inset?: number; onReady: () => void; onMiss: () => void;
}) {
  const studio = request.view === 'studio';
  useEffect(() => () => { if (import.meta.env.DEV) Reflect.deleteProperty(window, '__kitchen3D'); }, []);
  return <Canvas style={{ height: inset ? `calc(100% - ${inset}px)` : '100%' }} flat frameloop="demand" dpr={[1, 2]}
    camera={{ fov: CAMERA_FOV, near: 0.05, far: 200 }}
    onCreated={({ camera, scene, gl }) => {
      if (import.meta.env.DEV) Object.assign(window, { __kitchen3D: { camera, scene, renderer: gl } });
      onReady();
    }}
    onPointerMissed={(event) => { if (event.type === 'click') onMiss(); }}>
    <color attach="background" args={[studio ? STUDIO_BACKDROP : '#ebe8e3']} />
    <ambientLight intensity={Math.PI} />
    {children}
    <OrbitControls ref={controls} makeDefault enableDamping maxPolarAngle={Math.PI / 2 - 0.04} minDistance={0.6} maxDistance={studio || roomOnly ? 180 : 30} />
    <CameraRig request={request} controls={controls} roomOnly={roomOnly} />
  </Canvas>;
}
