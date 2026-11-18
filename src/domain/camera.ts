import { backWall, isWallMounted, itemRect, localDepthExtent, localToRoom, WALLS } from './geometry';
import type { KitchenItem, Room, Wall } from './types';

export type CameraView = 'perspective' | 'studio' | 'front' | 'top';
export type ScenePoint = [number, number, number];
export interface CameraPose { position: ScenePoint; target: ScenePoint }
export const CAMERA_FOV = 45;
export const STUDIO_FOV = 28;
export const STUDIO_BACKDROP = '#27272b';

/** Fit the projected furniture, not the empty envelope around a small kitchen. */
function studioPose(room: Room, items: readonly KitchenItem[], aspect: number): CameraPose {
  const points: ScenePoint[] = [];
  let faceX = 0, faceZ = 0;
  for (const item of items) {
    const r = item.rotation * Math.PI / 180;
    const weight = item.width * (isWallMounted(item) ? 2 : 1);
    faceX -= weight * Math.sin(r);
    faceZ += weight * Math.cos(r);
    const depth = localDepthExtent(item);
    for (const x of [0, item.width]) for (const z of [0, depth + 40]) {
      const p = localToRoom(item, x, z);
      for (const y of [isWallMounted(item) ? item.elevation : 0, item.elevation + item.height + 38])
        points.push([p.x / 1000, y / 1000, p.y / 1000]);
    }
  }
  if (!points.length) for (const x of [0, room.width]) for (const z of [0, room.depth]) for (const y of [0, room.height])
    points.push([x / 1000, y / 1000, z / 1000]);

  const azimuth = (faceX < -1 ? -1 : 1) * (faceZ < -1 ? Math.PI - 0.72 : 0.72);
  return framePoints(points, aspect, azimuth, 20 * Math.PI / 180, STUDIO_FOV);
}

/** Frame the architecture, independently of any cabinets, including the space behind the phone toolbar. */
export function roomCameraPose(room: Room, aspect: number, view: CameraView, reservedTop = 0): CameraPose {
  const points: ScenePoint[] = [];
  for (const x of [0, room.width]) for (const z of [0, room.depth]) for (const y of [0, room.height])
    points.push([x / 1000, y / 1000, z / 1000]);
  const azimuth = view === 'front' || view === 'top' ? 0 : 0.65;
  const elevation = view === 'top' ? Math.PI / 2 - 0.0001 : view === 'front' ? 0.05 : view === 'studio' ? 0.35 : 0.55;
  return framePoints(points, Math.max(0.1, aspect), azimuth, elevation, view === 'studio' ? STUDIO_FOV : CAMERA_FOV, reservedTop);
}

function framePoints(points: ScenePoint[], aspect: number, azimuth: number, elevation: number, fov: number, reservedTop = 0): CameraPose {
  const sx = Math.sin(azimuth), cz = Math.cos(azimuth), up = Math.sin(elevation), level = Math.cos(elevation);
  const arm: ScenePoint = [sx * level, up, cz * level], right: ScenePoint = [cz, 0, -sx], vertical: ScenePoint = [-sx * up, level, -cz * up];
  const dot = (p: ScenePoint, v: ScenePoint) => p[0] * v[0] + p[1] * v[1] + p[2] * v[2];
  // Fit both edges of the frustum, including perspective magnification on the
  // nearer return. Otherwise a wide U appears small and low in the frame.
  const axisFit = (v: ScenePoint, lower: number, upper = lower) => {
    let low = Infinity, high = -Infinity;
    for (const p of points) {
      const axis = dot(p, v), depth = dot(p, arm);
      low = Math.min(low, axis - lower * depth); high = Math.max(high, axis + upper * depth);
    }
    return { centre: (eye: number) => (low + high + (lower - upper) * eye) / 2, eye: (high - low) / (lower + upper) };
  };
  const slope = 0.90 * Math.tan(fov * Math.PI / 360);
  const horizontal = axisFit(right, slope * aspect), upright = axisFit(vertical, slope, slope * (1 - 2 * Math.min(0.8, reservedTop)));
  let near = -Infinity, far = Infinity;
  for (const p of points) { const z = dot(p, arm); near = Math.max(near, z); far = Math.min(far, z); }
  const eye = Math.max(horizontal.eye, upright.eye, near + 0.2), cx = horizontal.centre(eye), cy = upright.centre(eye);
  const czDepth = (near + far) / 2;
  const target: ScenePoint = [right[0] * cx + vertical[0] * cy + arm[0] * czDepth, vertical[1] * cy + arm[1] * czDepth,
    right[2] * cx + vertical[2] * cy + arm[2] * czDepth];
  const distance = eye - czDepth;
  return { target, position: [target[0] + arm[0] * distance, target[1] + arm[1] * distance, target[2] + arm[2] * distance] };
}

export function kitchenCameraPose(room: Room, items: readonly KitchenItem[], aspect: number, view: CameraView = 'perspective', focus?: KitchenItem): CameraPose {
  const W = room.width / 1000;
  const D = room.depth / 1000;
  const tanHalf = Math.tan(CAMERA_FOV * Math.PI / 360);
  const ratio = Math.max(0.1, aspect);
  if (focus) return cabinetFocusPose(room, focus, ratio);
  if (view === 'studio') return studioPose(room, items, ratio);
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
