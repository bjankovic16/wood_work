import { PLINTH_HEIGHT } from '../../domain/catalog';
import type { KitchenItem } from '../../domain/types';
import { resolveConfig, type BuildContext } from '../../engine/config';
import { frontLayout, OVEN_NICHE_HEIGHT, TOWER_OVEN_BOTTOM, type FrontRect } from '../../engine/fronts';
import { useT } from '../../i18n';

const MAX_W = 236;
const MAX_H = 150;

/**
 * Front view of one unit, drawn from the same front layout the cutting list
 * uses: doors with the usual swing lines (pointing to the hinges), drawers,
 * and dashed shelves behind the doors.
 */
export function FrontPreview({ item, ctx }: { item: KitchenItem; ctx: BuildContext }) {
  const text = useT();
  const { settings } = ctx;
  const config = resolveConfig(item, ctx);
  const fronts = frontLayout(item, config, settings);
  const g = settings.frontGap;
  const W = item.kind === 'corner' ? Math.max(...fronts.map((f) => f.x + f.w)) + g / 2 : item.width;
  const H = item.height;
  const t = config.carcass.thickness;
  const pad = Math.max(W, H) * 0.04;
  const scale = Math.min(MAX_W / (W + 2 * pad), MAX_H / (H + 2 * pad));
  const px = 1 / scale;
  const top = (f: { y: number; h: number }) => H - f.y - f.h;

  // Shelves sit evenly between the bottom and the top of the door area.
  const drawerSpace = fronts.some((f) => f.kind === 'door')
    ? fronts.filter((f) => f.kind === 'drawer').length * (settings.drawerFrontHeight + g)
    : 0;
  const interiorTop = H - t - drawerSpace;
  const shelfLines = Array.from({ length: config.shelves }, (_, i) => t + ((interiorTop - t) * (i + 1)) / (config.shelves + 1));
  const wallUnit = item.elevation >= 1000;

  return (
    <figure className="flex flex-col items-center gap-1 rounded-lg border border-zinc-100 bg-zinc-50 px-2 py-3">
      <svg
        width={(W + 2 * pad) * scale}
        height={(H + 2 * pad) * scale}
        viewBox={`${-pad} ${-pad} ${W + 2 * pad} ${H + 2 * pad}`}
        role="img"
        aria-label={text.item.frontViewAria(W, H)}
      >
        {item.shelfForm === 'floating' ? Array.from({ length: config.shelves + 2 }, (_, i) =>
          <rect key={i} x={0} y={(H - t) * i / (config.shelves + 1)} width={W} height={t} fill="#d6b38b" stroke="#71717a" strokeWidth={px} />)
        : item.kind === 'bar' ? (
          <g stroke="#71717a" strokeWidth={3 * px}>
            <rect x={0} y={0} width={W} height={t} fill="#d6b38b" strokeWidth={px} />
            <line x1={W * 0.06} x2={W * 0.06} y1={t} y2={H} />
            <line x1={W * 0.94} x2={W * 0.94} y1={t} y2={H} />
          </g>
        ) : item.kind === 'fridge' ? (
          <Fridge W={W} H={H} px={px} />
        ) : (
          <rect x={0} y={0} width={W} height={H} fill="#f4f4f5" stroke="#a1a1aa" strokeWidth={px} />
        )}
        {item.shelfForm !== 'floating' && shelfLines.map((y) => (
          <line key={y} x1={t} x2={W - t} y1={H - y} y2={H - y} stroke="#a1a1aa" strokeWidth={px} strokeDasharray={`${4 * px} ${3 * px}`} />
        ))}
        {item.kind === 'oven' && <Oven W={W} px={px} />}
        {item.kind === 'ovenTower' && <g transform={`translate(0 ${H - TOWER_OVEN_BOTTOM - OVEN_NICHE_HEIGHT})`}><Oven W={W} px={px} /></g>}
        {item.kind === 'dishwasher' && (
          <rect x={0} y={H - PLINTH_HEIGHT} width={W} height={PLINTH_HEIGHT} fill="#e4e4e7" stroke="none" />
        )}
        {fronts.map((front, i) => (
          <Front key={i} front={front} top={top(front)} px={px} handleLow={wallUnit} glass={item.kind === 'glassWall'} />
        ))}
      </svg>
      <figcaption className="text-[11px] tabular-nums text-zinc-500">{text.item.frontViewCaption(text.mm(W), text.mm(H))}</figcaption>
    </figure>
  );
}

function Front({ front, top, px, handleLow, glass }: { front: FrontRect; top: number; px: number; handleLow: boolean; glass: boolean }) {
  const { x, w, h } = front;
  const handle = Math.min(w, h) * 0.28;
  return (
    <g>
      <rect x={x} y={top} width={w} height={h} fill={glass ? '#cce0df' : '#ffffff'} fillOpacity={glass ? 0.4 : 1} stroke="#52525b" strokeWidth={1.2 * px} />
      {glass && <path d={`M${x + w * 0.2} ${top + h * 0.25}l${w * 0.35} ${-h * 0.15}m${-w * 0.2} ${h * 0.3}l${w * 0.35} ${-h * 0.15}`} fill="none" stroke="#8ba9a6" strokeWidth={px} />}
      {front.kind === 'door' && (
        <>
          {/* Swing lines meet at the hinge side. */}
          <polyline
            points={
              front.hinge === 'left'
                ? `${x + w},${top} ${x},${top + h / 2} ${x + w},${top + h}`
                : `${x},${top} ${x + w},${top + h / 2} ${x},${top + h}`
            }
            fill="none"
            stroke="#a1a1aa"
            strokeWidth={px}
            strokeDasharray={`${5 * px} ${4 * px}`}
          />
          <line
            x1={front.hinge === 'left' ? x + w - 6 * px : x + 6 * px}
            x2={front.hinge === 'left' ? x + w - 6 * px : x + 6 * px}
            y1={handleLow ? top + h - 8 * px - handle : top + 8 * px}
            y2={handleLow ? top + h - 8 * px : top + 8 * px + handle}
            stroke="#3f3f46"
            strokeWidth={2.4 * px}
            strokeLinecap="round"
          />
        </>
      )}
      {front.kind === 'drawer' && (
        <line
          x1={x + w / 2 - Math.min(w * 0.2, 60)}
          x2={x + w / 2 + Math.min(w * 0.2, 60)}
          y1={top + Math.min(h * 0.3, 40)}
          y2={top + Math.min(h * 0.3, 40)}
          stroke="#3f3f46"
          strokeWidth={2.4 * px}
          strokeLinecap="round"
        />
      )}
    </g>
  );
}

function Oven({ W, px }: { W: number; px: number }) {
  const inset = 6 * px;
  return (
    <g>
      <rect x={inset} y={inset} width={W - 2 * inset} height={OVEN_NICHE_HEIGHT - 2 * inset} rx={8 * px} fill="#27272a" />
      <rect x={W * 0.12} y={OVEN_NICHE_HEIGHT * 0.28} width={W * 0.76} height={OVEN_NICHE_HEIGHT * 0.52} rx={10 * px} fill="#52525b" />
      <line x1={W * 0.2} x2={W * 0.8} y1={OVEN_NICHE_HEIGHT * 0.16} y2={OVEN_NICHE_HEIGHT * 0.16} stroke="#d4d4d8" strokeWidth={3 * px} strokeLinecap="round" />
    </g>
  );
}

function Fridge({ W, H, px }: { W: number; H: number; px: number }) {
  const split = H * 0.36;
  return (
    <g>
      <rect x={0} y={0} width={W} height={H} rx={24 * px} fill="#f8fafc" stroke="#71717a" strokeWidth={1.2 * px} />
      <line x1={0} x2={W} y1={split} y2={split} stroke="#71717a" strokeWidth={px} />
      <line x1={W - 40 * px} x2={W - 40 * px} y1={split - 70 * px} y2={split - 10 * px} stroke="#3f3f46" strokeWidth={3 * px} strokeLinecap="round" />
      <line x1={W - 40 * px} x2={W - 40 * px} y1={split + 10 * px} y2={split + 90 * px} stroke="#3f3f46" strokeWidth={3 * px} strokeLinecap="round" />
    </g>
  );
}
