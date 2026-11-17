import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import type { SizeField } from '../../domain/catalog';
import { cabinetResize } from '../../domain/cabinetResize';
import { replaceItem } from '../../domain/designOps';
import { localToRoom } from '../../domain/geometry';
import type { Design, KitchenItem } from '../../domain/types';
import { useDesignStore } from '../../store/designStore';
import { useUiStore } from '../../store/uiStore';
import { HANDLE_COLOR } from './gizmoStyle';

interface ResizeGesture {
  design: Design;
  item: KitchenItem;
  field: SizeField;
  pointerId: number;
  capture: HTMLCanvasElement;
  axis: THREE.Vector3;
  plane: THREE.Plane | null;
  point: THREE.Vector3;
  x: number;
  y: number;
  pixelsPerMm: number;
  orbitEnabled: boolean;
}

function facePoint(item: KitchenItem, field: SizeField): THREE.Vector3 {
  const corner = item.kind === 'corner';
  const u = field === 'width' ? item.width : field === 'width2' || corner && field === 'height' ? item.depth / 2
    : corner && field === 'depth' ? (item.width + item.depth) / 2 : item.width / 2;
  const v = field === 'width2' ? item.width2 ?? item.width : field === 'depth' ? item.depth : item.depth / 2;
  const point = localToRoom(item, u, v);
  return new THREE.Vector3(point.x / 1000, (item.elevation + item.height * (field === 'height' ? 1 : 0.5)) / 1000, point.y / 1000);
}

function resizeAxis(item: KitchenItem, field: SizeField): THREE.Vector3 {
  return new THREE.Vector3(field === 'width' ? 1 : 0, field === 'height' ? 1 : 0, field === 'depth' || field === 'width2' ? 1 : 0)
    .applyEuler(new THREE.Euler(0, -item.rotation * Math.PI / 180, 0));
}

function isResizeField(value: unknown): value is SizeField {
  return value === 'width' || value === 'height' || value === 'depth' || value === 'width2';
}

export function CabinetResize({ item, overlay, onStart, onReady, onCancel, onBlocked }: {
  item: KitchenItem; overlay: RefObject<HTMLDivElement | null>;
  onStart: () => void; onReady: () => void; onCancel: () => void; onBlocked: (blocked: boolean) => void;
}) {
  const { camera, gl, controls, size, invalidate } = useThree();
  const currentItem = useRef(item);
  currentItem.current = item;
  const gesture = useRef<ResizeGesture | null>(null);
  const tool = useRef<THREE.Group>(null);
  const hovered = useRef<SizeField | null>(null);
  const fields: SizeField[] = item.kind === 'corner' ? ['width', 'height', 'depth', 'width2'] : ['width', 'height', 'depth'];

  useFrame(() => {
    if (!tool.current) return;
    for (const arrow of tool.current.children) {
      const field = arrow.userData.resizeField;
      if (!isResizeField(field)) continue;
      const face = facePoint(currentItem.current, field);
      const depth = Math.max(0.1, face.clone().sub(camera.position).dot(camera.getWorldDirection(new THREE.Vector3())));
      const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 45;
      const pixel = 2 * depth * Math.tan(fov * Math.PI / 360) / size.height;
      arrow.position.copy(face);
      arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), resizeAxis(currentItem.current, field));
      arrow.scale.setScalar(pixel);
      for (const mesh of arrow.children) {
        if (mesh instanceof THREE.Mesh && mesh.material instanceof THREE.MeshBasicMaterial && mesh.material.opacity > 0) {
          mesh.material.color.set(gesture.current?.field === field || hovered.current === field ? '#1d4ed8' : HANDLE_COLOR);
        }
      }
    }
    tool.current.updateMatrixWorld(true);
  }, -1);

  useFrame(() => {
    const container = overlay.current;
    if (!container) return;
    const canvas = gl.domElement.getBoundingClientRect();
    const sheet = document.querySelector('[data-testid="item-sheet"]')?.getBoundingClientRect();
    const height = Math.min(size.height, sheet ? sheet.top - canvas.top - 8 : size.height);
    const toolbar = document.querySelector<HTMLElement>('[data-testid="cabinet-tools"]');
    const toolbarBox = toolbar?.getBoundingClientRect();
    const boxes: { x: number; y: number; w: number; h: number }[] = toolbar && toolbarBox && toolbar.style.visibility !== 'hidden'
      ? [{ x: toolbarBox.left - canvas.left, y: toolbarBox.top - canvas.top, w: toolbarBox.width, h: toolbarBox.height }] : [];
    for (const arrow of tool.current?.children ?? []) {
      const point = arrow.localToWorld(new THREE.Vector3(0, 58, 0)).project(camera);
      boxes.push({ x: (point.x + 1) * size.width / 2 - 24, y: (1 - point.y) * size.height / 2 - 24, w: 48, h: 48 });
    }
    for (const field of ['width', 'height', 'depth', 'width2'] as const) {
      const element = container.querySelector<HTMLElement>(`[data-resize-field="${field}"]`);
      const arrow = tool.current?.getObjectByName(`resize-arrow-${field}`);
      if (!element || !arrow) continue;
      const point = arrow.localToWorld(new THREE.Vector3(0, 68, 0)).project(camera);
      element.style.visibility = 'hidden';
      if (point.z < -1 || point.z > 1 || Math.abs(point.x) > 1 || Math.abs(point.y) > 1) continue;
      const w = element.offsetWidth;
      const h = element.offsetHeight;
      const maxX = Math.max(8, size.width - w - 8);
      const maxY = Math.max(8, height - h - 8);
      const px = THREE.MathUtils.clamp((point.x + 1) * size.width / 2 + 28, 8, maxX);
      const py = THREE.MathUtils.clamp((1 - point.y) * size.height / 2 - h / 2, 8, maxY);
      const candidates = [[px, py], ...boxes.flatMap((box) => [
        [px, box.y - h - 8], [px, box.y + box.h + 8], [box.x - w - 8, py], [box.x + box.w + 8, py],
      ])].map(([x, y]) => [THREE.MathUtils.clamp(x, 8, maxX), THREE.MathUtils.clamp(y, 8, maxY)])
        .sort(([ax, ay], [bx, by]) => (ax - px) ** 2 + (ay - py) ** 2 - (bx - px) ** 2 - (by - py) ** 2);
      for (const [x, y] of candidates) {
        if (boxes.some((box) => x < box.x + box.w + 6 && x + w + 6 > box.x && y < box.y + box.h + 6 && y + h + 6 > box.y)) continue;
        boxes.push({ x, y, w, h });
        element.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
        element.style.visibility = 'visible';
        break;
      }
    }
  });

  useEffect(() => {
    const element = gl.domElement;
    let ownedPress = false;
    const enabled = () => controls && 'enabled' in controls ? Boolean(controls.enabled) : true;
    const setOrbit = (value: boolean) => { if (controls && 'enabled' in controls) controls.enabled = value; };
    const rayAt = (x: number, y: number) => {
      const box = gl.domElement.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2((x - box.left) / box.width * 2 - 1, -(y - box.top) / box.height * 2 + 1), camera);
      return ray;
    };
    const arrowAt = (event: PointerEvent): SizeField | null => {
      if (!tool.current) return null;
      const hit = rayAt(event.clientX, event.clientY).intersectObjects(tool.current.children, true)[0];
      let object: THREE.Object3D | null = hit?.object ?? null;
      while (object && !object.userData.resizeField) object = object.parent;
      const field = object?.userData.resizeField;
      return isResizeField(field) ? field : null;
    };
    const finish = (cancel: boolean) => {
      const start = gesture.current;
      if (!start) return;
      gesture.current = null;
      const store = useDesignStore.getState();
      if (store.gestureBase === start.design) {
        if (cancel) store.cancelGesture();
        else store.endGesture();
      }
      if (start.capture.hasPointerCapture(start.pointerId)) start.capture.releasePointerCapture(start.pointerId);
      setOrbit(start.orbitEnabled);
      element.style.cursor = '';
      hovered.current = null;
      invalidate();
    };
    const cancel = () => finish(true);
    const down = (event: PointerEvent) => {
        if (!gesture.current) ownedPress = false;
        const field = arrowAt(event);
        if (!field) return;
        const ui = useUiStore.getState();
        const store = useDesignStore.getState();
        const current = store.design.items.find((entry) => entry.id === currentItem.current.id);
        if (!current || ui.view !== '3d' || ui.cabinetTool !== 'resize' || ui.selectedId !== current.id || ui.previewLockedIds.includes(current.id)
          || gesture.current || store.gestureBase || event.button !== 0 || !event.isPrimary) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        ownedPress = true;
        onStart();
        const axis = resizeAxis(current, field);
        const face = facePoint(current, field);
        const normal = camera.getWorldDirection(new THREE.Vector3());
        normal.addScaledVector(axis, -normal.dot(axis));
        const plane = normal.lengthSq() > 0.02 ? new THREE.Plane().setFromNormalAndCoplanarPoint(normal.normalize(), face) : null;
        const point = plane ? rayAt(event.clientX, event.clientY).ray.intersectPlane(plane, new THREE.Vector3()) : null;
        const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 45;
        const pixelsPerMm = size.height / (2000 * Math.max(0.1, camera.position.distanceTo(face)) * Math.tan(fov * Math.PI / 360));
        gesture.current = {
          design: store.design, item: current, field, pointerId: event.pointerId, capture: element, axis,
          plane: point ? plane : null, point: point ?? face, x: event.clientX, y: event.clientY, pixelsPerMm, orbitEnabled: enabled(),
        };
        store.beginGesture();
        setOrbit(false);
        element.setPointerCapture(event.pointerId);
        element.style.cursor = 'grabbing';
        onBlocked(false);
        invalidate();
    };
    const move = (event: PointerEvent) => {
      const start = gesture.current;
      if (!start) {
        const field = event.target === element ? arrowAt(event) : null;
        if (hovered.current !== field) {
          hovered.current = field;
          element.style.cursor = field ? 'grab' : '';
          invalidate();
        }
        return;
      }
      if (event.pointerId !== start.pointerId) return;
      const store = useDesignStore.getState();
      if (store.gestureBase !== start.design) { cancel(); return; }
      const point = start.plane ? rayAt(event.clientX, event.clientY).ray.intersectPlane(start.plane, new THREE.Vector3()) : null;
      if (start.plane && !point) return;
      const delta = point ? point.sub(start.point).dot(start.axis) * 1000
        : (start.field === 'height' ? start.y - event.clientY : event.clientX - start.x) / start.pixelsPerMm;
      const value = (start.field === 'width2' ? start.item.width2 ?? start.item.width : start.item[start.field]) + delta;
      const ui = useUiStore.getState();
      const next = cabinetResize(start.item, start.field, value, store.design.room, ui.snapEnabled ? ui.gridSize : 0);
      onBlocked(next === null);
      if (next) store.apply((design) => replaceItem(design, next));
      invalidate();
    };
    const up = (event: PointerEvent) => { if (event.pointerId === gesture.current?.pointerId) finish(false); };
    const lostCapture = (event: PointerEvent) => { if (event.pointerId === gesture.current?.pointerId) cancel(); };
    const secondPointer = (event: PointerEvent) => { if (gesture.current && event.pointerId !== gesture.current.pointerId) cancel(); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { cancel(); onCancel(); } };
    const visibility = () => { if (document.visibilityState === 'hidden') cancel(); };
    const unsubscribe = useUiStore.subscribe((ui) => {
      const start = gesture.current;
      if (start && (ui.view !== '3d' || ui.cabinetTool !== 'resize' || ui.selectedId !== start.item.id || ui.previewLockedIds.includes(start.item.id))) cancel();
    });
    const click = (event: MouseEvent) => { if (ownedPress) event.stopImmediatePropagation(); };
    element.addEventListener('pointerdown', down, true);
    element.addEventListener('click', click, true);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointerdown', secondPointer);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('lostpointercapture', lostCapture);
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', key);
    document.addEventListener('visibilitychange', visibility);
    onReady();
    invalidate();
    return () => {
      unsubscribe();
      element.removeEventListener('pointerdown', down, true);
      element.removeEventListener('click', click, true);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointerdown', secondPointer);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('lostpointercapture', lostCapture);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', key);
      document.removeEventListener('visibilitychange', visibility);
      cancel();
      element.style.cursor = '';
    };
  }, [camera, controls, gl, size.height, invalidate, onStart, onReady, onCancel, onBlocked]);
  return <group ref={tool} name="kitchen-resize-tool">
    {fields.map((field) => <group key={field} name={`resize-arrow-${field}`} userData={{ resizeField: field }} scale={0.001}>
      <mesh position={[0, 31, 0]} renderOrder={1000}>
        <cylinderGeometry args={[3, 3, 42, 12]} />
        <meshBasicMaterial color={HANDLE_COLOR} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh name={`resize-arrow-head-${field}`} position={[0, 58, 0]} renderOrder={1001}>
        <coneGeometry args={[10, 22, 16]} />
        <meshBasicMaterial color={HANDLE_COLOR} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh name={`resize-arrow-picker-${field}`} position={[0, 58, 0]}>
        <sphereGeometry args={[26, 12, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>)}
  </group>;
}
