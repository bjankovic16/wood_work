import { Undo2 } from 'lucide-react';
import { useT } from '../../i18n';
import { undo } from '../../store/actions';
import { useDesignStore } from '../../store/designStore';
import { TooltipButton } from '../ui';

export function UndoButton() {
  const t = useT();
  const enabled = useDesignStore((s) => !s.gestureBase && s.past.length > 0);
  return (
    <TooltipButton variant="outline" className="shrink-0 whitespace-nowrap" tooltip={t.topBar.undoTitle} disabled={!enabled} onClick={undo}>
      <Undo2 className="size-4 max-[350px]:hidden" aria-hidden="true" />{t.topBar.undo}
    </TooltipButton>
  );
}
