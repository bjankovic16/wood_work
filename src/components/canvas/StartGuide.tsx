import { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import { useUiStore } from '../../store/uiStore';
import { Button, Dialog } from '../ui';

export function StartGuide({ compact, isEmpty }: { compact: boolean; isEmpty: boolean }) {
  const t = useT();
  const [welcome, setWelcome] = useState(() => isEmpty && !useUiStore.getState().welcomeSeen);
  const dragging = useUiStore((s) => !!s.libraryDrag);
  useEffect(() => { if (welcome) useUiStore.getState().rememberWelcome(); }, [welcome]);
  if (!isEmpty || dragging) return null;
  const hint = compact ? t.canvas.emptyTouch : t.canvas.emptyDesktop;
  return <>
    <p data-testid="empty-plan-hint" className="pointer-events-none absolute inset-x-3 bottom-24 mx-auto w-fit max-w-sm rounded-lg bg-studio-paper/95 px-3 py-2 text-center text-xs text-studio-muted lg:bottom-4">{hint}</p>
    <Dialog open={welcome} title={t.canvas.startTitle} sheet={compact} onClose={() => setWelcome(false)}>
      <div className="space-y-4 p-4 text-sm">
        <p>{hint}</p>
        <Button variant="primary" onClick={() => setWelcome(false)}>{t.canvas.dismissStart}</Button>
        <Button variant="outline" onClick={() => useUiStore.getState().setRoomOpen(true)}>{t.canvas.startWithRoom}</Button>
      </div>
    </Dialog>
  </>;
}
