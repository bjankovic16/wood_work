import type { KonvaEventObject } from 'konva/lib/Node';
import { Group, Line, Rect, Text } from 'react-konva';
import type { Opening, Room } from '../../domain/types';
import { openingFitsRoomWall, roomFeaturePolygon, roomFeaturePose, roomOutline } from '../../domain/roomGeometry';
import { useT } from '../../i18n';
import { FONT_FAMILY } from '../../lib/measureText';
import { WALL_THICKNESS } from '../../store/viewport';
import { COMPACT_LABEL_PX, planGridStep, ROOM_COLORS } from './theme';
import { openingFrame, openingIsValid, openingOnWall, partitionPolygon, roomSegments, wallPoint } from '../../domain/walls';
import { useUiStore } from '../../store/uiStore';

/** Where a wall starts, which way it runs, and which way is into the room. */
/** A window (glass lines in the wall) or a door (an opening with its swing), drawn the usual plan way. */
function OpeningSymbol({ room, opening, px }: { room: Room; opening: Opening; px: number }) {
  const frame = openingFrame(room, opening);
  if (!frame) return null;
  const T = room.partitions?.find((p) => p.id === frame.partitionId)?.thickness ?? WALL_THICKNESS;
  const at = (a: number, n: number) => wallPoint(frame, a, n);
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
export function RoomShape({ room, zoom, compact, openings = [] }: { room: Room; zoom: number; compact: boolean; openings?: Opening[] }) {
  const t = useT();
  const px = 1 / zoom;
  const outline = roomOutline(room);
  const points = outline.flatMap((point) => [point.x, point.y]);
  const step = planGridStep(zoom);
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
      <Line name="room-perimeter" points={points} closed fill={ROOM_COLORS.wall} stroke={ROOM_COLORS.wall} strokeWidth={WALL_THICKNESS * 2} lineJoin="miter" />
      <Line points={points} closed fill={ROOM_COLORS.floor} stroke={ROOM_COLORS.wallEdge} strokeWidth={px} />
      <Group clipFunc={(context) => {
        context.beginPath();
        outline.forEach((point, index) => index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y));
        context.closePath();
      }}>{lines}</Group>
      {(room.features ?? []).map((feature, index) => {
        const { centre, angle } = roomFeaturePose(room, feature);
        return <Group key={feature.id} x={centre.x} y={centre.y} rotation={angle} offsetX={feature.width / 2} offsetY={feature.depth / 2}>
          <Rect width={feature.width} height={feature.depth} fill="#d8cdbb" stroke="#847766" strokeWidth={1.5 * px} />
          {feature.width * zoom > 48 && feature.depth * zoom > 24 && <Text x={4 * px} y={feature.depth / 2 - 6 * px} width={feature.width - 8 * px} text={`${t.engine.roomFeatures[feature.kind]} ${index + 1}`} fontFamily={FONT_FAMILY} fontSize={(compact ? COMPACT_LABEL_PX : 10) * px} fill="#574b3e" align="center" ellipsis wrap="none" />}
        </Group>
      })}
      {(room.partitions ?? []).map((partition) => <Line key={partition.id} closed points={partitionPolygon(partition).flatMap((p) => [p.x, p.y])} fill="#d8cdbb" stroke="#847766" strokeWidth={1.5 * px} />)}
      {(room.treatments ?? []).map((entry) => {
        const segment = roomSegments(room).find((s) => s.id === entry.wallId);
        if (!segment) return null;
        const a = wallPoint(segment, entry.offset, 10);
        const b = wallPoint(segment, Math.min(segment.length, entry.offset + entry.width), 10);
        return <Line key={entry.id} points={[a.x, a.y, b.x, b.y]} stroke="#aa8050" strokeWidth={4 * px} />;
      })}
      {openings.filter((opening) => opening.wallId ? openingIsValid(room, opening) : openingFitsRoomWall(room, opening.wall, opening.offset, opening.width)).map((opening) => (
        <OpeningSymbol key={opening.id} room={room} opening={opening} px={px} />
      ))}
    </>
  );
}

/** Below cabinets in the hit stack: a room surface opens the same 2D editor as the header. */
export function RoomPickTargets({ room, openings, px, onPress }: {
  room: Room; openings: Opening[]; px: number; onPress: (event: KonvaEventObject<PointerEvent>, pick: () => void) => void;
}) {
  const ui = useUiStore.getState();
  return <Group>
    {roomSegments(room, false).map((s) => {
      const select = () => { ui.setRoomOpen(true); ui.setSelectedWallId(s.id); ui.setRoomElevationOpen(true); };
      return <Line key={s.id} points={[s.start.x, s.start.y, s.end.x, s.end.y]} stroke="transparent" strokeWidth={9 * px} onPointerDown={(e) => onPress(e, select)} />;
    })}
    {room.features?.map((f) => {
      const select = () => { ui.setRoomOpen(true); ui.selectRoomObject({ type: 'feature', id: f.id }, f.wallId); ui.setRoomElevationOpen(false); };
      return <Line key={f.id} points={roomFeaturePolygon(room, f).flatMap((p) => [p.x, p.y])} closed fill="transparent" onPointerDown={(e) => onPress(e, select)} />;
    })}
    {openings.map((o) => {
      const binding = openingOnWall(room, o);
      if (!binding) return null;
      const a = wallPoint(binding.segment, binding.offset, -WALL_THICKNESS / 2);
      const b = wallPoint(binding.segment, binding.offset + o.width, -WALL_THICKNESS / 2);
      const select = () => { ui.setRoomOpen(true); ui.selectRoomObject({ type: 'opening', id: o.id }, binding.segment.id); ui.setRoomElevationOpen(true); };
      return <Line key={o.id} points={[a.x, a.y, b.x, b.y]} stroke="transparent" strokeWidth={Math.max(WALL_THICKNESS, 14 * px)} onPointerDown={(e) => onPress(e, select)} />;
    })}
  </Group>;
}
