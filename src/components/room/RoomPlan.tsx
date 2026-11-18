import { Eye } from 'lucide-react';
import { useId, useMemo, useRef, useState, type KeyboardEvent, type TouchEvent } from 'react';
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
import { usePlanCorners } from './usePlanCorners';
import { planWallControls } from './planWallControls';
import { updateRoomFeature } from '../../store/actions';

export const points = (polygon: Point[]) => polygon.map((p) => `${p.x},${p.y}`).join(' ');
export function drawingButton(label: string, activate: (keyboard?: boolean) => void) {
  return { role: 'button', tabIndex: 0, 'aria-label': label, className: 'cursor-pointer focus-visible:outline-blue-600',
    onClick: () => activate(), onKeyDown: (event: KeyboardEvent<SVGGElement>) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(true); }
    } };
}

export function RoomPlan({ onFaceWall, reference }: { onFaceWall: (id: string, keyboard?: boolean) => void; reference: boolean }) {
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
  const fitted = Math.max(room.width / Math.max(40, size.width - 158), room.depth / Math.max(25, size.height - 102));
  const allWalls = useMemo(() => roomSegments(room), [room]);
  const segments = allWalls.filter((wall) => !wall.partitionId);
  const corners = usePlanCorners(segments, { px: fitted, x: (room.width - size.width * fitted) / 2, y: (room.depth - size.height * fitted) / 2 }, drag,
    (id) => { setMeasure(null); ui.setSelectedWallId(id); });
  const { px, x, y } = corners.frame;
  const active = segments.find((s) => s.id === wallId);
  const measuring = active && measure === active.id;
  const floor = style.floorColor ?? DEFAULT_FLOOR_COLOR;
  const tile = style.floorTileSize ?? DEFAULT_FLOOR_TILE_SIZE;
  const outline = points(roomOutline(room));
  const { width, height } = size;
  const { dimensions, icons } = useMemo(() => planWallControls(allWalls, { x, y, px }, { width, height }), [allWalls, x, y, px, width, height]);
  // Mobile browsers can discard the synthesized click on a thin, sloping SVG wall.
  // Treat a stationary single-finger release as a tap, without turning a swipe into one.
  const tap = useRef<{ x: number; y: number; id: number } | null>(null);
  const planButton = (label: string, activate: (keyboard?: boolean) => void) => ({
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
    <svg aria-label={t.room.plan} className="absolute inset-0 h-full w-full touch-none" viewBox={`${x} ${y} ${size.width * px} ${size.height * px}`}>
      {style.floorPattern === 'tiles' && <defs><pattern id={tileId} width={tile} height={tile} patternUnits="userSpaceOnUse">
        <rect width={tile} height={tile} fill={floor} /><path d={`M0 ${tile}V0H${tile}`} fill="none" stroke={style.floorGroutColor ?? DEFAULT_FLOOR_GROUT_COLOR} strokeWidth={Math.max(3, px * 1.4)} />
      </pattern></defs>}
      <polygon data-plan-floor="" points={outline} fill={style.floorPattern === 'tiles' ? `url(#${tileId})` : floor} />
      {reference && items.flatMap((item) => footprintPieces(item).map((part, i) => <polygon key={`${item.id}-${i}`} data-plan-cabinet={item.id} points={points(part)} fill="#edf0e9" stroke="#95a198" strokeWidth={px} />))}
      <polygon points={outline} fill="none" stroke="#43564f" strokeWidth={6 * px} strokeLinejoin="round" />
      <polygon data-wall-paint="" points={outline} fill="none" stroke={style.wallColor ?? DEFAULT_WALL_COLOR} strokeWidth={3 * px} strokeLinejoin="round" />
      {room.partitions?.map((p) => <polygon key={p.id} points={points(partitionPolygon(p))} fill="#b9af9c" />)}
      {allWalls.map((s, i) => {
        // Keep partition face targets on their own side; a perimeter line can be hit from either side.
        const thickness = s.partitionId && room.partitions?.find((p) => p.id === s.partitionId)?.thickness;
        const outside = thickness ? -thickness / 2 : -20 * px, inside = (s.partitionId ? 20 : 24) * px;
        return <g key={s.id} data-wall-id={s.id} {...planButton(t.advancedRoom.wall(i + 1), (keyboard) => onFaceWall(s.id, keyboard))} aria-pressed={wallId === s.id}>
          <title>{t.room.openWall(i + 1)}</title>
          <line className="room-wall-edge" x1={s.start.x} y1={s.start.y} x2={s.end.x} y2={s.end.y}
            stroke={wallId === s.id ? '#376b4a' : 'transparent'} strokeWidth={5 * px} pointerEvents="none" />
          <polygon fill="transparent" points={points([wallPoint(s, 0, outside), wallPoint(s, s.length, outside),
            wallPoint(s, s.length, inside), wallPoint(s, 0, inside)])} />
        </g>;
      })}
      {allWalls.map((s, i) => {
        const icon = icons.get(s.id)!, label = t.room.openWall(i + 1);
        const anchor = dimensions.get(s.id)?.at ?? wallPoint(s, s.length / 2);
        return <g key={s.id}>
          <line x1={anchor.x} y1={anchor.y} x2={icon.x} y2={icon.y} stroke="#8d9f95" strokeWidth={px} pointerEvents="none" />
          <g data-wall-view={s.id} {...planButton(label, (keyboard) => onFaceWall(s.id, keyboard))}
            transform={`translate(${icon.x} ${icon.y}) scale(${px})`}>
            <title>{label}</title>
            <rect x="-22" y="-22" width="44" height="44" fill="transparent" />
            <rect className="room-wall-view-chip" x="-20" y="-12" width="40" height="24" rx="7" />
            <Eye x="-16" y="-7" size={14} aria-hidden="true" color="#315a44" />
            <text textAnchor="middle" x="8" y="4" fontSize="11" fontWeight="650" fill="#315a44">2D</text>
          </g>
        </g>;
      })}
      {corners.targets}
      {segments.map((s, i) => {
        const label = `${t.advancedRoom.wall(i + 1)} · ${Math.round(s.length)} mm`;
        const selected = s.id === wallId;
        const { anchor, at } = dimensions.get(s.id)!;
        return <g key={s.id}>
          <line x1={anchor.x} y1={anchor.y} x2={at.x} y2={at.y} stroke="#8d9f95" strokeWidth={px} pointerEvents="none" />
          <g data-wall-dimension={s.id} {...planButton(`${label}: ${t.advancedRoom.length}`, () => { ui.setSelectedWallId(s.id); setMeasure(s.id); })}
            transform={`translate(${at.x} ${at.y}) scale(${px})`}>
            <rect x="-32" y="-22" width="64" height="44" rx="8" fill="transparent" />
            <rect x="-32" y="-18" width="64" height="36" rx="7" fill={selected ? '#34594d' : '#fffefa'} stroke={selected ? '#34594d' : '#c9d2c8'} />
            <text textAnchor="middle" y="-4" fontSize="10" fontWeight="600" fill={selected ? '#e2eee3' : '#53665e'}>{t.advancedRoom.wall(i + 1)}</text>
            <text textAnchor="middle" y="11" fontSize="13" fontWeight="650" fill={selected ? 'white' : '#233c33'}>{Math.round(s.length)}<tspan fontSize="9" fontWeight="500"> mm</tspan></text>
          </g>
        </g>;
      })}
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
      {corners.grips}
    </svg>
    {corners.notice && <p role="status" className="pointer-events-none absolute inset-x-2 bottom-1 mx-auto w-fit rounded bg-amber-50 px-2 py-1 text-center text-xs text-amber-950">{corners.notice}</p>}
    {readout && !measuring && <DrawingReadout data={readout} x={(readout.centre.x - x) / px} y={(readout.centre.y - y) / px} />}
    {measuring && <WallMeasureDialog wall={active} number={segments.indexOf(active) + 1} close={() => setMeasure(null)} />}
  </div>;
}
