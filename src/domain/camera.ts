import { backWall, itemRect, WALLS } from './geometry';
import type { KitchenItem, Room, Wall } from './types';

export type CameraView = 'perspective' | 'front' | 'top';
export type ScenePoint = [number, number, number];
export interface CameraPose { position: ScenePoint; target: ScenePoint }
export const CAMERA_FOV = 45;

export function kitchenCameraPose(room: Room, items: readonly KitchenItem[], aspect: number, view: CameraView = 'perspective', focus?: KitchenItem): CameraPose {
  const W = room.width / 1000;
  const D = room.depth / 1000;
  const tanHalf = Math.tan(CAMERA_FOV * Math.PI / 360);
  const ratio = Math.max(0.1, aspect);
  if (focus) {
    const rect = itemRect(focus);
    const target: ScenePoint = [(rect.x + rect.w / 2) / 1000, (focus.elevation + focus.height / 2) / 1000, (rect.y + rect.h / 2) / 1000];
    const distance = Math.max(1.2, Math.max(rect.w / ratio, rect.h, focus.height) / 2000 / tanHalf * 1.6);
    const side = backWall(focus.rotation);
    const offset: Record<Wall, ScenePoint> = { top: [distance * 0.18, distance * 0.25, distance], bottom: [-distance * 0.18, distance * 0.25, -distance], left: [distance, distance * 0.25, -distance * 0.18], right: [-distance, distance * 0.25, distance * 0.18] };
    return { target, position: [target[0] + offset[side][0], target[1] + offset[side][1], target[2] + offset[side][2]] };
  }
  if (view === 'top') {
    const height = room.height / 1000 + Math.max(3, (Math.max(W / ratio, D) / 2 + 0.4) / tanHalf);
    return { position: [W / 2, height, D / 2 + 0.001], target: [W / 2, 0, D / 2] };
  }
  const counts = new Map<Wall, number>(WALLS.map((wall) => [wall, 0]));
  for (const item of items) counts.set(backWall(item.rotation), (counts.get(backWall(item.rotation)) ?? 0) + 1);
  const facing = [...counts].sort((a, b) => b[1] - a[1])[0][0];
  const horizontal = facing === 'top' || facing === 'bottom';
  const span = horizontal ? W : D;
  const reach = horizontal ? D : W;
  const distance = Math.max(3, (room.height / 2000 + 0.4) / tanHalf, span / 2 / (tanHalf * ratio) + reach * 0.35);
  const height = view === 'front' ? 1.05 : 1.4 + distance * 0.18;
  const skew = view === 'front' ? 0 : 0.18;
  const position: Record<Wall, ScenePoint> = {
    top: [W / 2 + W * skew, height, D / 2 + distance],
    bottom: [W / 2 - W * skew, height, D / 2 - distance],
    left: [W / 2 + distance, height, D / 2 - D * skew],
    right: [W / 2 - distance, height, D / 2 + D * skew],
  };
  return { position: position[facing], target: [W / 2, 0.95, D / 2] };
}
