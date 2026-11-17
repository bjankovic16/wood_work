import { backWall, isWallMounted, itemRect, localDepthExtent, localToRoom, WALLS } from './geometry';
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
  if (focus) return cabinetFocusPose(room, focus, ratio);
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

/**
 * A close three-quarter view of one cabinet, from the side of the room it faces:
 * from above for floor units, so open drawers show their insides, and from eye
 * level for wall and tall units. Leaves room for its doors and drawers to open.
 */
export function cabinetFocusPose(room: Room, item: KitchenItem, aspect: number): CameraPose {
  const ratio = Math.max(0.1, aspect);
  const rect = itemRect(item);
  const centre = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
  const target: ScenePoint = [centre.x / 1000, (item.elevation + item.height / 2) / 1000, centre.y / 1000];
  const origin = localToRoom(item, 0, 0);
  const along = localToRoom(item, 1, 0);
  const out = localToRoom(item, 0, 1);
  const side = { x: along.x - origin.x, y: along.y - origin.y };
  const front = { x: out.x - origin.x, y: out.y - origin.y };
  // Stand on the side nearer the middle of the room, clear of side walls and tall neighbours.
  const lean = (room.width / 2 - centre.x) * side.x + (room.depth / 2 - centre.y) * side.y < 0 ? -0.5 : 0.5;
  const rise = isWallMounted(item) ? 0.1 : item.height > 1000 ? 0.28 : 0.8;
  const length = Math.hypot(1, lean, rise);
  const radius = Math.hypot(item.width + 500, item.height + 150, localDepthExtent(item) + 700) / 2000;
  const halfVertical = CAMERA_FOV * Math.PI / 360;
  const halfAngle = Math.min(halfVertical, Math.atan(Math.tan(halfVertical) * ratio));
  const distance = Math.max(1.6, radius / Math.sin(halfAngle) * 1.18);
  return {
    target,
    position: [
      target[0] + (front.x + side.x * lean) / length * distance,
      target[1] + rise / length * distance,
      target[2] + (front.y + side.y * lean) / length * distance,
    ],
  };
}

/**
 * The view part-way from one camera pose to another (t from 0 to 1): the point
 * looked at moves in a straight line while the camera swings around it, so the
 * kitchen stays in view for the whole move.
 */
export function blendPoses(from: CameraPose, to: CameraPose, t: number): CameraPose {
  if (t <= 0) return from;
  if (t >= 1) return to;
  const mix = (a: number, b: number) => a + (b - a) * t;
  const target: ScenePoint = [mix(from.target[0], to.target[0]), mix(from.target[1], to.target[1]), mix(from.target[2], to.target[2])];
  const arm = (pose: CameraPose) => {
    const offset = pose.position.map((value, index) => value - pose.target[index]);
    const radius = Math.hypot(offset[0], offset[1], offset[2]);
    const level = Math.hypot(offset[0], offset[2]);
    return {
      radius,
      // 0 is straight above the target.
      polar: Math.acos(Math.max(-1, Math.min(1, radius > 0 ? offset[1] / radius : 1))),
      // Straight above has no compass direction of its own.
      turn: level > radius * 1e-3 ? Math.atan2(offset[0], offset[2]) : null,
    };
  };
  const a = arm(from);
  const b = arm(to);
  const startTurn = a.turn ?? b.turn ?? 0;
  let sweep = (b.turn ?? startTurn) - startTurn;
  // The short way round.
  sweep -= Math.round(sweep / (2 * Math.PI)) * 2 * Math.PI;
  const radius = mix(a.radius, b.radius);
  const polar = mix(a.polar, b.polar);
  const turn = startTurn + sweep * t;
  return {
    target,
    position: [
      target[0] + radius * Math.sin(polar) * Math.sin(turn),
      target[1] + radius * Math.cos(polar),
      target[2] + radius * Math.sin(polar) * Math.cos(turn),
    ],
  };
}
