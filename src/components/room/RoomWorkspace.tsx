import { ArrowRight, Box, CircleDot, Images, MousePointer2, Scaling } from 'lucide-react';
import { useRef, useState } from 'react';
import { polygonArea } from '../../domain/polygons';
import { roomOutline } from '../../domain/roomGeometry';
import { useT } from '../../i18n';
import { useUiStore } from '../../store/uiStore';
import { RoomSettings } from '../properties/RoomPanel';
import { View3D } from '../three/View3D';
import { Button, Segmented } from '../ui';
import { RoomPlan } from './RoomPlan';
import { RoomDrawingTools } from './RoomDrawingTools';
import { RoomInspector } from './RoomInspector';
import { WallElevation } from './WallElevation';
import { roomSegments } from '../../domain/walls';
import { useDesignStore } from '../../store/designStore';
import { finishRoom } from '../../store/projects';

export function RoomWorkspace({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const view = useUiStore((s) => s.view);
  const wallId = useUiStore((s) => s.selectedWallId);
  const elevation = useUiStore((s) => s.roomElevationOpen);
  const room = useDesignStore((s) => s.design.room);
  const segments = roomSegments(room);
  const wall = segments.find((s) => s.id === wallId);
  const facing = elevation ? wall : undefined;
  const viewPicker = useRef<HTMLSelectElement>(null);
  const ui = useUiStore.getState();
  const [preview, setPreview] = useState(false);
  const area = t.number(Math.round(polygonArea(roomOutline(room)) / 10000) / 100);
  const showDrawing = (id: string) => {
    if (id) ui.setSelectedWallId(id);
    ui.setRoomElevationOpen(!!id);
  };
  const actions = <>
    {compact && <Button variant="outline" data-testid="room-ideas" onClick={() => ui.setLayoutsOpen(true)}>
      <Images className="size-4" />{t.layouts.title}
    </Button>}
    <Button variant="primary" data-testid="room-done" onClick={finishRoom}>{t.room.continue}<ArrowRight className="size-4" /></Button>
  </>;
  return <main data-testid="room-workspace" aria-label={t.room.setupTitle} className="flex h-full min-h-0 flex-1 flex-col bg-studio-canvas">
    <header className="room-heading">
      <div className="mr-auto min-w-0">
        <div className="flex items-center gap-3">
          <h1>{t.room.setupTitle}</h1>
          <span className="room-area" title={t.room.area} aria-label={`${t.room.area}: ${area} m²`}><Scaling size={13} aria-hidden="true" />{area} m²</span>
        </div>
      </div>
      {compact && <Segmented<'plan' | '3d'> ariaLabel={t.topBar.view} size="sm" value={view === '3d' ? '3d' : 'plan'}
        options={[{ value: 'plan', label: '2D', title: t.room.plan }, { value: '3d', label: t.topBar.view3d }]}
        onChange={(v) => ui.setRoomView(v)} />}
      {!compact && view === 'plan' && <Button variant="outline" active={preview} onClick={() => setPreview(!preview)}><Box className="size-4" />{t.room.preview}</Button>}
      {!compact && actions}
    </header>
    <div className="room-work-area" data-view={view}>
      <div className="room-drawing-area">
        {view === 'plan' && <div className="room-drawing-pane">
          <RoomDrawingTools room={room} walls={segments} facing={facing} selectedWall={wall} pickerRef={viewPicker} show={showDrawing}
            back={() => {
              showDrawing('');
              if (facing) requestAnimationFrame(() => document.querySelector<SVGElement>(`[data-wall-id="${CSS.escape(facing.id)}"]`)?.focus({ preventScroll: true }));
            }} />
          {facing ? <WallElevation key={facing.id} wall={facing} number={segments.indexOf(facing) + 1} />
            : <RoomPlan onFaceWall={(id, keyboard) => { showDrawing(id); if (keyboard) viewPicker.current?.focus({ preventScroll: true }); }} />}
          <p className="room-drawing-hint">{facing ? <><CircleDot size={13} />{t.room.originHint}</> : <><MousePointer2 size={13} />{t.room.measureHint}</>}</p>
        </div>}
        {(view === '3d' || !compact && preview) && <div className="min-w-0 flex-1 border-studio-line lg:border-l" data-testid="room-3d" data-room-3d="" tabIndex={-1}
          onPointerDownCapture={(e) => { if (e.target instanceof HTMLCanvasElement) e.currentTarget.focus({ preventScroll: true }); }}>
          <View3D compact={compact || view === 'plan'} roomPreview={view === 'plan'} />
        </div>}
      </div>
      <aside data-testid="room-inspector" className="room-inspector studio-panel">
        {view === 'plan' ? <RoomInspector wall={facing} wallNumber={wall ? segments.indexOf(wall) + 1 : 0} /> : <RoomSettings />}
      </aside>
    </div>
    {compact && <div className="room-footer">{actions}</div>}
  </main>;
}
