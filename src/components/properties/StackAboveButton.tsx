import { ArrowUp } from 'lucide-react';
import { useId, useState } from 'react';
import { canStackCabinet, planCabinetAbove, type StackError } from '../../domain/upperCabinets';
import type { KitchenItem } from '../../domain/types';
import { useT } from '../../i18n';
import { stackCabinetAbove } from '../../store/actions';
import { useDesignStore } from '../../store/designStore';
import { Button } from '../ui';

export function StackAboveButton({ item, iconOnly = false }: { item: KitchenItem; iconOnly?: boolean }) {
  const t = useT();
  const design = useDesignStore((state) => state.design);
  const [failure, setFailure] = useState<{ id: string; reason: StackError } | null>(null);
  const hintId = useId();
  if (!canStackCabinet(item)) return null;
  const plan = planCabinetAbove(design.room, design.items, item, design.openings);
  const error = failure?.id === item.id ? failure.reason : null;
  const reason = error ?? (!plan.ok ? plan.reason : null);
  return (
    <div className={iconOnly ? 'relative inline-flex' : 'space-y-2'}>
      <Button
        variant="outline"
        aria-label={t.stacking.addAbove}
        aria-describedby={reason ? hintId : undefined}
        title={reason ? t.stacking.errors[reason] : t.stacking.addAbove}
        disabled={!plan.ok}
        onClick={() => {
          const result = stackCabinetAbove(item.id);
          setFailure(result.ok ? null : { id: item.id, reason: result.reason });
        }}
      >
        <ArrowUp className="size-4" />
        {!iconOnly && t.stacking.addAbove}
      </Button>
      {reason && (
        <p id={hintId} role={error ? 'alert' : undefined} className={iconOnly && !error ? 'sr-only' : iconOnly ? 'absolute left-0 top-full z-10 mt-2 w-64 rounded-md bg-red-50 p-2 text-xs text-red-800' : 'text-xs leading-relaxed text-zinc-600'}>
          {t.stacking.errors[reason]}
        </p>
      )}
    </div>
  );
}
