import { useState, type KeyboardEvent } from 'react';
import { footprintPieces } from '../../domain/geometry';
import { roomFeaturePolygon, roomFeaturePose, roomOutline } from '../../domain/roomGeometry';
import { featureDragPlacement } from '../../domain/roomObjectPlacement';
import type { Point } from '../../domain/types';
import { openingFrame, openingOnWall, partitionPolygon, roomSegments, wallPoint } from '../../domain/walls';
import { useT } from '../../i18n';
import { useDesignStore } from '../../store/designStore';
import { useUiStore } from '../../store/uiStore';
import { Button } from '../ui';
import { WallMeasureFields } from './WallMeasures';
import { DrawingReadout, useRoomReadout } from './RoomReadout';
import { useDrawingDrag } from './useDrawingDrag';
import { useDrawingSize } from './useDrawingSize';
import { updateRoomFeature } from '../../store/actions';

export const points = (polygon: Point[]) => polygon.map((p) => `${p.x},${p.y}`).join(' ');
export function drawingButton(label: string, activate: () => void) {
  return { role: 'button', tabIndex: 0, 'aria-label': label, className: 'cursor-pointer focus-visible:outline-blue-600',
    onClick: activate, onKeyDown: (event: KeyboardEvent<SVGGElement>) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); }
    } };
}

export function RoomPlan() {
  const t = useT();
  const { room, openings, items } = useDesignStore((s) => s.design);
  const selection = useUiStore((s) => s.roomSelection);
  const wallId = useUiStore((s) => s.selectedWallId);
  const ui = useUiStore.getState();
  const drag = useDrawingDrag();
  const readout = useRoomReadout();
  const size = useDrawingSize();
  const [measure, setMeasure] = useState<{ id: string; focus: 'length' | 'height' } | null>(null);
  const px = Math.max(room.width / Math.max(50, size.width - 92), room.depth / Math.max(50, size.height - 84));
  const w = size.width * px, h = size.height * px;
  const allWalls = roomSegments(room);
  const segments = allWalls.filter((wall) => !wall.partitionId);
  const active = segments.find((s) => s.id === wallId);
  const measuring = measure?.id === active?.id && active && measure;
  const openMeasure = (id: string, focus: 'length' | 'height') => {
    ui.setSelectedWallId(id);
    setMeasure({ id, focus });
  };
  return <div ref={size.ref} data-testid="room-plan" className="relative min-h-0 min-w-0 flex-1 bg-[#f7f5ef]">
    <svg aria-label={t.room.plan} className="absolute inset-0 h-full w-full" viewBox={`${(room.width - w) / 2} ${(room.depth - h) / 2} ${w} ${h}`}>
      <polygon points={points(roomOutline(room))} fill="#fffdf7" stroke="#766f60" strokeWidth={5 * px} strokeLinejoin="round" />
      {items.flatMap((item) => footprintPieces(item).map((part, i) => <polygon key={`${item.id}-${i}`} points={points(part)} fill="#e1dfd5" stroke="#b3afa2" strokeWidth={px} />))}
      {room.partitions?.map((p) => <polygon key={p.id} points={points(partitionPolygon(p))} fill="#b9af9c" />)}
      {allWalls.filter((s) => s.partitionId).map((s) => <g key={s.id} data-wall-id={s.id}
        {...drawingButton(t.advancedRoom.wall(allWalls.indexOf(s) + 1), () => { ui.setSelectedWallId(s.id); ui.setRoomElevationOpen(true); })}>
        <polygon fill="transparent" points={points([s.start, s.end, wallPoint(s, s.length, 14 * px), wallPoint(s, 0, 14 * px)])} />
      </g>)}
      {segments.map((s, i) => <g key={s.id} data-wall-id={s.id} {...drawingButton(t.advancedRoom.wall(i + 1), () => { setMeasure(null); ui.setSelectedWallId(s.id); ui.setRoomElevationOpen(true); })} aria-pressed={wallId === s.id}>
        <line x1={s.start.x} y1={s.start.y} x2={s.end.x} y2={s.end.y} stroke={wallId === s.id ? '#376b4a' : 'transparent'} strokeWidth={5 * px} />
        <polygon fill="transparent" points={points([wallPoint(s, 0, -4 * px), wallPoint(s, s.length, -4 * px), wallPoint(s, s.length, 22 * px), wallPoint(s, 0, 22 * px)])} />
      </g>)}
      {segments.map((s, i) => {
        const label = `${t.advancedRoom.wall(i + 1)} · ${Math.round(s.length)} mm`;
        const at = wallPoint(s, s.length / 2, -15 * px);
        const angle = s.angle > 90 && s.angle <= 270 ? s.angle - 180 : s.angle;
        const width = Math.min(140, label.length * 6.8 + 14);
        return <g key={s.id} data-wall-dimension={s.id} {...drawingButton(`${label}: ${t.advancedRoom.length}`, () => openMeasure(s.id, 'length'))}
          transform={`translate(${at.x} ${at.y}) rotate(${angle}) scale(${px})`}>
          <rect x={-width / 2} y="-12" width={width} height="24" rx="8" fill={s.id === wallId ? '#dce8da' : '#f7f5ef'} />
          <text textAnchor="middle" dominantBaseline="central" fill="#38483c" fontSize="12" fontWeight="600">{label}</text>
        </g>;
      })}
      {active && <g pointerEvents="none" aria-label={t.advancedRoom.start}>
        <circle cx={active.start.x} cy={active.start.y} r={5 * px} fill="#376b4a" stroke="white" strokeWidth={2 * px} />
        <title>{t.advancedRoom.start} · 0 mm</title>
      </g>}
      {room.features?.map((f, i) => <g key={f.id} data-plan-feature={f.id} style={{ touchAction: 'none' }}
        {...drawingButton(`${t.engine.roomFeatures[f.kind]} ${i + 1}`, () => ui.selectRoomObject({ type: 'feature', id: f.id }, f.wallId))}
        onPointerDown={(e) => {
          setMeasure(null);
          ui.selectRoomObject({ type: 'feature', id: f.id }, f.wallId);
          const centre = roomFeaturePose(room, f).centre;
          drag.start(e, (d) => {
            const snap = useUiStore.getState();
            const placement = featureDragPlacement(room, f, { x: centre.x + d.x, y: centre.y + d.y }, snap.snapEnabled ? snap.gridSize : 0);
            if (placement) updateRoomFeature(f.id, placement);
          });
        }} {...drag.handlers}>
        <title>{t.roomStructure.moveHint}</title>
        <polygon points={points(roomFeaturePolygon(room, f))} fill="#d8cbb5" stroke={selection?.id === f.id ? '#2563eb' : '#81745d'} strokeWidth={2 * px} />
      </g>)}
      {openings.map((o, i) => {
        const frame = openingFrame(room, o);
        if (!frame) return null;
        const a = wallPoint(frame, o.offset), b = wallPoint(frame, o.offset + o.width);
        return <g key={o.id} {...drawingButton(`${t.room.opening(o.kind)} ${openings.slice(0, i + 1).filter((entry) => entry.kind === o.kind).length}`, () => {
          ui.selectRoomObject({ type: 'opening', id: o.id }, openingOnWall(room, o)?.segment.id);
          ui.setRoomElevationOpen(true);
        })}>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={selection?.id === o.id ? '#2563eb' : o.kind === 'window' ? '#86b8c8' : '#c99067'} strokeWidth={8 * px} />
          <polygon fill="transparent" points={points([wallPoint(frame, o.offset, -7 * px), wallPoint(frame, o.offset + o.width, -7 * px),
            wallPoint(frame, o.offset + o.width, 15 * px), wallPoint(frame, o.offset, 15 * px)])} />
        </g>;
      })}
    </svg>
    {readout && !measuring && <DrawingReadout data={readout} x={size.width / 2 + (readout.centre.x - room.width / 2) / px}
      y={size.height / 2 + (readout.centre.y - room.depth / 2) / px} minTop={32} />}
    <Button className="absolute left-1/2 top-1 h-7 -translate-x-1/2 whitespace-nowrap bg-studio-paper/90 text-xs" onClick={() => openMeasure((active ?? segments[0]).id, 'height')}>
      {t.room.ceilingHeight} · {room.height} mm
    </Button>
    {measuring && <div role="group" aria-label={t.advancedRoom.wall(segments.indexOf(active) + 1)} data-testid="drawing-measure"
      className="studio-panel absolute bottom-2 left-1/2 max-h-[94%] w-64 max-w-[96%] -translate-x-1/2 space-y-2 overflow-auto rounded-xl border p-3 shadow-lg"
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setMeasure(null); } }}>
      <div className="flex items-center justify-between gap-2 text-sm font-semibold">
        {t.advancedRoom.wall(segments.indexOf(active) + 1)}
        <Button onClick={() => setMeasure(null)}>{t.common.done}</Button>
      </div>
      <WallMeasureFields key={`${measuring.id}:${measuring.focus}`} wall={active} focus={measuring.focus} />
    </div>}
  </div>;
}
