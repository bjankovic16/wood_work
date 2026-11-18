import { useEffect, useMemo, useRef, useState } from 'react';
import { fitKitchenLayout } from '../../domain/fitLayout';
import { footprintPieces, isWallMounted } from '../../domain/geometry';
import { KITCHEN_DESIGNS } from '../../domain/kitchens';
import { roomFeaturePolygon, roomOutline } from '../../domain/roomGeometry';
import type { Design, KitchenItem, Point } from '../../domain/types';
import { openingFrame, partitionPolygon, roomSegments, wallPoint } from '../../domain/walls';
import { useT } from '../../i18n';
import { acceptFit } from '../../store/actions';
import { useDesignStore } from '../../store/designStore';
import { useUiStore, type FitRequest } from '../../store/uiStore';
import { Button, Segmented } from '../ui';

const points = (polygon: Point[]) => polygon.map(({ x, y }) => `${x},${y}`).join(' ');

function FitSketch({ design: { room, openings }, items, mainWall }: { design: Design; items: KitchenItem[]; mainWall?: string }) {
  const t = useT();
  const walls = roomSegments(room, false);
  const pad = Math.max(room.width, room.depth) * .1;
  return <svg viewBox={`${-pad} ${-pad} ${room.width + 2 * pad} ${room.depth + 2 * pad}`} role="img" aria-label={t.fit.sketch}
    className="h-52 w-full rounded-lg bg-[#f7f5ef] lg:h-64">
    <polygon points={points(roomOutline(room))} fill="#fffdf7" stroke="#48443d" strokeWidth="35" />
    {items.map((item) => footprintPieces(item).map((part, i) => <polygon key={`${item.id}-${i}`} points={points(part)}
      fill={isWallMounted(item) ? 'none' : '#aec4a7'} stroke="#446343" strokeWidth={isWallMounted(item) ? 10 : 18} strokeDasharray={isWallMounted(item) ? '50 25' : undefined} />))}
    {room.features?.map((f) => <polygon key={f.id} points={points(roomFeaturePolygon(room, f))} fill="#a38e78" />)}
    {room.partitions?.map((p) => <polygon key={p.id} points={points(partitionPolygon(p))} fill="#a38e78" />)}
    {openings.map((o) => {
      const frame = openingFrame(room, o);
      if (!frame) return null;
      const a = wallPoint(frame, o.offset), b = wallPoint(frame, o.offset + o.width);
      return <line key={o.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={o.kind === 'window' ? '#589cb9' : '#ca925e'} strokeWidth="70" />;
    })}
    {walls.map((s, i) => {
      const p = wallPoint(s, s.length / 2, -pad * .5);
      return <text key={s.id} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" fontSize={pad * .37}
        fill={s.id === mainWall ? '#215e34' : '#695f52'} fontWeight={s.id === mainWall ? 800 : 400}>{i + 1}</text>;
    })}
  </svg>;
}

export function IdeaFitReview({ request }: { request: FitRequest }) {
  const t = useT();
  const design = useDesignStore((s) => s.design);
  const selectedWall = useUiStore((s) => s.selectedWallId);
  const walls = useMemo(() => roomSegments(design.room, false), [design.room]);
  const [mainWallId, setWall] = useState(walls.some((s) => s.id === selectedWall) ? selectedWall! : '');
  const [side, setSide] = useState<'left' | 'right'>('left');
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const source = request.type === 'starter' ? request.id : KITCHEN_DESIGNS.find((preset) => preset.id === request.id)!;
  // Only an explicitly chosen starter replaces cabinets. Gallery ideas never use this path on an occupied plan.
  const fit = useMemo(() => fitKitchenLayout(request.type === 'starter' ? { ...design, items: [] } : design, source,
    { mainWallId: mainWallId || undefined, side, prefixes: t.labelPrefix }), [request.type, design, source, mainWallId, side, t.labelPrefix]);
  const layout = typeof source === 'string' ? source : source.layout;
  return <section className="space-y-4 p-4 sm:p-6">
    <Button variant="outline" onClick={() => useUiStore.getState().reviewFit(null)}>← {t.fit.back}</Button>
    <h3 ref={heading} tabIndex={-1} className="text-lg font-semibold outline-none">
      {t.fit.title} · {request.type === 'idea' ? t.kitchens.names[request.id] : t.layouts.names[request.id].name}
    </h3>
    <div className="grid gap-4 sm:grid-cols-2">
      <FitSketch design={design} items={fit.items} mainWall={fit.mainWallId} />
      <div className="space-y-3">
        <label className="block space-y-1 text-sm font-medium">{t.fit.main}
          <select aria-label={t.fit.main} className="block min-h-11 w-full rounded-lg border p-2" value={mainWallId} onChange={(e) => setWall(e.target.value)}>
            <option value="">{t.fit.auto}</option>
            {walls.map((s, i) => <option key={s.id} value={s.id}>{t.advancedRoom.wall(i + 1)} · {Math.round(s.length)} mm</option>)}
          </select>
        </label>
        {layout === 'l-shape' && <div>
          <p className="mb-1 text-sm font-medium">{t.fit.side}</p>
          <Segmented ariaLabel={t.fit.side} value={side} onChange={setSide} options={[{ value: 'left', label: t.fit.left }, { value: 'right', label: t.fit.right }]} />
        </div>}
        <p role="status" className="rounded-lg bg-studio-canvas p-3 text-sm">{fit.status === 'cannot-fit'
          ? `${t.fit.noFit} ${t.fit.reasons[fit.reason ?? 'space']}` : t.fit.fitted(fit.items.length)}</p>
      </div>
    </div>
    {fit.changes.length > 0 && <details className="rounded-lg border p-3 text-sm">
      <summary className="cursor-pointer font-medium">{t.fit.changes} ({fit.changes.length})</summary>
      <ul className="mt-2 max-h-44 space-y-1 overflow-y-auto">{fit.changes.map((c, i) => <li key={i}>
        {t.kinds[c.kind]} {c.label}: {c.type === 'omitted' ? t.fit.omitted :
          [c.fromWidth !== c.toWidth && c.toWidth !== undefined ? `${Math.round(c.fromWidth)} → ${Math.round(c.toWidth)} mm` : '',
            c.fromHeight !== c.toHeight && c.toHeight !== undefined ? `${t.room.height}: ${Math.round(c.fromHeight!)} → ${Math.round(c.toHeight)} mm` : ''].filter(Boolean).join(', ')}. {t.fit.reasons[c.reason]}
      </li>)}</ul>
    </details>}
    {request.type === 'starter' && design.items.length > 0 && <p className="text-sm">{t.layouts.replaces(design.items.length)}</p>}
    <Button variant="primary" data-testid="confirm-idea-fit" className="min-h-11" disabled={fit.status === 'cannot-fit'} onClick={() => acceptFit(design, request, fit)}>{t.fit.confirm}</Button>
  </section>;
}
