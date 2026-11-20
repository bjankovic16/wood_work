import { describe, expect, it } from 'vitest';
import type { Room } from '../../domain/types';
import { roomSegments } from '../../domain/walls';
import { planWallControls } from './planWallControls';

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
});
