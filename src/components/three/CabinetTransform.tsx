import { TransformControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useRef, type ComponentRef } from 'react';
import type * as THREE from 'three';
import { attachedWall, itemRect, localToRoom } from '../../domain/geometry';
import { computeDragPlacement } from '../../domain/snapping';
import type { KitchenItem, Point, Wall } from '../../domain/types';
import { setItemPlacement } from '../../store/actions';
import { useDesignStore } from '../../store/designStore';
import { tintGizmo } from './gizmoStyle';
import { snapSettings } from '../../store/viewport';

function syncObject(object: THREE.Group, item: KitchenItem): void {
  const anchor = localToRoom(item, 0, 0);
  object.position.set(anchor.x / 1000, item.elevation / 1000, anchor.y / 1000);
  object.rotation.set(0, -item.rotation * Math.PI / 180, 0);
  object.updateMatrixWorld(true);
}

export function CabinetTransform({ item, object, onReady, onCancel }: { item: KitchenItem; object: THREE.Group; onReady: () => void; onCancel: () => void }) {
  const invalidate = useThree((state) => state.invalidate);
  const element = useThree((state) => state.events.connected || state.gl.domElement);
  const orbit = useThree((state) => state.controls);
  const gesture = useRef<{ item: KitchenItem; centerOffset: Point; wall: Wall | null } | null>(null);
  const control = useRef<ComponentRef<typeof TransformControls>>(null);
  useEffect(() => {
    const transform = control.current;
    if (transform) {
      transform.name = 'kitchen-move-tool';
      transform.connect(element);
      tintGizmo(transform);
    }
    onReady();
    const cancelGesture = () => {
      const start = gesture.current;
      if (!start) return false;
      gesture.current = null;
      syncObject(object, start.item);
      useDesignStore.getState().cancelGesture();
      if (orbit && 'enabled' in orbit && typeof orbit.enabled === 'boolean') orbit.enabled = true;
      invalidate();
      return true;
    };
    const cancel = () => {
      if (cancelGesture()) onCancel();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') cancel();
    };
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    element.addEventListener('lostpointercapture', cancel);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
      element.removeEventListener('lostpointercapture', cancel);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      cancelGesture();
      transform?.dispose();
    };
  }, [element, orbit, object, invalidate, onReady, onCancel]);
  return (
    <TransformControls
      ref={control}
      object={object}
      mode="translate"
      space="world"
      showY={false}
      size={0.85}
      onMouseDown={() => {
        const design = useDesignStore.getState().design;
        const current = design.items.find((candidate) => candidate.id === item.id);
        if (!current) return;
        const rect = itemRect(current);
        const anchor = localToRoom(current, 0, 0);
        gesture.current = { item: current, centerOffset: { x: rect.x + rect.w / 2 - anchor.x, y: rect.y + rect.h / 2 - anchor.y }, wall: attachedWall(current, design.room) };
        useDesignStore.getState().beginGesture();
      }}
      onObjectChange={() => {
        const start = gesture.current;
        if (!start) return;
        const design = useDesignStore.getState().design;
        const placed = computeDragPlacement({
          room: design.room, others: design.items.filter((candidate) => candidate.id !== item.id), item: start.item,
          pointer: { x: object.position.x * 1000 + start.centerOffset.x, y: object.position.z * 1000 + start.centerOffset.y },
          grabOffset: null, previousWall: start.wall, snap: snapSettings(),
        });
        start.wall = placed.wall;
        setItemPlacement(item.id, { x: placed.x, y: placed.y, rotation: placed.rotation });
        syncObject(object, { ...start.item, x: placed.x, y: placed.y, rotation: placed.rotation });
        invalidate();
      }}
      onMouseUp={() => {
        if (!gesture.current) return;
        gesture.current = null;
        useDesignStore.getState().endGesture();
      }}
    />
  );
}
