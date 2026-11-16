import { useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { attachedWall, itemRect } from '../../domain/geometry';
import { computeDragPlacement } from '../../domain/snapping';
import type { Design, KitchenItem, Point, Wall } from '../../domain/types';
import { setItemPlacement } from '../../store/actions';
import { useDesignStore } from '../../store/designStore';
import { snapSettings } from '../../store/viewport';

export function DirectCabinetDrag({ item, onStart, onSelect, children }: {
  item: KitchenItem; onStart: (id: string) => void; onSelect: (id: string) => void; children: ReactNode;
}) {
  const { camera, gl, controls, scene, invalidate } = useThree();
  const start = useRef<{
    design: Design; item: KitchenItem; plane: THREE.Plane; offset: Point; wall: Wall | null;
    x: number; y: number; pointerId: number; moved: boolean; orbitEnabled: boolean;
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
      if (element.hasPointerCapture(current.pointerId)) element.releasePointerCapture(current.pointerId);
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
    element.addEventListener('lostpointercapture', cancel);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      unsubscribe();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', key);
      element.removeEventListener('lostpointercapture', cancel);
      document.removeEventListener('visibilitychange', visibility);
      cancel();
    };
  }, [camera, controls, gl, invalidate, onStart, onSelect]);

  const down = (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0 || !event.isPrimary || start.current || useDesignStore.getState().gestureBase) return;
    if (controls && 'enabled' in controls && controls.enabled === false) return;
    // The gizmo's native picker and R3F's cabinet events share the same canvas.
    for (const name of ['kitchen-resize-tool', 'kitchen-move-tool']) {
      const tool = scene.getObjectByName(name);
      if (tool && typeof Reflect.get(tool, 'axis') === 'string') return;
    }
    event.stopPropagation();
    const design = useDesignStore.getState().design;
    const rect = itemRect(item);
    const orbitEnabled = controls && 'enabled' in controls ? Boolean(controls.enabled) : true;
    if (controls && 'enabled' in controls) controls.enabled = false;
    start.current = {
      design, item, plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -event.point.y),
      offset: { x: event.point.x * 1000 - rect.x - rect.w / 2, y: event.point.z * 1000 - rect.y - rect.h / 2 },
      wall: attachedWall(item, design.room), x: event.clientX, y: event.clientY,
      pointerId: event.pointerId, moved: false, orbitEnabled,
    };
    gl.domElement.setPointerCapture(event.pointerId);
  };
  return <group onPointerDown={down}>{children}</group>;
}
