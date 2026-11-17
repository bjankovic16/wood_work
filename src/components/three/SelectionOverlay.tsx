import { Html, Line } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, type RefObject } from 'react';
import * as THREE from 'three';
import { computeClearances } from '../../domain/dimensions';
import { isWallMounted, itemRect, localDepthExtent, localToRoom } from '../../domain/geometry';
import type { KitchenItem, Room } from '../../domain/types';
import { useT } from '../../i18n';
import { HANDLE_COLOR as ACCENT } from './gizmoStyle';

/** Free space in front of or behind a unit is shown up to this distance (mm). */
const MAX_AISLE = 1600;

/** Keeps the floating buttons of the selected cabinet just above it on screen, clear of its resize arrows. */
export function SelectionOverlay({ item, overlay }: { item: KitchenItem; overlay: RefObject<HTMLDivElement | null> }) {
  const { camera, gl, scene } = useThree();
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
    scene.getObjectByName('kitchen-resize-tool')?.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (!materials.some((material) => material.visible && material.opacity > 0)) return;
      for (let parent: THREE.Object3D | null = object; parent; parent = parent.parent) if (!parent.visible) return;
      object.geometry.computeBoundingBox();
      if (object.geometry.boundingBox) includeBounds(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
    });
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    const x = THREE.MathUtils.clamp((point.x + 1) * box.width / 2, width / 2 + 8, Math.max(width / 2 + 8, box.width - width / 2 - 8));
    const above = top - height - 12;
    const y = above >= 8 ? above : bottom + height + 20 <= box.height ? bottom + 12 : 8;
    element.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translateX(-50%)`;
    element.style.visibility = point.z < -1 || point.z > 1 ? 'hidden' : 'visible';
  });
  return null;
}

/**
 * While a cabinet is being moved: the free space left on each side of it, to
 * the next unit or wall at the same height, measured as on the plan.
 */
export function MoveClearances({ room, items, item }: { room: Room; items: readonly KitchenItem[]; item: KitchenItem }) {
  const t = useT();
  const clearances = useMemo(() => computeClearances(room, items, item), [room, items, item]);
  // Like a tape measure laid along the floor, or along the underside of a wall unit.
  const height = (isWallMounted(item) ? item.elevation : 0) / 1000 + 0.02;
  const rect = itemRect(item);
  const front = localToRoom(item, item.width / 2, localDepthExtent(item));
  const widthAlongX = Math.abs(localToRoom(item, 1, 0).x - localToRoom(item, 0, 0).x) > 0.5;
  return (
    <group name="kitchen-move-clearances">
      {clearances.map((clearance) => {
        const alongX = clearance.axis === 'x';
        // The whole room in front of a unit is not a measurement anyone needs; an aisle is.
        if (alongX !== widthAlongX && clearance.to - clearance.from > MAX_AISLE) return null;
        // Gaps beside the unit are measured along its front edge, where they are not hidden by the neighbours.
        const at = alongX === widthAlongX ? (alongX ? front.y : front.x) : clearance.at;
        const point = (value: number): [number, number, number] => alongX ? [value / 1000, height, at / 1000] : [at / 1000, height, value / 1000];
        const a = point(clearance.from);
        const b = point(clearance.to);
        return (
          <group key={`${clearance.axis}-${clearance.to <= (alongX ? rect.x : rect.y) + 0.5 ? 'before' : 'after'}`}>
            <Line points={[a, b]} color={ACCENT} lineWidth={1.5} depthTest={false} transparent renderOrder={10} raycast={() => null} />
            <Html position={[(a[0] + b[0]) / 2, height, (a[2] + b[2]) / 2]} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
              <span className="block whitespace-nowrap rounded-md px-1.5 py-1 text-[11px] font-semibold tabular-nums leading-none text-white shadow-sm" style={{ backgroundColor: ACCENT }}>
                {t.mm(Math.round(clearance.to - clearance.from))}
              </span>
            </Html>
          </group>
        );
      })}
    </group>
  );
}
