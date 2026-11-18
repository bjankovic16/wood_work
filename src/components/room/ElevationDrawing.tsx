import { useId } from 'react';
import { hasWorktop, WORKTOP_THICKNESS } from '../../domain/catalog';
import { mountedSpan } from '../../domain/geometry';
import { DEFAULT_WALL_COLOR, FRONT_FINISHES, WORKTOP_FINISHES } from '../../domain/style';
import type { KitchenStyle } from '../../domain/style';
import type { Opening } from '../../domain/types';
import type { WallSegment } from '../../domain/walls';
import { buildContext, resolveConfig } from '../../engine/config';
import { frontLayout } from '../../engine/fronts';
import { useDesignStore } from '../../store/designStore';
import { drawingButton } from './RoomPlan';

/** Dimension lines are in millimetres; labels and hit areas stay in screen pixels. */
export function ElevationRuler({ x, y, vertical = false, length, px, label, edit }: {
  x: number; y: number; vertical?: boolean; length: number; px: number; label: string; edit?: () => void;
}) {
  const half = length / (2 * px);
  const value = `${Math.round(length)} mm`;
  const width = value.length * 7.3 + 12;
  return <g transform={`translate(${x} ${y}) rotate(${vertical ? -90 : 0}) scale(${px})`}>
    <path d={`M${-half} -4v8m0 -4H${half}m0 -4v8`} stroke="#74877b" fill="none" pointerEvents="none" />
    <g {...(edit ? drawingButton(`${label}: ${value}`, edit) : {})} className={edit ? 'room-ruler-button' : undefined}>
      {edit && <rect x={-width / 2} y="-22" width={width} height="44" fill="transparent" />}
      <rect x={-width / 2} y="-10" width={width} height="20" rx="6" fill="#fffefa" stroke="#bccbc1" />
      <text y="4" textAnchor="middle" fontSize="12" fontWeight="650" fill="#304e40">{value}</text>
    </g>
  </g>;
}

export function ElevationBackdrop({ wall, height, px }: { wall: WallSegment; height: number; px: number }) {
  const design = useDesignStore((s) => s.design);
  const { room, style, items } = design;
  const ctx = buildContext(design);
  const id = useId();
  const top = height - wall.height, w = wall.length;
  return <g pointerEvents="none" aria-hidden="true">
    <defs>
      <pattern id={`${id}-grid`} width="500" height="500" patternUnits="userSpaceOnUse" y={height}>
        <path d="M0 500V0H500" fill="none" stroke="#3b5146" strokeOpacity=".22" strokeWidth={px} />
      </pattern>
      <pattern id={`${id}-floor`} width={6 * px} height={6 * px} patternUnits="userSpaceOnUse">
        <path d={`M0 ${6 * px}l${6 * px} ${-6 * px}`} stroke="#a1ac9d" strokeWidth={px} />
      </pattern>
    </defs>
    <rect data-elevation-paint="" y={top} width={w} height={wall.height} fill={style.wallColor ?? DEFAULT_WALL_COLOR} />
    <rect y={top} width={w} height={wall.height} fill={`url(#${id}-grid)`} stroke="#68796f" strokeWidth={px} />
    {room.treatments?.filter((t) => t.wallId === wall.id).map((t) => <rect key={t.id} x={t.offset} y={height - t.elevation - t.height}
      width={t.width} height={t.height} fill={{ ...WORKTOP_FINISHES, ...FRONT_FINISHES }[t.finish].color} stroke="#806e59" strokeWidth={px} />)}
    {items.map((item) => {
      const span = mountedSpan(item, wall);
      if (!span) return null;
      const width = span[1] - span[0], y = height - item.elevation - item.height;
      const fill = FRONT_FINISHES[item.frontFinish ?? style.front].color;
      const config = resolveConfig(item, ctx);
      const floating = item.shelfForm === 'floating';
      // Corner front drawings are unfolded across two walls; only draw flat fronts on their own wall.
      const fronts = item.kind !== 'corner' && Math.abs(width - item.width) < 1.1 ? frontLayout(item, config, ctx.settings) : [];
      return <g key={item.id} data-elevation-cabinet={item.id} transform={`translate(${span[0]} ${y})`}>
        {floating ? Array.from({ length: config.shelves + 2 }, (_, i) =>
          <rect key={i} y={(item.height - config.carcass.thickness) * i / (config.shelves + 1)} width={width} height={config.carcass.thickness}
            fill={FRONT_FINISHES[item.carcassFinish ?? style.front].color} stroke="#6b7066" strokeWidth={px} />)
          : <rect width={width} height={item.height} fill={fill} stroke="#69766b" strokeWidth={px} />}
        {fronts.filter((f) => f.w > 0 && f.h > 0).map((f, i) => <rect key={i} x={f.x} y={item.height - f.y - f.h} width={f.w} height={f.h}
          fill={item.kind === 'glassWall' ? '#d2e0dc' : 'none'} stroke="#69766b" strokeWidth={.7 * px} />)}
        {hasWorktop(item) && <rect y={-WORKTOP_THICKNESS} width={width} height={WORKTOP_THICKNESS} fill={WORKTOP_FINISHES[style.worktop].color} stroke="#566258" strokeWidth={px} />}
        {item.shelfForm !== 'floating' && width / px > item.label.length * 8 + 8 && item.height / px > 18 &&
          <text x={width / 2} y={item.height / 2} textAnchor="middle" dominantBaseline="central" fontSize={10 * px}
            fill="#32463a" stroke="#fffefa" strokeWidth={2 * px} paintOrder="stroke">{item.label}</text>}
      </g>;
    })}
    <rect x={-6 * px} y={height} width={w + 12 * px} height={6 * px} fill={`url(#${id}-floor)`} />
    <path d={`M${-6 * px} ${height}h${w + 12 * px}`} stroke="#526558" strokeWidth={2 * px} />
  </g>;
}

export function OpeningFace({ opening, style, selected, px }: { opening: Opening; style: KitchenStyle; selected: boolean; px: number }) {
  const { width: w, height: h, kind } = opening;
  const win = kind === 'window';
  const frame = win ? style.windowFrame : style.doorFrame;
  const inset = Math.min(42, w / 6, h / 6);
  const leaf = style.doorLeaf ? FRONT_FINISHES[style.doorLeaf].color : '#d6c1a6';
  return <>
    <rect width={w} height={h} fill={frame ? FRONT_FINISHES[frame].color : '#f8f6ef'} stroke={selected ? '#2563eb' : '#586a60'} strokeWidth={(selected ? 2.5 : 1.4) * px} />
    <rect x={inset} y={inset} width={w - 2 * inset} height={h - (win ? 2 : 1) * inset} fill={win ? '#bcdbe0' : leaf} stroke="#73837c" strokeWidth={px} />
    {win ? <g pointerEvents="none">
      <path d={`M${w * .22} ${h * .52}l${w * .12} ${-h * .14}m${-w * .1} ${h * .25}l${w * .14} ${-h * .16}`} stroke="#eef8f7" fill="none" strokeWidth={1.5 * px} />
      <path d={`M${w / 2} ${inset}V${h - inset}`} stroke={frame ? FRONT_FINISHES[frame].color : '#f8f6ef'} strokeWidth={inset * .8} />
    </g> : <path d={`M${w * .73} ${h * .52}h${w * .11}`} stroke="#534d42" strokeWidth={2 * px} strokeLinecap="round" />}
  </>;
}
