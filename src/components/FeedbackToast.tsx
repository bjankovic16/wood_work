import { Undo2 } from 'lucide-react';
import { useLayoutEffect } from 'react';
import { useT } from '../i18n';
import { useDesignStore } from '../store/designStore';
import { offerUndo, undoFeedback, useFeedback } from '../store/feedback';
import { useUiStore } from '../store/uiStore';

export function FeedbackToast() {
  const t = useT();
  const notice = useFeedback((s) => s.notice);
  const editing = useDesignStore((s) => !!s.gestureBase);
  // Fit review also reports the number of adjustments, including a style tried in an empty room.
  const fit = useUiStore((s) => s.fitNotice);
  useLayoutEffect(() => {
    if (!fit) return;
    if (useDesignStore.getState().design === fit.design) offerUndo('fit', (t) => t.fit.applied(fit.changes));
    useUiStore.setState({ fitNotice: null });
  }, [fit]);
  return <div className="pointer-events-none fixed inset-x-3 bottom-[calc(var(--mobile-nav-height,5rem)+env(safe-area-inset-bottom)+0.75rem)] z-40 flex justify-center lg:bottom-5 print:hidden">
    <div data-testid={notice ? 'feedback-toast' : undefined}>
      <div data-testid={notice?.action?.kind === 'fit' ? 'fit-notice' : undefined}
        className={notice ? 'pointer-events-auto flex w-fit max-w-md items-center gap-3 rounded-xl bg-studio-ink px-4 py-1.5 text-sm text-white shadow-xl' : undefined}>
        <span role="status" aria-atomic="true">{notice?.message(t)}{notice?.action && <span className="sr-only"> {t.feedback.undoAvailable}</span>}</span>
        {notice?.action && <button type="button" className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded px-1 font-semibold underline focus-visible:outline-2"
          disabled={editing} onClick={() => undoFeedback(notice)}><Undo2 aria-hidden="true" size={16} />{t.topBar.undo}</button>}
      </div>
    </div>
  </div>;
}
