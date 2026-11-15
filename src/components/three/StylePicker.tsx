import { FRONT_FINISHES, HANDLE_STYLES, WORKTOP_FINISHES, type Finish } from '../../domain/style';
import { useT } from '../../i18n';
import { cn } from '../../lib/cn';
import { setStyle } from '../../store/actions';
import { useDesignStore } from '../../store/designStore';

function swatchBackground(finish: Finish): string {
  // Wood finishes get a streaky gradient to hint at the grain.
  return finish.wood
    ? `repeating-linear-gradient(100deg, ${finish.color} 0 5px, color-mix(in srgb, ${finish.color} 82%, #3b2410) 5px 7px)`
    : finish.color;
}

function Swatches<K extends string>({
  label,
  options,
  names,
  value,
  onChange,
}: {
  label: string;
  options: Record<K, Finish>;
  names: Record<K, string>;
  value: K;
  onChange: (value: K) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-xs font-medium text-zinc-700">{label}</span>
        <span className="text-[11px] text-zinc-500">{names[value]}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(options) as K[]).map((key) => (
          <button
            key={key}
            type="button"
            title={names[key]}
            aria-label={`${label}: ${names[key]}`}
            aria-pressed={key === value}
            onClick={() => onChange(key)}
            className={cn(
              'size-7 touch-manipulation rounded-full border border-black/10 shadow-inner transition',
              key === value ? 'ring-2 ring-blue-600 ring-offset-2' : 'hover:scale-110',
            )}
            style={{ background: swatchBackground(options[key]) }}
          />
        ))}
      </div>
    </div>
  );
}

/** Fronts, worktop and handles for the whole kitchen, as shown in 3D. */
export function StylePicker() {
  const t = useT();
  const style = useDesignStore((s) => s.design.style);
  return (
    <div className="space-y-4">
      <Swatches label={t.style.fronts} options={FRONT_FINISHES} names={t.style.frontFinishes} value={style.front} onChange={(front) => setStyle({ front })} />
      <Swatches
        label={t.style.worktop}
        options={WORKTOP_FINISHES}
        names={t.style.worktopFinishes}
        value={style.worktop}
        onChange={(worktop) => setStyle({ worktop })}
      />
      <div>
        <div className="mb-1.5 text-xs font-medium text-zinc-700">{t.style.handles}</div>
        <div className="grid grid-cols-2 gap-1.5">
          {(Object.keys(HANDLE_STYLES) as Array<keyof typeof HANDLE_STYLES>).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={key === style.handles}
              onClick={() => setStyle({ handles: key })}
              className={cn(
                'flex h-8 touch-manipulation items-center gap-2 rounded-md border px-2 text-xs font-medium transition-colors',
                key === style.handles ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-zinc-200 text-zinc-700 hover:bg-zinc-50',
              )}
            >
              <span
                className="h-1.5 w-4 shrink-0 rounded-full"
                style={{ background: HANDLE_STYLES[key].color ?? 'transparent', border: HANDLE_STYLES[key].color ? 'none' : '1px dashed #a1a1aa' }}
              />
              {t.style.handleStyles[key]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
