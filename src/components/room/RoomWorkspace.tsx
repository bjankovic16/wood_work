import { ChevronDown, ChevronLeft, ChevronRight, GripVertical, Maximize2, Minimize2, MousePointer2, RotateCw, SquareDashed } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { polygonArea } from '../../domain/polygons';
import { roomOutline } from '../../domain/roomGeometry';
import { useT } from '../../i18n';
import { useUiStore } from '../../store/uiStore';
import { roomMeasurements } from './roomMeasurements';
import { View3D } from '../three/View3D';
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
import { RoomPreviewCube } from './RoomPreviewCube';
import { nextRoomPlanAngle } from './roomPlanView';
import type { RoomObjectSelection } from '../../domain/roomObjectPlacement';

export function RoomWorkspace({ compact = false }: { compact?: boolean }) {
  const activeId = useProjectsStore((s) => s.activeId);
  return <ProjectRoom key={activeId} compact={compact} />;
}

function PreviewEdge({ value, change }: { value: number; change: (n: number) => void }) {
  const t = useT();
  const start = useRef<{ x: number; width: number; value: number } | null>(null);
  const set = (n: number) => change(Math.max(30, Math.min(70, Math.round(n))));
  return <div role="separator" aria-orientation="vertical" aria-label={t.room.previewSize} title={t.room.previewSize}
    aria-valuemin={30} aria-valuemax={70} aria-valuenow={value} tabIndex={0} className="room-preview-divider"
    onPointerDown={(e) => {
      const stage = e.currentTarget.closest<HTMLElement>('[data-room-stage]');
      if (e.button !== 0 || !e.isPrimary || !stage?.clientWidth) return;
      start.current = { x: e.clientX, width: stage.clientWidth, value };
      e.currentTarget.setPointerCapture(e.pointerId);
    }} onPointerMove={(e) => {
      const base = start.current;
      if (base && e.currentTarget.hasPointerCapture(e.pointerId)) set(base.value + (base.x - e.clientX) * 100 / base.width);
    }} onPointerUp={() => { start.current = null; }} onLostPointerCapture={() => { start.current = null; }}
    onPointerCancel={() => { if (start.current) change(start.current.value); start.current = null; }}
    onKeyDown={(e) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.stopPropagation(); e.preventDefault();
      set(e.key === 'Home' ? 30 : e.key === 'End' ? 70 : value + (e.key === 'ArrowLeft' ? 5 : -5));
    }}><GripVertical size={16} aria-hidden="true" /></div>;
}

function ProjectRoom({ compact }: { compact: boolean }) {
  const t = useT();
  const view = useUiStore((s) => s.view);
  const wallId = useUiStore((s) => s.selectedWallId);
  const elevation = useUiStore((s) => s.roomElevationOpen);
  const angle = useUiStore((s) => s.roomPlanAngle);
  const room = useDesignStore((s) => s.design.room);
  const openings = useDesignStore((s) => s.design.openings);
  const furnished = useDesignStore((s) => s.design.items.length > 0);
  const gesturing = useDesignStore((s) => s.gestureBase !== null);
  const segments = useMemo(() => roomSegments(room), [room]);
  const wall = segments.find((s) => s.id === wallId);
  const facing = elevation ? wall : undefined;
  const neighbours = useMemo(() => facing && adjoiningWalls(room, segments, facing), [room, segments, facing]);
  const viewPicker = useRef<HTMLSelectElement>(null);
  const ui = useUiStore.getState();
  const [preview, setPreview] = useState(false);
  const [previewWidth, setPreviewWidth] = useState(42);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [reference, setReference] = useState(false);
  const reviewing = view === '3d';
  const previewButton = useRef<HTMLButtonElement>(null);
  const drawingReturn = useRef<{ wallId: string | null; elevation: boolean; selection: RoomObjectSelection | null } | null>(null);
  const rows = useMemo(() => reviewing || preview ? roomMeasurements(room, openings, t) : [], [reviewing, preview, room, openings, t]);
  const area = t.number(Math.round(polygonArea(roomOutline(room)) / 10000) / 100);
  const showDrawing = (id: string) => {
    if (id) ui.setSelectedWallId(id);
    ui.setRoomElevationOpen(!!id);
  };
  const openWallIn2D = (id: string) => {
    drawingReturn.current = null;
    setPreview(false);
    ui.setRoomView('plan'); showDrawing(id);
    requestAnimationFrame(() => viewPicker.current?.focus({ preventScroll: true }));
  };
  const rememberDrawing = () => {
    const current = useUiStore.getState();
    drawingReturn.current = { wallId: current.selectedWallId, elevation: current.roomElevationOpen, selection: current.roomSelection };
  };
  const backToDrawing = () => {
    setPreview(false);
    ui.setRoomView('plan');
    const saved = drawingReturn.current;
    drawingReturn.current = null;
    if (saved) {
      ui.setSelectedWallId(saved.wallId);
      ui.setRoomElevationOpen(saved.elevation);
      if (saved.selection) ui.selectRoomObject(saved.selection, saved.wallId ?? undefined);
    }
    requestAnimationFrame(() => previewButton.current?.focus({ preventScroll: true }));
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
  const tools = <RoomDrawingTools room={room} walls={segments} facing={facing} selectedWall={wall} pickerRef={viewPicker} angle={reviewing ? 0 : angle}
    roomModel={{ active: reviewing, open: () => { if (!drawingReturn.current) rememberDrawing(); setPreview(false); ui.setRoomView('3d'); } }}
    show={(id) => { ui.setRoomView('plan'); showDrawing(id); }}
    back={() => {
      showDrawing('');
      if (facing) requestAnimationFrame(() => document.querySelector<SVGElement>(`[data-wall-view="${CSS.escape(facing.id)}"]`)?.focus({ preventScroll: true }));
    }} />;
  const togglePreview = () => {
    if (reviewing || preview) { backToDrawing(); return; }
    rememberDrawing();
    if (compact) ui.setRoomView('3d');
    else setPreview(true);
  };
  const toggle = <button type="button" ref={previewButton} className="room-canvas-toggle" data-room-preview-toggle=""
    aria-label={reviewing ? t.room.backToDrawing : t.room.preview} title={reviewing ? t.room.backToDrawing : t.room.preview}
    aria-pressed={reviewing || preview} aria-expanded={reviewing || preview} onClick={togglePreview}>
    {reviewing ? <><SquareDashed size={16} aria-hidden="true" />2D</> : <>
      <RoomPreviewCube room={room} wallId={wallId} /><span className="room-preview-long">{t.room.preview}</span>
      <span className="room-preview-short" aria-hidden="true">3D</span>
      {preview ? <Minimize2 size={14} aria-hidden="true" /> : <Maximize2 size={14} aria-hidden="true" />}
    </>}
  </button>;
  const viewActions = <div className="room-view-actions">
    {!reviewing && !facing && <button type="button" className="room-canvas-toggle room-plan-rotate" data-room-rotate-view=""
      disabled={gesturing} aria-label={t.room.rotatePlan} aria-description={t.room.planRotation(angle)}
      title={`${t.room.rotatePlan} · ${t.room.planRotation(angle)}`}
      onClick={() => ui.setRoomPlanAngle(nextRoomPlanAngle(useUiStore.getState().roomPlanAngle))}>
      <RotateCw size={18} aria-hidden="true" /><span className="room-rotation-step" aria-hidden="true">90°</span>
      <span className="sr-only" aria-live="polite">{t.room.planRotation(angle)}</span>
    </button>}
    {toggle}
  </div>;
  return <main data-testid="room-workspace" aria-label={t.room.tab} className="flex h-full min-h-0 flex-1 flex-col bg-studio-canvas">
    <div className="room-work-area" data-view={view} data-elevation={view === 'plan' && !!facing || undefined}
      data-schedule-closed={compact && reviewing && !scheduleOpen || undefined}>
      <div className="room-canvas" data-testid="room-canvas">
        {(!reviewing || !compact) && <div className="room-canvas-controls">{tools}{viewActions}</div>}
        <div className="room-drawing-area" data-room-stage="">
        {view === 'plan' && <div className="room-drawing-pane">
          {facing ? <WallElevation key={facing.id} wall={facing} number={segments.indexOf(facing) + 1} reference={reference} />
            : <RoomPlan reference={reference} onFaceWall={(id, keyboard) => { showDrawing(id); if (keyboard) viewPicker.current?.focus({ preventScroll: true }); }} />}
          {facing ? <nav className="room-wall-ends" aria-label={t.room.adjoiningWalls}>
            {wallEnd('left')}<div className="room-elevation-note">{compact && title}<span title={t.room.originHint}>{t.room.drawingUnits}</span></div>{wallEnd('right')}
          </nav> : compact ? <header className="room-plan-caption">{title}<p>{t.room.cornerHintShort}</p></header>
            : <p className="room-drawing-hint"><MousePointer2 size={13} />{wall && !wall.partitionId ? t.room.wallMoveHint : t.room.measureHint}</p>}
        </div>}
        {(view === '3d' || !compact && preview) && <div className="relative min-w-0 flex-1" data-testid="room-3d" data-room-3d="" tabIndex={-1}
          data-room-inset={view === 'plan' || undefined} style={view === 'plan' ? { width: `${previewWidth}%` } : undefined}
          onPointerDownCapture={(e) => { if (e.target instanceof HTMLCanvasElement) e.currentTarget.focus({ preventScroll: true }); }}>
          {view === 'plan' && <PreviewEdge value={previewWidth} change={setPreviewWidth} />}
          <View3D rows={rows} onOpenWall={openWallIn2D} closeInset={view === 'plan' ? backToDrawing : undefined}
            expandInset={view === 'plan' ? () => { setPreview(false); ui.setRoomView('3d'); } : undefined} />
          {compact && <><div className="mobile-scene-tools"><PhoneViewButton /></div>
            <div className="room-scene-picker">{tools}{toggle}</div></>}
        </div>}
        </div>
      </div>
      <aside data-testid="room-inspector" className="room-inspector studio-panel">
        {!compact && <header className="room-heading">{title}<RoomNextStep /></header>}
        {view === 'plan' ? <RoomInspector compact={compact} wall={facing} wallNumber={wall ? segments.indexOf(wall) + 1 : 0}
          reference={reference} onReference={furnished ? setReference : undefined} /> : <>
          {compact && <button className="flex min-h-11 shrink-0 items-center justify-between px-4 text-sm font-semibold" aria-expanded={scheduleOpen}
            aria-controls="room-measure-schedule" onClick={() => setScheduleOpen(!scheduleOpen)}>{t.room.measurements}
            <ChevronDown size={16} className={scheduleOpen ? 'rotate-180' : ''} /></button>}
          <section id="room-measure-schedule" hidden={compact && !scheduleOpen} aria-label={t.room.measurements} data-testid="room-measurements" className="min-h-0 overflow-y-auto p-4">
            {!compact && <h2 className="text-sm font-semibold">{t.room.measurements}</h2>}
            <p className="pt-1 text-xs text-studio-muted">{t.room.reviewHint}</p>
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
