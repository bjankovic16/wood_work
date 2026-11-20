import { useState } from 'react';
import { featureDragPlacement, openingDragPlacement } from '../../domain/roomObjectPlacement';
import { openingOnWall, openingsOnSegment, wallPoint, type WallSegment } from '../../domain/walls';
import { useT } from '../../i18n';
import { updateOpening, updateRoomFeature } from '../../store/actions';
import { useDesignStore } from '../../store/designStore';
import { useUiStore } from '../../store/uiStore';
import { ElevationBackdrop, OpeningFace } from './ElevationDrawing';
import { ElevationDimensions } from './ElevationDimensions';
import { WallMeasureDialog } from './WallMeasures';
import { drawingButton } from './RoomPlan';
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
  const size = useDrawingSize();
  const [measure, setMeasure] = useState<'length' | 'height' | null>(null);
  const height = room.height;
  const scale = Math.min(Math.max(1, size.width - 88) / wall.length, Math.max(1, size.height - 76) / height);
  const px = 1 / scale, left = (size.width - wall.length * scale) / 2, top = (size.height - height * scale) / 2;
  return <section data-testid="wall-elevation" aria-label={`${t.room.elevation}: ${t.advancedRoom.wall(number)}`} className="room-elevation-paper flex min-h-0 min-w-0 flex-1 flex-col">
    <header className="room-elevation-heading">
      <h2>{t.advancedRoom.wall(number)}</h2><span>{t.room.facingWall}</span>
      <p>{t.number(Math.round(wall.length))} × {t.number(wall.height)} mm</p>
    </header>
    <div ref={size.ref} className="relative min-h-0 flex-1">
      <svg className="absolute inset-0 h-full w-full touch-pan-y" aria-label={t.room.elevation} viewBox={`${-left * px} ${-top * px} ${size.width * px} ${size.height * px}`}>
        <ElevationBackdrop wall={wall} height={height} px={px} reference={reference} />
        <ElevationDimensions room={room} openings={openings} wall={wall} selection={selection} px={px} edit={setMeasure} />
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
          <title>{t.room.originHint}</title>
          <circle r="4" fill="#287250" stroke="white" strokeWidth="1.5" />
          <text x="-7" y="3" textAnchor="end" fontSize="12" fill="#3c634f">0</text>
        </g>
      </svg>
      {measure && <WallMeasureDialog wall={wall} number={number} focus={measure} close={() => setMeasure(null)} />}
    </div>
  </section>;
}
