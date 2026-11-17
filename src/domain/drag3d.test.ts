import { describe, expect, it } from 'vitest';
import { dragFreedom, floorDragPoint, screenPlanAxes, type Vec3 } from './drag3d';

const unit = (from: Vec3, to: Vec3): Vec3 => {
  const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const length = Math.hypot(d[0], d[1], d[2]);
  return [d[0] / length, d[1] / length, d[2] / length];
};

describe('dragging a unit in the 3D view', () => {
  const right: Vec3 = [1, 0, 0];

  it('follows the pointer exactly across the floor when seen from above', () => {
    const origin: Vec3 = [2, 8, 2.001];
    const grab: Vec3 = [2, 0.9, 1];
    expect(dragFreedom(origin, grab)).toBe(1);
    const point = floorDragPoint({ origin, direction: unit(origin, [3.2, 0.9, 1.7]), grab, right, freedom: 1 });
    expect(point!.x).toBeCloseTo(3.2, 6);
    expect(point!.z).toBeCloseTo(1.7, 6);
  });

  it('keeps the grabbed point under the pointer in the usual three-quarter view', () => {
    const origin: Vec3 = [2.3, 2.4, 5.4];
    const grab: Vec3 = [1.6, 0.5, 0.58];
    const freedom = dragFreedom(origin, grab);
    expect(freedom).toBeGreaterThan(0.95);
    const target: Vec3 = [2.35, 0.5, 0.58];
    const point = floorDragPoint({ origin, direction: unit(origin, target), grab, right, freedom: 1 });
    expect(point!.x).toBeCloseTo(target[0], 6);
    expect(point!.z).toBeCloseTo(target[2], 6);
  });

  it('only slides a wall unit sideways when it is grabbed near eye level', () => {
    const origin: Vec3 = [2.3, 2.14, 5.4];
    const grab: Vec3 = [1, 1.8, 0.34];
    const freedom = dragFreedom(origin, grab);
    expect(freedom).toBe(0);
    // The pointer moves right and drifts down: the unit goes right and stays against the wall.
    const point = floorDragPoint({ origin, direction: unit(origin, [1.5, 1.72, 0.34]), grab, right, freedom });
    expect(point!.x).toBeCloseTo(1.5, 6);
    expect(point!.z).toBeCloseTo(0.34, 6);
  });

  it('slides sideways in the level front view instead of jumping in depth', () => {
    const origin: Vec3 = [2.1, 1.05, 6];
    const grab: Vec3 = [1.2, 0.6, 0.58];
    const freedom = dragFreedom(origin, grab);
    expect(freedom).toBe(0);
    const up = floorDragPoint({ origin, direction: unit(origin, [1.2, 0.9, 0.58]), grab, right, freedom });
    const down = floorDragPoint({ origin, direction: unit(origin, [1.2, 0.2, 0.58]), grab, right, freedom });
    expect(up!.z).toBeCloseTo(0.58, 6);
    expect(down!.z).toBeCloseTo(0.58, 6);
    expect(up!.x).toBeCloseTo(1.2, 6);
  });

  it('stays finite and moves one way only as the pointer climbs to the horizon', () => {
    const origin: Vec3 = [2, 2.4, 6];
    const grab: Vec3 = [2, 0.5, 2];
    let previous = Infinity;
    for (let y = 0.5; y <= 4; y += 0.25) {
      const point = floorDragPoint({ origin, direction: unit(origin, [2.4, y, 2]), grab, right, freedom: 1 });
      expect(point).not.toBeNull();
      expect(Number.isFinite(point!.x) && Number.isFinite(point!.z)).toBe(true);
      expect(Math.abs(point!.z)).toBeLessThan(40);
      expect(point!.z).toBeLessThanOrEqual(previous + 1e-9);
      previous = point!.z;
    }
  });

  it('gives no position when the pointer misses both planes', () => {
    const origin: Vec3 = [2, 1, 6];
    // Level with the grabbed point and looking away from it.
    expect(floorDragPoint({ origin, direction: [0, 0, 1], grab: [2, 1, 2], right, freedom: 0 })).toBeNull();
  });

  it('works for a camera turned to face another wall', () => {
    // Looking along +x at a unit on the right wall: screen right is the room's +z.
    const origin: Vec3 = [-3, 6, 1.5];
    const grab: Vec3 = [3.2, 0.5, 1.5];
    const turned: Vec3 = [0, 0, 1];
    const point = floorDragPoint({ origin, direction: unit(origin, [3.2, 0.5, 2.1]), grab, right: turned, freedom: 1 });
    expect(point!.x).toBeCloseTo(3.2, 6);
    expect(point!.z).toBeCloseTo(2.1, 6);
  });
});

describe('arrows that follow the view', () => {
  it('match the plan when the kitchen on the top wall is seen from the room', () => {
    expect(screenPlanAxes([0, -0.3, -1])).toEqual({ right: [1, 0], up: [0, -1] });
  });

  it('turn with the camera', () => {
    expect(screenPlanAxes([0, -0.3, 1])).toEqual({ right: [-1, 0], up: [0, 1] });
    expect(screenPlanAxes([1, -0.3, 0.2])).toEqual({ right: [0, 1], up: [1, 0] });
    expect(screenPlanAxes([-1, -0.3, 0.2])).toEqual({ right: [0, -1], up: [-1, 0] });
  });

  it('use the top of the screen when looking straight down', () => {
    expect(screenPlanAxes([0, -1, -0.0001], [0, 0.0001, -1])).toEqual({ right: [1, 0], up: [0, -1] });
  });
});
