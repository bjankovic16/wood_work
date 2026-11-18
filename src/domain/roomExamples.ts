import { createDesign } from './designOps';
import { newId } from './ids';
import { buildLayout } from './templates';
import type { LabelPrefixes } from './catalog';
import type { Design, Room } from './types';

export type RoomExampleId = 'l-chimney' | 'diagonal-corner';
export const ROOM_EXAMPLES: readonly RoomExampleId[] = ['l-chimney', 'diagonal-corner'];

export function createRoomExample(id: RoomExampleId, name: string, prefixes?: LabelPrefixes): Design {
  const room: Room = id === 'l-chimney'
    ? {
        width: 4800, depth: 4000, height: 2700,
        cutout: { kind: 'notch', corner: 'bottomRight', width: 1400, depth: 1500 },
        features: [{ id: newId(), kind: 'chimney', x: 1800, y: 0, width: 450, depth: 450 }],
      }
    : {
        width: 4600, depth: 3400, height: 2700,
        cutout: { kind: 'diagonal', corner: 'topRight', width: 1000, depth: 800 },
        features: [{ id: newId(), kind: 'column', x: 0, y: 1800, width: 400, depth: 400 }],
      };
  return {
    ...createDesign(name), room, items: buildLayout(id === 'l-chimney' ? 'l-shape' : 'straight', room, prefixes),
    style: { front: id === 'l-chimney' ? 'cashmere' : 'oak', worktop: 'marble', handles: 'brass', backsplash: 'marble', decor: true },
  };
}
