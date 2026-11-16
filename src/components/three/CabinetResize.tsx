import { TransformControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type ComponentRef } from 'react';
import * as THREE from 'three';
import type { SizeField } from '../../domain/catalog';
import { cabinetResize } from '../../domain/cabinetResize';
import { replaceItem } from '../../domain/designOps';
import { localToRoom, roomToLocal } from '../../domain/geometry';
import type { Design, KitchenItem } from '../../domain/types';
import { useDesignStore } from '../../store/designStore';
import { useUiStore } from '../../store/uiStore';

function syncHandle(object: THREE.Group, item: KitchenItem, field: SizeField) {
  const u = field === 'width' ? item.width : field === 'width2' ? item.depth / 2 : item.width / 2;
  const v = field === 'width2' ? item.width2 ?? item.width : field === 'depth' ? item.depth : item.depth / 2;
  const point = localToRoom(item, u, v);
  object.position.set(point.x / 1000, (item.elevation + (field === 'height' ? item.height : item.height / 2)) / 1000, point.y / 1000);
  object.rotation.set(0, -item.rotation * Math.PI / 180, 0);
  object.updateMatrixWorld(true);
}

export function CabinetResize({ item, field, onReady, onCancel, onBlocked }: {
  item: KitchenItem; field: SizeField; onReady: () => void; onCancel: () => void; onBlocked: (blocked: boolean) => void;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const element = useThree((state) => state.events.connected || state.gl.domElement);
  const orbit = useThree((state) => state.controls);
  const proxy = useMemo(() => new THREE.Group(), []);
  const control = useRef<ComponentRef<typeof TransformControls>>(null);
  const gesture = useRef<{ design: Design; item: KitchenItem } | null>(null);

  useEffect(() => {
    syncHandle(proxy, item, field);
    invalidate();
  }, [proxy, item, field, invalidate]);

  useEffect(() => {
    const transform = control.current;
    if (transform) {
      transform.name = 'kitchen-resize-tool';
      transform.connect(element);
    }
    onReady();
    const cancelGesture = () => {
      const start = gesture.current;
      if (!start) return false;
      gesture.current = null;
      const store = useDesignStore.getState();
      if (store.gestureBase === start.design) store.cancelGesture();
      const current = useDesignStore.getState().design.items.find((entry) => entry.id === start.item.id);
      if (current) syncHandle(proxy, current, field);
      if (orbit && 'enabled' in orbit && typeof orbit.enabled === 'boolean') orbit.enabled = true;
      invalidate();
      return true;
    };
    const cancel = () => { if (cancelGesture()) onCancel(); };
    const keyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') { cancelGesture(); onCancel(); } };
    const visibility = () => { if (document.visibilityState === 'hidden') cancel(); };
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
      document.removeEventListener('visibilitychange', visibility);
      cancelGesture();
      transform?.dispose();
    };
  }, [element, orbit, proxy, field, invalidate, onReady, onCancel]);

  return <>
    <primitive object={proxy} />
    <TransformControls ref={control} object={proxy} mode="translate" space="local" size={0.95}
      showX={field === 'width'} showY={field === 'height'} showZ={field === 'depth' || field === 'width2'}
      onMouseDown={() => {
        const store = useDesignStore.getState();
        const current = store.design.items.find((entry) => entry.id === item.id);
        if (!current) return;
        store.beginGesture();
        gesture.current = { design: store.design, item: current };
        onBlocked(false);
      }}
      onObjectChange={() => {
        const start = gesture.current;
        const store = useDesignStore.getState();
        if (!start || store.gestureBase !== start.design) return;
        const local = roomToLocal(start.item, { x: proxy.position.x * 1000, y: proxy.position.z * 1000 });
        const value = field === 'height' ? proxy.position.y * 1000 - start.item.elevation : field === 'width' ? local.x : local.y;
        const ui = useUiStore.getState();
        const next = cabinetResize(start.item, field, value, store.design.room, ui.snapEnabled ? ui.gridSize : 0);
        onBlocked(next === null);
        if (next) store.apply((design) => replaceItem(design, next));
        const current = useDesignStore.getState().design.items.find((entry) => entry.id === start.item.id);
        if (current) syncHandle(proxy, current, field);
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
