import { FilePlus2 } from 'lucide-react';
import { useId } from 'react';
import { useT } from '../../i18n';
import { storageWorks } from '../../lib/platform';
import { startFresh, useProjectsStore } from '../../store/projects';
import { Button } from '../ui';

export function StartFreshButton({ onCreated }: {
  onCreated?: () => void;
}) {
  const { projects: p } = useT();
  const failed = useProjectsStore((s) => s.writeFailed);
  const hint = storageWorks && !failed ? p.startFreshHint : p.startFreshSessionHint;
  const hintId = useId();
  const start = () => {
    startFresh();
    onCreated?.();
  };
  const icon = <FilePlus2 className="size-4 shrink-0" aria-hidden="true" />;

  return <>
    <Button variant="primary" className="px-3" aria-describedby={hintId} onClick={start}>{icon}{p.startFresh}</Button>
    <p id={hintId} className="order-last w-full text-xs text-studio-muted">{hint}</p>
  </>;
}
