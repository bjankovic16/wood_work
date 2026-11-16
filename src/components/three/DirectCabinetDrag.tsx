import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import * as THREE from 'three';
import { attachedWall, itemRect, localToRoom } from '../../domain/geometry';
import { computeDragPlacement } from '../../domain/snapping';
import type { Design, KitchenItem, Point, Wall } from '../../domain/types';
import { setItemPlacement } from '../../store/actions';
import { useDesignStore } from '../../store/designStore';
import { snapSettings } from '../../store/viewport';

export function DirectCabinetDrag({ item, onStart, onSelect, handleRef, overlayRef, children }: {
  item: KitchenItem; onStart: (id: string) => void; onSelect: (id: string) => void;
  handleRef?: RefObject<HTMLButtonElement | null>; overlayRef?: RefObject<HTMLDivElement | null>; children: ReactNode;
}) {
  const { camera, gl, controls, scene, events, invalidate } = useThree();
  const body = useRef<THREE.Group>(null);
  const start = useRef<{
    design: Design; item: KitchenItem; plane: THREE.Plane; offset: Point; wall: Wall | null;
    x: number; y: number; pointerId: number; moved: boolean; orbitEnabled: boolean;
    capture: HTMLElement;
  } | null>(null);

  useEffect(() => {
    const element = gl.domElement;
    const restoreControls = (enabled: boolean) => {
      if (controls && 'enabled' in controls) controls.enabled = enabled;
    };
    const finish = (cancel: boolean) => {
      const current = start.current;
      if (!current) return;
      start.current = null;
      const store = useDesignStore.getState();
      if (current.moved && store.gestureBase === current.design) {
        if (cancel) store.cancelGesture();
        else store.endGesture();
      }
      restoreControls(current.orbitEnabled);
      if (current.capture.hasPointerCapture(current.pointerId)) current.capture.releasePointerCapture(current.pointerId);
      element.style.cursor = '';
      if (!cancel && !current.moved) onSelect(current.item.id);
      invalidate();
    };
    const move = (event: PointerEvent) => {
      const current = start.current;
      if (!current || event.pointerId !== current.pointerId) return;
      const store = useDesignStore.getState();
      if (current.moved ? store.gestureBase !== current.design : store.design !== current.design) { finish(true); return; }
      if (!current.moved) {
        if (Math.hypot(event.clientX - current.x, event.clientY - current.y) < 6) return;
        store.beginGesture();
        current.moved = true;
        onStart(current.item.id);
        element.style.cursor = 'grabbing';
      }
      const box = element.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2((event.clientX - box.left) / box.width * 2 - 1, -(event.clientY - box.top) / box.height * 2 + 1), camera);
      const hit = ray.ray.intersectPlane(current.plane, new THREE.Vector3());
      if (!hit) return;
      const placed = computeDragPlacement({
        room: store.design.room, others: store.design.items.filter((entry) => entry.id !== current.item.id), item: current.item,
        pointer: { x: hit.x * 1000, y: hit.z * 1000 }, grabOffset: current.offset, previousWall: current.wall, snap: snapSettings(),
      });
      current.wall = placed.wall;
      setItemPlacement(current.item.id, placed);
      invalidate();
    };
    const up = (event: PointerEvent) => { if (event.pointerId === start.current?.pointerId) finish(false); };
    const cancel = () => finish(true);
    const lostCapture = (event: PointerEvent) => {
      if (event.pointerId === start.current?.pointerId && event.target === start.current.capture) cancel();
    };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') cancel(); };
    const visibility = () => { if (document.visibilityState === 'hidden') cancel(); };
    const unsubscribe = useDesignStore.subscribe((state) => {
      const current = start.current;
      if (current && (current.moved ? state.gestureBase !== current.design : state.design !== current.design)) cancel();
    });
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', key);
    window.addEventListener('lostpointercapture', lostCapture);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      unsubscribe();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', key);
      window.removeEventListener('lostpointercapture', lostCapture);
      document.removeEventListener('visibilitychange', visibility);
      cancel();
    };
  }, [camera, controls, gl, invalidate, onStart, onSelect]);

  const begin = (clientX: number, clientY: number, pointerId: number, point: THREE.Vector3, capture: HTMLElement) => {
    const design = useDesignStore.getState().design;
    const rect = itemRect(item);
    const orbitEnabled = controls && 'enabled' in controls ? Boolean(controls.enabled) : true;
    if (controls && 'enabled' in controls) controls.enabled = false;
    start.current = {
      design, item, plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -point.y),
      offset: { x: point.x * 1000 - rect.x - rect.w / 2, y: point.z * 1000 - rect.y - rect.h / 2 },
      wall: attachedWall(item, design.room), x: clientX, y: clientY,
      pointerId, moved: false, orbitEnabled, capture,
    };
    capture.setPointerCapture(pointerId);
  };

  useEffect(() => {
    const element = gl.domElement;
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || !event.isPrimary || start.current || useDesignStore.getState().gestureBase) return;
      if (controls && 'enabled' in controls && controls.enabled === false) return;
      const box = element.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2((event.clientX - box.left) / box.width * 2 - 1, -(event.clientY - box.top) / box.height * 2 + 1), camera);
      scene.updateMatrixWorld(true);
      if (!body.current || ray.intersectObject(body.current, true).length === 0) return;
      const hits = ray.intersectObjects(scene.children, true).filter(({ object }) => {
        if (!(object instanceof THREE.Mesh)) return false;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        if (!materials.some((material) => material.visible && material.opacity > 0)) return false;
        for (let parent: THREE.Object3D | null = object; parent; parent = parent.parent) {
          if (!parent.visible) return false;
        }
        return true;
      });
      // Only visible arrows own a resize press, not their oversized invisible pickers.
      if (hits.some(({ object }) => {
        for (let parent: THREE.Object3D | null = object; parent; parent = parent.parent) {
          if (parent.name === 'kitchen-resize-tool' || parent.name === 'kitchen-move-tool') return true;
        }
        return false;
      })) return;
      const hit = hits[0];
      if (!hit) return;
      for (let parent: THREE.Object3D | null = hit.object; parent; parent = parent.parent) {
        if (parent !== body.current) continue;
        event.stopImmediatePropagation();
        // Keep R3F's click/double-click bookkeeping without starting native gizmos or orbit.
        events.handlers?.onPointerDown(event);
        begin(event.clientX, event.clientY, event.pointerId, hit.point, element);
        return;
      }
    };
    element.addEventListener('pointerdown', down, true);
    return () => element.removeEventListener('pointerdown', down, true);
  });
  useFrame(() => {
    const overlay = overlayRef?.current;
    if (!overlay) return;
    const centre = localToRoom(item, item.width / 2, item.depth / 2);
    const point = new THREE.Vector3(centre.x / 1000, (item.elevation + item.height) / 1000 + 0.08, centre.y / 1000).project(camera);
    const box = gl.domElement.getBoundingClientRect();
    let top = (1 - point.y) * box.height / 2;
    let bottom = top;
    const includeBounds = (bounds: THREE.Box3) => {
      for (const x of [bounds.min.x, bounds.max.x]) {
        for (const y of [bounds.min.y, bounds.max.y]) {
          for (const z of [bounds.min.z, bounds.max.z]) {
            const projected = new THREE.Vector3(x, y, z).project(camera);
            const screenY = (1 - projected.y) * box.height / 2;
            top = Math.min(top, screenY);
            bottom = Math.max(bottom, screenY);
          }
        }
      }
    };
    if (body.current) includeBounds(new THREE.Box3().setFromObject(body.current));
    const tool = scene.getObjectByName('kitchen-resize-tool');
    tool?.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (!materials.some((material) => material.visible && material.opacity > 0)) return;
      for (let parent: THREE.Object3D | null = object; parent; parent = parent.parent) if (!parent.visible) return;
      object.geometry.computeBoundingBox();
      if (object.geometry.boundingBox) includeBounds(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
    });
    const width = overlay.offsetWidth;
    const height = overlay.offsetHeight;
    const x = THREE.MathUtils.clamp((point.x + 1) * box.width / 2, width / 2 + 8, Math.max(width / 2 + 8, box.width - width / 2 - 8));
    const above = top - height - 12;
    const y = above >= 8 ? above : bottom + height + 20 <= box.height ? bottom + 12 : 8;
    overlay.style.transform = `translate(${x}px, ${y}px) translateX(-50%)`;
    overlay.style.visibility = point.z < -1 || point.z > 1 ? 'hidden' : 'visible';
  });
  useEffect(() => {
    const handle = handleRef?.current;
    if (!handle) return;
    const press = (event: PointerEvent) => {
      event.stopPropagation();
      if (event.button !== 0 || !event.isPrimary || start.current || useDesignStore.getState().gestureBase) return;
      if (controls && 'enabled' in controls && controls.enabled === false) return;
      const box = gl.domElement.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2((event.clientX - box.left) / box.width * 2 - 1, -(event.clientY - box.top) / box.height * 2 + 1), camera);
      const height = (item.elevation + item.height) / 1000 + 0.08;
      const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -height), new THREE.Vector3());
      if (hit) begin(event.clientX, event.clientY, event.pointerId, hit, handle);
    };
    handle.addEventListener('pointerdown', press);
    return () => handle.removeEventListener('pointerdown', press);
  });
  return <group ref={body}>{children}</group>;
}
