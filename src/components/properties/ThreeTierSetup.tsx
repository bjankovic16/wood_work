import { useState } from 'react';
import { canBuildThreeTier, DEFAULT_THREE_TIER, planThreeTier } from '../../domain/upperCabinets';
import type { KitchenItem } from '../../domain/types';
import { useT } from '../../i18n';
import { addThreeTierRun } from '../../store/actions';
import { useDesignStore } from '../../store/designStore';
import { Button, PanelSection } from '../ui';
import { NumberField } from './NumberField';

export function ThreeTierSetup({ item }: { item: KitchenItem }) {
  const t = useT();
  const design = useDesignStore((s) => s.design);
  const [options, setOptions] = useState(DEFAULT_THREE_TIER);
  const [failed, setFailed] = useState(false);
  if (!canBuildThreeTier(item)) return null;
  const plan = planThreeTier(design.room, design.items, item, options, design.openings);
  return <PanelSection title={t.threeTier.title}>
    <details>
      <summary className="cursor-pointer rounded py-1 text-xs font-medium text-stone-700">{t.threeTier.setup}</summary>
      <div className="space-y-2 pt-3">
        {(['middleHeight', 'topHeight', 'middleDepth', 'topDepth'] as const).map((field) =>
          <NumberField key={field} label={t.threeTier[field]} value={options[field]}
            min={field.endsWith('Height') ? 200 : 150} max={field.endsWith('Height') ? 1200 : 600}
            onCommit={(value) => { setOptions({ ...options, [field]: value }); setFailed(false); }} />)}
        {plan.ok ? <p className="text-xs leading-relaxed text-stone-600">{t.threeTier.preview(plan.cabinets.length, plan.cabinets[0].elevation)}</p>
          : <p role="status" className="text-xs text-amber-800">{t.stacking.errors[plan.reason]}</p>}
        <Button variant="primary" disabled={!plan.ok} onClick={() => setFailed(!addThreeTierRun(item.id, options).ok)}>{t.threeTier.add}</Button>
        {failed && <p role="alert" className="text-xs text-red-700">{t.stacking.errors.blocked}</p>}
        <p className="text-xs leading-relaxed text-stone-500">{t.threeTier.note}</p>
      </div>
    </details>
  </PanelSection>;
}
