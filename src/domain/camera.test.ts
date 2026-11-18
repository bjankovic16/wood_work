import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { blendPoses, cabinetFocusPose, CAMERA_FOV, kitchenCameraPose, roomCameraPose, STUDIO_FOV, type CameraPose } from './camera';
import { createBasilKitchen } from './basilKitchen';
import { createItem } from './catalog';
import { footprintPieces, itemRect } from './geometry';

const room = { width: 4800, depth: 4000, height: 2700 };

describe('3D camera views', () => {
  it('fits the entire empty room below the phone toolbar, including the ceiling and near corners', () => {
    const room = { width: 4400, depth: 7000, height: 3100 };
    for (const [aspect, inset] of [[0.7, 0.24], [1.8, 0]]) for (const view of ['perspective', 'top', 'front', 'studio'] as const) {
      const { position, target } = roomCameraPose(room, aspect, view, inset);
      const camera = new PerspectiveCamera(view === 'studio' ? STUDIO_FOV : CAMERA_FOV, aspect, 0.05, 200);
      camera.position.fromArray(position); camera.lookAt(...target); camera.updateMatrixWorld();
      for (const x of [0, room.width]) for (const z of [0, room.depth]) for (const y of [0, room.height]) {
        const p = new Vector3(x / 1000, y / 1000, z / 1000).project(camera);
        expect(Math.abs(p.x)).toBeLessThan(1); expect(p.y).toBeGreaterThan(-1); expect(p.y).toBeLessThan(1 - 2 * inset);
      }
    }
  });
  for (const aspect of [0.5, 1, 1.8]) {
    for (const view of ['perspective', 'front', 'top'] as const) {
      it(`${view} produces a valid room view at aspect ${aspect}`, () => {
        const pose = kitchenCameraPose(room, [], aspect, view);
        expect([...pose.position, ...pose.target].every(Number.isFinite)).toBe(true);
        expect(Math.hypot(...pose.position.map((value, index) => value - pose.target[index]))).toBeGreaterThan(1);
        expect(pose.position[1]).toBeGreaterThan(0);
        if (view === 'top') {
          expect(pose.position[0]).toBe(pose.target[0]);
          const usableHeight = pose.position[1] - room.height / 1000;
          expect(usableHeight * Math.tan(Math.PI / 8)).toBeGreaterThanOrEqual(Math.max(room.width / aspect, room.depth) / 2000);
        }
      });
    }
  }
  it('focuses the true footprint and elevation of a rotated cabinet', () => {
    const item = createItem('wall', [], { x: 1200, y: 1800, rotation: 90, width: 800, elevation: 1450 });
    const rect = itemRect(item);
    const pose = kitchenCameraPose(room, [item], 1, 'perspective', item);
    expect(pose.target).toEqual([(rect.x + rect.w / 2) / 1000, (item.elevation + item.height / 2) / 1000, (rect.y + rect.h / 2) / 1000]);
    expect(pose.position[0]).toBeLessThan(pose.target[0]);
  });

  it('looks into a floor unit from above, on the side nearer the middle of the room', () => {
    const left = createItem('drawer', [], { x: 0, y: 0 });
    const right = createItem('drawer', [], { x: room.width - 600, y: 0 });
    const pose = cabinetFocusPose(room, left, 1.6);
    expect(pose.position[2]).toBeGreaterThan(pose.target[2] + 1);
    expect(pose.position[1]).toBeGreaterThan(pose.target[1] + 0.8);
    expect(pose.position[0]).toBeGreaterThan(pose.target[0]);
    expect(cabinetFocusPose(room, right, 1.6).position[0]).toBeLessThan(cabinetFocusPose(room, right, 1.6).target[0]);
  });

  it('views wall units from eye level and steps back on a narrow screen', () => {
    const item = createItem('wall', [], { x: 1800, y: 0, elevation: 1450 });
    const wide = cabinetFocusPose(room, item, 1.6);
    const narrow = cabinetFocusPose(room, item, 0.5);
    const distance = (pose: typeof wide) => Math.hypot(...pose.position.map((value, index) => value - pose.target[index]));
    expect(wide.position[1] - wide.target[1]).toBeLessThan(0.4);
    expect(distance(narrow)).toBeGreaterThan(distance(wide) * 1.5);
    // The cabinet with its doors open fits inside the narrower of the two view angles.
    const half = Math.min(Math.PI / 8, Math.atan(Math.tan(Math.PI / 8) * 0.5));
    expect(distance(narrow) * Math.sin(half)).toBeGreaterThan(Math.hypot(item.width + 400, item.height + 100, item.depth + 600) / 2000);
  });

  it('faces the front of a cabinet on any wall', () => {
    const item = createItem('base', [], { x: room.width - 560, y: 1500, rotation: 90 });
    const pose = cabinetFocusPose(room, item, 1.4);
    expect(pose.position[0]).toBeLessThan(pose.target[0] - 1);
  });

  it('frames both arms and the uppers in Studio on portrait and landscape screens, even in a much larger room', () => {
    const { items } = createBasilKitchen('');
    for (const aspect of [0.46, 1.68]) {
      const { position, target } = kitchenCameraPose({ width: 15000, depth: 12000, height: 3300 }, items, aspect, 'studio');
      const camera = new PerspectiveCamera(STUDIO_FOV, aspect, 0.05, 200);
      camera.position.fromArray(position); camera.lookAt(...target); camera.updateMatrixWorld();
      const vertices = items.flatMap((item) => footprintPieces(item).flat().flatMap((p) =>
        [item.elevation, item.elevation + item.height].map((y) => new Vector3(p.x / 1000, y / 1000, p.y / 1000).project(camera))));
      const xs = vertices.map((v) => v.x), ys = vertices.map((v) => v.y);
      expect([...xs, ...ys].every((v) => Math.abs(v) <= 0.93)).toBe(true);
      expect(Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))).toBeGreaterThan(1.67);
      expect(position[0]).toBeGreaterThan(target[0]);
      expect(position[1]).toBeGreaterThan(target[1]);
      expect(position[2]).toBeGreaterThan(target[2]);
    }
  });
});

describe('moving the camera between views', () => {
  const overview = kitchenCameraPose(room, [], 1.6, 'perspective');
  const top = kitchenCameraPose(room, [], 1.6, 'top');
  const distance = (pose: CameraPose) => Math.hypot(...pose.position.map((value, index) => value - pose.target[index]));

  it('starts and ends exactly on the two poses', () => {
    expect(blendPoses(overview, top, 0)).toBe(overview);
    expect(blendPoses(overview, top, 1)).toBe(top);
  });

  it('keeps its distance from what it looks at, instead of cutting through the room', () => {
    const behind: CameraPose = { target: overview.target, position: [overview.target[0], overview.position[1], overview.target[2] - (overview.position[2] - overview.target[2])] };
    for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      const pose = blendPoses(overview, behind, t);
      expect([...pose.position, ...pose.target].every(Number.isFinite)).toBe(true);
      expect(distance(pose)).toBeGreaterThan(Math.min(distance(overview), distance(behind)) - 1e-6);
      expect(distance(pose)).toBeLessThan(Math.max(distance(overview), distance(behind)) + 1e-6);
    }
  });

  it('swings the short way round', () => {
    const pose = (degrees: number): CameraPose => ({ target: [0, 1, 0], position: [5 * Math.sin(degrees * Math.PI / 180), 1, 5 * Math.cos(degrees * Math.PI / 180)] });
    const middle = blendPoses(pose(170), pose(-170), 0.5);
    expect(middle.position[2]).toBeCloseTo(-5, 6);
    expect(middle.position[0]).toBeCloseTo(0, 6);
  });

  it('rises smoothly into the top view without spinning', () => {
    let previous = overview.position[1];
    for (const t of [0.2, 0.4, 0.6, 0.8, 0.99]) {
      const pose = blendPoses(overview, top, t);
      expect(pose.position[1]).toBeGreaterThan(previous);
      previous = pose.position[1];
      // Same compass direction as the overview all the way up.
      const start = Math.atan2(overview.position[0] - overview.target[0], overview.position[2] - overview.target[2]);
      expect(Math.atan2(pose.position[0] - pose.target[0], pose.position[2] - pose.target[2])).toBeCloseTo(start, 6);
    }
  });
});
