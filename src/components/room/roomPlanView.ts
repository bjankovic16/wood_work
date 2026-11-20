import type { Point, Room } from '../../domain/types';
import type { RoomPlanAngle } from '../../store/uiStore';

export type RoomPlanFrame = Point & { px: number; angle: RoomPlanAngle };

export function rotatePlanPoint({ x, y }: Point, angle: RoomPlanAngle): Point {
  switch (angle) {
    case 0: return { x, y };
    case 90: return { x: y === 0 ? 0 : -y, y: x };
    case 180: return { x: x === 0 ? 0 : -x, y: y === 0 ? 0 : -y };
    case 270: return { x: y, y: x === 0 ? 0 : -x };
    default: throw new RangeError('Room plan rotation must be a quarter turn.');
  }
}

export function unrotatePlanPoint(point: Point, angle: RoomPlanAngle): Point {
  return rotatePlanPoint(point, angle === 90 ? 270 : angle === 270 ? 90 : angle);
}

export function nextRoomPlanAngle(angle: RoomPlanAngle): RoomPlanAngle {
  switch (angle) {
    case 0: return 90;
    case 90: return 180;
    case 180: return 270;
    case 270: return 0;
    default: throw new RangeError('Room plan rotation must be a quarter turn.');
  }
}

export function roomPlanBounds(room: Pick<Room, 'width' | 'depth'>, angle: RoomPlanAngle) {
  const centre = rotatePlanPoint({ x: room.width / 2, y: room.depth / 2 }, angle);
  const sideways = angle === 90 || angle === 270;
  const width = sideways ? room.depth : room.width, height = sideways ? room.width : room.depth;
  return { x: centre.x - width / 2, y: centre.y - height / 2, width, height };
}

export function roomPlanFrame(room: Pick<Room, 'width' | 'depth'>, size: { width: number; height: number }, angle: RoomPlanAngle): RoomPlanFrame {
  const bounds = roomPlanBounds(room, angle);
  const px = Math.max(bounds.width / Math.max(40, size.width - 158), bounds.height / Math.max(25, size.height - 102));
  return { px, angle, x: bounds.x + (bounds.width - size.width * px) / 2, y: bounds.y + (bounds.height - size.height * px) / 2 };
}
