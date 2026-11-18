import { ArrowLeft, Copy } from 'lucide-react';
import { useMemo, useState } from 'react';
import { polygonArea } from '../../domain/polygons';
import { roomOutline } from '../../domain/roomGeometry';
import type { Design } from '../../domain/types';
import { buildCuttingList } from '../../engine/cuttingList';
import { planSvg } from '../../export/planSvg';
import { useT, type Messages } from '../../i18n';
import { storageWorks } from '../../lib/platform';
import { committedDesign, useDesignStore } from '../../store/designStore';
import { editLayoutVariant, projectDesign, useProjectsStore } from '../../store/projects';
import { Button } from '../ui';

function summary(design: Design, t: Messages) {
  const plan = planSvg(design, t.engine), cuts = buildCuttingList(design, t.engine);
  const area = (m2: number) => `${t.number(Math.round(m2 * 100) / 100)} m²`;
  return {
    name: design.name, width: plan.width, height: plan.height, image: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(plan.svg)}`,
    values: [area(polygonArea(roomOutline(design.room)) / 1e6), design.items.length, cuts.pieceCount, area(cuts.materials.reduce((sum, m) => sum + m.area, 0))],
  };
}

function ComparedPlans({ current, other }: { current: Design; other: Design }) {
  const t = useT(), p = t.planner;
  const a = useMemo(() => summary(current, t), [current, t]), b = useMemo(() => summary(other, t), [other, t]);
  // Fit both drawings against the same physical bounds, even when the rooms are different sizes.
  const width = Math.max(a.width, b.width), height = Math.max(a.height, b.height);
  return <>
    <div className="grid grid-cols-2 gap-2">{[a, b].map((s, i) => <figure key={i} className="min-w-0 overflow-hidden rounded-xl border border-studio-line">
      <div className="grid h-32 place-items-center bg-studio-canvas p-1 sm:h-56">
        <img alt={p.planOf(s.name)} src={s.image} className="object-contain"
          style={{ width: `${100 * s.width / width}%`, height: `${100 * s.height / height}%` }} />
      </div>
      <figcaption className="p-2 text-sm"><small className="block text-studio-muted">{i ? `B · ${p.alternative}` : `A · ${p.current}`}</small>
        <strong className="[overflow-wrap:anywhere]">{s.name}</strong></figcaption>
    </figure>)}</div>
    <table className="w-full table-fixed text-sm tabular-nums">
      <caption className="sr-only">{p.compare}</caption>
      <thead><tr className="text-studio-muted"><th className="w-1/2" /><th scope="col" aria-label={`A: ${a.name}`}>A</th><th scope="col" aria-label={`B: ${b.name}`}>B</th></tr></thead>
      <tbody>{[t.room.area, p.units, p.pieces, p.boardArea].map((label, i) => <tr key={label} className="border-t border-studio-line">
        <th scope="row" className="py-2 text-left font-medium">{label}</th>
        <td className="text-center">{a.values[i]}</td><td className="text-center">{b.values[i]}</td>
      </tr>)}</tbody>
    </table>
  </>;
}

export function ProjectComparison({ close, back, backLabel }: { close: () => void; back: () => void; backLabel: string }) {
  const t = useT(), p = t.planner;
  const current = useDesignStore(committedDesign);
  const { activeId, projects } = useProjectsStore();
  const [picked, setPicked] = useState(''), [failed, setFailed] = useState(false);
  const choices = projects.filter((m) => m.id !== activeId).sort((a, b) => b.updatedAt - a.updatedAt);
  const meta = choices.find((m) => m.id === picked) ?? choices[0];
  const other = useMemo(() => meta ? projectDesign(meta.id) : null, [meta]);
  return <div className="mx-auto max-w-3xl space-y-4 p-4">
    <Button className="min-h-11" onClick={back}><ArrowLeft size={16} />{backLabel}</Button>
    <p className="text-sm text-studio-muted">{meta ? p.compareHint : p.empty}</p>
    {meta && <label className="block space-y-1 text-sm font-medium"><span>{p.choose}</span>
      <select value={meta.id} onChange={(e) => setPicked(e.target.value)}
        className="block min-h-11 w-full rounded-lg border border-studio-line bg-studio-paper px-2 text-base">
        {choices.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
    </label>}
    {other ? <ComparedPlans current={current} other={other} /> : meta && <p role="alert">{p.unavailable}</p>}
    <div className="space-y-2 border-t border-studio-line pt-3">
      <Button variant="primary" className="h-auto min-h-11" onClick={() => {
        if (editLayoutVariant()) close(); else setFailed(true);
      }}><Copy size={16} />{p.editCopy}</Button>
      <p className="text-xs text-studio-muted">{p.copyHint}</p>
      {!storageWorks && <p role="note" className="text-xs text-amber-900">{t.projects.notKept}</p>}
      {failed && <p role="alert">{p.copyFailed}</p>}
    </div>
  </div>;
}
