import { onSegment, pointInPolygon, segmentsCross } from './polygons';
import type { Point, Room } from './types';
import { partitionPolygon, wallCoordinates, wallPoint, type WallSegment } from './walls';

const touches = (a: Point, b: Point, c: Point, d: Point) => segmentsCross(a, b, c, d)
  || onSegment(a, c, d) || onSegment(b, c, d) || onSegment(c, a, b) || onSegment(d, a, b);

/** In an inside elevation the segment's measuring origin is always on the left. */
export function adjoiningWalls(room: Room, walls: WallSegment[], wall: WallSegment) {
  const outer = walls.filter((s) => !s.partitionId);
  if (!wall.partitionId) {
    const i = outer.findIndex((s) => s.id === wall.id);
    return { left: outer[(i + outer.length - 1) % outer.length], right: outer[(i + 1) % outer.length] };
  }
  const partitions = room.partitions ?? [];
  const own = partitions.find((p) => p.id === wall.partitionId)!;
  const atEnd = (along: number, direction: number) => {
    const face = wallPoint(wall, along), back = wallPoint(wall, along, -own.thickness);
    const toward = (s: WallSegment) => direction * (s.inward.x * wall.tangent.x + s.inward.y * wall.tangent.y);
    // A wall running alongside the partition is not an end connection. A collinear continuation is.
    const beyondEnd = (s: WallSegment) => [s.start, s.end].every((p) => direction * (wallCoordinates(wall, p).x - along) <= .01);
    const candidates = outer.filter((s) => touches(face, back, s.start, s.end) && (Math.abs(toward(s)) > 1e-8 || beyondEnd(s)));
    for (const p of partitions) {
      if (p === own) continue;
      const body = partitionPolygon(p);
      if (!pointInPolygon(face, body) && !body.some((a, i) => touches(face, back, a, body[(i + 1) % body.length]))) continue;
      // At a T-junction open the side facing the approaching wall, not the far side.
      for (const s of walls.filter((s) => s.partitionId === p.id)) {
        const normal = toward(s);
        if (normal > 1e-8 || (Math.abs(normal) <= 1e-8 && beyondEnd(s) && s.inward.x * wall.inward.x + s.inward.y * wall.inward.y > 0)) candidates.push(s);
      }
    }
    // At a corner two walls can meet the end cap. Prefer the one on the viewed face.
    const distance = (s: WallSegment) => {
      const p = wallCoordinates(s, face);
      return Math.hypot(p.y, Math.max(0, -p.x, p.x - s.length));
    };
    return candidates.sort((a, b) => distance(a) - distance(b))[0];
  };
  return { left: atEnd(0, 1), right: atEnd(wall.length, -1) };
}
