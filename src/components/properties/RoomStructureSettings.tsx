import { Plus, Trash2 } from 'lucide-react';
import { MAX_ROOM_FEATURES, ROOM_CORNERS } from '../../domain/roomGeometry';
import { ROOM_EXAMPLES } from '../../domain/roomExamples';
import type { RoomCorner, RoomCutout, RoomFeatureKind } from '../../domain/types';
import { useT } from '../../i18n';
import * as actions from '../../store/actions';
import { useDesignStore } from '../../store/designStore';
import { Button, PanelSection } from '../ui';
import { NumberField, SelectField } from './NumberField';
import { useState } from 'react';

const FEATURE_KINDS: readonly RoomFeatureKind[] = ['chimney', 'column', 'projection'];

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
      <details className="pt-2" open={room.features?.length ? true : undefined}>
        <summary className="cursor-pointer rounded py-1 text-xs font-medium text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">{t.roomStructure.structures}</summary>
        <div className="space-y-3 pt-2">
          <p className="text-xs leading-relaxed text-zinc-600">{t.roomStructure.fullHeight}</p>
          {(room.features ?? []).map((feature, index) => {
            const name = `${t.engine.roomFeatures[feature.kind]} ${index + 1}`;
            return (
              <div key={feature.id} className="space-y-2 rounded-lg border border-zinc-200 p-3" data-room-feature={feature.id}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-zinc-800">{name}</span>
                  <Button aria-label={t.roomStructure.remove(name)} onClick={() => actions.removeRoomFeature(feature.id)}><Trash2 className="size-3.5" /></Button>
                </div>
                <NumberField label={t.roomStructure.width} value={feature.width} min={100} max={room.width} onCommit={(width) => actions.updateRoomFeature(feature.id, { width })} />
                <NumberField label={t.roomStructure.depth} value={feature.depth} min={100} max={room.depth} onCommit={(depth) => actions.updateRoomFeature(feature.id, { depth })} />
                <NumberField label={t.item.fromLeftWall} value={feature.x} min={0} max={room.width - feature.width} onCommit={(x) => actions.updateRoomFeature(feature.id, { x })} />
                <NumberField label={t.item.fromTopWall} value={feature.y} min={0} max={room.depth - feature.depth} onCommit={(y) => actions.updateRoomFeature(feature.id, { y })} />
              </div>
            );
          })}
          <div className="flex flex-wrap gap-2">
            {FEATURE_KINDS.map((kind) => <Button key={kind} variant="outline" disabled={(room.features?.length ?? 0) >= MAX_ROOM_FEATURES} onClick={() => actions.addRoomFeature(kind)}><Plus className="size-3.5" />{t.engine.roomFeatures[kind]}</Button>)}
          </div>
          {(room.features?.length ?? 0) >= MAX_ROOM_FEATURES && <p role="status" className="text-xs text-zinc-600">{t.roomStructure.limit}</p>}
        </div>
      </details>
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
