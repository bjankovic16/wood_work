import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { FRONT_FINISHES, WORKTOP_FINISHES } from '../../domain/style';
import { roomSegments } from '../../domain/walls';
import type { Partition, WallTreatment } from '../../domain/types';
import { useT } from '../../i18n';
import * as actions from '../../store/actions';
import { useDesignStore } from '../../store/designStore';
import { useUiStore } from '../../store/uiStore';
import { Button, PanelSection } from '../ui';
import { NumberField, SelectField } from './NumberField';

export function AdvancedRoomSettings() {
  const t = useT();
  const room = useDesignStore((s) => s.design.room);
  const selectedWallId = useUiStore((s) => s.selectedWallId);
  const [failed, setFailed] = useState(false);
  const frames = roomSegments(room);
  const outer = frames.filter((s) => !s.partitionId);
  const wall = outer.find((s) => s.id === selectedWallId) ?? outer[0];
  const [finishWall, setFinishWall] = useState('');
  const commit = (edit: () => void) => {
    try { edit(); setFailed(false); }
    catch (error) { if (!(error instanceof RangeError)) throw error; setFailed(true); }
  };
  const updatePartition = (partition: Partition, patch: Partial<Partition>) => commit(() => actions.setRoomSize({
    partitions: room.partitions?.map((p) => p.id === partition.id ? { ...p, ...patch } : p),
  }));
  const updateTreatment = (treatment: WallTreatment, patch: Partial<WallTreatment>) => commit(() => actions.setRoomSize({
    treatments: room.treatments?.map((entry) => entry.id === treatment.id ? { ...entry, ...patch } : entry),
  }));
  const wallOptions = frames.map((s, i) => ({ value: s.id, label: `${t.advancedRoom.wall(i + 1)}${s.partitionId ? ` - ${t.engine.roomPartition}` : ''}` }));
  const finishes: Array<WallTreatment['finish']> = [...Object.keys(FRONT_FINISHES) as Array<keyof typeof FRONT_FINISHES>, 'stone', 'marble', 'travertine', 'black'];
  return <PanelSection title={t.advancedRoom.title}>
    {failed && <p role="alert" className="rounded-lg bg-red-50 p-2 text-xs leading-relaxed text-red-800">{t.advancedRoom.invalid}</p>}
    <p className="text-xs font-semibold">{t.advancedRoom.wall(outer.indexOf(wall) + 1)}</p>
    <p className="text-xs leading-relaxed text-stone-500">{t.advancedRoom.closure}</p>
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => commit(() => actions.splitRoomWall(wall.id))}>{t.advancedRoom.split}</Button>
      <Button variant="outline" disabled={outer.length <= 3} onClick={() => commit(() => actions.removeRoomCorner(wall.id))}>{t.advancedRoom.remove}</Button>
    </div>
    <Button variant="outline" onClick={() => {
      useUiStore.getState().openRoomPlan();
      requestAnimationFrame(() => document.querySelector<SVGElement>('.room-corner-grip')?.focus({ preventScroll: true }));
    }}>{t.advancedRoom.edit}</Button>
    <details className="pt-3" open={room.partitions?.length ? true : undefined}>
      <summary className="cursor-pointer rounded text-xs font-medium text-stone-700">{t.advancedRoom.partitions}</summary>
      <div className="space-y-3 pt-3">
        {(room.partitions ?? []).map((p, index) => <div key={p.id} data-partition={p.id} className="space-y-2 rounded-xl border border-stone-200 p-3">
          <div className="flex items-center justify-between gap-2 text-xs font-semibold">{t.advancedRoom.partition(index + 1)}
            <Button aria-label={`${t.room.remove} ${t.advancedRoom.partition(index + 1)}`} onClick={() => commit(() => actions.setRoomSize({ partitions: room.partitions?.filter((v) => v.id !== p.id) }))}><Trash2 className="size-3.5" /></Button>
          </div>
          <NumberField label={t.advancedRoom.startX} value={p.start.x} min={0} max={room.width} onCommit={(x) => updatePartition(p, { start: { ...p.start, x } })} />
          <NumberField label={t.advancedRoom.startY} value={p.start.y} min={0} max={room.depth} onCommit={(y) => updatePartition(p, { start: { ...p.start, y } })} />
          <NumberField label={t.advancedRoom.endX} value={p.end.x} min={0} max={room.width} onCommit={(x) => updatePartition(p, { end: { ...p.end, x } })} />
          <NumberField label={t.advancedRoom.endY} value={p.end.y} min={0} max={room.depth} onCommit={(y) => updatePartition(p, { end: { ...p.end, y } })} />
          <NumberField label={t.advancedRoom.length} value={Math.round(Math.hypot(p.end.x - p.start.x, p.end.y - p.start.y))} min={100} max={20000} onCommit={(length) => {
            const angle = Math.atan2(p.end.y - p.start.y, p.end.x - p.start.x);
            updatePartition(p, { end: { x: Math.round(p.start.x + length * Math.cos(angle)), y: Math.round(p.start.y + length * Math.sin(angle)) } });
          }} />
          <NumberField label={t.advancedRoom.angle} value={(Math.atan2(p.end.y - p.start.y, p.end.x - p.start.x) * 180 / Math.PI + 360) % 360} min={0} max={360} suffix="deg" precision={1} onCommit={(angle) => {
            const length = Math.hypot(p.end.x - p.start.x, p.end.y - p.start.y);
            updatePartition(p, { end: { x: Math.round(p.start.x + length * Math.cos(angle * Math.PI / 180)), y: Math.round(p.start.y + length * Math.sin(angle * Math.PI / 180)) } });
          }} />
          <NumberField label={t.advancedRoom.thickness} value={p.thickness} min={50} max={600} onCommit={(thickness) => updatePartition(p, { thickness })} />
          <NumberField label={t.room.height} value={p.height} min={100} max={room.height} onCommit={(height) => updatePartition(p, { height })} />
        </div>)}
        <Button variant="outline" onClick={() => commit(actions.addPartition)}>{t.advancedRoom.addPartition}</Button>
      </div>
    </details>
    <details className="pt-3" open={room.treatments?.length ? true : undefined}>
      <summary className="cursor-pointer rounded text-xs font-medium text-stone-700">{t.advancedRoom.finishTitle}</summary>
      <div className="space-y-3 pt-3">
        {(room.treatments ?? []).map((entry, index) => {
          const frame = frames.find((s) => s.id === entry.wallId);
          return <div key={entry.id} data-treatment={entry.id} className="space-y-2 rounded-xl border border-stone-200 p-3">
            <div className="flex justify-between gap-2 text-xs font-semibold">{t.advancedRoom.finish} {index + 1}
              <Button aria-label={`${t.room.remove} ${t.advancedRoom.finish} ${index + 1}`} onClick={() => commit(() => actions.setRoomSize({ treatments: room.treatments?.filter((v) => v.id !== entry.id) }))}><Trash2 className="size-3.5" /></Button>
            </div>
            <SelectField label={t.room.wall} value={entry.wallId} options={wallOptions} onChange={(wallId) => updateTreatment(entry, { wallId })} />
            <SelectField label={t.advancedRoom.finish} value={entry.finish} options={finishes.map((finish) => ({ value: finish,
              label: Object.hasOwn(FRONT_FINISHES, finish) ? t.style.frontFinishes[finish as keyof typeof FRONT_FINISHES] : t.style.worktopFinishes[finish as keyof typeof WORKTOP_FINISHES] }))}
              onChange={(finish) => updateTreatment(entry, { finish })} />
            <NumberField label={t.advancedRoom.offset} value={entry.offset} min={0} max={Math.max(0, (frame?.length ?? 0) - entry.width)} onCommit={(offset) => updateTreatment(entry, { offset })} />
            <NumberField label={t.room.width} value={entry.width} min={100} max={(frame?.length ?? 100) - entry.offset} onCommit={(width) => updateTreatment(entry, { width })} />
            <NumberField label={t.item.heightFromFloor} value={entry.elevation} min={0} max={(frame?.height ?? room.height) - entry.height} onCommit={(elevation) => updateTreatment(entry, { elevation })} />
            <NumberField label={t.room.height} value={entry.height} min={100} max={(frame?.height ?? room.height) - entry.elevation} onCommit={(height) => updateTreatment(entry, { height })} />
          </div>;
        })}
        <SelectField label={t.room.wall} value={frames.some((s) => s.id === finishWall) ? finishWall : wall.id} options={wallOptions} onChange={setFinishWall} />
        <Button variant="outline" onClick={() => commit(() => actions.addWallTreatment(frames.some((s) => s.id === finishWall) ? finishWall : wall.id))}>{t.advancedRoom.addFinish}</Button>
        <p className="text-xs leading-relaxed text-stone-500">{t.advancedRoom.visual}</p>
      </div>
    </details>
  </PanelSection>;
}
