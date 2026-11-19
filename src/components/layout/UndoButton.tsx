import { Undo2 } from 'lucide-react';
import { useT } from '../../i18n';
import { shortcutKeys } from '../../lib/shortcutKeys';
import { undo } from '../../store/actions';
import { useDesignStore } from '../../store/designStore';
import { useFeedback } from '../../store/feedback';
import { TooltipButton } from '../ui';

export function UndoButton({ iconOnly = false }: { iconOnly?: boolean }) {
  const t = useT();
  const fresh = useFeedback((s) => s.notice?.action?.kind === 'fresh');
  const enabled = useDesignStore((s) => !s.gestureBase && (fresh || s.past.length > 0));
  return (
    <TooltipButton variant="outline" className={iconOnly ? 'size-11 shrink-0 p-0' : 'shrink-0 whitespace-nowrap'}
      aria-label={t.topBar.undo} tooltip={`${t.topBar.undo} (${shortcutKeys().undo.join('+')})`} disabled={!enabled} onClick={undo}>
      <Undo2 className="size-4" aria-hidden="true" />{!iconOnly && t.topBar.undo}
    </TooltipButton>
  );
}
