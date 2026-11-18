import { Grid2X2, Pipette } from 'lucide-react';
import { DEFAULT_FLOOR_COLOR, DEFAULT_FLOOR_GROUT_COLOR, DEFAULT_FLOOR_TILE_SIZE, DEFAULT_WALL_COLOR, FLOOR_TILE_SIZE_LIMITS, ROOM_COLORS, type RoomColor } from '../../domain/style';
import { useT } from '../../i18n';
import { setStyle } from '../../store/actions';
import { useDesignStore } from '../../store/designStore';
import { NumberField } from '../properties/NumberField';

function RoomColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (color: string) => void }) {
  const t = useT();
  const colours = Object.keys(ROOM_COLORS) as RoomColor[];
  const current = colours.find((key) => ROOM_COLORS[key].color === value.toLowerCase());
  return <fieldset className="min-w-0">
    <legend className="float-left text-sm font-semibold text-studio-ink">{label}</legend>
    <label className="room-custom-colour" title={t.style.customColor}>
      {current ? t.style.roomColors[current] : value.toUpperCase()}<Pipette size={14} aria-hidden="true" />
      <input type="color" aria-label={`${label}: ${t.style.customColor}`} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
    <div className="room-swatches">
      {colours.map((key) => <button key={key} type="button" aria-pressed={key === current}
        aria-label={`${label}: ${t.style.roomColors[key]}`} title={t.style.roomColors[key]}
        onClick={() => onChange(ROOM_COLORS[key].color)}>
        <span style={{ backgroundColor: ROOM_COLORS[key].color }} />
      </button>)}
    </div>
  </fieldset>;
}

/** The room inspector and 3D style palette edit the same saved finishes. */
export function RoomSurfaces() {
  const t = useT();
  const style = useDesignStore((s) => s.design.style);
  const tiled = style.floorPattern === 'tiles';
  return <div className="space-y-3">
    <h3 className="text-sm font-semibold text-studio-ink">{t.style.roomSurfaces}</h3>
    <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-studio-line bg-[#f7f7f1] px-3 text-sm font-semibold">
      <Grid2X2 size={17} aria-hidden="true" />{t.style.floorTiles}
      <input type="checkbox" className="ml-auto size-5" checked={tiled} onChange={(e) => setStyle({ floorPattern: e.target.checked ? 'tiles' : 'plain' })} />
    </label>
    <RoomColorPicker label={t.style.wallColor} value={style.wallColor ?? DEFAULT_WALL_COLOR} onChange={(wallColor) => setStyle({ wallColor })} />
    <RoomColorPicker label={t.style.floorColor} value={style.floorColor ?? DEFAULT_FLOOR_COLOR} onChange={(floorColor) => setStyle({ floorColor })} />
    {tiled && <div className="space-y-3 rounded-xl border border-studio-line bg-[#f7f7f1] p-3">
      <NumberField label={t.style.tileSize} value={style.floorTileSize ?? DEFAULT_FLOOR_TILE_SIZE}
        min={FLOOR_TILE_SIZE_LIMITS.min} max={FLOOR_TILE_SIZE_LIMITS.max} onCommit={(floorTileSize) => setStyle({ floorTileSize })} />
      <RoomColorPicker label={t.style.groutColor} value={style.floorGroutColor ?? DEFAULT_FLOOR_GROUT_COLOR} onChange={(floorGroutColor) => setStyle({ floorGroutColor })} />
      <p className="text-xs leading-relaxed text-studio-muted">{t.style.floorTilesNote}</p>
    </div>}
    <p className="text-xs leading-relaxed text-studio-muted">{t.style.roomColorNote}</p>
  </div>;
}
