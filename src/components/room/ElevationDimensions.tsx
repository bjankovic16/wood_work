import type { RoomObjectSelection } from '../../domain/roomObjectPlacement';
import type { Opening, Room } from '../../domain/types';
import { openingOnWall, type WallSegment } from '../../domain/walls';
import { useT } from '../../i18n';
import { measureText } from '../../lib/measureText';
import { drawingButton } from './RoomPlan';
import { DimensionLines } from './DimensionLines';

const CHAIN_GAP = 19; // screen pixels from the wall to the dimension chain

/** Dimension geometry is in millimetres. Strokes, lettering and witness gaps stay in screen pixels. */
function Dimension({ kind, label, x, y, length, px, vertical, witnesses, overflowSide, edit }: {
  kind: string; label: string; x: number; y: number; length: number; px: number; vertical?: boolean;
  witnesses: [number, number]; overflowSide?: -1 | 1; edit?: () => void;
}) {
  if (length <= 0) return null;
  const half = length / (2 * px);
  const mm = `${Math.round(length)} mm`, text = overflowSide ? String(Math.round(length)) : mm;
  const font = 12, width = measureText(text, font, 550);
  // A short dimension still needs a value: put it beyond the chain, not over the next number.
  const outside = overflowSide && half * 2 < width + 6 ? overflowSide : 0;
  const textX = outside * (half + 4 + width / 2);
  const props = edit ? drawingButton(`${label}: ${mm}`, edit) : { role: 'img', 'aria-label': `${label}: ${mm}` };
  return <g data-elevation-dimension={kind} pointerEvents="none" transform={`translate(${x} ${y}) rotate(${vertical ? -90 : 0}) scale(${px})`}
    color={overflowSide ? '#275b75' : '#394e44'}>
    <DimensionLines half={half} witnesses={witnesses} left={outside < 0 ? width + 6 : 3} right={outside > 0 ? width + 6 : 3} />
    <g {...props} className={edit ? 'room-ruler-button' : undefined} pointerEvents={edit ? 'auto' : 'none'}>
      {edit && <rect x={-Math.max(44, width + 8) / 2} y="-23" width={Math.max(44, width + 8)} height="44" fill="transparent" />}
      <text x={textX} y="-4" textAnchor="middle" fontSize={font} fontWeight="550" fill="currentColor">{text}</text>
    </g>
  </g>;
}

function selectedExtent(room: Room, openings: Opening[], wall: WallSegment, selection: RoomObjectSelection | null) {
  if (selection?.type === 'opening') {
    const o = openings.find((entry) => entry.id === selection.id);
    const at = o && openingOnWall(room, o);
    if (o && at?.segment.id === wall.id) return { offset: at.offset, width: o.width, opening: o };
  } else if (selection?.type === 'feature') {
    const f = room.features?.find((entry) => entry.id === selection.id && entry.wallId === wall.id);
    if (f) return { offset: f.offset ?? 0, width: f.width, opening: null };
  }
  return null;
}

export function ElevationDimensions({ room, openings, wall, selection, px, edit }: {
  room: Room; openings: Opening[]; wall: WallSegment; selection: RoomObjectSelection | null; px: number;
  edit: (ruler: 'length' | 'height') => void;
}) {
  const t = useT();
  const floor = room.height, w = wall.length;
  const obj = selectedExtent(room, openings, wall, selection);
  const sill = obj?.opening?.sill ?? 0, bottomWitness = -CHAIN_GAP - sill / px;
  const jambWitness = obj ? (obj.offset + obj.width - w) / px - CHAIN_GAP : 0;
  return <>
    <Dimension kind="wall-length" x={w / 2} y={floor - wall.height - 16 * px} length={w} px={px} witnesses={[16, 16]}
      label={t.advancedRoom.length} edit={wall.partitionId ? undefined : () => edit('length')} />
    <Dimension kind="wall-height" x={-CHAIN_GAP * px} y={floor - wall.height / 2} vertical length={wall.height} px={px} witnesses={[CHAIN_GAP, CHAIN_GAP]}
      label={wall.partitionId ? t.room.height : t.room.ceilingHeight} edit={wall.partitionId ? undefined : () => edit('height')} />
    {obj && <>
      <Dimension kind="offset" x={obj.offset / 2} y={floor + CHAIN_GAP * px} length={obj.offset} px={px}
        witnesses={[-CHAIN_GAP, bottomWitness]} overflowSide={-1} label={t.advancedRoom.offset} />
      <Dimension kind="width" x={obj.offset + obj.width / 2} y={floor + CHAIN_GAP * px} length={obj.width} px={px}
        witnesses={[bottomWitness, bottomWitness]} overflowSide={1} label={obj.opening ? t.room.width : t.roomStructure.alongLength} />
      {obj.opening && <>
        <Dimension kind="sill" x={w + CHAIN_GAP * px} y={floor - sill / 2} vertical length={sill} px={px}
          witnesses={[-CHAIN_GAP, jambWitness]} overflowSide={-1} label={t.room.sill} />
        <Dimension kind="height" x={w + CHAIN_GAP * px} y={floor - sill - obj.opening.height / 2} vertical length={obj.opening.height} px={px}
          witnesses={[jambWitness, jambWitness]} overflowSide={1} label={t.room.height} />
      </>}
    </>}
  </>;
}
