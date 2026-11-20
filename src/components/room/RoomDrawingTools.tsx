import { ArrowLeft, ChevronDown, Plus } from 'lucide-react';
import type { Ref } from 'react';
import { roomOutline } from '../../domain/roomGeometry';
import type { Room } from '../../domain/types';
import type { WallSegment } from '../../domain/walls';
import { useT } from '../../i18n';
import { useUiStore, type RoomPlanAngle } from '../../store/uiStore';
import { RoomObjectButtons } from '../properties/RoomPanel';
import { Menu } from '../ui';
import { requestRoomWall } from './RoomWallPicker';
import { roomPlanBounds } from './roomPlanView';

interface Props {
  room: Room;
  walls: WallSegment[];
  facing?: WallSegment;
  selectedWall?: WallSegment;
  pickerRef: Ref<HTMLSelectElement>;
  show: (wallId: string) => void;
  back: () => void;
  roomModel?: { active: boolean; open: () => void };
  angle?: RoomPlanAngle;
}

export function RoomDrawingTools({ room, walls, facing, selectedWall, pickerRef, show, back, roomModel, angle = 0 }: Props) {
  const t = useT();
  const addOpen = useUiStore((s) => s.roomAddMenuOpen);
  const ui = useUiStore.getState();
  const bounds = roomPlanBounds(room, angle);
  const selected = facing ?? selectedWall;
  const number = selected ? walls.indexOf(selected) + 1 : 0;
  let modelOption = ':room-model';
  while (walls.some((s) => s.id === modelOption)) modelOption += ':';
  const margin = Math.max(room.width, room.depth) * 0.1;
  return <div className="room-drawing-tools">
    {facing && !roomModel?.active && <button type="button" className="room-plan-back" onClick={back} aria-label={t.room.backToPlan} title={t.room.backToPlan}>
      <ArrowLeft size={16} aria-hidden="true" />
    </button>}
    <label className="room-view-picker">
      <svg className="room-mini-plan" aria-hidden="true" viewBox={`${bounds.x - margin} ${bounds.y - margin} ${bounds.width + 2 * margin} ${bounds.height + 2 * margin}`}>
        <g transform={`rotate(${angle})`}>
        <polygon points={roomOutline(room).map((p) => `${p.x},${p.y}`).join(' ')} fill="#e1e9dd" stroke="#718878" vectorEffect="non-scaling-stroke" />
        {room.partitions?.map((p) => <line key={p.id} x1={p.start.x} y1={p.start.y} x2={p.end.x} y2={p.end.y} stroke="#899889" vectorEffect="non-scaling-stroke" />)}
        {facing && <line x1={facing.start.x} y1={facing.start.y} x2={facing.end.x} y2={facing.end.y}
          stroke="#246748" strokeWidth="3" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
        </g>
      </svg>
      <span aria-hidden="true"><small>{roomModel?.active ? t.room.model : facing ? t.room.facingWall : t.room.plan}</small>
        <strong>{number && !roomModel?.active ? t.advancedRoom.wall(number) : t.room.chooseWall}</strong></span>
      <ChevronDown size={15} aria-hidden="true" />
      <select aria-label={t.room.drawingView} ref={pickerRef} value={roomModel?.active ? modelOption : facing?.id ?? ''}
        onChange={(e) => e.target.value === modelOption ? roomModel?.open() : show(e.target.value)}>
        <option value="">{t.room.plan}</option>
        {roomModel && <option value={modelOption}>{t.room.model}</option>}
        <optgroup label={t.room.wallView}>{walls.map((s, i) => <option key={s.id} value={s.id}>
          {t.advancedRoom.wall(i + 1)} · {Math.round(s.length)} mm
        </option>)}</optgroup>
      </select>
    </label>
    {!roomModel?.active && <div className="room-add-menu" onKeyDown={(e) => {
      if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      // Arrows must never nudge the selected chimney through an open picker.
      e.preventDefault(); e.stopPropagation();
      const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[data-close-menu]:not(:disabled)'));
      if (!buttons.length) return;
      const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (e.key === 'Home') buttons[0].focus();
      else if (e.key === 'End') buttons.at(-1)?.focus();
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') buttons[i === -1 && e.key === 'ArrowUp' ? buttons.length - 1
        : (i + (e.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length].focus();
    }}>
      <Menu label={t.room.addObject} variant="outline" icon={<Plus size={16} aria-hidden="true" />} open={addOpen}
        onOpenChange={(open) => open ? requestRoomWall(() => ui.setRoomAddMenuOpen(true)) : ui.setRoomAddMenuOpen(false)}
        text={<><span className="room-add-label">{t.room.addShort}</span><ChevronDown size={14} aria-hidden="true" /></>}>
        <RoomObjectButtons menu facing={!!facing} />
      </Menu>
    </div>}
  </div>;
}
