import { ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { roomOutline } from '../../domain/roomGeometry';
import { roomSegments } from '../../domain/walls';
import { useIsCompact } from '../../hooks/useMediaQuery';
import { useT } from '../../i18n';
import { useDesignStore } from '../../store/designStore';
import { useProjectsStore } from '../../store/projects';
import { useUiStore } from '../../store/uiStore';
import { Button, Dialog } from '../ui';
import { roomPlanBounds } from './roomPlanView';

export function requestRoomWall(choose: (wallId: string) => void) {
  const ui = useUiStore.getState();
  const wall = roomSegments(useDesignStore.getState().design.room).find((s) => s.id === ui.selectedWallId);
  if (wall) { choose(wall.id); return; }
  ui.setRoomElevationOpen(false);
  ui.setRoomWallRequest({ projectId: useProjectsStore.getState().activeId, choose });
}

export function RoomWallPicker() {
  const t = useT(), compact = useIsCompact();
  const request = useUiStore((s) => s.roomWallRequest);
  const angle = useUiStore((s) => s.roomPlanAngle);
  const room = useDesignStore((s) => s.design.room);
  const projectId = useProjectsStore((s) => s.activeId);
  const [failed, setFailed] = useState(false);
  const ui = useUiStore.getState();
  const close = () => { ui.setRoomWallRequest(null); setFailed(false); };
  useEffect(() => {
    if (request && request.projectId !== projectId) close();
  }, [request, projectId]);
  if (!request || request.projectId !== projectId) return null;
  const bounds = roomPlanBounds(room, angle), margin = Math.max(room.width, room.depth) * .12;
  const outline = roomOutline(room).map((p) => `${p.x},${p.y}`).join(' ');
  const choose = (wallId: string) => {
    const current = useUiStore.getState().roomWallRequest;
    if (!current || current.projectId !== useProjectsStore.getState().activeId) { close(); return; }
    if (!roomSegments(useDesignStore.getState().design.room).some((wall) => wall.id === wallId)) { setFailed(true); return; }
    ui.setSelectedWallId(wallId);
    try { current.choose(wallId); close(); }
    catch (error) { if (!(error instanceof RangeError)) throw error; setFailed(true); }
  };
  return <Dialog open title={t.room.wallBeforeAdd} onClose={close} sheet={compact}
    footer={<Button variant="outline" onClick={close}>{t.common.cancel}</Button>}>
    <div className="room-wall-picker">
      <p>{t.room.wallBeforeAddHint}</p>
      <div className="room-wall-choices">{roomSegments(room).map((wall, i) =>
        <Button key={wall.id} variant="outline" className="room-wall-choice" data-room-wall-choice={wall.id}
          aria-label={t.room.selectWall(i + 1)} onClick={() => choose(wall.id)}>
          <svg aria-hidden="true" viewBox={`${bounds.x - margin} ${bounds.y - margin} ${bounds.width + 2 * margin} ${bounds.height + 2 * margin}`}>
            <g transform={`rotate(${angle})`}>
              <polygon points={outline} fill="#e6ece2" stroke="#a2b19f" vectorEffect="non-scaling-stroke" />
              <line x1={wall.start.x} y1={wall.start.y} x2={wall.end.x} y2={wall.end.y}
                stroke="#376b4a" strokeWidth="3" vectorEffect="non-scaling-stroke" />
            </g>
          </svg>
          <span><strong>{t.advancedRoom.wall(i + 1)}</strong><small>{Math.round(wall.length)} mm</small></span>
          <ChevronRight size={16} aria-hidden="true" />
        </Button>)}</div>
      {failed && <p role="alert">{t.room.noSpace}</p>}
    </div>
  </Dialog>;
}
