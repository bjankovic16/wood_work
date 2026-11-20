import { Box, ChevronLeft, ChevronRight, MousePointer2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { polygonArea } from '../../domain/polygons';
import { roomOutline } from '../../domain/roomGeometry';
import { useT } from '../../i18n';
import { useUiStore } from '../../store/uiStore';
import { roomMeasurements } from './roomMeasurements';
import { View3D } from '../three/View3D';
import { Button } from '../ui';
import { RoomPlan } from './RoomPlan';
import { RoomDrawingTools } from './RoomDrawingTools';
import { RoomInspector } from './RoomInspector';
import { WallElevation } from './WallElevation';
import { WallViewButton } from './WallViewButton';
import { roomSegments } from '../../domain/walls';
import { adjoiningWalls } from '../../domain/adjoiningWalls';
import { useDesignStore } from '../../store/designStore';
import { useProjectsStore } from '../../store/projects';
import { RoomNextStep } from '../layout/TopBar';
import { PhoneViewButton } from '../layout/PhoneThreeChrome';

export function RoomWorkspace({ compact = false }: { compact?: boolean }) {
  const activeId = useProjectsStore((s) => s.activeId);
  return <ProjectRoom key={activeId} compact={compact} />;
}

function ProjectRoom({ compact }: { compact: boolean }) {
  const t = useT();
  const view = useUiStore((s) => s.view);
  const wallId = useUiStore((s) => s.selectedWallId);
  const elevation = useUiStore((s) => s.roomElevationOpen);
  const room = useDesignStore((s) => s.design.room);
  const openings = useDesignStore((s) => s.design.openings);
  const furnished = useDesignStore((s) => s.design.items.length > 0);
  const segments = useMemo(() => roomSegments(room), [room]);
  const wall = segments.find((s) => s.id === wallId);
  const facing = elevation ? wall : undefined;
  const neighbours = useMemo(() => facing && adjoiningWalls(room, segments, facing), [room, segments, facing]);
  const viewPicker = useRef<HTMLSelectElement>(null);
  const ui = useUiStore.getState();
  const [preview, setPreview] = useState(false);
  const [reference, setReference] = useState(false);
  const reviewing = view === '3d';
  const rows = useMemo(() => reviewing || preview ? roomMeasurements(room, openings, t) : [], [reviewing, preview, room, openings, t]);
  const area = t.number(Math.round(polygonArea(roomOutline(room)) / 10000) / 100);
  const showDrawing = (id: string) => {
    if (id) ui.setSelectedWallId(id);
    ui.setRoomElevationOpen(!!id);
  };
  const openWallIn2D = (id: string) => {
    ui.setRoomView('plan'); showDrawing(id);
    requestAnimationFrame(() => viewPicker.current?.focus({ preventScroll: true }));
  };
  const title = <div className="mr-auto flex min-w-0 items-center gap-2">
    <h1>{t.room.tab}</h1>
    <span className="room-area" data-prefix={t.room.areaShort} aria-label={`${t.room.area}: ${area} m²`}>{area} m²</span>
  </div>;
  const wallEnd = (side: 'left' | 'right') => {
    const neighbour = neighbours?.[side], n = neighbour ? segments.indexOf(neighbour) + 1 : 0;
    const label = t.room.wallEnd[side];
    const wording = <span><small>{label}</small><strong>{neighbour ? t.advancedRoom.wall(n) : t.room.freeEnd}</strong></span>;
    return neighbour ? <button type="button" className={`room-wall-end ${side}`} title={t.room.openWall(n)}
      aria-label={`${label}: ${t.advancedRoom.wall(n)}`} onClick={() => openWallIn2D(neighbour.id)}>
      {side === 'left' && <ChevronLeft size={16} aria-hidden="true" />}{wording}{side === 'right' && <ChevronRight size={16} aria-hidden="true" />}
    </button> : <span className={`room-wall-end ${side}`}>{wording}</span>;
  };
  const tools = <RoomDrawingTools room={room} walls={segments} facing={facing} selectedWall={wall} pickerRef={viewPicker}
    roomModel={{ active: reviewing, open: () => { setPreview(false); ui.setRoomView('3d'); } }}
    show={(id) => { ui.setRoomView('plan'); showDrawing(id); }}
    back={() => {
      showDrawing('');
      if (facing) requestAnimationFrame(() => document.querySelector<SVGElement>(`[data-wall-view="${CSS.escape(facing.id)}"]`)?.focus({ preventScroll: true }));
    }} />;
  return <main data-testid="room-workspace" aria-label={t.room.tab} className="flex h-full min-h-0 flex-1 flex-col bg-studio-canvas">
    {!compact && <header className="room-heading">
      {title}{tools}
      {!reviewing && <Button variant="outline" active={preview} onClick={() => setPreview(!preview)}><Box size={16} />{t.room.preview}</Button>}
      <RoomNextStep />
    </header>}
    {compact && !reviewing && tools}
    <div className="room-work-area" data-view={view} data-elevation={view === 'plan' && !!facing || undefined}>
      <div className="room-drawing-area">
        {view === 'plan' && <div className="room-drawing-pane">
          {facing ? <WallElevation key={facing.id} wall={facing} number={segments.indexOf(facing) + 1} reference={reference} />
            : <RoomPlan reference={reference} onFaceWall={(id, keyboard) => { showDrawing(id); if (keyboard) viewPicker.current?.focus({ preventScroll: true }); }} />}
          {facing ? <nav className="room-wall-ends" aria-label={t.room.adjoiningWalls}>
            {wallEnd('left')}<div className="room-elevation-note">{compact && title}<span title={t.room.originHint}>{t.room.drawingUnits}</span></div>{wallEnd('right')}
          </nav> : compact ? <header className="room-plan-caption">{title}<p>{t.room.cornerHintShort}</p></header>
            : <p className="room-drawing-hint"><MousePointer2 size={13} />{t.room.measureHint}</p>}
        </div>}
        {(view === '3d' || !compact && preview) && <div className="relative min-w-0 flex-1 border-studio-line lg:border-l" data-testid="room-3d" data-room-3d="" tabIndex={-1}
          onPointerDownCapture={(e) => { if (e.target instanceof HTMLCanvasElement) e.currentTarget.focus({ preventScroll: true }); }}>
          <View3D rows={rows} split={view === 'plan'} onOpenWall={openWallIn2D} />
          {compact && <><div className="mobile-scene-tools"><PhoneViewButton /></div>
            <div className="room-scene-picker">{tools}</div></>}
        </div>}
      </div>
      <aside data-testid="room-inspector" className="room-inspector studio-panel">
        {view === 'plan' ? <RoomInspector compact={compact} wall={facing} wallNumber={wall ? segments.indexOf(wall) + 1 : 0}
          reference={reference} onReference={furnished ? setReference : undefined} /> : <>
          <section aria-label={t.room.measurements} data-testid="room-measurements" className="min-h-0 overflow-y-auto p-4">
            <h2 className="text-sm font-semibold">{t.room.measurements}</h2>
            <p className="pt-1 text-xs text-studio-muted">{t.room.reviewHint}</p>
            {wall && <Button variant="outline" className="mt-2" onClick={() => openWallIn2D(wall.id)}>{t.advancedRoom.wall(segments.indexOf(wall) + 1)} · {t.room.editIn2D}</Button>}
            <dl className="mt-2 divide-y divide-studio-line text-sm">{rows.map(({ id, name, value, details, faces = [] }) =>
              <div key={id} data-measure={id} className="py-2">
                <dt className="font-semibold">{name}</dt><dd className="flex items-center justify-between gap-2">
                  <span>{value}{details && <small className="block text-studio-muted">{details}</small>}</span>
                  {faces.length > 0 && <span className="flex">{faces.map((face) =>
                    <WallViewButton key={face.id} face={face} numbered={faces.length > 1} open={openWallIn2D} />)}</span>}
                </dd>
              </div>)}</dl>
          </section>
        </>}
      </aside>
    </div>
  </main>;
}
