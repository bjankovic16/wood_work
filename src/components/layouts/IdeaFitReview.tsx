import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { footprintPieces, isWallMounted } from '../../domain/geometry';
import { KITCHEN_DESIGNS } from '../../domain/kitchens';
import { roomFeaturePolygon, roomOutline } from '../../domain/roomGeometry';
import { FRONT_FINISHES, WORKTOP_FINISHES } from '../../domain/style';
import type { Design, KitchenItem, Point } from '../../domain/types';
import { openingFrame, partitionPolygon, roomSegments, wallPoint } from '../../domain/walls';
import { useT } from '../../i18n';
import { acceptFit } from '../../store/actions';
import { useDesignStore } from '../../store/designStore';
import { preferredIdeaWall, prepareIdeaReview } from '../../store/ideaReview';
import { useUiStore, type FitRequest } from '../../store/uiStore';
import { Button, Segmented } from '../ui';
import { drawingButton } from '../room/RoomPlan';
import { useDrawingSize } from '../room/useDrawingSize';
import { ModelBoundary } from '../three/ModelPreviewFallback';

const IdeaModel = lazy(() => import('./IdeaModel'));
const points = (polygon: Point[]) => polygon.map(({ x, y }) => `${x},${y}`).join(' ');

function FitSketch({ design: { room, openings, style }, items, mainWall, onSelect }: {
  design: Design; items: KitchenItem[]; mainWall?: string; onSelect?: (wall: string) => void;
}) {
  const t = useT();
  const walls = roomSegments(room, false);
  const { ref, width, height } = useDrawingSize();
  const scale = Math.max(room.width / Math.max(1, width - 58), room.depth / Math.max(1, height - 58));
  const w = width * scale, h = height * scale;
  return <div ref={ref} className="h-64 w-full min-w-0 rounded-xl bg-[#f7f5ef]">
    <svg viewBox={`${(room.width - w) / 2} ${(room.depth - h) / 2} ${w} ${h}`} role={onSelect ? 'group' : 'img'} aria-label={t.fit.sketch}
    className="h-full w-full">
    <polygon points={points(roomOutline(room))} fill="#fffdf7" stroke="#48443d" strokeWidth="35" />
    {items.map((item) => footprintPieces(item).map((part, i) => <polygon key={`${item.id}-${i}`} points={points(part)}
      fill={isWallMounted(item) ? 'none' : FRONT_FINISHES[item.frontFinish ?? style.front].color} stroke="#446343" strokeWidth={isWallMounted(item) ? 10 : 18} strokeDasharray={isWallMounted(item) ? '50 25' : undefined} />))}
    {room.features?.map((f) => <polygon key={f.id} points={points(roomFeaturePolygon(room, f))} fill="#a38e78" />)}
    {room.partitions?.map((p) => <polygon key={p.id} points={points(partitionPolygon(p))} fill="#a38e78" />)}
    {openings.map((o) => {
      const frame = openingFrame(room, o);
      if (!frame) return null;
      const a = wallPoint(frame, o.offset), b = wallPoint(frame, o.offset + o.width);
      return <line key={o.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={o.kind === 'window' ? '#589cb9' : '#ca925e'} strokeWidth="70" />;
    })}
    {walls.map((s, i) => {
      if (!onSelect) return null;
      const a = wallPoint(s, 0), b = wallPoint(s, s.length), p = wallPoint(s, s.length / 2);
      const selected = s.id === mainWall;
      return <g key={s.id} {...drawingButton(`${t.advancedRoom.wall(i + 1)} · ${Math.round(s.length)} mm`, () => onSelect(s.id))}
        data-fit-wall={s.id} aria-pressed={selected}>
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={44 * scale} strokeLinecap="round" />
        {selected && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#32613e" strokeWidth={4 * scale} />}
        <circle cx={p.x} cy={p.y} r={11 * scale} fill={selected ? '#32613e' : '#fffdf7'} stroke="#537055" strokeWidth={scale} />
        <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" fontSize={13 * scale}
          fill={selected ? 'white' : '#304e35'} fontWeight={700}>{i + 1}</text>
      </g>;
    })}
  </svg></div>;
}

export function IdeaFitReview({ request }: { request: FitRequest }) {
  const t = useT();
  const design = useDesignStore((s) => s.design);
  const selectedWall = useUiStore((s) => s.selectedWallId);
  const walls = useMemo(() => roomSegments(design.room, false), [design.room]);
  const [mainWallId, setWall] = useState(() => preferredIdeaWall(design.room, selectedWall) ?? '');
  const [side, setSide] = useState<'left' | 'right'>('left');
  const [referenceRoomLook, setReferenceRoomLook] = useState<boolean>();
  const [preview, setPreview] = useState<'plan' | '3d'>('plan');
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const source = request.type === 'starter' ? request.id : KITCHEN_DESIGNS.find((preset) => preset.id === request.id)!;
  const review = useMemo(() => prepareIdeaReview(design, request, { mainWallId: mainWallId || undefined, side, referenceRoomLook, prefixes: t.labelPrefix }, t.engine),
    [design, request, mainWallId, side, referenceRoomLook, t]);
  const { fit, issues, appearanceOnly } = review;
  const look = appearanceOnly ? review.candidate?.style : undefined;
  const activeWall = walls.findIndex((s) => s.id === fit?.mainWallId);
  const layout = typeof source === 'string' ? source : source.layout;
  const sketch = <FitSketch design={review.candidate ?? design} items={review.candidate?.items ?? []} mainWall={fit?.mainWallId} onSelect={appearanceOnly ? undefined : setWall} />;
  const fallback = <><p role="status" className="text-sm">{t.fit.modelFallback}</p>{sketch}</>;
  return <section className="space-y-4 p-4 sm:p-6">
    <Button variant="outline" onClick={() => useUiStore.getState().reviewFit(null)}>← {t.fit.back}</Button>
    <h3 ref={heading} tabIndex={-1} className="text-lg font-semibold outline-none">
      {appearanceOnly ? t.fit.appearance : t.fit.title} · {request.type === 'idea' ? t.kitchens.names[request.id] : t.layouts.names[request.id].name}
    </h3>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="min-w-0 space-y-2">
        {review.candidate && <Segmented ariaLabel={t.fit.preview} value={preview} onChange={setPreview}
          options={[{ value: 'plan', label: t.room.plan }, { value: '3d', label: t.fit.model }]} />}
        {review.candidate && preview === '3d' ? <ModelBoundary fallback={fallback}><Suspense fallback={<p role="status">{t.view3d.loading}</p>}>
          <IdeaModel design={review.candidate} fallback={fallback} />
        </Suspense></ModelBoundary> : sketch}
      </div>
      <div className="space-y-3">
        {appearanceOnly && <p className="text-sm">{t.fit.keepInstalled(design.items.length)}</p>}
        {review.offersRoomLook && <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm"><input type="checkbox"
          checked={review.referenceRoomLook} onChange={(e) => setReferenceRoomLook(e.target.checked)} />{t.fit.referenceRoomLook}</label>}
        {look && review.candidate && <div className="space-y-2 text-sm text-studio-muted">
          {[...new Set(review.candidate.items.map((i) => i.frontFinish ?? look.front))].map((front) =>
            <p key={front} className="flex items-center gap-2"><span className="size-5 rounded-full border border-black/10" style={{ backgroundColor: FRONT_FINISHES[front].color }} />
              {t.style.fronts}: {t.style.frontFinishes[front]}</p>)}
          <p className="flex items-center gap-2"><span className="size-5 rounded-full border border-black/10" style={{ backgroundColor: WORKTOP_FINISHES[look.worktop].color }} />
            {t.style.worktop}: {t.style.worktopFinishes[look.worktop]}</p>
        </div>}
        {fit && <>
        <label className="block space-y-1 text-sm font-medium">{t.fit.main}
          <select aria-label={t.fit.main} className="block min-h-11 w-full rounded-lg border p-2" value={mainWallId} onChange={(e) => setWall(e.target.value)}>
            <option value="">{t.fit.auto}</option>
            {walls.map((s, i) => <option key={s.id} value={s.id}>{t.advancedRoom.wall(i + 1)} · {Math.round(s.length)} mm</option>)}
          </select>
        </label>
        {activeWall >= 0 && <p className="text-xs font-medium text-studio-muted">{t.advancedRoom.wall(activeWall + 1)} · {Math.round(walls[activeWall].length)} mm</p>}
        {layout === 'l-shape' && <div>
          <p className="mb-1 text-sm font-medium">{t.fit.side}</p>
          <Segmented ariaLabel={t.fit.side} value={side} onChange={setSide} options={[{ value: 'left', label: t.fit.left }, { value: 'right', label: t.fit.right }]} />
        </div>}
        <p role="status" className="rounded-lg bg-studio-canvas p-3 text-sm">{fit.status === 'cannot-fit'
          ? `${t.fit.noFit} ${t.fit.reasons[fit.reason ?? 'space']}` : t.fit.fitted(fit.items.length)}</p></>}
      </div>
    </div>
    {fit && fit.changes.length > 0 && <details data-testid="fit-adjustments" className="rounded-lg border text-sm">
      <summary className="cursor-pointer font-medium">{t.fit.changes} ({fit.changes.length})</summary>
      <ul className="max-h-44 space-y-1 overflow-y-auto px-3 pb-3">{fit.changes.map((c, i) => <li key={i}>
        {t.kinds[c.kind]} {c.label}: {c.type === 'added' ? `${t.fit.added} (${c.toWidth} mm)` : c.type === 'omitted' ? t.fit.omitted :
          [c.fromWidth !== c.toWidth && c.toWidth !== undefined ? `${Math.round(c.fromWidth)} → ${Math.round(c.toWidth)} mm` : '',
            c.fromHeight !== c.toHeight && c.toHeight !== undefined ? `${t.room.height}: ${Math.round(c.fromHeight!)} → ${Math.round(c.toHeight)} mm` : ''].filter(Boolean).join(', ')}. {t.fit.reasons[c.reason]}
      </li>)}</ul>
    </details>}
    {review.candidate && <div data-testid="fit-checks" data-issues={issues.length} className={`rounded-xl border p-3 text-sm ${issues.length ? 'border-amber-300 bg-amber-50' : 'border-green-200 bg-green-50'}`}>
      <p className="font-semibold">{t.checks.checks} · {issues.length ? t.fit.remaining(issues.length) : t.fit.clear}</p>
      {issues.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5">{issues.map((issue) => <li key={issue.key}>{issue.message}</li>)}</ul>}
    </div>}
    {request.type === 'starter' && design.items.length > 0 && <p className="text-sm">{t.layouts.replaces(design.items.length)}</p>}
    <Button variant="primary" data-testid="confirm-idea-fit" className="min-h-11" disabled={!review.candidate || review.candidate === design}
      onClick={() => acceptFit(review)}>{review.candidate === design ? t.fit.alreadyApplied : appearanceOnly ? t.fit.applyLook : t.fit.confirm}</Button>
  </section>;
}
