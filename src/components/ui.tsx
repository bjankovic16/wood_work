import { X } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../i18n';
import { cn } from '../lib/cn';
import { SheetHandle, type SheetSnap } from './sheets/SheetHandle';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Highlights the button as a switched-on toggle. */
  active?: boolean;
  variant?: 'ghost' | 'outline' | 'danger' | 'primary';
}

export function Button({ active, variant = 'ghost', className, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      aria-pressed={active}
      className={cn(
        'inline-flex h-8 min-w-8 touch-manipulation select-none items-center justify-center gap-1.5 rounded-lg px-2 text-[13px] font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-studio-accent/50 focus-visible:ring-offset-1',
        'disabled:pointer-events-none disabled:opacity-35',
        variant === 'ghost' && 'text-[#696357] hover:bg-[#ece8df] hover:text-studio-ink',
        variant === 'outline' && 'border border-studio-line bg-studio-paper text-[#585348] shadow-xs hover:border-[#b6b09f] hover:bg-[#f4f1e9]',
        variant === 'danger' && 'border border-zinc-200 bg-white text-red-600 shadow-xs hover:border-red-200 hover:bg-red-50',
        variant === 'primary' && 'bg-studio-accent text-white shadow-sm hover:bg-[#40533d]',
        active && 'border-[#aab69d] bg-[#e6ecdf] text-[#3e5539] hover:bg-[#dce6d3] hover:text-[#31482e]',
        className,
      )}
      {...props}
    />
  );
}

/** Hover or keyboard focus explains an action; a long press explains it without activating it. */
export function TooltipButton({ tooltip, ...props }: ButtonProps & { tooltip: string }) {
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const held = useRef(false);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const clearTimer = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  useEffect(() => () => clearTimer(), []);
  useLayoutEffect(() => {
    if (!open || !root.current || !bubble.current) return;
    const anchor = root.current.getBoundingClientRect();
    const box = bubble.current.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(innerWidth - box.width - 8, anchor.left + (anchor.width - box.width) / 2)),
      top: anchor.bottom + box.height + 8 <= innerHeight - 8 ? anchor.bottom + 8 : Math.max(8, anchor.top - box.height - 8),
    });
  }, [open, tooltip]);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) close(); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); close(); } };
    window.addEventListener('pointerdown', outside);
    window.addEventListener('keydown', key, true);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('pointerdown', outside);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);
  return <span ref={root} className="inline-flex shrink-0"
    onPointerEnter={(event) => {
      if (event.pointerType === 'touch') return;
      clearTimer();
      timer.current = setTimeout(() => setOpen(true), 400);
    }}
    onPointerLeave={() => { clearTimer(); if (!held.current) setOpen(false); }}
    onFocusCapture={(event) => { if (event.target.matches(':focus-visible')) setOpen(true); }}
    onBlurCapture={() => setOpen(false)}
    onPointerDownCapture={(event) => {
      clearTimer(); setOpen(false); held.current = false;
      touch.current = event.pointerType === 'touch' ? { x: event.clientX, y: event.clientY } : null;
      if (touch.current) timer.current = setTimeout(() => { held.current = true; setOpen(true); }, 500);
    }}
    onPointerMoveCapture={(event) => {
      if (touch.current && Math.hypot(event.clientX - touch.current.x, event.clientY - touch.current.y) > 8) clearTimer();
    }}
    onPointerUpCapture={clearTimer}
    onPointerCancelCapture={() => { clearTimer(); held.current = false; setOpen(false); }}
    onContextMenu={(event) => { if (touch.current) event.preventDefault(); }}
    onClickCapture={(event) => {
      if (held.current) { event.preventDefault(); event.stopPropagation(); held.current = false; }
      else setOpen(false);
    }}
  >
    <Button {...props} title={undefined} aria-describedby={open ? [props['aria-describedby'], id].filter(Boolean).join(' ') : props['aria-describedby']} />
    {open && createPortal(<div ref={bubble} id={id} role="tooltip"
      className="pointer-events-none fixed z-[80] max-w-[min(280px,calc(100vw-16px))] rounded-xl bg-studio-ink px-3 py-2 text-xs leading-relaxed text-white shadow-lg"
      style={{ left: position?.left ?? 8, top: position?.top ?? 8, visibility: position ? 'visible' : 'hidden' }}
    >{tooltip}</div>, root.current?.closest('dialog') ?? document.body)}
  </span>;
}

export function Divider() {
  return <div className="mx-1 h-5 w-px shrink-0 bg-studio-line" />;
}

export function PanelSection({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="border-b border-studio-line/70 px-4 py-4 last:border-b-0">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.13em] text-studio-muted">{title}</h3>
        {aside}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-zinc-200 bg-zinc-50 px-1 text-[11px] font-medium text-zinc-600">
      {children}
    </kbd>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  options: Array<{ value: T; label: ReactNode; title?: string; ariaLabel?: string }>;
  onChange: (value: T) => void;
  className?: string;
  size?: 'sm' | 'md';
  ariaLabel?: string;
}

/** A row of mutually exclusive choices. */
export function Segmented<T extends string>({ value, options, onChange, className, size = 'md', ariaLabel }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn('flex rounded-xl border border-studio-line/60 bg-[#efede5] p-1', className)}>
      {options.map((option, i) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          tabIndex={value === option.value ? 0 : -1}
          aria-label={option.ariaLabel}
          title={option.title}
          onClick={() => onChange(option.value)}
          onKeyDown={(e) => {
            const next = e.key === 'Home' ? 0 : e.key === 'End' ? options.length - 1
              : ['ArrowRight', 'ArrowDown'].includes(e.key) ? (i + 1) % options.length
              : ['ArrowLeft', 'ArrowUp'].includes(e.key) ? (i + options.length - 1) % options.length : -1;
            if (next === -1) return;
            e.preventDefault(); e.stopPropagation();
            e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
            onChange(options[next].value);
          }}
          className={cn(
            'flex flex-1 touch-manipulation items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-studio-accent',
            size === 'sm' ? 'h-7 text-xs' : 'h-8 text-[13px]',
            value === option.value ? 'bg-studio-paper text-studio-ink shadow-sm' : 'text-studio-muted hover:text-studio-ink',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  headerNote?: ReactNode;
  /** Slides up from the bottom (phones) instead of opening in the middle. */
  sheet?: boolean;
  wide?: boolean;
}

/** Open dialogs, innermost last: Escape closes only the top one. */
const openDialogs: object[] = [];

/** Modal dialog, or a bottom sheet on small screens. Escape and the backdrop close it. */
export function Dialog({ open, title, onClose, children, footer, headerNote, sheet = false, wide = false }: DialogProps) {
  const t = useT();
  const [snap, setSnap] = useState<SheetSnap>('full');
  const contentId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) { setSnap('full'); return; }
    const token = {};
    openDialogs.push(token);
    const panel = panelRef.current!;
    const trigger = document.activeElement;
    const onKey = (e: KeyboardEvent) => {
      if (openDialogs.at(-1) !== token || document.querySelector('dialog:modal')) return;
      if (e.key === 'Escape') { e.stopPropagation(); onCloseRef.current(); }
      if (e.key !== 'Tab') return;
      const targets = [...panel.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], summary, [tabindex]')]
        .filter((el) => el.tabIndex >= 0 && !el.matches(':disabled') && el.getClientRects().length && getComputedStyle(el).visibility === 'visible');
      const boundary = e.shiftKey ? targets[0] : targets.at(-1);
      if (document.activeElement === boundary || document.activeElement === panel && e.shiftKey || !panel.contains(document.activeElement)) {
        e.preventDefault();
        (e.shiftKey ? targets.at(-1) : targets[0])?.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    panel.focus();
    return () => {
      window.removeEventListener('keydown', onKey, true);
      openDialogs.splice(openDialogs.indexOf(token), 1);
      if (trigger instanceof HTMLElement && trigger.isConnected && (document.activeElement === document.body || panel.contains(document.activeElement)))
        trigger.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div
      className={cn('fixed inset-0 z-50 flex bg-[#29291f]/35 backdrop-blur-[3px]', sheet ? 'items-end' : 'items-center justify-center p-6')}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        data-sheet-panel={sheet ? 'modal' : undefined}
        data-snap={sheet ? snap : undefined}
        className={cn(
          'flex flex-col border border-studio-line bg-studio-paper shadow-2xl outline-none',
          sheet ? 'w-full rounded-t-3xl' : cn('max-h-full w-full rounded-2xl', wide ? 'max-w-5xl' : 'max-w-md'),
        )}
      >
        <div className={cn('flex shrink-0 items-center justify-between gap-2 border-b border-studio-line', sheet ? 'px-2 py-1' : 'py-3 pl-5 pr-3')}>
          {sheet && <SheetHandle snap={snap} onSnap={setSnap} onClose={onClose} controls={contentId} />}
          <div className="mr-auto min-w-0">
            <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
            {headerNote}
          </div>
          <Button aria-label={t.common.close} title={t.common.closeTitle} onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
        <div id={contentId} className="min-h-0 flex-auto overflow-y-auto overscroll-contain">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-zinc-100 px-5 py-3 pb-[max(env(safe-area-inset-bottom),12px)]">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** A button that opens a small menu below it. */
interface MenuProps {
  label: string;
  icon: ReactNode;
  children: ReactNode;
  align?: 'left' | 'right';
  /** Shown next to the icon; without it the button is icon-only. */
  text?: ReactNode;
  variant?: ButtonProps['variant'];
}

export function Menu({ label, icon, children, align = 'right', text, variant = 'ghost' }: MenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const closeToTrigger = () => {
    setOpen(false);
    rootRef.current?.querySelector('button')?.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open]);
  return (
    <div ref={rootRef} className="relative" onBlur={(e) => {
      if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) setOpen(false);
    }} onKeyDown={(e) => {
      if (open && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeToTrigger(); }
    }}>
      <TooltipButton tooltip={label} variant={variant} aria-label={label} aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen((o) => !o)}>
        {icon}
        {text}
      </TooltipButton>
      {open && (
        <div id={id}
          className={cn(
            'absolute top-full z-40 mt-2 w-64 rounded-xl border border-studio-line bg-studio-paper p-2 shadow-xl',
            align === 'right' ? 'right-0' : 'left-0',
          )}
          onClick={(e) => {
            if (e.target instanceof Element && e.target.closest('[data-close-menu]')) closeToTrigger();
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
