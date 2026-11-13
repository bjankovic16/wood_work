import { CircleCheck, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Issue } from '../../engine/checks';
import { cn } from '../../lib/cn';
import { useIssues } from '../../store/derived';
import { useUiStore } from '../../store/uiStore';

/** Shows the unit an issue is about on the plan. */
function openIssue(issue: Issue) {
  const ui = useUiStore.getState();
  if (issue.itemIds.length > 0) ui.select(issue.itemIds[0]);
  if (ui.view === 'list') ui.setView('plan');
}

/** The design checks: a count in the top bar, and the list when opened. */
export function ChecksButton({ compact = false }: { compact?: boolean }) {
  const issues = useIssues();
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.length - errors;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const summary = issues.length === 0 ? 'No problems found' : [errors && `${errors} ${errors === 1 ? 'error' : 'errors'}`, warnings && `${warnings} ${warnings === 1 ? 'warning' : 'warnings'}`].filter(Boolean).join(', ');

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        title={`Checks: ${summary}`}
        aria-label={`Checks: ${summary}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex h-8 min-w-8 touch-manipulation items-center justify-center gap-1.5 rounded-md px-2 text-[13px] font-medium transition-colors',
          errors > 0 ? 'text-red-700 hover:bg-red-50' : warnings > 0 ? 'text-amber-700 hover:bg-amber-50' : 'text-emerald-700 hover:bg-emerald-50',
        )}
      >
        {issues.length === 0 ? <CircleCheck className="size-4" /> : <TriangleAlert className="size-4" />}
        {!compact && <span>Checks</span>}
        {issues.length > 0 && (
          <span
            className={cn(
              'min-w-5 rounded-full px-1.5 text-[11px] font-semibold leading-5 text-white',
              errors > 0 ? 'bg-red-600' : 'bg-amber-500',
            )}
          >
            {issues.length}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-[min(22rem,calc(100vw-1rem))] rounded-xl border border-zinc-200 bg-white p-2 shadow-xl" role="dialog" aria-label="Checks">
          <div className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{summary}</div>
          {issues.length === 0 ? (
            <p className="flex items-center gap-2 px-2 pb-2 text-[13px] text-zinc-600">
              <CircleCheck className="size-4 text-emerald-600" />
              Nothing overlaps, every part fits its sheet, and doors and windows are clear.
            </p>
          ) : (
            <ul className="max-h-80 space-y-1 overflow-y-auto">
              {issues.map((issue) => (
                <li key={issue.key}>
                  <button
                    type="button"
                    onClick={() => {
                      openIssue(issue);
                      setOpen(false);
                    }}
                    className={cn(
                      'flex w-full gap-2 rounded-lg px-2.5 py-2 text-left text-xs leading-snug transition-colors',
                      issue.severity === 'error' ? 'bg-red-50 text-red-800 hover:bg-red-100' : 'bg-amber-50 text-amber-900 hover:bg-amber-100',
                    )}
                  >
                    <TriangleAlert className="mt-px size-3.5 shrink-0" />
                    {issue.message}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
