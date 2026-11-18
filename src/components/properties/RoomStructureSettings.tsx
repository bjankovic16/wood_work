import { ROOM_CORNERS } from '../../domain/roomGeometry';
import { roomSegments } from '../../domain/walls';
import { ROOM_EXAMPLES } from '../../domain/roomExamples';
import type { RoomCorner, RoomCutout, RoomFeature } from '../../domain/types';
import { useT } from '../../i18n';
import * as actions from '../../store/actions';
import { useDesignStore } from '../../store/designStore';
import { Button, PanelSection } from '../ui';
import { NumberField, SelectField } from './NumberField';
import { useState } from 'react';

export function RoomFeatureFields({ feature }: { feature: RoomFeature }) {
  const t = useT();
  const room = useDesignStore((state) => state.design.room);
  const [failed, setFailed] = useState(false);
  const walls = roomSegments(room);
  const wall = walls.find((s) => s.id === feature.wallId);
  const edit = (operation: () => void) => {
    try { operation(); setFailed(false); }
    catch (error) { if (!(error instanceof RangeError)) throw error; setFailed(true); return false; }
  };
  const update = (patch: Partial<RoomFeature>) => edit(() => actions.updateRoomFeature(feature.id, patch));
  return <>
    <SelectField label={t.roomStructure.alongWall} value={wall?.id ?? ''} options={[{ value: '', label: t.roomStructure.free }, ...walls.map((s, i) => ({ value: s.id, label: t.advancedRoom.wall(i + 1) }))]}
      onChange={(wallId) => edit(() => actions.setRoomFeatureWall(feature.id, wallId || null))} />
    <NumberField label={wall ? t.roomStructure.alongLength : t.roomStructure.width} value={feature.width} min={100} max={wall ? Math.floor(wall.length - (feature.offset ?? 0)) : room.width} onCommit={(width) => update({ width })} />
    <NumberField label={wall ? t.roomStructure.projection : t.roomStructure.depth} value={feature.depth} min={100} max={wall ? Math.max(room.width, room.depth) : room.depth} onCommit={(depth) => update({ depth })} />
    {wall ? <NumberField label={t.advancedRoom.offset} value={feature.offset ?? 0} min={0} max={Math.floor(wall.length - feature.width)} onCommit={(offset) => update({ offset })} />
      : <>
        <NumberField label={t.item.fromLeftWall} value={feature.x} min={0} max={room.width - feature.width} onCommit={(x) => update({ x })} />
        <NumberField label={t.item.fromTopWall} value={feature.y} min={0} max={room.depth - feature.depth} onCommit={(y) => update({ y })} />
      </>}
    {failed && <p role="alert" className="text-xs text-red-700">{t.room.noSpace}</p>}
  </>;
}

export function RoomStructureSettings() {
  const t = useT();
  const room = useDesignStore((state) => state.design.room);
  const cut = room.cutout;
  const [failed, setFailed] = useState(false);
  const commit = (edit: () => void) => {
    try { edit(); setFailed(false); }
    catch (error) { if (!(error instanceof RangeError)) throw error; setFailed(true); }
  };
  const changeCut = (patch: Partial<RoomCutout>) => {
    if (cut) commit(() => actions.setRoomCutout({ ...cut, ...patch }));
  };
  return (
    <PanelSection title={t.roomStructure.title}>
      <SelectField
        label={t.roomStructure.shape}
        value={room.vertices ? 'polygon' : cut?.kind ?? 'rectangle'}
        options={[
          ...(room.vertices ? [{ value: 'polygon' as const, label: t.advancedRoom.polygon }] : []),
          { value: 'rectangle', label: t.roomStructure.rectangle },
          { value: 'notch', label: t.roomStructure.notch },
          { value: 'diagonal', label: t.roomStructure.diagonal },
        ]}
        onChange={(kind) => { if (kind !== 'polygon') commit(() => actions.setRoomCutout(kind === 'rectangle' ? undefined : {
          kind, corner: cut?.corner ?? 'bottomRight',
          width: cut?.width ?? Math.round(room.width * 0.3), depth: cut?.depth ?? Math.round(room.depth * 0.3),
        })); }}
      />
      {failed && <p role="alert" className="text-xs text-red-700">{t.advancedRoom.invalid}</p>}
      {cut && (
        <>
          <SelectField label={t.roomStructure.corner} value={cut.corner} options={ROOM_CORNERS.map((corner) => ({ value: corner, label: t.roomStructure.corners[corner] }))} onChange={(corner: RoomCorner) => changeCut({ corner })} />
          <NumberField label={t.roomStructure.cutWidth} value={cut.width} min={100} max={room.width - 600} onCommit={(width) => changeCut({ width })} />
          <NumberField label={t.roomStructure.cutDepth} value={cut.depth} min={100} max={room.depth - 600} onCommit={(depth) => changeCut({ depth })} />
          {cut.kind === 'diagonal' && <p className="text-xs leading-relaxed text-zinc-600">{t.roomStructure.diagonalNote}</p>}
        </>
      )}
      <details className="pt-2">
        <summary className="cursor-pointer rounded py-1 text-xs font-medium text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">{t.roomStructure.examplesTitle}</summary>
        <p className="py-2 text-xs leading-relaxed text-zinc-600">{t.roomStructure.examplesNote}</p>
        <div className="flex flex-col gap-2">
          {ROOM_EXAMPLES.map((id) => <Button key={id} variant="outline" className="h-auto min-h-9 justify-start whitespace-normal py-2 text-left" onClick={() => actions.openRoomExample(id)}>{t.roomStructure.examples[id]}</Button>)}
        </div>
      </details>
    </PanelSection>
  );
}
