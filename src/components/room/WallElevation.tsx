import { ArrowLeft } from 'lucide-react';
import { featureDragPlacement, openingDragPlacement } from '../../domain/roomObjectPlacement';
import { DEFAULT_WALL_COLOR } from '../../domain/style';
import { openingOnWall, wallCoordinates, wallPoint, type WallSegment } from '../../domain/walls';
import { useT } from '../../i18n';
import { updateOpening, updateRoomFeature } from '../../store/actions';
import { useDesignStore } from '../../store/designStore';
import { useUiStore } from '../../store/uiStore';
import { RoomObjectButtons } from '../properties/RoomPanel';
import { Button } from '../ui';
import { drawingButton } from './RoomPlan';
import { DrawingReadout, useRoomReadout } from './RoomReadout';
import { useDrawingDrag } from './useDrawingDrag';
import { useDrawingSize } from './useDrawingSize';

const steps: Partial<Record<string, [number, number]>> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
const snapGrid = () => { const ui = useUiStore.getState(); return ui.snapEnabled ? ui.gridSize : 0; };

export function WallElevation({ wall, number }: { wall: WallSegment; number: number }) {
  const t = useT();
  const { room, openings, style } = useDesignStore((s) => s.design);
  const selection = useUiStore((s) => s.roomSelection);
  const ui = useUiStore.getState();
  const drag = useDrawingDrag();
  const readout = useRoomReadout();
  const size = useDrawingSize();
  const height = room.height;
  const pad = Math.max(wall.length, height) * 0.06;
  const font = pad * 0.5;
  const scale = Math.min(size.width / (wall.length + 2 * pad), size.height / (height + 2.8 * pad));
  return <section data-testid="wall-elevation" aria-label={`${t.room.elevation}: ${t.advancedRoom.wall(number)}`} className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#f7f5ef] p-2">
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <Button variant="outline" aria-label={t.room.backToPlan} title={t.room.backToPlan} onClick={() => ui.setRoomElevationOpen(false)}><ArrowLeft className="size-4" /></Button>
      <strong className="mr-auto text-sm">{t.advancedRoom.wall(number)}</strong>
      <RoomObjectButtons wallId={wall.id} openingsOnly />
    </div>
    <p className="px-1 pt-1 text-[11px] text-studio-muted">{t.room.elevation} · {t.room.elevationHint}</p>
    <div ref={size.ref} className="relative min-h-0 flex-1">
      <svg className="h-full w-full touch-none" aria-label={t.room.elevation} viewBox={`${-pad} ${-pad} ${wall.length + 2 * pad} ${height + 2.8 * pad}`}>
        <rect x="0" y={height - wall.height} width={wall.length} height={wall.height} fill={style.wallColor ?? DEFAULT_WALL_COLOR} stroke="#66786b" strokeWidth={pad / 18} />
        <line x1="0" y1={height - wall.height} x2="0" y2={height} stroke="#376b4a" strokeWidth={pad / 12} />
        <text x="0" y={height + font * 1.4} fontSize={font} fill="#376b4a">{t.advancedRoom.start} · 0 mm</text>
        <text x={wall.length} y={height + font * 1.4} textAnchor="end" fontSize={font} fill="#544e42">{Math.round(wall.length)} mm</text>
        {room.features?.map((f, i) => f.wallId === wall.id && <g key={f.id} data-elevation-feature={f.id}
          {...drawingButton(`${t.engine.roomFeatures[f.kind]} ${i + 1}`, () => ui.selectRoomObject({ type: 'feature', id: f.id }, wall.id))}
          style={{ touchAction: 'none', cursor: 'grab' }} onPointerDown={(e) => {
            ui.selectRoomObject({ type: 'feature', id: f.id }, wall.id);
            drag.start(e, (d) => {
              const next = featureDragPlacement(room, f, wallPoint(wall, (f.offset ?? 0) + f.width / 2 + d.x, f.depth / 2), snapGrid());
              if (next) updateRoomFeature(f.id, next);
            });
          }} {...drag.handlers}>
          <title>{t.roomStructure.moveHint}</title>
          <rect x={f.offset} width={f.width} height={height} fill="#d6c9b2" stroke={selection?.id === f.id ? '#2563eb' : '#81745d'} strokeWidth={pad / 16} />
        </g>)}
        {openings.map((o, i) => {
          const binding = openingOnWall(room, o);
          if (binding?.segment.id !== wall.id) return null;
          const offset = binding.offset, top = height - o.sill - o.height;
          const name = `${t.room.opening(o.kind)} ${openings.slice(0, i + 1).filter((entry) => entry.kind === o.kind).length}`;
          const select = () => ui.selectRoomObject({ type: 'opening', id: o.id }, wall.id);
          const button = drawingButton(name, select);
          const move = (along: number, up: number, grid: number) => {
            const placed = openingDragPlacement(room, { ...o, wallId: wall.id, offset },
              { ...wallPoint(wall, offset + o.width / 2 + along), elevation: o.sill + o.height / 2 + up }, grid);
            if (placed.offset !== offset || placed.sill !== o.sill || useDesignStore.getState().gestureBase)
              updateOpening(o.id, { wallId: wall.id, offset: placed.offset, sill: placed.sill });
          };
          return <g key={o.id} data-elevation-opening={o.id} {...button} style={{ touchAction: 'none', cursor: 'grab' }}
            onKeyDown={(e) => {
              const delta = steps[e.key];
              if (!delta || e.ctrlKey || e.metaKey || e.altKey) { button.onKeyDown(e); return; }
              e.preventDefault(); select();
              const amount = e.shiftKey ? 100 : 10;
              move(delta[0] * amount, delta[1] * amount, 0);
            }}
            onPointerDown={(e) => {
              select();
              drag.start(e, (d) => move(d.x, -d.y, snapGrid()));
            }} {...drag.handlers}>
            <title>{t.room.elevationHint}</title>
            <rect x={offset} y={top} width={o.width} height={o.height} fill={o.kind === 'window' ? '#cce1e6' : '#dec7ad'}
              stroke={selection?.id === o.id ? '#2563eb' : '#786c5a'} strokeWidth={pad / 16} />
            <text pointerEvents="none" x={offset + o.width / 2} y={top + o.height / 2} textAnchor="middle" dominantBaseline="central" fontSize={Math.min(font, o.width / (name.length * 0.65))} fill="#403d34">{name}</text>
          </g>;
        })}
      </svg>
      {readout && readout.wallId === wall.id && <DrawingReadout data={readout}
        x={size.width / 2 + (wallCoordinates(wall, readout.centre).x - wall.length / 2) * scale}
        y={size.height / 2 + (height / 2 - readout.elevation - 0.4 * pad) * scale} />}
    </div>
  </section>;
}
