import { Shuffle } from 'lucide-react';
import { useRef } from 'react';
import { hasLook, KITCHEN_LOOKS } from '../../domain/kitchens';
import { randomSeed, shuffled } from '../../domain/shuffle';
import { APPLIANCE_FINISHES, BACKSPLASH_FINISHES, DEFAULT_FLOOR_COLOR, DEFAULT_FLOOR_GROUT_COLOR, DEFAULT_FLOOR_TILE_SIZE, DEFAULT_WALL_COLOR, FLOOR_TILE_SIZE_LIMITS, FRONT_FINISHES, HANDLE_STYLES, ROOM_COLORS, WORKTOP_FINISHES, type Finish, type RoomColor } from '../../domain/style';
import { useT } from '../../i18n';
import { cn } from '../../lib/cn';
import { setStyle } from '../../store/actions';
import { useDesignStore } from '../../store/designStore';
import { Button } from '../ui';
import { CheckboxField, NumberField } from '../properties/NumberField';

function swatchBackground(finish: Finish): string {
  // Wood finishes get a streaky gradient to hint at the grain.
  return finish.wood
    ? `repeating-linear-gradient(100deg, ${finish.color} 0 5px, color-mix(in srgb, ${finish.color} 82%, #3b2410) 5px 7px)`
    : finish.texture
      ? `repeating-linear-gradient(${finish.texture === 'marble' ? '135deg' : '0deg'}, ${finish.color} 0 8px, color-mix(in srgb, ${finish.color} 80%, #8b7967) 8px 9px)`
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
              'size-8 touch-manipulation rounded-full border border-black/10 shadow-inner transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 motion-reduce:transform-none',
              key === value ? 'ring-2 ring-blue-600 ring-offset-2' : 'hover:scale-110',
            )}
            style={{ background: swatchBackground(options[key]) }}
          />
        ))}
      </div>
    </div>
  );
}

function RoomColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (color: string) => void }) {
  const t = useT();
  return <div className="space-y-2">
    <label className="flex items-center justify-between gap-2 text-xs font-medium text-zinc-700">
      {label}
      <input type="color" aria-label={`${label}: ${t.style.customColor}`} value={value}
        className="h-9 w-14 cursor-pointer rounded-md border border-zinc-200 bg-white p-1"
        onChange={(event) => onChange(event.target.value)} />
    </label>
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {(Object.keys(ROOM_COLORS) as RoomColor[]).map((key) => <button key={key} type="button"
        aria-label={`${label}: ${t.style.roomColors[key]}`} title={t.style.roomColors[key]}
        aria-pressed={value.toLowerCase() === ROOM_COLORS[key].color}
        className={cn('size-8 rounded-full border border-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2',
          value.toLowerCase() === ROOM_COLORS[key].color && 'ring-2 ring-blue-600 ring-offset-2')}
        style={{ backgroundColor: ROOM_COLORS[key].color }} onClick={() => onChange(ROOM_COLORS[key].color)} />)}
    </div>
  </div>;
}

/** Fronts, worktop and handles for the whole kitchen, as shown in 3D. */
export function StylePicker() {
  const t = useT();
  const style = useDesignStore((s) => s.design.style);
  // Looks are dealt from a shuffled pack, so none repeats until all have been seen.
  const pack = useRef<{ seed: number; next: number } | null>(null);
  const shuffleLook = () => {
    pack.current ??= { seed: randomSeed(), next: 0 };
    const current = useDesignStore.getState().design.style;
    for (let tries = 0; tries < KITCHEN_LOOKS.length; tries++) {
      if (pack.current.next >= KITCHEN_LOOKS.length) pack.current = { seed: randomSeed(), next: 0 };
      const look = shuffled(KITCHEN_LOOKS, pack.current.seed)[pack.current.next++];
      if (hasLook(current, look)) continue;
      setStyle(look);
      return;
    }
  };
  return (
    <div className="space-y-4">
      <div>
        <Button variant="outline" className="h-10 w-full" title={t.style.shuffleTitle} onClick={shuffleLook}>
          <Shuffle className="size-4" />{t.style.shuffle}
        </Button>
        <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-600">{t.style.shuffleNote}</p>
      </div>
      <Swatches label={t.style.fronts} options={FRONT_FINISHES} names={t.style.frontFinishes} value={style.front} onChange={(front) => setStyle({ front })} />
      <div>
        <p className="mb-1.5 text-xs font-medium text-zinc-700">{t.style.frontProfile}</p>
        <div role="group" aria-label={t.style.frontProfile} className="grid grid-cols-2 gap-1.5">
          {(['flat', 'shaker'] as const).map((profile) => <button key={profile} type="button" aria-pressed={(style.frontProfile ?? 'flat') === profile} onClick={() => setStyle({ frontProfile: profile })} className={cn('min-h-9 rounded-md border px-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500', (style.frontProfile ?? 'flat') === profile ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-zinc-200 text-zinc-700 hover:bg-zinc-50')}>{t.style.frontProfiles[profile]}</button>)}
        </div>
        {style.frontProfile === 'shaker' && <p className="mt-2 text-[11px] leading-relaxed text-zinc-600">{t.style.frontProfileNote}</p>}
      </div>
      <Swatches
        label={t.style.worktop}
        options={WORKTOP_FINISHES}
        names={t.style.worktopFinishes}
        value={style.worktop}
        onChange={(worktop) => setStyle({ worktop })}
      />
      <Swatches label={t.style.appliances} options={APPLIANCE_FINISHES} names={t.style.applianceFinishes} value={style.appliances ?? 'white'} onChange={(appliances) => setStyle({ appliances })} />
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
      <Swatches
        label={t.style.backsplash}
        options={BACKSPLASH_FINISHES}
        names={t.style.backsplashFinishes}
        value={style.backsplash ?? 'none'}
        onChange={(backsplash) => setStyle({ backsplash })}
      />
      <div className="space-y-4 border-t border-zinc-100 pt-3">
        <h3 className="text-sm font-semibold text-zinc-800">{t.style.roomSurfaces}</h3>
        <RoomColorPicker label={t.style.wallColor} value={style.wallColor ?? DEFAULT_WALL_COLOR} onChange={(wallColor) => setStyle({ wallColor })} />
        <RoomColorPicker label={t.style.floorColor} value={style.floorColor ?? DEFAULT_FLOOR_COLOR} onChange={(floorColor) => setStyle({ floorColor })} />
        <CheckboxField label={t.style.floorTiles} checked={style.floorPattern === 'tiles'} onChange={(enabled) => setStyle({ floorPattern: enabled ? 'tiles' : 'plain' })} />
        {style.floorPattern === 'tiles' && <div className="space-y-3">
          <NumberField label={t.style.tileSize} value={style.floorTileSize ?? DEFAULT_FLOOR_TILE_SIZE}
            min={FLOOR_TILE_SIZE_LIMITS.min} max={FLOOR_TILE_SIZE_LIMITS.max} onCommit={(floorTileSize) => setStyle({ floorTileSize })} />
          <RoomColorPicker label={t.style.groutColor} value={style.floorGroutColor ?? DEFAULT_FLOOR_GROUT_COLOR} onChange={(floorGroutColor) => setStyle({ floorGroutColor })} />
          <p className="text-[11px] leading-relaxed text-zinc-600">{t.style.floorTilesNote}</p>
        </div>}
        <p className="text-[11px] leading-relaxed text-zinc-600">{t.style.roomColorNote}</p>
      </div>
      <div className="space-y-3 border-t border-zinc-100 pt-3">
        <label className="flex cursor-pointer items-start gap-2 text-xs leading-relaxed text-zinc-700">
          <input type="checkbox" className="mt-0.5 size-4 accent-blue-600" checked={style.lighting ?? false} onChange={(event) => setStyle({ lighting: event.target.checked })} />
          {t.style.lighting}
        </label>
        <label className="flex cursor-pointer items-start gap-2 text-xs leading-relaxed text-zinc-700">
          <input type="checkbox" className="mt-0.5 size-4 accent-blue-600" checked={style.plinthLighting ?? false} onChange={(event) => setStyle({ plinthLighting: event.target.checked })} />
          {t.style.plinthLighting}
        </label>
        <label className="flex cursor-pointer items-start gap-2 text-xs leading-relaxed text-zinc-700">
          <input type="checkbox" className="mt-0.5 size-4 accent-blue-600" checked={style.decor ?? false} onChange={(event) => setStyle({ decor: event.target.checked })} />
          {t.style.decor}
        </label>
        <p className="text-[11px] leading-relaxed text-zinc-600">{t.style.previewNote}</p>
      </div>
    </div>
  );
}
