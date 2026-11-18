import { useState } from 'react';
import { ROOM_LIMITS } from '../../domain/roomGeometry';
import type { WallSegment } from '../../domain/walls';
import { roomSegments } from '../../domain/walls';
import { useT } from '../../i18n';
import { editRoomWall, setRoomSize } from '../../store/actions';
import { useDesignStore } from '../../store/designStore';
import { useUiStore } from '../../store/uiStore';
import { NumberField, SelectField } from '../properties/NumberField';
import { Button, PanelSection } from '../ui';

export function WallMeasureFields({ wall, focus }: { wall: WallSegment; focus?: 'length' | 'height' }) {
  const t = useT();
  const [failed, setFailed] = useState(false);
  const room = useDesignStore((s) => s.design.room);
  const commit = (edit: () => void) => {
    try { edit(); setFailed(false); }
    catch (error) { if (!(error instanceof RangeError)) throw error; setFailed(true); return false; }
  };
  return <>
    <NumberField label={t.advancedRoom.length} value={Math.round(wall.length)} min={100} max={20000} autoFocus={focus === 'length'}
      onCommit={(length) => commit(() => editRoomWall(wall.id, length, wall.angle))} />
    <NumberField label={t.advancedRoom.angle} value={Math.round(wall.angle * 10) / 10} min={0} max={360} suffix="°" precision={1}
      onCommit={(angle) => commit(() => editRoomWall(wall.id, wall.length, angle))} />
    {focus && <NumberField label={t.room.ceilingHeight} value={room.height} {...ROOM_LIMITS.height} autoFocus={focus === 'height'}
      onCommit={(height) => commit(() => setRoomSize({ height }))} />}
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
