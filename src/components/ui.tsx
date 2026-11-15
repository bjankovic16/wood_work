import { X } from 'lucide-react';
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../i18n';
import { cn } from '../lib/cn';

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
        'inline-flex h-8 min-w-8 touch-manipulation select-none items-center justify-center gap-1.5 rounded-md px-2 text-[13px] font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40',
        'disabled:pointer-events-none disabled:opacity-35',
        variant === 'ghost' && 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900',
        variant === 'outline' && 'border border-zinc-200 bg-white text-zinc-700 shadow-xs hover:bg-zinc-50',
        variant === 'danger' && 'border border-zinc-200 bg-white text-red-600 shadow-xs hover:border-red-200 hover:bg-red-50',
        variant === 'primary' && 'bg-zinc-900 text-white shadow-sm hover:bg-zinc-800',
        active && 'bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800',
        className,
      )}
      {...props}
    />
  );
}

export function Divider() {
  return <div className="mx-1 h-5 w-px shrink-0 bg-zinc-200" />;
}

export function PanelSection({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="border-b border-zinc-100 px-4 py-4 last:border-b-0">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{title}</h3>
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
  options: Array<{ value: T; label: ReactNode; title?: string }>;
  onChange: (value: T) => void;
  className?: string;
  size?: 'sm' | 'md';
  ariaLabel?: string;
}

/** A row of mutually exclusive choices. */
export function Segmented<T extends string>({ value, options, onChange, className, size = 'md', ariaLabel }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn('flex rounded-lg bg-zinc-100 p-0.5', className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          title={option.title}
          onClick={() => onChange(option.value)}
          className={cn(
            'flex flex-1 touch-manipulation items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2.5 font-medium transition-colors',
            size === 'sm' ? 'h-7 text-xs' : 'h-8 text-[13px]',
            value === option.value ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800',
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
  /** Slides up from the bottom (phones) instead of opening in the middle. */
  sheet?: boolean;
  wide?: boolean;
}

/** Open dialogs, innermost last: Escape closes only the top one. */
const openDialogs: object[] = [];

/** Modal dialog, or a bottom sheet on small screens. Escape and the backdrop close it. */
export function Dialog({ open, title, onClose, children, footer, sheet = false, wide = false }: DialogProps) {
  const t = useT();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const token = {};
    openDialogs.push(token);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || openDialogs[openDialogs.length - 1] !== token) return;
      e.stopPropagation();
      onCloseRef.current();
    };
    window.addEventListener('keydown', onKey, true);
    panelRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey, true);
      openDialogs.splice(openDialogs.indexOf(token), 1);
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div
      className={cn('fixed inset-0 z-50 flex bg-zinc-900/30', sheet ? 'items-end' : 'items-center justify-center p-6')}
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
        className={cn(
          'flex flex-col bg-white shadow-2xl outline-none',
          sheet ? 'max-h-[85dvh] w-full rounded-t-2xl' : cn('max-h-full w-full rounded-xl', wide ? 'max-w-2xl' : 'max-w-md'),
        )}
      >
        <div className="flex items-center justify-between border-b border-zinc-100 py-3 pl-5 pr-3">
          <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
          <Button aria-label={t.common.close} title={t.common.closeTitle} onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
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
  text?: string;
  variant?: ButtonProps['variant'];
}

export function Menu({ label, icon, children, align = 'right', text, variant = 'ghost' }: MenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open]);
  return (
    <div ref={rootRef} className="relative">
      <Button variant={variant} aria-label={label} title={label} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {icon}
        {text}
      </Button>
      {open && (
        <div
          className={cn(
            'absolute top-full z-40 mt-1 w-64 rounded-xl border border-zinc-200 bg-white p-2 shadow-xl',
            align === 'right' ? 'right-0' : 'left-0',
          )}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('[data-close-menu]')) setOpen(false);
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
