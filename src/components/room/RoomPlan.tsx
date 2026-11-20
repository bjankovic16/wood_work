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
import { FeatureSizeGrips } from './FeatureSizeGrips';
import { planGridStep, ROOM_COLORS } from '../canvas/theme';
import { WALL_THICKNESS } from '../../store/viewport';
import { measureText } from '../../lib/measureText';
import { DimensionLines } from './DimensionLines';
import { roomPlanFrame, rotatePlanPoint } from './roomPlanView';

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
  const angle = useUiStore((s) => s.roomPlanAngle);
  const ui = useUiStore.getState();
  const drag = useDrawingDrag(angle);
  const readout = useRoomReadout();
  const feature = selection?.type === 'feature' && room.features?.find((f) => f.id === selection.id);
  const size = useDrawingSize();
  const tileId = useId();
  const [measure, setMeasure] = useState<string | null>(null);
  const fitted = roomPlanFrame(room, size, angle);
  const allWalls = useMemo(() => roomSegments(room), [room]);
  const segments = allWalls.filter((wall) => !wall.partitionId);
  const corners = usePlanCorners(segments, fitted, drag,
    (id) => { setMeasure(null); ui.setSelectedWallId(id); });
  const { px, x, y } = corners.frame;
  const active = segments.find((s) => s.id === wallId);
  const measuring = active && measure === active.id;
  const tiled = style.floorPattern === 'tiles';
  const floor = style.floorColor ?? (tiled ? DEFAULT_FLOOR_COLOR : ROOM_COLORS.floor);
  const grid = planGridStep(1 / px);
  const tile = style.floorTileSize ?? DEFAULT_FLOOR_TILE_SIZE;
  const outline = points(roomOutline(room));
  const { width, height } = size;
  const movingWall = selection ? undefined : active;
  const viewLabel = wallId ? t.room.openWall(allWalls.findIndex((s) => s.id === wallId) + 1) : '';
  const namedWidth = Math.max(88, measureText(viewLabel, 12, 550) + 40);
  const { dimensions, icons, grip } = useMemo(() => planWallControls(allWalls, { x, y, px, angle }, { width, height }, movingWall,
    wallId ? { id: wallId, width: namedWidth } : undefined),
    [allWalls, x, y, px, angle, width, height, movingWall, wallId, namedWidth]);
  const readoutCentre = readout && rotatePlanPoint(readout.centre, angle);
  const viewLayout = allWalls.map((wall, i) => ({ wall, label: t.room.openWall(i + 1), icon: icons.get(wall.id)!,
    anchor: dimensions.get(wall.id)?.at ?? wallPoint(wall, wall.length / 2), number: i + 1 }));
  const dimensionLayout = segments.map((wall, i) => {
    const { anchor, at } = dimensions.get(wall.id)!;
    const distance = (at.x - anchor.x) * wall.inward.x + (at.y - anchor.y) * wall.inward.y;
    const centre = wallPoint(wall, wall.length / 2, distance), half = wall.length / (2 * px);
    const along = ((at.x - centre.x) * wall.tangent.x + (at.y - centre.y) * wall.tangent.y) / px;
    return { wall, number: i + 1, at, distance, centre, half, along };
  });
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
    <svg aria-label={t.room.plan} data-room-plan-angle={angle} className="absolute inset-0 h-full w-full touch-none" viewBox={`${x} ${y} ${size.width * px} ${size.height * px}`}>
      <defs>{tiled ? <pattern id={tileId} width={tile} height={tile} patternUnits="userSpaceOnUse">
        <rect width={tile} height={tile} fill={floor} /><path d={`M0 ${tile}V0H${tile}`} fill="none" stroke={style.floorGroutColor ?? DEFAULT_FLOOR_GROUT_COLOR} strokeWidth={Math.max(3, px * 1.4)} />
      </pattern> : <>
        <pattern id={`${tileId}-grid`} width={grid} height={grid} patternUnits="userSpaceOnUse">
          <rect width={grid} height={grid} fill={floor} />
          <path d={`M0 ${grid}V0H${grid}`} fill="none" stroke={ROOM_COLORS.gridMinor} strokeWidth={2 * px} />
        </pattern>
        <pattern id={tileId} width="1000" height="1000" patternUnits="userSpaceOnUse">
          <rect width="1000" height="1000" fill={`url(#${tileId}-grid)`} />
          <path d="M0 1000V0H1000" fill="none" stroke={ROOM_COLORS.gridMajor} strokeWidth={2 * px} />
        </pattern>
      </>}</defs>
      <g data-room-space="" transform={`rotate(${angle})`}>
      <polygon points={outline} fill="none" stroke={ROOM_COLORS.wall} strokeWidth={2 * WALL_THICKNESS} strokeLinejoin="miter" />
      <polygon data-plan-floor="" points={outline} fill={`url(#${tileId})`} />
      {reference && items.flatMap((item) => footprintPieces(item).map((part, i) => <polygon key={`${item.id}-${i}`} data-plan-cabinet={item.id} points={points(part)} fill="#edf0e9" stroke="#95a198" strokeWidth={px} />))}
      <polygon points={outline} fill="none" stroke={ROOM_COLORS.wallEdge} strokeWidth={5 * px} strokeLinejoin="round" />
      <polygon data-wall-paint="" points={outline} fill="none" stroke={style.wallColor ?? DEFAULT_WALL_COLOR} strokeWidth={3 * px} strokeLinejoin="round" />
      {room.partitions?.map((p) => <polygon key={p.id} points={points(partitionPolygon(p))} fill="#b9af9c" />)}
      {allWalls.map((s, i) => {
        // Keep partition face targets on their own side; a perimeter line can be hit from either side.
        const thickness = s.partitionId && room.partitions?.find((p) => p.id === s.partitionId)?.thickness;
        const outside = thickness ? -thickness / 2 : -20 * px, inside = (s.partitionId ? 20 : 24) * px;
        return <g key={s.id} data-wall-id={s.id} {...(s.partitionId
          ? planButton(t.advancedRoom.wall(i + 1), (keyboard) => onFaceWall(s.id, keyboard))
          : { role: 'button', tabIndex: 0, 'aria-label': t.advancedRoom.wall(i + 1), 'aria-description': t.room.wallMoveHint, ...corners.wallProps(s.id) })}
          aria-pressed={wallId === s.id}>
          <title>{s.partitionId ? t.room.openWall(i + 1) : `${t.advancedRoom.wall(i + 1)} · ${t.room.wallMoveHint}`}</title>
          <line className="room-wall-edge" x1={s.start.x} y1={s.start.y} x2={s.end.x} y2={s.end.y}
            stroke={wallId === s.id ? '#376b4a' : 'transparent'} strokeWidth={5 * px} pointerEvents="none" />
          <polygon fill="transparent" points={points([wallPoint(s, 0, outside), wallPoint(s, s.length, outside),
            wallPoint(s, s.length, inside), wallPoint(s, 0, inside)])} />
        </g>;
      })}
      {room.features?.map((f, i) => <g key={f.id} data-plan-feature={f.id} style={{ touchAction: 'none' }}
        {...drawingButton(`${t.engine.roomFeatures[f.kind]} ${i + 1}`, () => ui.selectRoomObject({ type: 'feature', id: f.id }, f.wallId))}
        // Selection opens the inspector on pointerdown. A synthesized tap would hit the redrawn wall underneath.
        onTouchEnd={(e) => e.preventDefault()}
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
      {dimensionLayout.map(({ wall, centre, half, distance, along }) =>
        <g key={wall.id} data-plan-dimension-line={wall.id} pointerEvents="none"
          transform={`translate(${centre.x} ${centre.y}) rotate(${wall.angle}) scale(${px})`} color={wall.id === wallId ? '#34594d' : '#526457'}>
          <DimensionLines half={half} witnesses={[-distance / px, -distance / px]}
            left={Math.max(3, -half - along + 32)} right={Math.max(3, along + 32 - half)} />
        </g>)}
      {viewLayout.map(({ wall, anchor, icon }) =>
        <line key={wall.id} x1={anchor.x} y1={anchor.y} x2={icon.x} y2={icon.y}
          stroke="#8d9f95" strokeWidth={px} pointerEvents="none" />)}
      {corners.targets}
      {dimensionLayout.map(({ wall, number, at }) => {
        const label = `${t.advancedRoom.wall(number)} · ${Math.round(wall.length)} mm`, selected = wall.id === wallId;
        return <g key={wall.id} data-wall-dimension={wall.id}
          {...planButton(`${label}: ${t.advancedRoom.length}`, () => { ui.setSelectedWallId(wall.id); setMeasure(wall.id); })}
          transform={`translate(${at.x} ${at.y}) scale(${px}) rotate(${-angle})`}>
          <rect x="-32" y="-22" width="64" height="44" rx="8" fill="transparent" />
          <rect x="-32" y="-18" width="64" height="36" rx="2" fill="#fffefa" stroke={selected ? '#34594d' : '#c9d2c8'} strokeWidth={selected ? 1.4 : .7} />
          <text textAnchor="middle" y="-4" fontSize="11" fontWeight="550" fill="#475b50">{t.advancedRoom.wall(number)}</text>
          <text textAnchor="middle" y="11" fontSize="13" fontWeight="600" fill={selected ? '#34594d' : '#233c33'}>{Math.round(wall.length)}<tspan fontSize="11" fontWeight="500"> mm</tspan></text>
        </g>;
      })}
      {viewLayout.map(({ wall, label, icon, number }) => {
        const named = wall.id === wallId, half = named ? namedWidth / 2 : 22;
        return <g key={wall.id} data-wall-view={wall.id} {...planButton(label, (keyboard) => onFaceWall(wall.id, keyboard))}
          transform={`translate(${icon.x} ${icon.y}) scale(${px}) rotate(${-angle})`}>
          <title>{label}</title>
          <rect x={-half} y="-22" width={half * 2} height="44" fill="transparent" />
          <rect className="room-wall-view-chip" x={-half + 2} y="-15" width={half * 2 - 4} height="30" rx="5" />
          <Eye x={named ? -half + 9 : -16} y="-8" size={16} aria-hidden="true" color="#315a44" />
          <text textAnchor={named ? 'start' : 'middle'} x={named ? -half + 30 : 9} y="4" fontSize="12" fontWeight="550" fill="#315a44">{named ? label : number}</text>
        </g>;
      })}
      {corners.grips}
      {!selection && corners.wallGrip(grip)}
      {!selection && corners.angle}
      {feature && <FeatureSizeGrips key={feature.id} room={room} feature={feature} px={px} angle={angle} />}
      </g>
    </svg>
    {corners.notice && <p role="status" className="pointer-events-none absolute inset-x-2 bottom-1 mx-auto w-fit rounded bg-amber-50 px-2 py-1 text-center text-xs text-amber-950">{corners.notice}</p>}
    {readout && readoutCentre && !measuring && <DrawingReadout data={readout} x={(readoutCentre.x - x) / px}
      y={feature ? ((readoutCentre.y - y) / px < height / 2 ? height - 74 : 0) : (readoutCentre.y - y) / px} />}
    {measuring && <WallMeasureDialog wall={active} number={segments.indexOf(active) + 1} close={() => setMeasure(null)} />}
  </div>;
}
