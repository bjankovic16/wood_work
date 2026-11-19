import { Paintbrush } from 'lucide-react';
import { useId } from 'react';
import { useT } from '../../i18n';
import { shuffleKitchen } from '../../store/actions';
import { useDesignStore } from '../../store/designStore';
import { useUiStore } from '../../store/uiStore';
import { Button } from '../ui';

/** Separate from shuffling the gallery cards: this action changes the open kitchen. */
export function TryAnotherStyle() {
  const t = useT();
  const id = useId();
  const preview = useUiStore((s) => !!s.previewLockedIds.length);
  const tool = useUiStore((s) => !!s.cabinetTool);
  const gesture = useDesignStore((s) => !!s.gestureBase);
  const reason = preview ? t.shuffle.preview : tool || gesture ? t.shuffle.busy : null;
  return <aside className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-[#edf1e8] p-2 text-left">
    <Button variant="outline" aria-describedby={id} disabled={!!reason} className="min-h-11" onClick={shuffleKitchen}>
      <Paintbrush aria-hidden="true" size={16} />{t.shuffle.title}
    </Button>
    <p id={id} className="min-w-[7rem] flex-1 text-xs leading-snug text-studio-muted">{reason ?? t.shuffle.hint}</p>
  </aside>;
}
