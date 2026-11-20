import { describe, expect, it } from 'vitest';
import { nextRoomPlanAngle, roomPlanBounds, roomPlanFrame, rotatePlanPoint, unrotatePlanPoint } from './roomPlanView';

const angles = [0, 90, 180, 270] as const;
const room = { width: 3600, depth: 3000 };

describe('room plan view rotation', () => {
  it.each(angles)('reverses the %i degree view without rounding physical coordinates', (angle) => {
    const point = { x: -123.5, y: 891.25 };
    expect(unrotatePlanPoint(rotatePlanPoint(point, angle), angle)).toEqual(point);
    expect(rotatePlanPoint({ x: 10, y: 0 }, angle)).toEqual([
      { x: 10, y: 0 }, { x: 0, y: 10 }, { x: -10, y: 0 }, { x: 0, y: -10 },
    ][angles.indexOf(angle)]);
  });

  it('cycles four clockwise turns back to the original view', () => {
    let angle = nextRoomPlanAngle(0);
    expect(angle).toBe(90);
    for (let i = 0; i < 3; i++) angle = nextRoomPlanAngle(angle);
    expect(angle).toBe(0);
  });

  it.each(angles)('fits every room corner with measurement margins at %i degrees', (angle) => {
    const size = { width: 320, height: 185.8125 }, frame = roomPlanFrame(room, size, angle);
    for (const point of [{ x: 0, y: 0 }, { x: room.width, y: 0 }, { x: room.width, y: room.depth }, { x: 0, y: room.depth }]) {
      const viewed = rotatePlanPoint(point, angle);
      expect((viewed.x - frame.x) / frame.px).toBeGreaterThanOrEqual(79 - 1e-8);
      expect((viewed.x - frame.x) / frame.px).toBeLessThanOrEqual(size.width - 79 + 1e-8);
      expect((viewed.y - frame.y) / frame.px).toBeGreaterThanOrEqual(51 - 1e-8);
      expect((viewed.y - frame.y) / frame.px).toBeLessThanOrEqual(size.height - 51 + 1e-8);
    }
  });

  it('preserves the existing unrotated frame and uses origin-relative rotated bounds', () => {
    const size = { width: 800, height: 500 }, frame = roomPlanFrame(room, size, 0);
    expect(frame.px).toBe(Math.max(room.width / (size.width - 158), room.depth / (size.height - 102)));
    expect(frame.x).toBe((room.width - size.width * frame.px) / 2);
    expect(frame.y).toBe((room.depth - size.height * frame.px) / 2);
    expect(roomPlanBounds(room, 90)).toEqual({ x: -3000, y: 0, width: 3000, height: 3600 });
  });
});
