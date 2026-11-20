import { polygonBounds } from '../../domain/polygons';
import { DEFAULT_WALL_COLOR } from '../../domain/style';
import type { Point, Room } from '../../domain/types';
import { openingsOnSegment, roomSegments, wallPoint } from '../../domain/walls';
import { useDesignStore } from '../../store/designStore';

export function RoomPreviewCube({ room, wallId }: { room: Room; wallId: string | null }) {
  const { style, openings } = useDesignStore((s) => s.design);
  const walls = roomSegments(room, false);
  const project = (p: Point, z = 0) => ({ x: (p.x - p.y) * .866, y: (p.x + p.y) * .36 - z * .8 });
  const shape = (points: Point[]) => points.map((p) => `${p.x},${p.y}`).join(' ');
  const floor = walls.map((w) => project(w.start));
  const bounds = polygonBounds([...floor, ...walls.map((w) => project(w.start, room.height))]);
  const margin = Math.max(bounds.w, bounds.h) * .09;
  return <svg data-room-preview-cube="" className="room-preview-cube" aria-hidden="true"
    viewBox={`${bounds.x - margin} ${bounds.y - margin} ${bounds.w + 2 * margin} ${bounds.h + 2 * margin}`}>
    <polygon points={shape(floor)} fill="#dfe8d7" stroke="#7f947d" vectorEffect="non-scaling-stroke" />
    {walls.filter((wall) => wall.inward.x + wall.inward.y > 0).map((wall) => <g key={wall.id}>
      <polygon points={shape([project(wall.start), project(wall.end), project(wall.end, wall.height), project(wall.start, wall.height)])}
        fill={style.wallColor ?? DEFAULT_WALL_COLOR} stroke={wall.id === wallId ? '#315a44' : '#80917c'}
        strokeWidth={wall.id === wallId ? 2 : 1} vectorEffect="non-scaling-stroke" />
      {openingsOnSegment(room, wall, openings).map((hole, i) => <polygon key={i}
        points={shape([project(wallPoint(wall, hole.from), hole.bottom), project(wallPoint(wall, hole.to), hole.bottom),
          project(wallPoint(wall, hole.to), hole.top), project(wallPoint(wall, hole.from), hole.top)])}
        fill={hole.bottom ? '#bfd9da' : '#cfbda5'} stroke="#7e948b" strokeWidth=".6" vectorEffect="non-scaling-stroke" />)}
    </g>)}
    {walls.map((wall) => <line key={wall.id} x1={project(wall.start).x} y1={project(wall.start).y}
      x2={project(wall.end).x} y2={project(wall.end).y} stroke={wall.id === wallId ? '#315a44' : '#7f947d'}
      strokeWidth={wall.id === wallId ? 2.5 : 1} vectorEffect="non-scaling-stroke" />)}
  </svg>;
}
