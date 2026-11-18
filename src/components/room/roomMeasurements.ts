import { polygonArea } from '../../domain/polygons';
import { roomOutline } from '../../domain/roomGeometry';
import type { Opening, Point, Room } from '../../domain/types';
import { roomSegments, wallPoint } from '../../domain/walls';
import type { Messages } from '../../i18n';
import { roomObjectReadout } from './RoomReadout';

export interface RoomMeasure {
  id: string;
  name: string;
  value: string;
  details?: string;
  /** Position in the plan (mm), and distance above the floor (mm). */
  at?: Point;
  elevation?: number;
}

/** One measurement schedule drives both the projected labels and the accessible, unabridged list. */
export function roomMeasurements(room: Room, openings: Opening[], t: Messages): RoomMeasure[] {
  const walls = roomSegments(room);
  const outline = roomOutline(room);
  const mm = (v: number) => `${t.number(Math.round(v))} mm`;
  const angle = (v: number) => `${t.advancedRoom.angle}: ${t.number(Math.round(v * 10) / 10)}°`;
  const rows: RoomMeasure[] = [
    { id: 'bounds', name: t.room.roomSize, value: `${t.room.width}: ${mm(room.width)} · ${t.room.depth}: ${mm(room.depth)}` },
    { id: 'height', name: t.room.ceilingHeight, value: mm(room.height), at: outline[0], elevation: room.height / 2 },
    { id: 'area', name: t.room.area, value: `${t.number(Math.round(polygonArea(outline) / 10000) / 100)} m²` },
  ];
  for (const [i, wall] of walls.entries()) {
    if (wall.partitionId) continue;
    rows.push({ id: `wall:${wall.id}`, name: t.advancedRoom.wall(i + 1), value: mm(wall.length),
      details: `${t.room.height}: ${mm(wall.height)} · ${angle(wall.angle)}`,
      at: wallPoint(wall, wall.length / 2), elevation: 70 });
  }
  for (const selection of [...openings.map(({ id }) => ({ type: 'opening' as const, id })),
    ...(room.features ?? []).map(({ id }) => ({ type: 'feature' as const, id }))]) {
    const data = roomObjectReadout(room, openings, selection, t);
    if (data) rows.push({ id: `${selection.type}:${selection.id}`, name: data.name, value: data.lines[0],
      details: data.lines.slice(1).join(' · '), at: data.centre, elevation: data.elevation });
  }
  for (const [i, part] of (room.partitions ?? []).entries()) {
    const faceIndex = walls.findIndex((s) => s.partitionId === part.id), wall = walls[faceIndex];
    rows.push({ id: `partition:${part.id}`, name: t.advancedRoom.partition(i + 1), value: mm(wall.length),
      details: [`${t.advancedRoom.thickness}: ${mm(part.thickness)}`, `${t.room.height}: ${mm(part.height)}`, angle(wall.angle),
        `${t.advancedRoom.startX}: ${mm(part.start.x)}`, `${t.advancedRoom.startY}: ${mm(part.start.y)}`,
        `${t.advancedRoom.endX}: ${mm(part.end.x)}`, `${t.advancedRoom.endY}: ${mm(part.end.y)}`,
        `${t.advancedRoom.wall(faceIndex + 1)} / ${t.advancedRoom.wall(faceIndex + 2)}`].join(' · '),
      at: wallPoint(wall, wall.length / 2), elevation: part.height });
  }
  for (const [i, finish] of (room.treatments ?? []).entries()) {
    const j = walls.findIndex((s) => s.id === finish.wallId);
    if (j === -1) continue;
    rows.push({ id: `finish:${finish.id}`, name: `${t.advancedRoom.finish} ${i + 1}`, value: `${finish.width} × ${finish.height} mm`,
      details: `${t.advancedRoom.wall(j + 1)} · ${t.advancedRoom.offset}: ${mm(finish.offset)} · ${t.item.heightFromFloor}: ${mm(finish.elevation)}`,
      at: wallPoint(walls[j], finish.offset + finish.width / 2), elevation: finish.elevation + finish.height / 2 });
  }
  return rows;
}
