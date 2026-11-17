/**
 * Turning a pointer in the 3D view into a position on the floor.
 *
 * Plain tuples and numbers only, so this works (and is tested) without three.js.
 * Scene axes: x runs along the top wall, y is up, z runs from the top wall into
 * the room, all in metres.
 */

export type Vec3 = readonly [number, number, number];

/** Below this view angle a grabbed unit only slides sideways (about 7 degrees). */
const SLIDE_ONLY = 0.12;
/** From this view angle up the grabbed point follows the pointer freely on the floor (about 20 degrees). */
const FULL_FREEDOM = 0.34;
/** The pointer never counts as flatter than this, so one pixel cannot become metres (about 6 degrees). */
const MIN_ELEVATION = 0.1;

function smoothstep(from: number, to: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

/**
 * How freely a grabbed point may move towards and away from the camera, from
 * 0 (it only slides sideways) to 1 (it follows the pointer across the floor).
 *
 * Seen from above, the floor under the pointer is unambiguous. Seen nearly
 * level, as with wall units at eye height or the front view, a pixel up or
 * down would mean metres of depth, so depth is taken out of the drag instead.
 */
export function dragFreedom(camera: Vec3, grab: Vec3): number {
  const distance = Math.hypot(grab[0] - camera[0], grab[1] - camera[1], grab[2] - camera[2]);
  if (distance < 1e-9) return 0;
  return smoothstep(SLIDE_ONLY, FULL_FREEDOM, Math.abs(grab[1] - camera[1]) / distance);
}

export interface FloorDragInput {
  /** Camera position. */
  origin: Vec3;
  /** Unit direction of the ray through the pointer. */
  direction: Vec3;
  /** The point of the unit that was grabbed; it keeps its height during the drag. */
  grab: Vec3;
  /** The camera's right-hand direction. Only its horizontal part is used. */
  right: Vec3;
  /** Result of {@link dragFreedom} when the drag started. */
  freedom: number;
}

/**
 * Where the grabbed point is while the pointer drags it: its new x and z.
 *
 * Sideways movement comes from the upright plane facing the camera, where the
 * point stays exactly under the pointer from any view. Movement in depth comes
 * from the horizontal plane through the point, scaled by `freedom`. Returns
 * null when the pointer does not meet either plane.
 */
export function floorDragPoint({ origin, direction, grab, right, freedom }: FloorDragInput): { x: number; z: number } | null {
  const rightLength = Math.hypot(right[0], right[2]);
  const rx = rightLength > 1e-9 ? right[0] / rightLength : 1;
  const rz = rightLength > 1e-9 ? right[2] / rightLength : 0;
  // Horizontal direction away from the camera: up × right.
  const fx = rz;
  const fz = -rx;
  const toGrab: Vec3 = [grab[0] - origin[0], grab[1] - origin[1], grab[2] - origin[2]];

  let slide: number | null = null;
  const facing = direction[0] * fx + direction[2] * fz;
  if (Math.abs(facing) > 1e-4) {
    const distance = (toGrab[0] * fx + toGrab[2] * fz) / facing;
    if (distance > 0) slide = (distance * direction[0] - toGrab[0]) * rx + (distance * direction[2] - toGrab[2]) * rz;
  }

  let floorSide: number | null = null;
  let floorDepth = 0;
  if (Math.abs(toGrab[1]) > 1e-6) {
    const towards = Math.sign(toGrab[1]);
    const level = Math.hypot(direction[0], direction[2]);
    let [dx, dy, dz] = direction;
    if (towards * dy < MIN_ELEVATION && level > 1e-9) {
      const flat = Math.sqrt(1 - MIN_ELEVATION * MIN_ELEVATION) / level;
      dx *= flat;
      dz *= flat;
      dy = towards * MIN_ELEVATION;
    }
    if (towards * dy > 0) {
      const distance = toGrab[1] / dy;
      const hx = distance * dx - toGrab[0];
      const hz = distance * dz - toGrab[2];
      floorSide = hx * rx + hz * rz;
      floorDepth = hx * fx + hz * fz;
    }
  }

  if (slide === null && floorSide === null) return null;
  const weight = floorSide === null ? 0 : slide === null ? 1 : Math.min(1, Math.max(0, freedom));
  const side = (slide ?? floorSide ?? 0) * (1 - weight) + (floorSide ?? slide ?? 0) * weight;
  const depth = floorDepth * weight;
  return { x: grab[0] + side * rx + depth * fx, z: grab[2] + side * rz + depth * fz };
}

/**
 * The room directions that the screen's right and up arrows stand for, as plan
 * steps (x to the right wall, y to the bottom wall), for a camera looking along
 * `forward`. Keeps arrow buttons and arrow keys matching what is seen.
 */
export function screenPlanAxes(forward: Vec3, up: Vec3 = [0, 1, 0]): { right: [number, number]; up: [number, number] } {
  // Looking straight down, "away" is whatever points up the screen.
  let ax = forward[0];
  let az = forward[2];
  if (Math.hypot(ax, az) < 0.2) {
    ax = up[0];
    az = up[2];
  }
  const away: [number, number] = Math.abs(ax) > Math.abs(az) ? [Math.sign(ax), 0] : [0, Math.sign(az) || -1];
  // Right of "away" on the plan, where y grows towards the viewer of a top-wall kitchen.
  const right: [number, number] = [-away[1], away[0]];
  return { right: [right[0] || 0, right[1] || 0], up: away };
}
