import { describe, expect, it } from 'vitest';
import { kitchenCameraPose } from './camera';
import { createItem } from './catalog';
import { itemRect } from './geometry';

const room = { width: 4800, depth: 4000, height: 2700 };

describe('3D camera views', () => {
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
});
