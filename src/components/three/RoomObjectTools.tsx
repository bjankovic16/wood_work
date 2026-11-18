import { Pencil, X } from 'lucide-react';
import { useFrame } from '@react-three/fiber';
import { useMemo, type RefObject } from 'react';
import { Vector3 } from 'three';
import type { RoomObjectSelection } from '../../domain/roomObjectPlacement';
import { useT } from '../../i18n';
import { useIssues } from '../../store/derived';
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

export function RoomObjectTools({ selection, onClose }: { selection: RoomObjectSelection; onClose: () => void }) {
  const t = useT();
  const data = useRoomReadout();
  const issues = useIssues().filter((issue) => selection.type === 'feature'
    ? issue.roomFeatureId === selection.id || issue.key.startsWith(`structure-${selection.id}-`)
    : issue.key === `opening-${selection.id}` || issue.key.startsWith(`door-${selection.id}-`) || issue.key.startsWith(`window-${selection.id}-`));
  if (!data) return null;
  return <div className="max-w-full space-y-1">
    <div role="group" aria-label={t.view3d.roomObjectActions} className="flex flex-wrap items-center gap-1">
      <strong className="px-2 text-xs">{data.name}</strong>
      <Button variant="outline" data-testid="room-edit-position-2d" onClick={editRoomPositionIn2D}><Pencil className="size-4" />{t.room.editIn2D}</Button>
      <Button aria-label={t.view3d.deselectRoomObject} onClick={onClose}><X className="size-4" /></Button>
    </div>
    {issues.length > 0 && <details className="max-w-sm rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <summary className="cursor-pointer font-medium">{t.view3d.roomObjectChecks}</summary>
      <ul className="mt-1 list-disc space-y-1 pl-4">{issues.map((issue) => <li key={issue.key}>{issue.message}</li>)}</ul>
    </details>}
  </div>;
}
