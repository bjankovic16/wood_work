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

export interface ResizeGripApi {
  begin: (field: SizeField, event: PointerEvent, element: HTMLButtonElement) => void;
}

interface ResizeGesture {
  design: Design;
  item: KitchenItem;
  field: SizeField;
  pointerId: number;
  capture: HTMLButtonElement;
  axis: THREE.Vector3;
  plane: THREE.Plane | null;
  point: THREE.Vector3;
  x: number;
  y: number;
  pixelsPerMm: number;
  orbitEnabled: boolean;
}

function gripPoint(item: KitchenItem, field: SizeField): THREE.Vector3 {
  const corner = item.kind === 'corner';
  const u = field === 'width' ? item.width : field === 'width2' || corner && field === 'height' ? item.depth / 2
    : corner && field === 'depth' ? (item.width + item.depth) / 2 : item.width / 2;
  const v = field === 'width2' ? item.width2 ?? item.width : field === 'depth' ? item.depth : item.depth / 2;
  const point = localToRoom(item, u, v);
  return new THREE.Vector3(point.x / 1000, (item.elevation + item.height * (field === 'height' ? 1 : 0.5)) / 1000, point.y / 1000);
}

export function CabinetResize({ item, overlay, api, onStart, onReady, onCancel, onBlocked }: {
  item: KitchenItem; overlay: RefObject<HTMLDivElement | null>; api: RefObject<ResizeGripApi | null>;
  onStart: () => void; onReady: () => void; onCancel: () => void; onBlocked: (blocked: boolean) => void;
}) {
  const { camera, gl, controls, size, invalidate } = useThree();
  const currentItem = useRef(item);
  currentItem.current = item;
  const gesture = useRef<ResizeGesture | null>(null);

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
    for (const field of ['width', 'height', 'depth', 'width2'] as const) {
      const element = container.querySelector<HTMLButtonElement>(`[data-resize-field="${field}"]`);
      if (!element) continue;
      const point = gripPoint(currentItem.current, field).project(camera);
      element.style.visibility = 'hidden';
      if (point.z < -1 || point.z > 1 || Math.abs(point.x) > 1 || Math.abs(point.y) > 1) continue;
      const w = element.offsetWidth;
      const h = element.offsetHeight;
      const maxX = Math.max(8, size.width - w - 8);
      const maxY = Math.max(8, height - h - 8);
      const px = THREE.MathUtils.clamp((point.x + 1) * size.width / 2 - w / 2, 8, maxX);
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
    const enabled = () => controls && 'enabled' in controls ? Boolean(controls.enabled) : true;
    const setOrbit = (value: boolean) => { if (controls && 'enabled' in controls) controls.enabled = value; };
    const rayAt = (x: number, y: number) => {
      const box = gl.domElement.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2((x - box.left) / box.width * 2 - 1, -(y - box.top) / box.height * 2 + 1), camera);
      return ray.ray;
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
      invalidate();
    };
    const cancel = () => finish(true);
    api.current = {
      begin: (field, event, capture) => {
        const ui = useUiStore.getState();
        const store = useDesignStore.getState();
        const current = store.design.items.find((entry) => entry.id === currentItem.current.id);
        if (!current || ui.view !== '3d' || ui.cabinetTool !== 'resize' || ui.selectedId !== current.id || ui.previewLockedIds.includes(current.id)
          || gesture.current || store.gestureBase || event.button !== 0 || !event.isPrimary) return;
        event.preventDefault();
        event.stopPropagation();
        onStart();
        const axis = new THREE.Vector3(field === 'width' ? 1 : 0, field === 'height' ? 1 : 0, field === 'depth' || field === 'width2' ? 1 : 0)
          .applyEuler(new THREE.Euler(0, -current.rotation * Math.PI / 180, 0));
        const face = gripPoint(current, field);
        const normal = camera.getWorldDirection(new THREE.Vector3());
        normal.addScaledVector(axis, -normal.dot(axis));
        const plane = normal.lengthSq() > 0.02 ? new THREE.Plane().setFromNormalAndCoplanarPoint(normal.normalize(), face) : null;
        const point = plane ? rayAt(event.clientX, event.clientY).intersectPlane(plane, new THREE.Vector3()) : null;
        const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 45;
        const pixelsPerMm = size.height / (2000 * Math.max(0.1, camera.position.distanceTo(face)) * Math.tan(fov * Math.PI / 360));
        gesture.current = {
          design: store.design, item: current, field, pointerId: event.pointerId, capture, axis,
          plane: point ? plane : null, point: point ?? face, x: event.clientX, y: event.clientY, pixelsPerMm, orbitEnabled: enabled(),
        };
        store.beginGesture();
        setOrbit(false);
        capture.setPointerCapture(event.pointerId);
        onBlocked(false);
        invalidate();
      },
    };
    const move = (event: PointerEvent) => {
      const start = gesture.current;
      if (!start || event.pointerId !== start.pointerId) return;
      const store = useDesignStore.getState();
      if (store.gestureBase !== start.design) { cancel(); return; }
      const point = start.plane ? rayAt(event.clientX, event.clientY).intersectPlane(start.plane, new THREE.Vector3()) : null;
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
      api.current = null;
      unsubscribe();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointerdown', secondPointer);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('lostpointercapture', lostCapture);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', key);
      document.removeEventListener('visibilitychange', visibility);
      cancel();
    };
  }, [api, camera, controls, gl, size.height, invalidate, onStart, onReady, onCancel, onBlocked]);
  return null;
}
