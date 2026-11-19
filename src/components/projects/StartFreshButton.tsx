import { FilePlus2 } from 'lucide-react';
import { useId } from 'react';
import { useT } from '../../i18n';
import { storageWorks } from '../../lib/platform';
import { startFresh, useProjectsStore } from '../../store/projects';
import { Button, TooltipButton } from '../ui';

export function StartFreshButton({ placement, onCreated }: {
  placement: 'toolbar' | 'menu' | 'dialog';
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

  if (placement === 'toolbar') return (
    <TooltipButton variant="outline" className="whitespace-nowrap" tooltip={hint} onClick={start}>
      {icon}{p.startFresh}
    </TooltipButton>
  );
  if (placement === 'menu') return (
    <Button data-close-menu className="h-auto w-full justify-start py-2 text-left" aria-label={p.startFresh} aria-describedby={hintId} onClick={start}>
      {icon}<span>{p.startFresh}<span id={hintId} className="block text-xs font-normal text-studio-muted">{hint}</span></span>
    </Button>
  );
  return <>
    <Button variant="primary" className="px-3" aria-describedby={hintId} onClick={start}>{icon}{p.startFresh}</Button>
    <p id={hintId} className="order-last w-full text-xs text-studio-muted">{hint}</p>
  </>;
}
