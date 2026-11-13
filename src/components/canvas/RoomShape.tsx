import { Group, Line, Rect } from 'react-konva';
import type { Opening, Point, Room, Wall } from '../../domain/types';
import { WALL_THICKNESS } from '../../store/viewport';
import { ROOM_COLORS } from './theme';

const GRID_STEPS = [50, 100, 250, 500, 1000];
const MIN_GRID_SPACING_PX = 14;

/** Where a wall starts, which way it runs, and which way is into the room. */
function wallFrame(room: Room, wall: Wall): { origin: Point; along: Point; inward: Point } {
  switch (wall) {
    case 'top':
      return { origin: { x: 0, y: 0 }, along: { x: 1, y: 0 }, inward: { x: 0, y: 1 } };
    case 'bottom':
      return { origin: { x: 0, y: room.depth }, along: { x: 1, y: 0 }, inward: { x: 0, y: -1 } };
    case 'left':
      return { origin: { x: 0, y: 0 }, along: { x: 0, y: 1 }, inward: { x: 1, y: 0 } };
    case 'right':
      return { origin: { x: room.width, y: 0 }, along: { x: 0, y: 1 }, inward: { x: -1, y: 0 } };
  }
}

/** A window (glass lines in the wall) or a door (an opening with its swing), drawn the usual plan way. */
function OpeningSymbol({ room, opening, px }: { room: Room; opening: Opening; px: number }) {
  const { origin, along, inward } = wallFrame(room, opening.wall);
  const T = WALL_THICKNESS;
  const at = (a: number, n: number) => ({ x: origin.x + along.x * a + inward.x * n, y: origin.y + along.y * a + inward.y * n });
  const start = opening.offset;
  const end = opening.offset + opening.width;
  // The gap in the wall: from the room face (n = 0) out through the wall (n = -T).
  const corners = [at(start, 0), at(end, 0), at(end, -T), at(start, -T)];
  const gap = corners.flatMap((p) => [p.x, p.y]);
  const stroke = { stroke: '#52525b', strokeWidth: px, listening: false } as const;

  if (opening.kind === 'window') {
    const line = (n: number) => [at(start, n), at(end, n)].flatMap((p) => [p.x, p.y]);
    return (
      <Group listening={false}>
        <Line points={gap} closed fill="#f8fafc" {...stroke} />
        <Line points={line(-T * 0.38)} {...stroke} />
        <Line points={line(-T * 0.62)} {...stroke} />
      </Group>
    );
  }

  // Door: hinged at the start of the opening, swinging into the room.
  const arc: number[] = [];
  for (let i = 0; i <= 16; i++) {
    const angle = (i / 16) * (Math.PI / 2);
    const p = at(start + Math.cos(angle) * opening.width, Math.sin(angle) * opening.width);
    arc.push(p.x, p.y);
  }
  const hinge = at(start, 0);
  const leaf = at(start, opening.width);
  return (
    <Group listening={false}>
      <Line points={gap} closed fill={ROOM_COLORS.floor} {...stroke} />
      <Line points={[hinge.x, hinge.y, leaf.x, leaf.y]} stroke="#3f3f46" strokeWidth={2 * px} listening={false} />
      <Line points={arc} stroke="#a1a1aa" strokeWidth={px} dash={[4 * px, 3 * px]} listening={false} />
    </Group>
  );
}

/** Walls with their windows and doors, floor, and a background grid that gets finer as you zoom in. */
export function RoomShape({ room, zoom, openings = [] }: { room: Room; zoom: number; openings?: Opening[] }) {
  const px = 1 / zoom;
  const step = GRID_STEPS.find((s) => s * zoom >= MIN_GRID_SPACING_PX) ?? 1000;
  const lines = [];
  for (let x = step; x < room.width; x += step) {
    lines.push(
      <Line
        key={`x${x}`}
        points={[x, 0, x, room.depth]}
        stroke={x % 1000 === 0 ? ROOM_COLORS.gridMajor : ROOM_COLORS.gridMinor}
        strokeWidth={px}
      />,
    );
  }
  for (let y = step; y < room.depth; y += step) {
    lines.push(
      <Line
        key={`y${y}`}
        points={[0, y, room.width, y]}
        stroke={y % 1000 === 0 ? ROOM_COLORS.gridMajor : ROOM_COLORS.gridMinor}
        strokeWidth={px}
      />,
    );
  }

  return (
    <>
      <Rect
        x={-WALL_THICKNESS}
        y={-WALL_THICKNESS}
        width={room.width + 2 * WALL_THICKNESS}
        height={room.depth + 2 * WALL_THICKNESS}
        fill={ROOM_COLORS.wall}
        stroke={ROOM_COLORS.wallEdge}
        strokeWidth={px}
      />
      <Rect x={0} y={0} width={room.width} height={room.depth} fill={ROOM_COLORS.floor} />
      {lines}
      <Rect x={0} y={0} width={room.width} height={room.depth} stroke={ROOM_COLORS.wallEdge} strokeWidth={px} />
      {openings.map((opening) => (
        <OpeningSymbol key={opening.id} room={room} opening={opening} px={px} />
      ))}
    </>
  );
}
