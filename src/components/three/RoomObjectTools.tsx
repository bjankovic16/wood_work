import { Move, Pencil, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import type { RoomObjectSelection } from '../../domain/roomObjectPlacement';
import { useT } from '../../i18n';
import { removeOpening, removeRoomFeature } from '../../store/actions';
import { useDesignStore } from '../../store/designStore';
import { useIssues } from '../../store/derived';
import { OpeningCard } from '../properties/RoomPanel';
import { RoomFeatureFields } from '../properties/RoomStructureSettings';
import { Button, Dialog } from '../ui';

export function RoomObjectTools({ selection, compact, moving, blocked, onMove, onClose }: {
  selection: RoomObjectSelection; compact: boolean; moving: boolean; blocked: boolean; onMove: () => void; onClose: () => void;
}) {
  const t = useT();
  const design = useDesignStore((state) => state.design);
  const issues = useIssues().filter((issue) => selection.type === 'feature'
    ? issue.roomFeatureId === selection.id || issue.key.startsWith(`structure-${selection.id}-`)
    : issue.key === `opening-${selection.id}` || issue.key.startsWith(`door-${selection.id}-`) || issue.key.startsWith(`window-${selection.id}-`));
  const [editing, setEditing] = useState(false);
  const opening = selection.type === 'opening' ? design.openings.find((opening) => opening.id === selection.id) : undefined;
  const feature = selection.type === 'feature' ? design.room.features?.find((feature) => feature.id === selection.id) : undefined;
  if (!opening && !feature) return null;
  const number = opening ? design.openings.filter((entry) => entry.kind === opening.kind).findIndex((entry) => entry.id === opening.id) + 1
    : (design.room.features?.findIndex((entry) => entry.id === selection.id) ?? 0) + 1;
  const name = `${opening ? t.room.opening(opening.kind) : t.engine.roomFeatures[feature!.kind]} ${number}`;
  return <div className="pointer-events-auto max-w-full space-y-1">
    <div role="group" aria-label={t.view3d.roomObjectActions} className="flex max-w-full flex-wrap items-center gap-1 rounded-lg border border-zinc-200 bg-white p-1 shadow-sm">
      <span className="px-2 text-xs font-semibold text-zinc-800">{name}</span>
      <Button active={moving} aria-label={t.view3d.moveRoomObject} title={t.view3d.moveRoomObject} onClick={onMove}><Move className="size-4" /></Button>
      <Button aria-label={t.view3d.editRoomObject} title={t.view3d.editRoomObject} onClick={() => setEditing(true)}><Pencil className="size-4" /></Button>
      <Button aria-label={t.view3d.deleteRoomObject} title={t.view3d.deleteRoomObject} onClick={() => {
        if (opening) removeOpening(opening.id);
        else if (feature) removeRoomFeature(feature.id);
        onClose();
      }}><Trash2 className="size-4" /></Button>
      <Button aria-label={t.view3d.deselectRoomObject} title={t.view3d.deselectRoomObject} onClick={onClose}><X className="size-4" /></Button>
    </div>
    {blocked && <p role="status" className="max-w-sm rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">{t.view3d.blockedRoomMove}</p>}
    {issues.length > 0 && <details className="max-w-sm rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <summary className="cursor-pointer font-medium">{t.view3d.roomObjectChecks}</summary>
      <ul className="mt-1 list-disc space-y-1 pl-4">{issues.map((issue) => <li key={issue.key}>{issue.message}</li>)}</ul>
    </details>}
    <Dialog open={editing} title={name} sheet={compact} onClose={() => setEditing(false)} footer={<Button variant="primary" onClick={() => setEditing(false)}>{t.common.done}</Button>}>
      <div className="space-y-2 p-4">
        {opening && <OpeningCard opening={opening} number={number} />}
        {feature && <RoomFeatureFields feature={feature} />}
        {feature?.kind === 'chimney' && <p className="text-xs leading-relaxed text-zinc-600">{t.roomStructure.fullHeight}</p>}
      </div>
    </Dialog>
  </div>;
}
