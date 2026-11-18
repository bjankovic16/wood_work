import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, type RefObject } from 'react';
import * as THREE from 'three';
import { localToRoom } from '../../domain/geometry';
import type { KitchenItem } from '../../domain/types';
import { overlayTopInset } from './overlayInset';

/** Keeps the floating buttons just above the selected cabinet on screen. */
export function SelectionOverlay({ item, overlay }: { item: KitchenItem; overlay: RefObject<HTMLDivElement | null> }) {
  const { camera, gl, scene, invalidate } = useThree();
  useEffect(() => {
    const sheet = document.querySelector('[data-testid="item-sheet"]');
    const observer = new ResizeObserver(() => invalidate());
    if (sheet) observer.observe(sheet);
    return () => observer.disconnect();
  }, [item.id, invalidate]);
  useFrame(() => {
    const element = overlay.current;
    if (!element) return;
    const centre = localToRoom(item, item.width / 2, item.depth / 2);
    const point = new THREE.Vector3(centre.x / 1000, (item.elevation + item.height) / 1000 + 0.08, centre.y / 1000).project(camera);
    const box = gl.domElement.getBoundingClientRect();
    let top = (1 - point.y) * box.height / 2;
    let bottom = top;
    const includeBounds = (bounds: THREE.Box3) => {
      for (const x of [bounds.min.x, bounds.max.x]) {
        for (const y of [bounds.min.y, bounds.max.y]) {
          for (const z of [bounds.min.z, bounds.max.z]) {
            const screenY = (1 - new THREE.Vector3(x, y, z).project(camera).y) * box.height / 2;
            top = Math.min(top, screenY);
            bottom = Math.max(bottom, screenY);
          }
        }
      }
    };
    const body = scene.getObjectByName(item.id);
    if (body) includeBounds(new THREE.Box3().setFromObject(body));
    const arrows = scene.getObjectByName('kitchen-resize-tool');
    if (arrows) includeBounds(new THREE.Box3().setFromObject(arrows));
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    const sheet = document.querySelector('[data-testid="item-sheet"]')?.getBoundingClientRect();
    const availableHeight = Math.min(box.height, sheet ? sheet.top - box.top - 8 : box.height);
    const hint = document.querySelector('[data-testid="cabinet-mode-hint"]')?.getBoundingClientRect();
    const minY = Math.max(overlayTopInset(element, box.top), hint ? hint.bottom - box.top : 0) + 8;
    const x = THREE.MathUtils.clamp((point.x + 1) * box.width / 2, width / 2 + 8, Math.max(width / 2 + 8, box.width - width / 2 - 8));
    const above = top - height - 12;
    const maxY = Math.max(8, availableHeight - height - 8);
    const y = THREE.MathUtils.clamp(above >= minY ? above : bottom + height + 20 <= availableHeight ? bottom + 12 : maxY,
      Math.min(minY, maxY), maxY);
    element.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translateX(-50%)`;
    element.style.visibility = point.z < -1 || point.z > 1 ? 'hidden' : 'visible';
  });
  return null;
}
