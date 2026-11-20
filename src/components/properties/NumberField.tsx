import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { clamp, evaluateExpression } from '../../domain/math';
import { COMPACT_QUERY, useIsCompact } from '../../hooks/useMediaQuery';
import { useT } from '../../i18n';
import { Dialog } from '../ui';

interface NumberFieldProps {
  label: string;
  shortLabel?: string;
  value: number;
  onCommit: (value: number) => void | false;
  min?: number;
  max?: number;
  suffix?: string;
  autoFocus?: boolean;
  title?: string;
  readOnly?: boolean;
  /** Optional price fields store an unknown price as zero; show an empty editor instead. */
  zeroPlaceholder?: string;
  /** Decimal places kept (whole numbers by default). */
  precision?: number;
  picks?: { value: number; disabled: boolean }[];
}

/**
 * Millimetre input. Changes apply on Enter or when the field loses focus, so
 * typing "6" on the way to "600" never resizes anything. Accepts simple
 * arithmetic ("600+18"); arrow keys step by 10 (Shift: 100); Escape reverts.
 */
export function NumberField({
  label,
  shortLabel,
  value,
  onCommit,
  min = -Infinity,
  max = Infinity,
  suffix = 'mm',
  autoFocus,
  title,
  readOnly = false,
  zeroPlaceholder,
  precision = 0,
  picks,
}: NumberFieldProps) {
  const id = useId();
  const t = useT();
  const show = t.number;
  const display = (n: number) => zeroPlaceholder && n === 0 ? '' : show(n);
  const inputRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<'number' | 'blocked' | null>(null);
  const skipBlurCommit = useRef(false);

  useEffect(() => {
    if (!autoFocus) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [autoFocus]);

  useEffect(() => {
    setError(null);
    if (readOnly) setDraft(null);
  }, [value, readOnly]);

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [error]);

  const commit = (text: string): number | null => {
    const parsed = zeroPlaceholder && !text.trim() ? 0 : evaluateExpression(text);
    if (parsed === null) { setError('number'); return null; }
    const factor = 10 ** precision;
    const next = Math.round(clamp(parsed, min, max) * factor) / factor;
    if (next !== value && onCommit(next) === false) { setError('blocked'); return null; }
    setError(null);
    return next;
  };

  return <>
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1" title={title}>
      <label htmlFor={id} className="w-[104px] shrink-0 text-xs text-zinc-500">
        {shortLabel ? <><span aria-hidden="true">{shortLabel}</span><span className="sr-only">{label}</span></> : label}
      </label>
      <div className="relative min-w-0 flex-1">
        <input
          ref={inputRef}
          id={id}
          inputMode={precision > 0 ? 'decimal' : 'numeric'}
          enterKeyHint="done"
          autoComplete="off"
          spellCheck={false}
          placeholder={zeroPlaceholder}
          readOnly={readOnly}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          value={draft ?? display(value)}
          onFocus={(e) => {
            if (!readOnly) setDraft(display(value));
            e.currentTarget.select();
          }}
          onChange={(e) => { setDraft(e.target.value); setError(null); }}
          onBlur={(e) => {
            if (!readOnly && !skipBlurCommit.current) commit(e.target.value);
            skipBlurCommit.current = false;
            setDraft(null);
          }}
          onKeyDown={(e) => {
            if (readOnly) return;
            if (e.key === 'Enter') {
              e.preventDefault();
              if (window.matchMedia(COMPACT_QUERY).matches) { e.currentTarget.blur(); return; }
              const next = commit(e.currentTarget.value);
              setDraft(display(next ?? value));
              e.currentTarget.select();
            } else if (e.key === 'Escape') {
              skipBlurCommit.current = true;
              setError(null);
              e.currentTarget.blur();
            } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              const step = (e.shiftKey ? 100 : 10) * (e.key === 'ArrowUp' ? 1 : -1);
              const base = evaluateExpression(e.currentTarget.value) ?? value;
              const next = commit(String(base + step));
              if (next !== null) setDraft(display(next));
            }
          }}
          className="h-9 w-full rounded-md border border-zinc-200 bg-white pl-2.5 pr-9 text-base tabular-nums lg:h-8 lg:text-[13px] text-zinc-900 shadow-xs transition-colors hover:border-zinc-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 aria-invalid:border-red-500 aria-invalid:focus:ring-red-500/20 read-only:bg-studio-canvas read-only:text-studio-muted"
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-zinc-400">
          {suffix}
        </span>
      </div>
      {error && <p ref={errorRef} id={`${id}-error`} role="alert" className="w-full text-xs text-red-700">{error === 'number' ? t.common.invalidNumber : t.common.blockedNumber}</p>}
    </div>
    {!readOnly && picks && picks.length > 0 && <div role="group" aria-label={t.sheet.commonSizes(label)} className="flex flex-wrap gap-1">
      {picks.map((pick) => <button key={pick.value} type="button"
        aria-label={`${label}: ${show(pick.value)} ${suffix}`} aria-pressed={pick.value === value} disabled={pick.disabled}
        className="min-h-8 min-w-11 rounded-lg border border-studio-line px-2 text-xs font-medium tabular-nums text-studio-muted aria-pressed:border-studio-accent aria-pressed:bg-[#ecf1e8] aria-pressed:text-studio-accent disabled:opacity-40"
        onPointerDown={(e) => {
          // A completed pick replaces the draft in one Undo step. Tabbing to it, or canceling a tap, doesn't.
          if (e.button === 0 && document.activeElement === inputRef.current) e.preventDefault();
        }}
        onClick={(e) => {
          if (document.activeElement === inputRef.current) {
            skipBlurCommit.current = true;
            e.currentTarget.focus({ preventScroll: true });
          }
          const applied = pick.value !== value ? onCommit(pick.value) : undefined;
          setDraft(null);
          setError(applied === false ? 'blocked' : null);
        }}>{show(pick.value)}</button>)}
    </div>}
  </>;
}

interface TextFieldProps {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  maxLength?: number;
  /** The text may be cleared (a note); otherwise an empty field keeps the old value. */
  allowEmpty?: boolean;
  placeholder?: string;
}

export function TextField({ label, value, onCommit, maxLength, allowEmpty = false, placeholder }: TextFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const skipBlurCommit = useRef(false);
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="w-[104px] shrink-0 text-xs text-zinc-500">
        {label}
      </label>
      <input
        id={id}
        value={draft ?? value}
        maxLength={maxLength}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onFocus={() => setDraft(value)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => {
          const text = e.target.value;
          if (!skipBlurCommit.current && (allowEmpty || text.trim()) && text !== value) onCommit(text);
          skipBlurCommit.current = false;
          setDraft(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            skipBlurCommit.current = true;
            e.currentTarget.blur();
          }
        }}
        className="h-9 min-w-0 flex-1 rounded-md border border-zinc-200 bg-white px-2.5 text-base font-medium lg:h-8 lg:text-[13px] text-zinc-900 shadow-xs transition-colors hover:border-zinc-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
      />
    </div>
  );
}

interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  title?: string;
  /** Show the whole selected stock label, even when a native select would clip its gauge. */
  wrapValue?: boolean;
}

export function SelectField<T extends string>({ label, value, options, onChange, title, wrapValue }: SelectFieldProps<T>) {
  const id = useId();
  const select = <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}
    className={wrapValue ? 'absolute inset-0 h-full w-full cursor-pointer opacity-0' : 'h-9 min-w-0 flex-1 rounded-md border border-zinc-200 bg-white px-2 text-base text-zinc-900 shadow-xs hover:border-zinc-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 lg:h-8 lg:text-[13px]'}>
    {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
  </select>;
  return (
    <div className={wrapValue ? 'min-w-0 space-y-1' : 'flex items-center gap-2'} title={title}>
      <label htmlFor={id} className={wrapValue ? 'block text-xs text-zinc-500' : 'w-[104px] shrink-0 text-xs text-zinc-500'}>
        {label}
      </label>
      {wrapValue ? <div className="relative flex min-h-8 items-center gap-2 rounded-md border border-zinc-200 bg-white px-2 py-1 text-[13px] text-zinc-900 shadow-xs focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20">
        <span aria-hidden="true" className="min-w-0 flex-1 [overflow-wrap:anywhere]">{options.find((o) => o.value === value)?.label}</span>
        <ChevronDown aria-hidden="true" size={14} className="shrink-0" />
        {select}
      </div> : select}
    </div>
  );
}

/** Native select on desktop; a wrapping current value and full-width choices on compact layouts. */
export function PickerField<T extends string>(props: SelectFieldProps<T>) {
  const compact = useIsCompact();
  const [open, setOpen] = useState(false);
  const id = useId();
  const { label, value, options, onChange } = props;
  if (!compact) return <SelectField {...props} />;
  return <>
    <button type="button" aria-haspopup="dialog" aria-expanded={open} aria-labelledby={`${id}-label`} aria-describedby={`${id}-value`}
      className="grid w-full touch-manipulation grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 rounded-xl border border-studio-line bg-white px-3 py-2 text-left"
      title={props.title} onClick={() => setOpen(true)}>
      <span id={`${id}-label`} className="text-xs text-studio-muted">{label}</span>
      <span id={`${id}-value`} className="col-start-1 text-sm font-medium [overflow-wrap:anywhere]">{options.find((o) => o.value === value)?.label}</span>
      <ChevronDown aria-hidden="true" size={16} className="col-start-2 row-span-2 row-start-1 text-studio-muted" />
    </button>
    <Dialog open={open} title={label} onClose={() => setOpen(false)} sheet>
      <ul className="divide-y divide-studio-line px-2 pb-[max(env(safe-area-inset-bottom),8px)]">
        {options.map((option) => <li key={option.value}>
          <button type="button" aria-pressed={value === option.value}
            className="flex min-h-11 w-full touch-manipulation items-center gap-3 rounded-lg px-3 py-2 text-left text-sm aria-pressed:bg-[#ecf1e8] aria-pressed:text-studio-accent"
            onClick={() => { onChange(option.value); setOpen(false); }}>
            <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{option.label}</span>
            {value === option.value && <Check size={18} aria-hidden="true" />}
          </button>
        </li>)}
      </ul>
    </Dialog>
  </>;
}

export function CheckboxField({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (checked: boolean) => void; hint?: string }) {
  const id = useId();
  return (
    <div className="flex items-start gap-2">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-blue-600"
      />
      <label htmlFor={id} className="text-xs leading-snug text-zinc-700">
        {label}
        {hint && <span className="block text-[11px] text-zinc-400">{hint}</span>}
      </label>
    </div>
  );
}
