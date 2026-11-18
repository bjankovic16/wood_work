import { ArrowRight, Box, CircleDot, Images, MousePointer2, Scaling } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { polygonArea } from '../../domain/polygons';
import { roomOutline } from '../../domain/roomGeometry';
import { useT } from '../../i18n';
import { useUiStore } from '../../store/uiStore';
import { roomMeasurements } from './roomMeasurements';
import { View3D } from '../three/View3D';
import { Button, Segmented } from '../ui';
import { RoomPlan } from './RoomPlan';
import { RoomDrawingTools } from './RoomDrawingTools';
import { RoomInspector } from './RoomInspector';
import { WallElevation } from './WallElevation';
import { WallViewButton } from './WallViewButton';
import { roomSegments } from '../../domain/walls';
import { useDesignStore } from '../../store/designStore';
import { finishRoom, useProjectsStore } from '../../store/projects';

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
  const segments = roomSegments(room);
  const wall = segments.find((s) => s.id === wallId);
  const facing = elevation ? wall : undefined;
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
  const openReviewedWall = (id: string) => {
    ui.setRoomView('plan'); showDrawing(id);
    requestAnimationFrame(() => viewPicker.current?.focus({ preventScroll: true }));
  };
  const actions = <>
    {compact && <Button variant="outline" data-testid="room-ideas" aria-label={t.layouts.title} title={t.layouts.title} onClick={() => ui.setLayoutsOpen(true)}>
      <Images className="size-4" /><span className="max-[459px]:hidden">{t.layouts.title}</span>
    </Button>}
    <Button variant="primary" data-testid="room-done" aria-label={t.room.continue} onClick={finishRoom}>
      <span className="max-[459px]:hidden">{t.room.continue}</span><span className="min-[460px]:hidden">{t.room.kitchenShort}</span><ArrowRight className="size-4" />
    </Button>
  </>;
  const title = <div className="mr-auto flex min-w-0 items-center gap-2">
    <h1>{t.room.setupTitle}</h1>
    <span className="room-area" title={t.room.area} aria-label={`${t.room.area}: ${area} m²`}><Scaling size={13} aria-hidden="true" />{area} m²</span>
  </div>;
  const views = <Segmented<'plan' | '3d'> ariaLabel={t.room.view} size="sm" value={reviewing ? '3d' : 'plan'}
        options={[{ value: 'plan', label: '2D', title: t.room.plan }, { value: '3d', label: t.room.review }]}
        onChange={(v) => { setPreview(false); ui.setRoomView(v); }} />;
  const heading = <header className="room-heading">
      {title}{views}
      {!compact && view === 'plan' && <Button variant="outline" active={preview} onClick={() => setPreview(!preview)}><Box className="size-4" />{t.room.preview}</Button>}
      {!compact && actions}
    </header>;
  return <main data-testid="room-workspace" aria-label={t.room.tab} className="flex h-full min-h-0 flex-1 flex-col bg-studio-canvas">
    {!compact && heading}
    <div className="room-work-area" data-view={view}>
      <div className="room-drawing-area">
        {view === 'plan' && <div className="room-drawing-pane">
          <RoomDrawingTools room={room} walls={segments} facing={facing} selectedWall={wall} pickerRef={viewPicker} show={showDrawing}
            back={() => {
              showDrawing('');
              if (facing) requestAnimationFrame(() => document.querySelector<SVGElement>(`[data-wall-view="${CSS.escape(facing.id)}"]`)?.focus({ preventScroll: true }));
            }} />
          {facing ? <WallElevation key={facing.id} wall={facing} number={segments.indexOf(facing) + 1} reference={reference} />
            : <RoomPlan reference={reference} onFaceWall={(id, keyboard) => { showDrawing(id); if (keyboard) viewPicker.current?.focus({ preventScroll: true }); }} />}
          {compact ? <header className="room-plan-caption">{title}<p>{facing ? t.room.originHint : t.room.cornerHintShort}</p></header>
            : <p className="room-drawing-hint">{facing ? <><CircleDot size={13} />{t.room.originHint}</> : <><MousePointer2 size={13} />{t.room.measureHint}</>}</p>}
        </div>}
        {(view === '3d' || !compact && preview) && <div className="min-w-0 flex-1 border-studio-line lg:border-l" data-testid="room-3d" data-room-3d="" tabIndex={-1}
          onPointerDownCapture={(e) => { if (e.target instanceof HTMLCanvasElement) e.currentTarget.focus({ preventScroll: true }); }}>
          <View3D rows={rows} split={view === 'plan'} onOpenWall={openReviewedWall} />
        </div>}
      </div>
      <aside data-testid="room-inspector" className="room-inspector studio-panel">
        {view === 'plan' ? <RoomInspector wall={facing} wallNumber={wall ? segments.indexOf(wall) + 1 : 0}
          reference={reference} onReference={furnished ? setReference : undefined} /> : <>
          {compact && heading}
          <section aria-label={t.room.measurements} data-testid="room-measurements" className="min-h-0 overflow-y-auto p-4">
            <h2 className="text-sm font-semibold">{t.room.measurements}</h2>
            <p className="pt-1 text-xs text-studio-muted">{t.room.reviewHint}</p>
            {wall && <Button variant="outline" className="mt-2" onClick={() => openReviewedWall(wall.id)}>{t.advancedRoom.wall(segments.indexOf(wall) + 1)} · {t.room.editIn2D}</Button>}
            <dl className="mt-2 divide-y divide-studio-line text-sm">{rows.map(({ id, name, value, details, faces = [] }) =>
              <div key={id} data-measure={id} className="py-2">
                <dt className="font-semibold">{name}</dt><dd className="flex items-center justify-between gap-2">
                  <span>{value}{details && <small className="block text-studio-muted">{details}</small>}</span>
                  {faces.length > 0 && <span className="flex">{faces.map((face) =>
                    <WallViewButton key={face.id} face={face} numbered={faces.length > 1} open={openReviewedWall} />)}</span>}
                </dd>
              </div>)}</dl>
          </section>
        </>}
      </aside>
    </div>
    {compact && !reviewing && <div className="room-footer">{views}{actions}</div>}
  </main>;
}
