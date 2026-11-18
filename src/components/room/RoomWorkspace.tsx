import { Box, Check, Images } from 'lucide-react';
import { useState } from 'react';
import { useT } from '../../i18n';
import { useUiStore } from '../../store/uiStore';
import { RoomSettings } from '../properties/RoomPanel';
import { View3D } from '../three/View3D';
import { Button } from '../ui';
import { RoomPlan } from './RoomPlan';
import { WallElevation } from './WallElevation';
import { roomSegments } from '../../domain/walls';
import { useDesignStore } from '../../store/designStore';

export function RoomWorkspace({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const view = useUiStore((s) => s.view);
  const wallId = useUiStore((s) => s.selectedWallId);
  const elevation = useUiStore((s) => s.roomElevationOpen);
  const room = useDesignStore((s) => s.design.room);
  const segments = roomSegments(room);
  const wall = segments.find((s) => s.id === wallId);
  const ui = useUiStore.getState();
  const [preview, setPreview] = useState(false);
  return <main data-testid="room-workspace" aria-label={t.room.setupTitle} className="flex h-full min-h-0 flex-1 flex-col bg-studio-canvas">
    <div className="studio-panel flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
      <div className="mr-auto"><h1 className="text-base font-semibold">{t.room.setupTitle}</h1>
        {view === 'plan' && !elevation && <p className="text-[11px] text-studio-muted">{t.room.measureHint}</p>}
      </div>
      {!compact && view === 'plan' && <Button variant="outline" active={preview} onClick={() => setPreview(!preview)}><Box className="size-4" />{t.room.preview}</Button>}
      <Button variant="outline" data-testid="room-ideas" onClick={() => { ui.setRoomOpen(false); ui.setLayoutsOpen(true); }}><Images className="size-4" />{t.layouts.title}</Button>
      <Button variant="primary" data-testid="room-done" onClick={() => ui.setRoomOpen(false)}><Check className="size-4" />{t.room.continue}</Button>
    </div>
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className={`flex min-h-0 min-w-0 lg:flex-1 ${compact && view === '3d' ? 'flex-1' : 'h-[43%] shrink-0 lg:h-auto'}`}>
        {view === 'plan' && (elevation && wall ? <WallElevation key={wall.id} wall={wall} number={segments.indexOf(wall) + 1} /> : <RoomPlan />)}
        {(view === '3d' || !compact && preview) && <div className="min-w-0 flex-1 border-studio-line lg:border-l" data-testid="room-3d" data-room-3d="" tabIndex={-1}
          onPointerDownCapture={(e) => { if (e.target instanceof HTMLCanvasElement) e.currentTarget.focus({ preventScroll: true }); }}>
          <View3D compact={compact || view === 'plan'} roomPreview={view === 'plan'} />
        </div>}
      </div>
      <aside data-testid="room-inspector" className={`studio-panel min-h-0 overflow-y-auto overscroll-contain border-t pb-[env(safe-area-inset-bottom)] lg:w-[300px] lg:flex-none lg:border-l lg:border-t-0 ${compact && view === '3d' ? 'max-h-[25%] shrink-0' : 'flex-1'}`}>
        <RoomSettings />
      </aside>
    </div>
  </main>;
}
