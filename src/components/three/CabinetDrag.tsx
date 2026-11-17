import { useThree } from '@react-three/fiber';
import { useEffect, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { dragFreedom, floorDragPoint, type Vec3 } from '../../domain/drag3d';
import { attachedWall, itemRect } from '../../domain/geometry';
import { clamp } from '../../domain/math';
import { computeDragPlacement } from '../../domain/snapping';
import type { Design, KitchenItem, Point, Wall } from '../../domain/types';
import { setItemPlacement } from '../../store/actions';
import { useDesignStore } from '../../store/designStore';
import { useUiStore } from '../../store/uiStore';

/** Pointer travel (px) before a press becomes a drag; fingers wobble more than mice. */
const DRAG_START_PX = { mouse: 4, touch: 8 };
/** How long a finger rests on an unselected cabinet before it is picked up. */
export const TOUCH_HOLD_MS = 240;
/** A finger that travels further than this during the hold is turning the view instead. */
const TOUCH_HOLD_SLOP_PX = 6;
/** Edges closer than this on screen snap together. */
const SNAP_DISTANCE_PX = 12;

export interface CabinetDragApi {
  /** Starts a drag from the hand button of the selected cabinet. */
  beginFromHandle: (event: PointerEvent, handle: HTMLElement) => void;
}

interface DragState {
  id: string;
  item: KitchenItem;
  design: Design;
  grab: Vec3;
  freedom: number;
  /** Grabbed point relative to the middle of the footprint, in plan millimetres. */
  centreOffset: Point;
  /** Pointer position relative to the grabbed point on screen (the hand floats above the cabinet). */
  screenOffset: Point;
  wall: Wall | null;
  snapThreshold: number;
  x: number;
  y: number;
  pointerId: number;
  threshold: number;
  moved: boolean;
  orbitEnabled: boolean;
  capture: HTMLElement | null;
  fromHandle: boolean;
}

interface Hold {
  pointerId: number;
  x: number;
  y: number;
  timer: number;
}

/**
 * Moves cabinets by dragging them in the 3D view.
 *
 * With a mouse, pressing any cabinet and dragging moves it. With a finger, a
 * swipe turns the view as it does everywhere else, so an unselected cabinet is
 * picked up by resting the finger on it first; the selected cabinet and its
 * hand button move at once. The grabbed point stays under the pointer, units
 * keep to their wall until clearly pulled away, and one drag is one Undo step.
 */
export function CabinetDragController({ api, onDragStart, onDragEnd, onSelect, onHandleClick }: {
  api: RefObject<CabinetDragApi | null>;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onSelect: (id: string) => void;
  onHandleClick: () => void;
}) {
  const { camera, gl, controls, scene, events, invalidate } = useThree();
  const callbacks = useRef({ onDragStart, onDragEnd, onSelect, onHandleClick });
  callbacks.current = { onDragStart, onDragEnd, onSelect, onHandleClick };

  useEffect(() => {
    const element = gl.domElement;
    let drag: DragState | null = null;
    let hold: Hold | null = null;
    const touches = new Set<number>();

    const orbitEnabled = () => (controls && 'enabled' in controls ? Boolean(controls.enabled) : true);
    const setOrbit = (enabled: boolean) => {
      if (controls && 'enabled' in controls) controls.enabled = enabled;
    };
    const rayAt = (clientX: number, clientY: number) => {
      const box = element.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2((clientX - box.left) / box.width * 2 - 1, -(clientY - box.top) / box.height * 2 + 1), camera);
      return ray;
    };
    const visible = (object: THREE.Object3D) => {
      if (!(object instanceof THREE.Mesh)) return false;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (!materials.some((material) => material.visible && material.opacity > 0)) return false;
      for (let parent: THREE.Object3D | null = object; parent; parent = parent.parent) if (!parent.visible) return false;
      return true;
    };
    const within = (object: THREE.Object3D, test: (parent: THREE.Object3D) => boolean) => {
      for (let parent: THREE.Object3D | null = object; parent; parent = parent.parent) if (test(parent)) return parent;
      return null;
    };
    /** The cabinet in front under the pointer, unless a resize or move arrow is there. */
    const cabinetAt = (clientX: number, clientY: number): { item: KitchenItem; point: THREE.Vector3 } | null => {
      scene.updateMatrixWorld(true);
      const hits = rayAt(clientX, clientY).intersectObjects(scene.children, true).filter(({ object }) => visible(object));
      // Only visible arrows own a press, not their oversized invisible pickers.
      if (hits.some(({ object }) => within(object, (parent) => parent.name === 'kitchen-resize-tool' || parent.name === 'kitchen-move-tool'))) return null;
      const hit = hits[0];
      if (!hit) return null;
      const items = useDesignStore.getState().design.items;
      const group = within(hit.object, (parent) => parent.name !== '' && items.some((item) => item.id === parent.name));
      const item = group && items.find((candidate) => candidate.id === group.name);
      return item ? { item, point: hit.point } : null;
    };
    const project = (point: Vec3): Point => {
      const box = element.getBoundingClientRect();
      const projected = new THREE.Vector3(...point).project(camera);
      return { x: box.left + (projected.x + 1) * box.width / 2, y: box.top + (1 - projected.y) * box.height / 2 };
    };

    const begin = (item: KitchenItem, grab: Vec3, event: PointerEvent, capture: HTMLElement | null, fromHandle: boolean) => {
      const design = useDesignStore.getState().design;
      const rect = itemRect(item);
      const position: Vec3 = [camera.position.x, camera.position.y, camera.position.z];
      const forward = camera.getWorldDirection(new THREE.Vector3());
      const depth = Math.max(0.1, (grab[0] - position[0]) * forward.x + (grab[1] - position[1]) * forward.y + (grab[2] - position[2]) * forward.z);
      const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 45;
      const millimetresPerPixel = 2 * depth * Math.tan(fov * Math.PI / 360) * 1000 / Math.max(1, element.getBoundingClientRect().height);
      const onScreen = fromHandle ? project(grab) : { x: event.clientX, y: event.clientY };
      drag = {
        id: item.id, item, design, grab, freedom: dragFreedom(position, grab),
        centreOffset: { x: grab[0] * 1000 - rect.x - rect.w / 2, y: grab[2] * 1000 - rect.y - rect.h / 2 },
        screenOffset: { x: event.clientX - onScreen.x, y: event.clientY - onScreen.y },
        wall: attachedWall(item, design.room),
        snapThreshold: clamp(millimetresPerPixel * SNAP_DISTANCE_PX, 15, 120),
        x: event.clientX, y: event.clientY, pointerId: event.pointerId,
        threshold: event.pointerType === 'touch' ? DRAG_START_PX.touch : DRAG_START_PX.mouse,
        moved: false, orbitEnabled: orbitEnabled(), capture, fromHandle,
      };
      setOrbit(false);
      capture?.setPointerCapture(event.pointerId);
    };

    const finish = (cancel: boolean) => {
      const current = drag;
      if (!current) return;
      drag = null;
      const store = useDesignStore.getState();
      if (current.moved && store.gestureBase === current.design) {
        if (cancel) store.cancelGesture();
        else store.endGesture();
      }
      setOrbit(current.orbitEnabled);
      if (current.capture?.hasPointerCapture(current.pointerId)) current.capture.releasePointerCapture(current.pointerId);
      element.style.cursor = '';
      if (current.moved) callbacks.current.onDragEnd();
      else if (!cancel) {
        callbacks.current.onSelect(current.id);
        if (current.fromHandle) callbacks.current.onHandleClick();
      }
      invalidate();
    };

    const clearHold = () => {
      if (!hold) return;
      window.clearTimeout(hold.timer);
      hold = null;
    };

    const move = (event: PointerEvent) => {
      if (hold && event.pointerId === hold.pointerId && Math.hypot(event.clientX - hold.x, event.clientY - hold.y) > TOUCH_HOLD_SLOP_PX) clearHold();
      const current = drag;
      if (!current || event.pointerId !== current.pointerId) return;
      const store = useDesignStore.getState();
      if (current.moved ? store.gestureBase !== current.design : store.design !== current.design) { finish(true); return; }
      if (!current.moved) {
        if (Math.hypot(event.clientX - current.x, event.clientY - current.y) < current.threshold) return;
        store.beginGesture();
        current.moved = true;
        callbacks.current.onDragStart(current.id);
        element.style.cursor = 'grabbing';
      }
      const ray = rayAt(event.clientX - current.screenOffset.x, event.clientY - current.screenOffset.y).ray;
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
      const point = floorDragPoint({
        origin: [ray.origin.x, ray.origin.y, ray.origin.z], direction: [ray.direction.x, ray.direction.y, ray.direction.z],
        grab: current.grab, right: [right.x, right.y, right.z], freedom: current.freedom,
      });
      if (!point) return;
      const ui = useUiStore.getState();
      const placed = computeDragPlacement({
        room: store.design.room, others: store.design.items.filter((entry) => entry.id !== current.id), item: current.item,
        // The middle of the footprint decides which wall the unit belongs to, as it does on the plan.
        pointer: { x: point.x * 1000 - current.centreOffset.x, y: point.z * 1000 - current.centreOffset.y },
        grabOffset: null, previousWall: current.wall, stickyWall: true,
        snap: { enabled: ui.snapEnabled, grid: ui.gridSize, threshold: current.snapThreshold },
      });
      current.wall = placed.wall;
      setItemPlacement(current.id, placed);
      invalidate();
    };

    const down = (event: PointerEvent) => {
      if (event.pointerType === 'touch') {
        touches.add(event.pointerId);
        // A second finger means pinch or pan: never a pick-up.
        if (touches.size > 1) clearHold();
      }
      if (event.button !== 0 || !event.isPrimary || drag || useDesignStore.getState().gestureBase) return;
      if (!orbitEnabled()) return;
      const target = cabinetAt(event.clientX, event.clientY);
      if (!target) return;
      const grab: Vec3 = [target.point.x, target.point.y, target.point.z];
      if (event.pointerType === 'touch' && useUiStore.getState().selectedId !== target.item.id) {
        // Let the view turn as usual; resting the finger picks the cabinet up instead.
        clearHold();
        const { pointerId, clientX, clientY, pointerType, isPrimary, button } = event;
        hold = {
          pointerId, x: clientX, y: clientY,
          timer: window.setTimeout(() => {
            hold = null;
            const item = useDesignStore.getState().design.items.find((entry) => entry.id === target.item.id);
            if (!item || drag || useDesignStore.getState().gestureBase || !touches.has(pointerId)) return;
            begin(item, grab, { pointerId, clientX, clientY, pointerType, isPrimary, button } as PointerEvent, null, false);
            callbacks.current.onSelect(item.id);
            if ('vibrate' in navigator) navigator.vibrate(8);
            invalidate();
          }, TOUCH_HOLD_MS),
        };
        return;
      }
      event.stopImmediatePropagation();
      // Keep R3F's click/double-click bookkeeping without starting native gizmos or orbit.
      events.handlers?.onPointerDown(event);
      begin(target.item, grab, event, element, false);
    };

    const up = (event: PointerEvent) => {
      touches.delete(event.pointerId);
      if (hold?.pointerId === event.pointerId) clearHold();
      if (event.pointerId === drag?.pointerId) finish(false);
    };
    const cancel = () => { clearHold(); finish(true); };
    const pointerCancel = (event: PointerEvent) => { touches.delete(event.pointerId); cancel(); };
    const lostCapture = (event: PointerEvent) => {
      if (drag?.capture && event.pointerId === drag.pointerId && event.target === drag.capture) cancel();
    };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') cancel(); };
    const visibility = () => { if (document.visibilityState === 'hidden') cancel(); };
    const unsubscribe = useDesignStore.subscribe((state) => {
      if (drag && (drag.moved ? state.gestureBase !== drag.design : state.design !== drag.design)) cancel();
    });

    api.current = {
      beginFromHandle: (event, handle) => {
        event.stopPropagation();
        if (event.button !== 0 || !event.isPrimary || drag || useDesignStore.getState().gestureBase) return;
        if (!orbitEnabled()) return;
        const id = useUiStore.getState().selectedId;
        const item = useDesignStore.getState().design.items.find((entry) => entry.id === id);
        if (!item) return;
        clearHold();
        const rect = itemRect(item);
        begin(item, [(rect.x + rect.w / 2) / 1000, (item.elevation + item.height) / 1000, (rect.y + rect.h / 2) / 1000], event, handle, true);
      },
    };

    element.addEventListener('pointerdown', down, true);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', pointerCancel);
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', key);
    window.addEventListener('lostpointercapture', lostCapture);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      api.current = null;
      unsubscribe();
      element.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', pointerCancel);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', key);
      window.removeEventListener('lostpointercapture', lostCapture);
      document.removeEventListener('visibilitychange', visibility);
      cancel();
    };
  }, [api, camera, controls, events, gl, invalidate, scene]);

  return null;
}
