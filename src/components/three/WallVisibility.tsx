import type { Room } from '../../domain/types';
import { roomSegments } from '../../domain/walls';
import { useT } from '../../i18n';
import { Button } from '../ui';

export function WallVisibility({ room, hidden, onChange }: { room: Room; hidden: string[]; onChange: (ids: string[]) => void }) {
  const t = useT();
  const segments = roomSegments(room);
  const walls = segments.filter((s) => !s.partitionId).map((s, i) => ({
    ids: [s.id], name: t.advancedRoom.wall(i + 1), length: s.length,
    side: s.id === 'top' || s.id === 'right' || s.id === 'bottom' || s.id === 'left' ? t.walls[s.id] : '',
  }));
  for (const [i, partition] of (room.partitions ?? []).entries()) {
    const faces = segments.filter((s) => s.partitionId === partition.id);
    walls.push({ ids: faces.map((s) => s.id), name: t.advancedRoom.partition(i + 1), length: faces[0].length, side: '' });
  }
  return <details className="w-full max-w-md rounded-lg border border-studio-line bg-studio-paper px-3">
    <summary className="cursor-pointer py-3 text-sm font-semibold">{t.view3d.walls}</summary>
    <p className="pb-2 text-sm text-studio-muted">{t.view3d.wallVisibilityHint}</p>
    <div className="grid gap-x-3 min-[380px]:grid-cols-2">
      {walls.map(({ ids, name, length, side }) => <label key={ids[0]} className="flex min-h-11 cursor-pointer items-center gap-2 py-1 text-sm">
        <input type="checkbox" className="size-4 shrink-0 accent-studio-accent" checked={!hidden.includes(ids[0])}
          onChange={(event) => onChange(event.target.checked ? hidden.filter((id) => !ids.includes(id)) : [...hidden, ...ids])} />
        <span>{name}<small className="block text-xs text-studio-muted">{side && `${side} · `}{t.mm(Math.round(length))} mm</small></span>
      </label>)}
    </div>
    <Button className="my-2" variant="outline" disabled={!walls.some(({ ids }) => hidden.includes(ids[0]))} onClick={() => onChange([])}>
      {t.view3d.restoreWalls}
    </Button>
  </details>;
}
