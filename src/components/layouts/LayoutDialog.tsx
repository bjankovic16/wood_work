import { LAYOUTS, type LayoutId } from '../../domain/templates';
import { useIsCompact } from '../../hooks/useMediaQuery';
import { applyLayout } from '../../store/actions';
import { useDesignStore } from '../../store/designStore';
import { useUiStore } from '../../store/uiStore';
import { Dialog } from '../ui';

/** Small top views of each layout: grey runs of floor units against the walls. */
function LayoutSketch({ id }: { id: LayoutId }) {
  const run = 'fill-zinc-300 stroke-zinc-500';
  return (
    <svg viewBox="0 0 64 48" className="h-12 w-16" aria-hidden>
      <rect x="2" y="2" width="60" height="44" rx="2" className="fill-white stroke-zinc-300" strokeWidth="1.5" />
      {id === 'straight' && <rect x="2" y="2" width="60" height="10" className={run} strokeWidth="1" />}
      {id === 'l-shape' && <path d="M2 2h60v10H12v34H2Z" className={run} strokeWidth="1" />}
      {id === 'u-shape' && <path d="M2 2h60v34H52V12H12v24H2Z" className={run} strokeWidth="1" />}
    </svg>
  );
}

/** Start from a complete kitchen that fits the room, like a planner's ready-made kitchens. */
export function LayoutDialog() {
  const open = useUiStore((s) => s.layoutsOpen);
  const count = useDesignStore((s) => s.design.items.length);
  const room = useDesignStore((s) => s.design.room);
  const compact = useIsCompact();
  const close = () => useUiStore.getState().setLayoutsOpen(false);

  return (
    <Dialog open={open} title="Ready-made layouts" sheet={compact} onClose={close}>
      <div className="space-y-2 p-4 pb-[max(env(safe-area-inset-bottom),16px)]">
        <p className="pb-1 text-[13px] leading-relaxed text-zinc-600">
          A starting point sized for your {room.width} × {room.depth} mm room, built from standard cabinet widths. Change
          anything afterwards.
          {count > 0 && <span className="font-medium text-zinc-800"> It replaces the {count} elements on the plan; Undo brings them back.</span>}
        </p>
        {LAYOUTS.map((layout) => (
          <button
            key={layout.id}
            type="button"
            onClick={() => {
              applyLayout(layout.id);
              close();
            }}
            className="flex w-full touch-manipulation items-center gap-4 rounded-xl border border-zinc-200 bg-white p-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/40"
          >
            <LayoutSketch id={layout.id} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-zinc-900">{layout.name}</span>
              <span className="block text-xs leading-snug text-zinc-500">{layout.description}</span>
            </span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}
