import { describe, expect, it } from 'vitest';
import type { Room } from '../../domain/types';
import { roomSegments } from '../../domain/walls';
import { planWallControls } from './planWallControls';
import { roomPlanFrame, rotatePlanPoint } from './roomPlanView';

describe('wall movement control placement', () => {
  it.each([{ width: 320, height: 185.8125 }, { width: 390, height: 300 }, { width: 1440, height: 700 }])(
    'keeps the grip, numbers and views reachable in a $width px notched plan', (size) => {
      const room: Room = { width: 3600, depth: 3000, height: 2600,
        cutout: { kind: 'notch', corner: 'bottomRight', width: 1080, depth: 900 } };
      const walls = roomSegments(room), movingWall = walls.find((wall) => wall.id === 'bottom');
      if (!movingWall) throw new Error('The fixture must have a bottom wall.');
      const px = Math.max(room.width / Math.max(40, size.width - 158), room.depth / Math.max(25, size.height - 102));
      const frame = { px, x: (room.width - size.width * px) / 2, y: (room.depth - size.height * px) / 2 };
      const original = planWallControls(walls, frame, size);
      const { dimensions, icons, grip } = planWallControls(walls, frame, size, movingWall);
      expect(dimensions).toEqual(original.dimensions);
      if (!grip) throw new Error('A selected wall must have a movement grip.');
      const targets = [
        ...Array.from(dimensions.values(), ({ at }) => ({ ...at, halfWidth: 32 })),
        ...Array.from(icons.values(), (at) => ({ ...at, halfWidth: 22 })),
        { ...grip, halfWidth: 22 },
      ];
      for (let i = 0; i < targets.length; i++) for (let j = i + 1; j < targets.length; j++) {
        const a = targets[i], b = targets[j];
        const dx = Math.abs(a.x - b.x) / px, dy = Math.abs(a.y - b.y) / px;
        expect(dx >= Math.max(a.halfWidth, b.halfWidth) || dy >= 22,
          `Controls ${i} and ${j} must not cover each other's centers.`).toBe(true);
      }
    },
  );

  it.each([0, 90, 180, 270] as const)('keeps a named wall action clear in a rotated %i degree phone plan', (angle) => {
    const room: Room = { width: 3600, depth: 3000, height: 2600,
      cutout: { kind: 'notch', corner: 'bottomRight', width: 1080, depth: 900 } };
    const walls = roomSegments(room), moving = walls.find((wall) => wall.id === 'bottom');
    if (!moving) throw new Error('The fixture must have a bottom wall.');
    const size = { width: 320, height: 185.8125 }, frame = roomPlanFrame(room, size, angle);
    const { dimensions, icons, grip } = planWallControls(walls, frame, size, moving, { id: moving.id, width: 132 });
    if (!grip) throw new Error('The selected wall must retain its grip.');
    const targets = [
      ...Array.from(dimensions.values(), ({ at }) => ({ ...at, halfWidth: 32 })),
      ...Array.from(icons, ([id, at]) => ({ ...at, halfWidth: id === moving.id ? 66 : 22 })),
      { ...grip, halfWidth: 22 },
    ].map(({ halfWidth, ...point }) => {
      const viewed = rotatePlanPoint(point, angle);
      return { x: (viewed.x - frame.x) / frame.px, y: (viewed.y - frame.y) / frame.px, halfWidth };
    });
    for (const target of targets) {
      expect(target.x - target.halfWidth).toBeGreaterThanOrEqual(-1e-8);
      expect(target.x + target.halfWidth).toBeLessThanOrEqual(size.width + 1e-8);
      expect(target.y).toBeGreaterThanOrEqual(22 - 1e-8);
      expect(target.y).toBeLessThanOrEqual(size.height - 22 + 1e-8);
    }
    for (let i = 0; i < targets.length; i++) for (let j = i + 1; j < targets.length; j++) {
      const a = targets[i], b = targets[j];
      expect(Math.abs(a.x - b.x) >= Math.max(a.halfWidth, b.halfWidth) || Math.abs(a.y - b.y) >= 22,
        `Rotated controls ${i} and ${j} must not cover each other's centers.`).toBe(true);
    }
  });
});
