import { TransformControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useRef, type ComponentRef } from 'react';
import type * as THREE from 'three';
import { featureDragPlacement, openingDragPlacement, type RoomObjectSelection } from '../../domain/roomObjectPlacement';
import { openingFrame, wallPoint } from '../../domain/walls';
import { updateOpening, updateRoomFeature } from '../../store/actions';
import { useDesignStore } from '../../store/designStore';
import { useUiStore } from '../../store/uiStore';

function syncObject(object: THREE.Group, selection: RoomObjectSelection) {
  const { room, openings } = useDesignStore.getState().design;
  if (selection.type === 'feature') {
    const feature = room.features?.find((feature) => feature.id === selection.id);
    if (feature) object.position.set((feature.x + feature.width / 2) / 1000, room.height / 2000, (feature.y + feature.depth / 2) / 1000);
  } else {
    const opening = openings.find((opening) => opening.id === selection.id);
    const frame = opening && openingFrame(room, opening);
    if (opening && frame) {
      const centre = wallPoint(frame, opening.offset + opening.width / 2);
      object.position.set(centre.x / 1000, (opening.sill + opening.height / 2) / 1000, centre.y / 1000);
      object.rotation.set(0, -frame.angle * Math.PI / 180, 0);
    }
  }
  object.updateMatrixWorld(true);
}

export function RoomObjectTransform({ selection, object, onReady, onCancel, onBlocked }: {
  selection: RoomObjectSelection; object: THREE.Group; onReady: () => void; onCancel: () => void; onBlocked: (blocked: boolean) => void;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const element = useThree((state) => state.events.connected || state.gl.domElement);
  const orbit = useThree((state) => state.controls);
  const control = useRef<ComponentRef<typeof TransformControls>>(null);
  const gesture = useRef<ReturnType<typeof useDesignStore.getState>['design'] | null>(null);
  const opening = useDesignStore((state) => state.design.openings.find((opening) => selection.type === 'opening' && opening.id === selection.id));

  useEffect(() => {
    const transform = control.current;
    if (transform) {
      transform.name = 'kitchen-room-move-tool';
      transform.connect(element);
    }
    onReady();
    const cancelGesture = () => {
      if (!gesture.current) return false;
      if (useDesignStore.getState().gestureBase === gesture.current) useDesignStore.getState().cancelGesture();
      gesture.current = null;
      syncObject(object, selection);
      if (orbit && 'enabled' in orbit && typeof orbit.enabled === 'boolean') orbit.enabled = true;
      invalidate();
      return true;
    };
    const cancel = () => { if (cancelGesture()) onCancel(); };
    const keyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') cancel(); };
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
  }, [element, orbit, object, selection, invalidate, onReady, onCancel]);

  return <TransformControls
    ref={control}
    object={object}
    mode="translate"
    space={selection.type === 'opening' ? 'local' : 'world'}
    showX
    showY={opening?.kind === 'window'}
    showZ={selection.type === 'feature'}
    size={0.85}
    onMouseDown={() => {
      const store = useDesignStore.getState();
      store.beginGesture();
      gesture.current = store.design;
      onBlocked(false);
    }}
    onObjectChange={() => {
      const store = useDesignStore.getState();
      if (!gesture.current || store.gestureBase !== gesture.current) return;
      const { room, openings } = store.design;
      const centre = { x: object.position.x * 1000, y: object.position.z * 1000, elevation: object.position.y * 1000 };
      const ui = useUiStore.getState();
      const grid = ui.snapEnabled ? ui.gridSize : 0;
      if (selection.type === 'feature') {
        const feature = room.features?.find((feature) => feature.id === selection.id);
        if (!feature) return;
        const placement = featureDragPlacement(room, feature, centre, grid);
        onBlocked(placement === null);
        if (placement) updateRoomFeature(feature.id, placement);
      } else {
        const current = openings.find((opening) => opening.id === selection.id);
        if (!current) return;
        const next = openingDragPlacement(room, current, centre, grid);
        updateOpening(current.id, { offset: next.offset, sill: next.sill });
      }
      syncObject(object, selection);
      invalidate();
    }}
    onMouseUp={() => {
      if (!gesture.current) return;
      if (useDesignStore.getState().gestureBase === gesture.current) useDesignStore.getState().endGesture();
      gesture.current = null;
    }}
  />;
}
