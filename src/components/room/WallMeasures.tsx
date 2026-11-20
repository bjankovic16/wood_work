import { useId, useLayoutEffect, useRef, useState } from 'react';
import { ROOM_LIMITS } from '../../domain/roomGeometry';
import { snapRoomAngle } from '../../domain/roomCornerEdit';
import type { WallSegment } from '../../domain/walls';
import { roomSegments } from '../../domain/walls';
import { useIsCompact } from '../../hooks/useMediaQuery';
import { useT } from '../../i18n';
import { editRoomWall, setRoomSize } from '../../store/actions';
import { useDesignStore } from '../../store/designStore';
import { useUiStore } from '../../store/uiStore';
import { NumberField, SelectField } from '../properties/NumberField';
import { SheetHandle, type SheetSnap } from '../sheets/SheetHandle';
import { Button, PanelSection } from '../ui';

export function WallMeasureDialog({ wall, number, close, focus = 'length' }: { wall: WallSegment; number: number; close: () => void; focus?: 'length' | 'height' }) {
  const t = useT();
  const id = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const compact = useIsCompact();
  const [snap, setSnap] = useState<SheetSnap>('full');
  useLayoutEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return <dialog ref={ref} aria-labelledby={id} data-testid="drawing-measure" className="room-sheet open:flex open:flex-col"
    data-sheet-panel={compact ? 'modal' : undefined} data-snap={compact ? snap : undefined}
    onCancel={(event) => { event.preventDefault(); close(); }} onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
    <div className={compact ? 'flex shrink-0 items-center gap-2 border-b border-studio-line px-2 py-1' : 'px-5 pt-5'}>
      {compact && <SheetHandle snap={snap} onSnap={setSnap} onClose={close} controls={`${id}-fields`} />}
      <h2 id={id} className="text-lg font-semibold">{t.advancedRoom.wall(number)}</h2>
    </div>
    <div id={`${id}-fields`} className="min-h-0 space-y-3 overflow-y-auto overscroll-contain px-5 pb-5 pt-3">
      <WallMeasureFields wall={wall} focus={focus} />
      <Button variant="primary" className="mt-1 h-11 w-full" onClick={close}>{t.common.done}</Button>
    </div>
  </dialog>;
}

export function WallMeasureFields({ wall, focus, ceiling = !!focus }: { wall: WallSegment; focus?: 'length' | 'height'; ceiling?: boolean }) {
  const t = useT();
  const [failed, setFailed] = useState(false);
  const room = useDesignStore((s) => s.design.room);
  const snapAngles = useUiStore((s) => s.roomAngleSnapEnabled);
  const commit = (edit: () => void) => {
    try { edit(); setFailed(false); }
    catch (error) { if (!(error instanceof RangeError)) throw error; setFailed(true); return false; }
  };
  return <>
    <NumberField label={t.advancedRoom.length} value={Math.round(wall.length)} min={100} max={20000} autoFocus={focus === 'length'}
      onCommit={(length) => commit(() => editRoomWall(wall.id, length, wall.angle))} />
    {ceiling && <NumberField label={t.room.ceilingHeight} value={room.height} {...ROOM_LIMITS.height} autoFocus={focus === 'height'}
      onCommit={(height) => commit(() => setRoomSize({ height }))} />}
    <div className="room-angle-field">
      <NumberField label={t.advancedRoom.angle} value={Math.round(wall.angle * 10) / 10} min={0} max={360} suffix="°" precision={1}
        normalize={snapAngles ? snapRoomAngle : undefined} picks={[0, 90, 180, 270].map((value) => ({ value, disabled: false }))}
        onCommit={(angle) => commit(() => editRoomWall(wall.id, wall.length, angle))} />
      <label className="room-angle-snap">
        <input type="checkbox" checked={snapAngles} onChange={(e) => useUiStore.getState().setRoomAngleSnapEnabled(e.target.checked)} />
        {t.room.angleSnap}
      </label>
    </div>
    {failed && <p role="alert" className="text-xs text-red-700">{t.advancedRoom.invalid}</p>}
  </>;
}

export function WallMeasurements() {
  const t = useT();
  const room = useDesignStore((s) => s.design.room);
  const selectedId = useUiStore((s) => s.selectedWallId);
  const roomOpen = useUiStore((s) => s.roomOpen);
  const segments = roomSegments(room);
  const wall = segments.find((s) => s.id === selectedId) ?? segments[0];
  return <PanelSection title={t.advancedRoom.title}>
    <SelectField label={t.room.wall} value={wall.id} options={segments.map((s, i) => ({ value: s.id, label: t.advancedRoom.wall(i + 1) }))}
      onChange={(id) => useUiStore.getState().setSelectedWallId(id)} />
    {wall.partitionId ? <p className="text-xs">{t.advancedRoom.length}: {Math.round(wall.length)} mm · {t.room.height}: {wall.height} mm</p>
      : <WallMeasureFields key={wall.id} wall={wall} />}
    <Button variant="outline" onClick={() => {
      const ui = useUiStore.getState();
      if (!roomOpen) ui.setRoomOpen(true);
      ui.setSelectedWallId(wall.id);
      ui.setRoomElevationOpen(true);
    }}>{t.room.elevation}</Button>
  </PanelSection>;
}
