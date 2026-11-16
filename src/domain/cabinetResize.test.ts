import { describe, expect, it } from 'vitest';
import { createItem } from './catalog';
import { cabinetResize } from './cabinetResize';
import { localToRoom } from './geometry';

const room = { width: 5000, depth: 4000, height: 2700 };

describe('3D cabinet resizing', () => {
  it('grows and shrinks local dimensions at any angle without changing the anchor, elevation or other dimensions', () => {
    for (const rotation of [0, 45, 90, 180, 270, 315]) {
      const item = { ...createItem('base', [], { x: 1500, y: 1200 }), rotation };
      for (const [field, value] of [['width', 850], ['height', 800], ['depth', 500]] as const) {
        const next = cabinetResize(item, field, value, room, 50)!;
        expect(next[field]).toBe(value);
        const anchor = localToRoom(item, 0, 0);
        const after = localToRoom(next, 0, 0);
        expect(after.x).toBeCloseTo(anchor.x);
        expect(after.y).toBeCloseTo(anchor.y);
        expect(next.elevation).toBe(item.elevation);
        for (const other of ['width', 'height', 'depth'] as const) if (other !== field) expect(next[other]).toBe(item[other]);
      }
    }
  });

  it('snaps measurements and clamps catalog limits, including no-snap millimetres and corner-arm constraints', () => {
    const item = createItem('base', [], { x: 1000, y: 1000 });
    expect(cabinetResize(item, 'width', 877, room, 50)?.width).toBe(900);
    expect(cabinetResize(item, 'width', 877.4, room, 0)?.width).toBe(877);
    expect(cabinetResize(item, 'width', -100, room, 50)?.width).toBe(150);
    expect(cabinetResize(item, 'width', 9000, room, 50)?.width).toBe(1200);
    const corner = createItem('corner', [], { x: 1000, y: 1000 });
    const next = cabinetResize(corner, 'width2', 1200, room, 50)!;
    expect(next.width2).toBe(1200);
    expect(next.width).toBe(corner.width);
    expect(cabinetResize(corner, 'depth', 9000, room, 50)?.depth).toBeLessThan(Math.min(corner.width, corner.width2 ?? corner.width));
  });

  it('rejects polygon/boundary excursions and keeps upper cabinets below the ceiling without changing their elevation', () => {
    const item = createItem('base', [], { x: 4400, y: 1000 });
    expect(cabinetResize(item, 'width', 1000, room, 50)).toBeNull();
    const notched = { ...room, cutout: { kind: 'notch' as const, corner: 'bottomRight' as const, width: 1000, depth: 1000 } };
    expect(cabinetResize({ ...item, x: 3300, y: 3100 }, 'width', 1000, notched, 50)).toBeNull();
    const upper = createItem('wall', [], { x: 500, y: 500, elevation: 2100 });
    expect(cabinetResize(upper, 'height', 1200, room, 50)).toMatchObject({ height: 600, elevation: 2100 });
    expect(cabinetResize({ ...upper, elevation: 2650 }, 'height', 200, room, 50)).toBeNull();
  });
});
