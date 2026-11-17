import { TransformControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type ComponentRef, type RefObject } from 'react';
import * as THREE from 'three';
import type { SizeField } from '../../domain/catalog';
import { cabinetResize } from '../../domain/cabinetResize';
import { replaceItem } from '../../domain/designOps';
import { localToRoom, roomToLocal } from '../../domain/geometry';
import type { Design, KitchenItem } from '../../domain/types';
import { useDesignStore } from '../../store/designStore';
import { tintGizmo } from './gizmoStyle';
import { useUiStore } from '../../store/uiStore';

const AXES = ['X', 'Y', 'Z'] as const;

function useResizeLabels(control: RefObject<ComponentRef<typeof TransformControls> | null>, item: KitchenItem, overlay: RefObject<HTMLDivElement | null>) {
  const { camera, size } = useThree();
  useFrame(() => {
    const tool = control.current;
    if (!tool) return;
    tool.updateMatrixWorld();
    for (const axis of AXES) {
      const label = overlay.current?.querySelector<HTMLSpanElement>(`[data-resize-axis="${axis}"]`);
      if (!label) continue;
      const tip = new THREE.Vector3();
      let furthest = -Infinity;
      const direction = new THREE.Vector3(axis === 'X' ? 1 : 0, axis === 'Y' ? 1 : 0, axis === 'Z' ? 1 : 0)
        .applyEuler(new THREE.Euler(0, -item.rotation * Math.PI / 180, 0));
      tool.traverse((object) => {
        if (!(object instanceof THREE.Mesh) || object.name !== axis) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        if (!materials.some((material) => material.visible && material.opacity > 0)) return;
        for (let parent: THREE.Object3D | null = object; parent; parent = parent.parent) if (!parent.visible) return;
        object.geometry.computeBoundingBox();
        const centre = object.geometry.boundingBox?.clone().applyMatrix4(object.matrixWorld).getCenter(new THREE.Vector3());
        if (centre && centre.dot(direction) > furthest) {
          furthest = centre.dot(direction);
          tip.copy(centre);
        }
      });
      label.style.visibility = 'hidden';
      if (furthest === -Infinity) continue;
      const point = tip.project(camera);
      if (point.z < -1 || point.z > 1 || Math.abs(point.x) > 1 || Math.abs(point.y) > 1) continue;
      const x = THREE.MathUtils.clamp((point.x + 1) * size.width / 2 + 12, 8, Math.max(8, size.width - label.offsetWidth - 8));
      const y = THREE.MathUtils.clamp((1 - point.y) * size.height / 2 + 12, 8, Math.max(8, size.height - label.offsetHeight - 8));
      label.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      label.style.visibility = 'visible';
    }
  });
}

function syncHandle(object: THREE.Group, item: KitchenItem, field: SizeField, allAxes: boolean) {
  const u = allAxes || field === 'width' ? item.width : field === 'width2' ? item.depth / 2 : item.width / 2;
  const v = allAxes && item.kind === 'corner' || field === 'width2' ? item.width2 ?? item.width : allAxes || field === 'depth' ? item.depth : item.depth / 2;
  const point = localToRoom(item, u, v);
  object.position.set(point.x / 1000, (item.elevation + (allAxes || field === 'height' ? item.height : item.height / 2)) / 1000, point.y / 1000);
  object.rotation.set(0, -item.rotation * Math.PI / 180, 0);
  object.updateMatrixWorld(true);
}

export function CabinetResize({ item, field, allAxes = false, labels, onReady, onCancel, onBlocked }: {
  item: KitchenItem; field: SizeField; allAxes?: boolean; labels: RefObject<HTMLDivElement | null>;
  onReady: () => void; onCancel: () => void; onBlocked: (blocked: boolean) => void;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const element = useThree((state) => state.events.connected || state.gl.domElement);
  const orbit = useThree((state) => state.controls);
  const proxy = useMemo(() => new THREE.Group(), []);
  const control = useRef<ComponentRef<typeof TransformControls>>(null);
  const gesture = useRef<{ design: Design; item: KitchenItem } | null>(null);
  const activeField = useRef(field);
  const resizePress = useRef(false);
  useResizeLabels(control, item, labels);

  useEffect(() => {
    syncHandle(proxy, item, field, allAxes);
    invalidate();
  }, [proxy, item, field, allAxes, invalidate]);

  useEffect(() => {
    const transform = control.current;
    if (transform) {
      transform.name = 'kitchen-resize-tool';
      transform.connect(element);
      tintGizmo(transform);
      if (allAxes) {
        const planes: THREE.Object3D[] = [];
        transform.traverse((child) => { if (['XY', 'YZ', 'XZ', 'XYZ'].includes(child.name)) planes.push(child); });
        for (const plane of planes) plane.removeFromParent();
      }
    }
    onReady();
    const cancelGesture = () => {
      const start = gesture.current;
      if (!start) return false;
      gesture.current = null;
      const store = useDesignStore.getState();
      if (store.gestureBase === start.design) store.cancelGesture();
      const current = useDesignStore.getState().design.items.find((entry) => entry.id === start.item.id);
      if (current) syncHandle(proxy, current, field, allAxes);
      if (orbit && 'enabled' in orbit && typeof orbit.enabled === 'boolean') orbit.enabled = true;
      invalidate();
      return true;
    };
    const cancel = () => { if (cancelGesture()) onCancel(); };
    const keyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') { cancelGesture(); onCancel(); } };
    const visibility = () => { if (document.visibilityState === 'hidden') cancel(); };
    const pointerDown = () => { resizePress.current = false; };
    // Native gizmos own their release click, even over another cabinet or empty canvas.
    const click = (event: MouseEvent) => { if (resizePress.current) event.stopImmediatePropagation(); };
    element.addEventListener('pointerdown', pointerDown, true);
    element.addEventListener('click', click, true);
    window.addEventListener('keydown', keyDown);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    element.addEventListener('lostpointercapture', cancel);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
      element.removeEventListener('lostpointercapture', cancel);
      element.removeEventListener('pointerdown', pointerDown, true);
      element.removeEventListener('click', click, true);
      document.removeEventListener('visibilitychange', visibility);
      cancelGesture();
      transform?.dispose();
    };
  }, [element, orbit, proxy, field, allAxes, invalidate, onReady, onCancel]);

  return <>
    <primitive object={proxy} />
    <TransformControls ref={control} object={proxy} mode="translate" space="local" size={0.95}
      showX={allAxes || field === 'width'} showY={allAxes || field === 'height'} showZ={allAxes || field === 'depth' || field === 'width2'}
      onMouseDown={() => {
        const store = useDesignStore.getState();
        const current = store.design.items.find((entry) => entry.id === item.id);
        if (!current) return;
        const axis: unknown = control.current && Reflect.get(control.current, 'axis');
        if (allAxes && axis !== 'X' && axis !== 'Y' && axis !== 'Z') return;
        activeField.current = allAxes ? axis === 'X' ? 'width' : axis === 'Y' ? 'height' : current.kind === 'corner' ? 'width2' : 'depth' : field;
        store.beginGesture();
        gesture.current = { design: store.design, item: current };
        resizePress.current = true;
        onBlocked(false);
      }}
      onObjectChange={() => {
        const start = gesture.current;
        const store = useDesignStore.getState();
        if (!start || store.gestureBase !== start.design) return;
        const local = roomToLocal(start.item, { x: proxy.position.x * 1000, y: proxy.position.z * 1000 });
        const dimension = activeField.current;
        const value = dimension === 'height' ? proxy.position.y * 1000 - start.item.elevation : dimension === 'width' ? local.x : local.y;
        const ui = useUiStore.getState();
        const next = cabinetResize(start.item, dimension, value, store.design.room, ui.snapEnabled ? ui.gridSize : 0);
        onBlocked(next === null);
        if (next) store.apply((design) => replaceItem(design, next));
        const current = useDesignStore.getState().design.items.find((entry) => entry.id === start.item.id);
        if (current) syncHandle(proxy, current, field, allAxes);
        invalidate();
      }}
      onMouseUp={() => {
        const start = gesture.current;
        if (!start) return;
        gesture.current = null;
        if (useDesignStore.getState().gestureBase === start.design) useDesignStore.getState().endGesture();
      }}
    />
  </>;
}
