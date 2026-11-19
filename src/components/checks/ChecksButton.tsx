import { CircleCheck, TriangleAlert } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { itemRect } from '../../domain/geometry';
import { openingOnWall } from '../../domain/walls';
import type { Issue } from '../../engine/checks';
import { useT } from '../../i18n';
import { cn } from '../../lib/cn';
import { editCabinetPositionInPlan } from '../../store/actions';
import { useDesignStore } from '../../store/designStore';
import { useIssues, usePrecutChecklist } from '../../store/derived';
import { useUiStore } from '../../store/uiStore';
import { revealPlanRect } from '../../store/viewport';

function openIssue(issue: Issue) {
  const ui = useUiStore.getState();
  const { items, room, openings } = useDesignStore.getState().design;
  const item = items.find((i) => i.id === issue.itemIds[0]);
  // A collision with a room object is still a cabinet issue: show the cabinet first.
  if (item) {
    editCabinetPositionInPlan(item.id);
    requestAnimationFrame(() => {
      if (useUiStore.getState().selectedId === item.id) revealPlanRect(itemRect(item));
    });
  } else if (issue.placement || issue.roomFeatureId) {
    ui.setRoomOpen(true);
    ui.setSelectedWallId(issue.roomWallId ?? null);
    const feature = room.features?.find((f) => f.id === issue.roomFeatureId);
    const opening = openings.find((o) => o.id === issue.roomOpeningId);
    const wall = opening && openingOnWall(room, opening)?.segment;
    if (feature) ui.selectRoomObject({ type: 'feature', id: feature.id }, feature.wallId);
    if (opening) ui.selectRoomObject({ type: 'opening', id: opening.id }, wall?.id);
    ui.setRoomElevationOpen(Boolean(wall || issue.roomWallId));
  } else {
    // Workshop-only issues (e.g. an oversized extra piece) have no plan geometry.
    ui.setView('list');
  }
}

export function ChecksButton({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const issues = useIssues();
  const checklist = usePrecutChecklist();
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.length - errors;
  const id = useId();
  const [mode, setMode] = useState<'closed' | 'preview' | 'pinned'>('closed');
  const open = mode !== 'closed';
  const rootRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, above: false, height: 0 });

  useLayoutEffect(() => {
    if (!open || !rootRef.current || !popupRef.current) return;
    const anchor = rootRef.current.getBoundingClientRect();
    const width = popupRef.current.offsetWidth;
    const below = innerHeight - anchor.bottom;
    const above = below < 180 && anchor.top > below;
    const left = Math.max(8, Math.min(innerWidth - width - 8, anchor.right - width));
    setPosition({ left: left - anchor.left, above, height: (above ? anchor.top : below) - 12 });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setMode('closed');
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (popupRef.current?.contains(document.activeElement)) badgeRef.current?.focus();
      close();
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const summary =
    issues.length === 0 ? t.checks.none : [errors > 0 && t.checks.errors(errors), warnings > 0 && t.checks.warnings(warnings)].filter(Boolean).join(', ');

  const issueRow = (issue: Issue) => <li key={issue.key}>
    <button type="button" data-close-menu onClick={() => { openIssue(issue); setMode('closed'); }}
      className={cn(
        'flex w-full gap-2 rounded-lg px-2.5 py-2 text-left text-xs leading-snug',
        issue.severity === 'error' ? 'bg-red-50 text-red-800 hover:bg-red-100' : 'bg-amber-50 text-amber-900 hover:bg-amber-100',
      )}>
      <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />{issue.message}
    </button>
  </li>;

  return (
    <div ref={rootRef} className={cn('relative shrink-0', open && 'z-40')}
      onPointerEnter={(e) => { if (e.pointerType !== 'touch') setMode((m) => m === 'closed' ? 'preview' : m); }}
      onPointerLeave={() => { if (mode === 'preview' && !rootRef.current?.contains(document.activeElement)) setMode('closed'); }}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setMode('closed'); }}>
      <button
        ref={badgeRef}
        type="button"
        aria-label={t.checks.summary(summary)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? id : undefined}
        aria-describedby={open && issues.length ? `${id}-preview` : undefined}
        onFocus={() => setMode((m) => m === 'closed' ? 'preview' : m)}
        onClick={() => setMode((m) => m === 'pinned' ? 'closed' : 'pinned')}
        className={cn(
          'inline-flex h-8 min-w-8 touch-manipulation items-center justify-center rounded-md text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40',
          compact ? 'gap-1 px-1 text-xs' : 'gap-1.5 px-2',
          errors > 0 ? 'text-red-700 hover:bg-red-50' : warnings > 0 ? 'text-amber-700 hover:bg-amber-50' : 'text-emerald-700 hover:bg-emerald-50',
        )}
      >
        {issues.length === 0 ? <CircleCheck className="size-4" /> : <TriangleAlert className="size-4" />}
        <span>{compact ? t.checks.chip(issues.length) : t.checks.checks}</span>
        {!compact && issues.length > 0 && (
          <span
            aria-hidden
            className={cn(
              'pointer-events-none rounded-full font-semibold text-white',
              'min-w-5 px-1.5 text-xs leading-5',
              errors > 0 ? 'bg-red-600' : 'bg-amber-700',
            )}
          >
            {issues.length}
          </span>
        )}
      </button>
      {open && (
        <div ref={popupRef} className={cn('absolute w-[min(22rem,calc(100vw-1rem))]', position.above ? 'bottom-full pb-1' : 'top-full pt-1')} style={{ left: position.left }}>
        <div id={id} role="dialog" aria-label={t.checks.checks}
          className="overflow-y-auto overscroll-contain rounded-xl border border-zinc-200 bg-white p-2 shadow-xl" style={{ maxHeight: position.height }}>
          <div className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{summary}</div>
          {issues.length === 0 ? (
            <p className="flex items-center gap-2 px-2 pb-2 text-[13px] text-zinc-600">
              <CircleCheck className="size-4 text-emerald-600" />
              {t.checks.allClear}
            </p>
          ) : (
            <ul id={`${id}-preview`} className="space-y-1">{issues.slice(0, 2).map(issueRow)}</ul>
          )}
          {issues.length > 2 && <details className="mt-1 text-studio-accent">
            <summary>{t.checks.showAll(issues.length)}</summary>
            <ul className="space-y-1">{issues.slice(2).map(issueRow)}</ul>
          </details>}
          {checklist.length > 0 && <details className="mt-1 border-t border-zinc-100 text-xs text-zinc-600">
            <summary>{t.checks.precut} ({checklist.length})</summary>
            <p className="py-2">{t.checks.precutHint}</p>
            <ul className="max-h-60 list-disc space-y-2 overflow-y-auto pl-4">
              {checklist.map((issue) => <li key={issue.key}>{issue.message}</li>)}
            </ul>
          </details>}
        </div>
        </div>
      )}
    </div>
  );
}
