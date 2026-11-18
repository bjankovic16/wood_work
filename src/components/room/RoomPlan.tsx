import { useId, useRef, useState, type KeyboardEvent, type TouchEvent } from 'react';
import { footprintPieces } from '../../domain/geometry';
import { DEFAULT_FLOOR_COLOR, DEFAULT_FLOOR_GROUT_COLOR, DEFAULT_FLOOR_TILE_SIZE, DEFAULT_WALL_COLOR } from '../../domain/style';
import { roomFeaturePolygon, roomFeaturePose, roomOutline } from '../../domain/roomGeometry';
import { featureDragPlacement } from '../../domain/roomObjectPlacement';
import type { Point } from '../../domain/types';
import { openingFrame, openingOnWall, partitionPolygon, roomSegments, wallPoint } from '../../domain/walls';
import { useT } from '../../i18n';
import { useDesignStore } from '../../store/designStore';
import { useUiStore } from '../../store/uiStore';
import { WallMeasureDialog } from './WallMeasures';
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
  const { room, openings, items, style } = useDesignStore((s) => s.design);
  const selection = useUiStore((s) => s.roomSelection);
  const wallId = useUiStore((s) => s.selectedWallId);
  const ui = useUiStore.getState();
  const drag = useDrawingDrag();
  const readout = useRoomReadout();
  const size = useDrawingSize();
  const tileId = useId();
  const [measure, setMeasure] = useState<string | null>(null);
  // Reserve actual screen space on all four sides for horizontal, tappable measurements.
  const px = Math.max(room.width / Math.max(40, size.width - 158), room.depth / Math.max(25, size.height - 102));
  const w = size.width * px, h = size.height * px;
  const allWalls = roomSegments(room);
  const segments = allWalls.filter((wall) => !wall.partitionId);
  const active = segments.find((s) => s.id === wallId);
  const measuring = active && measure === active.id;
  const floor = style.floorColor ?? DEFAULT_FLOOR_COLOR;
  const tile = style.floorTileSize ?? DEFAULT_FLOOR_TILE_SIZE;
  const outline = points(roomOutline(room));
  const labels: Point[] = [];
  // Mobile browsers can discard the synthesized click on a thin, sloping SVG wall.
  // Treat a stationary single-finger release as a tap, without turning a swipe into one.
  const tap = useRef<{ x: number; y: number; id: number } | null>(null);
  const planButton = (label: string, activate: () => void) => ({
    ...drawingButton(label, activate),
    onTouchStart: (e: TouchEvent<SVGGElement>) => {
      const p = e.touches[0];
      tap.current = e.touches.length === 1 ? { x: p.clientX, y: p.clientY, id: p.identifier } : null;
    },
    onTouchMove: (e: TouchEvent<SVGGElement>) => {
      const p = e.touches[0];
      if (tap.current && (e.touches.length !== 1 || Math.hypot(p.clientX - tap.current.x, p.clientY - tap.current.y) > 8)) tap.current = null;
    },
    onTouchCancel: () => { tap.current = null; },
    onTouchEnd: (e: TouchEvent<SVGGElement>) => {
      const start = tap.current, p = e.changedTouches[0];
      tap.current = null;
      e.preventDefault();
      if (start?.id === p.identifier && e.touches.length === 0 && Math.hypot(p.clientX - start.x, p.clientY - start.y) <= 8) activate();
    },
  });
  return <div ref={size.ref} data-testid="room-plan" className="room-drafting-paper relative min-h-0 min-w-0 flex-1">
    <svg aria-label={t.room.plan} className="absolute inset-0 h-full w-full touch-none" viewBox={`${(room.width - w) / 2} ${(room.depth - h) / 2} ${w} ${h}`}>
      {style.floorPattern === 'tiles' && <defs><pattern id={tileId} width={tile} height={tile} patternUnits="userSpaceOnUse">
        <rect width={tile} height={tile} fill={floor} /><path d={`M0 ${tile}V0H${tile}`} fill="none" stroke={style.floorGroutColor ?? DEFAULT_FLOOR_GROUT_COLOR} strokeWidth={Math.max(3, px * 1.4)} />
      </pattern></defs>}
      <polygon data-plan-floor="" points={outline} fill={style.floorPattern === 'tiles' ? `url(#${tileId})` : floor} />
      {items.flatMap((item) => footprintPieces(item).map((part, i) => <polygon key={`${item.id}-${i}`} points={points(part)} fill="#edf0e9" stroke="#95a198" strokeWidth={px} />))}
      <polygon points={outline} fill="none" stroke="#43564f" strokeWidth={6 * px} strokeLinejoin="round" />
      <polygon data-wall-paint="" points={outline} fill="none" stroke={style.wallColor ?? DEFAULT_WALL_COLOR} strokeWidth={3 * px} strokeLinejoin="round" />
      {room.partitions?.map((p) => <polygon key={p.id} points={points(partitionPolygon(p))} fill="#b9af9c" />)}
      {allWalls.filter((s) => s.partitionId).map((s) => <g key={s.id} data-wall-id={s.id}
        {...planButton(t.advancedRoom.wall(allWalls.indexOf(s) + 1), () => { ui.setSelectedWallId(s.id); ui.setRoomElevationOpen(true); })}>
        <polygon fill="transparent" points={points([s.start, s.end, wallPoint(s, s.length, 14 * px), wallPoint(s, 0, 14 * px)])} />
      </g>)}
      {segments.map((s, i) => <g key={s.id} data-wall-id={s.id} {...planButton(t.advancedRoom.wall(i + 1), () => { setMeasure(null); ui.setSelectedWallId(s.id); ui.setRoomElevationOpen(true); })} aria-pressed={wallId === s.id}>
        <line x1={s.start.x} y1={s.start.y} x2={s.end.x} y2={s.end.y} stroke={wallId === s.id ? '#376b4a' : 'transparent'} strokeWidth={5 * px} />
        <polygon fill="transparent" points={points([wallPoint(s, 0, -4 * px), wallPoint(s, s.length, -4 * px), wallPoint(s, s.length, 22 * px), wallPoint(s, 0, 22 * px)])} />
      </g>)}
      {segments.map((s, i) => {
        const label = `${t.advancedRoom.wall(i + 1)} · ${Math.round(s.length)} mm`;
        const selected = s.id === wallId;
        const candidates = [0.5, 0.3, 0.7, 0.15, 0.85].map((fraction) => {
          const anchor = wallPoint(s, s.length * fraction);
          return { anchor, x: anchor.x - s.inward.x * 42 * px, y: anchor.y - s.inward.y * 28 * px };
        });
        const clear = (p: Point) => labels.every((q) => Math.abs(q.x - p.x) >= 70 * px || Math.abs(q.y - p.y) >= 45 * px);
        const at = candidates.find(clear) ?? candidates[0];
        labels.push(at);
        return <g key={s.id}>
          <line x1={at.anchor.x} y1={at.anchor.y} x2={at.x} y2={at.y} stroke="#8d9f95" strokeWidth={px} pointerEvents="none" />
          <g data-wall-dimension={s.id} {...planButton(`${label}: ${t.advancedRoom.length}`, () => { ui.setSelectedWallId(s.id); setMeasure(s.id); })}
            transform={`translate(${at.x} ${at.y}) scale(${px})`}>
            <rect x="-32" y="-22" width="64" height="44" rx="8" fill="transparent" />
            <rect x="-32" y="-18" width="64" height="36" rx="7" fill={selected ? '#34594d' : '#fffefa'} stroke={selected ? '#34594d' : '#c9d2c8'} />
            <text textAnchor="middle" y="-4" fontSize="10" fontWeight="600" fill={selected ? '#e2eee3' : '#53665e'}>{t.advancedRoom.wall(i + 1)}</text>
            <text textAnchor="middle" y="11" fontSize="13" fontWeight="650" fill={selected ? 'white' : '#233c33'}>{Math.round(s.length)}<tspan fontSize="9" fontWeight="500"> mm</tspan></text>
          </g>
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
        return <g key={o.id} {...planButton(`${t.room.opening(o.kind)} ${openings.slice(0, i + 1).filter((entry) => entry.kind === o.kind).length}`, () => {
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
      y={size.height / 2 + (readout.centre.y - room.depth / 2) / px} />}
    {measuring && <WallMeasureDialog wall={active} number={segments.indexOf(active) + 1} close={() => setMeasure(null)} />}
  </div>;
}
