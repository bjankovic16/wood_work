import { Pencil, Scaling, X } from 'lucide-react';
import { useFrame } from '@react-three/fiber';
import { useId, useMemo, useState, type RefObject } from 'react';
import { Vector3 } from 'three';
import type { RoomObjectSelection } from '../../domain/roomObjectPlacement';
import { openingOnWall } from '../../domain/walls';
import { useT } from '../../i18n';
import { useIssues } from '../../store/derived';
import { useDesignStore } from '../../store/designStore';
import { setOpeningSize } from '../../store/actions';
import { FeatureSizeFields } from '../properties/RoomStructureSettings';
import { NumberField } from '../properties/NumberField';
import { editRoomPositionIn2D, RoomReadout, useRoomReadout } from '../room/RoomReadout';
import { Button } from '../ui';
import { overlayTopInset } from './overlayInset';

export function RoomObjectAnchor({ overlay }: { overlay: RefObject<HTMLDivElement | null> }) {
  const data = useRoomReadout();
  const point = useMemo(() => new Vector3(), []);
  useFrame(({ camera, size, gl }) => {
    const el = overlay.current;
    if (!el || !data) return;
    point.set(data.centre.x / 1000, data.elevation / 1000, data.centre.y / 1000).project(camera);
    const x = Math.max(4, Math.min(size.width - el.offsetWidth - 4, (1 + point.x) * size.width / 2 + 8));
    const maxY = size.height - el.offsetHeight - 4;
    const minY = Math.min(maxY, overlayTopInset(el, gl.domElement.getBoundingClientRect().top) + 4);
    const y = Math.max(minY, Math.min(maxY, (1 - point.y) * size.height / 2 + 8));
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    el.style.visibility = Math.abs(point.z) <= 1 ? 'visible' : 'hidden';
  });
  return null;
}

export function RoomObjectAnnotation({ overlay }: { overlay: RefObject<HTMLDivElement | null> }) {
  const data = useRoomReadout();
  return data && <div ref={overlay} className="pointer-events-none absolute left-0 top-0" style={{ visibility: 'hidden' }}>
    <RoomReadout data={data} testId="room-readout-3d" />
  </div>;
}

function ObjectSizeFields({ selection }: { selection: RoomObjectSelection }) {
  const t = useT();
  const { room, openings } = useDesignStore((s) => s.design);
  if (selection.type === 'feature') {
    const f = room.features?.find((f) => f.id === selection.id);
    return f && <FeatureSizeFields feature={f} />;
  }
  const o = openings.find((o) => o.id === selection.id), face = o && openingOnWall(room, o)?.segment;
  return o && face ? <>
    <NumberField label={t.room.width} value={o.width} min={100} max={Math.floor(face.length)} onCommit={(v) => setOpeningSize(o.id, 'width', v)} />
    <NumberField label={t.room.height} value={o.height} min={100} max={face.height - o.sill} onCommit={(v) => setOpeningSize(o.id, 'height', v)} />
  </> : <p role="alert">{t.room.noSpace}</p>;
}

export function RoomObjectTools({ selection, sizing = false, onClose, onEditPosition = editRoomPositionIn2D }: {
  selection: RoomObjectSelection; sizing?: boolean; onClose: () => void; onEditPosition?: () => void;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const sizeId = useId();
  const data = useRoomReadout();
  const issues = useIssues().filter((issue) => selection.type === 'feature'
    ? issue.roomFeatureId === selection.id || issue.key.startsWith(`structure-${selection.id}-`)
    : issue.key === `opening-${selection.id}` || issue.key.startsWith(`door-${selection.id}-`) || issue.key.startsWith(`window-${selection.id}-`));
  if (!data) return null;
  return <div className="max-w-full space-y-1">
    <div role="group" aria-label={t.view3d.roomObjectActions} className="flex flex-wrap items-center gap-1">
      <strong className="px-2 text-xs">{data.name}</strong>
      {sizing && <Button variant="outline" aria-expanded={expanded} aria-controls={sizeId} onClick={() => setExpanded(!expanded)}>
        <Scaling size={16} />{t.room.resizeObject}</Button>}
      <Button variant="outline" data-testid="room-edit-position-2d" onClick={onEditPosition}><Pencil className="size-4" />{t.room.editIn2D}</Button>
      <Button aria-label={t.view3d.deselectRoomObject} onClick={onClose}><X className="size-4" /></Button>
    </div>
    {sizing && expanded && <div id={sizeId} role="group" aria-label={t.room.resizeObject} className="room-size-grid max-w-sm !grid-cols-2 p-1">
      <ObjectSizeFields selection={selection} /></div>}
    {issues.length > 0 && <details className="max-w-sm rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <summary className="cursor-pointer font-medium">{t.view3d.roomObjectChecks}</summary>
      <ul className="mt-1 list-disc space-y-1 pl-4">{issues.map((issue) => <li key={issue.key}>{issue.message}</li>)}</ul>
    </details>}
  </div>;
}
