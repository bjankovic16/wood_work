import { describe, expect, it } from 'vitest';
import { featureDragPlacement, openingDragPlacement } from './roomObjectPlacement';
import { openingFrame, wallPoint } from './walls';
import type { Opening, Room, RoomFeature, Wall } from './types';

const room: Room = { width: 4000, depth: 3200, height: 2700 };
const window: Opening = { id: 'window', kind: 'window', wall: 'top', offset: 1000, width: 1000, height: 1000, sill: 900 };
const feature: RoomFeature = { id: 'chimney', kind: 'chimney', x: 1000, y: 0, width: 450, depth: 450 };

describe('3D room-object placement', () => {
  it('projects openings onto every legacy wall, retaining its offset direction and snapping the sill', () => {
    for (const wall of ['top', 'right', 'bottom', 'left'] satisfies Wall[]) {
      const opening = { ...window, wall };
      const centre = wallPoint(openingFrame(room, opening)!, 1876, 250);
      expect(openingDragPlacement(room, opening, { ...centre, elevation: 1637 }, 50)).toEqual({ ...opening, offset: 1400, sill: 1150 });
    }
  });

  it('preserves window size, clamps to the wall and ceiling, and keeps doors on the floor', () => {
    expect(openingDragPlacement(room, window, { x: 9000, y: 5000, elevation: 9000 }, 50))
      .toEqual({ ...window, offset: 3000, sill: 1700 });
    expect(openingDragPlacement(room, { ...window, kind: 'door', sill: 0 }, { x: -9000, y: 0, elevation: 1000 }, 0))
      .toEqual({ ...window, kind: 'door', sill: 0, offset: 0 });
    expect(openingDragPlacement(room, window, { x: 1876, y: 0, elevation: 1637 }, 0))
      .toEqual({ ...window, offset: 1376, sill: 1137 });
  });

  it('moves along an arbitrary-angle wall or either partition face without changing attachment', () => {
    const polygon: Room = { ...room, vertices: [
      { id: 'diagonal', x: 0, y: 0 }, { id: 'right', x: 4000, y: 1000 }, { id: 'bottom', x: 4000, y: 3200 }, { id: 'left', x: 0, y: 3200 },
    ], partitions: [{ id: 'divider', start: { x: 500, y: 2000 }, end: { x: 3500, y: 2000 }, thickness: 100, height: 2200 }] };
    for (const wallId of ['diagonal', 'divider:1', 'divider:-1']) {
      const opening = { ...window, wallId };
      const centre = wallPoint(openingFrame(polygon, opening)!, 2000, 100);
      const next = openingDragPlacement(polygon, opening, { ...centre, elevation: 1800 }, 50);
      expect(next).toEqual({ ...opening, offset: 1500, sill: Math.min(1300, openingFrame(polygon, opening)!.height - opening.height) });
    }
  });

  it('snaps structures, clamps outer boundaries and rejects notched or polygon-exterior positions', () => {
    expect(featureDragPlacement(room, feature, { x: 1762, y: 2101 }, 50)).toEqual({ x: 1550, y: 1900 });
    expect(featureDragPlacement(room, feature, { x: 9000, y: -9000 }, 50)).toEqual({ x: 3550, y: 0 });
    const cutout: Room = { ...room, cutout: { kind: 'notch', corner: 'bottomRight', width: 1000, depth: 1000 } };
    expect(featureDragPlacement(cutout, feature, { x: 3550, y: 2750 }, 0)).toBeNull();
    const polygon: Room = { ...room, vertices: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 4000, y: 3200 }, { id: 'c', x: 0, y: 3200 }] };
    expect(featureDragPlacement(polygon, feature, { x: 3500, y: 1000 }, 0)).toBeNull();
  });
});
