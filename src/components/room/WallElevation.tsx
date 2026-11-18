import { useState } from 'react';
import { featureDragPlacement, openingDragPlacement } from '../../domain/roomObjectPlacement';
import { openingOnWall, openingsOnSegment, wallCoordinates, wallPoint, type WallSegment } from '../../domain/walls';
import { useT } from '../../i18n';
import { updateOpening, updateRoomFeature } from '../../store/actions';
import { useDesignStore } from '../../store/designStore';
import { useUiStore } from '../../store/uiStore';
import { ElevationBackdrop, ElevationRuler, OpeningFace } from './ElevationDrawing';
import { WallMeasureDialog } from './WallMeasures';
import { drawingButton } from './RoomPlan';
import { DrawingReadout, useRoomReadout } from './RoomReadout';
import { useDrawingDrag } from './useDrawingDrag';
import { useDrawingSize } from './useDrawingSize';

const steps: Partial<Record<string, [number, number]>> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
const snapGrid = () => { const ui = useUiStore.getState(); return ui.snapEnabled ? ui.gridSize : 0; };

export function WallElevation({ wall, number, reference }: { wall: WallSegment; number: number; reference: boolean }) {
  const t = useT();
  const { room, openings, style } = useDesignStore((s) => s.design);
  const selection = useUiStore((s) => s.roomSelection);
  const ui = useUiStore.getState();
  const drag = useDrawingDrag();
  const readout = useRoomReadout();
  const size = useDrawingSize();
  const [measure, setMeasure] = useState<'length' | 'height' | null>(null);
  const height = room.height;
  const scale = Math.min(Math.max(1, size.width - 72) / wall.length, Math.max(1, size.height - 74) / height);
  const px = 1 / scale, left = (size.width - wall.length * scale) / 2 + 12, top = (size.height - height * scale) / 2 + 2;
  return <section data-testid="wall-elevation" aria-label={`${t.room.elevation}: ${t.advancedRoom.wall(number)}`} className="room-elevation-paper flex min-h-0 min-w-0 flex-1 flex-col">
    <div ref={size.ref} className="relative min-h-0 flex-1">
      <svg className="absolute inset-0 h-full w-full touch-none" aria-label={t.room.elevation} viewBox={`${-left * px} ${-top * px} ${size.width * px} ${size.height * px}`}>
        <ElevationBackdrop wall={wall} height={height} px={px} reference={reference} />
        <ElevationRuler x={wall.length / 2} y={height - wall.height - 19 * px} length={wall.length} px={px}
          label={t.advancedRoom.length} edit={wall.partitionId ? undefined : () => setMeasure('length')} />
        <ElevationRuler x={-23 * px} y={height - wall.height / 2} vertical length={wall.height} px={px}
          label={wall.partitionId ? t.room.height : t.room.ceilingHeight} edit={wall.partitionId ? undefined : () => setMeasure('height')} />
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
          <rect x={f.offset} width={f.width} height={height} fill="#d6c9b2" stroke={selection?.id === f.id ? '#2563eb' : '#81745d'} strokeWidth={2 * px} />
        </g>)}
        {openings.map((o, i) => {
          const binding = openingOnWall(room, o);
          if (!binding) return null;
          const name = `${t.room.opening(o.kind)} ${openings.slice(0, i + 1).filter((entry) => entry.kind === o.kind).length}`;
          const top = height - o.sill - o.height;
          if (binding.segment.id !== wall.id) {
            if (!wall.partitionId || wall.partitionId !== binding.segment.partitionId) return null;
            // A through-opening is visible from both faces. Edit from its saved measuring origin.
            const reverse = openingsOnSegment(room, wall, [o])[0];
            return reverse && <g key={o.id} transform={`translate(${reverse.from} ${top})`}
              {...drawingButton(name, () => ui.selectRoomObject({ type: 'opening', id: o.id }, binding.segment.id))}>
              <OpeningFace opening={o} style={style} px={px} selected={false} />
            </g>;
          }
          const offset = binding.offset;
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
            <g transform={`translate(${offset} ${top})`}><OpeningFace opening={o} style={style} px={px} selected={selection?.id === o.id} /></g>
          </g>;
        })}
        <g transform={`translate(0 ${height}) scale(${px})`} pointerEvents="none">
          <circle r="4" fill="#287250" stroke="white" strokeWidth="1.5" />
          <text y="22" fontSize="11" fill="#3c634f">{t.advancedRoom.start} · 0 mm</text>
        </g>
      </svg>
      {readout && readout.wallId === wall.id && <DrawingReadout data={readout}
        x={left + wallCoordinates(wall, readout.centre).x * scale} y={top + (height - readout.elevation) * scale} />}
      {measure && <WallMeasureDialog wall={wall} number={number} focus={measure} close={() => setMeasure(null)} />}
    </div>
  </section>;
}
