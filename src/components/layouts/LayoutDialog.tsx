import { ArrowRight, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { KITCHEN_DESIGNS, kitchenCategory, type KitchenCategory } from '../../domain/kitchens';
import { LAYOUTS, type LayoutId } from '../../domain/templates';
import { useIsCompact } from '../../hooks/useMediaQuery';
import { useT } from '../../i18n';
import { applyKitchenDesign, applyLayout } from '../../store/actions';
import { useDesignStore } from '../../store/designStore';
import { useUiStore } from '../../store/uiStore';
import { Button, Dialog, Segmented } from '../ui';
import { PhotoReferenceGallery } from '../references/PhotoReferences';

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

function KitchenCard({ kitchen, onClose }: { kitchen: (typeof KITCHEN_DESIGNS)[number]; onClose: () => void }) {
  const t = useT();
  const [previewFailed, setPreviewFailed] = useState(false);
  const name = t.kitchens.names[kitchen.id];
  return (
    <button
      type="button"
      data-kitchen-design={kitchen.id}
      aria-label={t.kitchens.open(name)}
      onClick={() => {
        applyKitchenDesign(kitchen);
        onClose();
      }}
      className="group min-w-0 overflow-hidden rounded-xl border border-zinc-200 bg-white text-left transition-colors hover:border-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      {previewFailed ? (
        <span role="alert" className="flex aspect-3/2 items-center justify-center bg-zinc-100 p-6 text-sm text-red-700">
          {t.kitchens.previewUnavailable}
        </span>
      ) : (
        <img
          src={`${import.meta.env.BASE_URL}kitchens/${kitchen.id}.jpg`}
          alt=""
          width={900}
          height={600}
          loading="lazy"
          onError={() => setPreviewFailed(true)}
          className="aspect-3/2 w-full bg-[#ebe8e3] object-cover"
        />
      )}
      <span className="block p-3">
        <span className="flex items-center justify-between gap-2 text-sm font-semibold text-zinc-900">
          {name}
          <ArrowRight className="size-4 shrink-0 text-zinc-400 group-hover:text-blue-600" />
        </span>
        <span className="mt-1 block text-xs text-zinc-600">
          {t.style.frontFinishes[kitchen.style.front]} · {t.style.worktopFinishes[kitchen.style.worktop]}
        </span>
        {'layered' in kitchen && <span className="mt-2 inline-flex rounded bg-stone-100 px-2 py-1 text-[11px] font-medium text-stone-700">{t.kitchens.layered}</span>}
        <span className="mt-2 flex flex-wrap justify-between gap-x-2 gap-y-1 text-xs tabular-nums text-zinc-600">
          <span>{kitchenCategory(kitchen) === 'island' ? t.kitchens.island : t.layouts.names[kitchen.layout].name}</span>
          <span>{t.kitchens.roomSize(kitchen.room.width, kitchen.room.depth)}</span>
        </span>
      </span>
    </button>
  );
}

function LayoutChoices({ onClose }: { onClose: () => void }) {
  const t = useT();
  const count = useDesignStore((s) => s.design.items.length);
  const room = useDesignStore((s) => s.design.room);
  const [tab, setTab] = useState<'designs' | 'photos' | 'layouts'>('designs');
  const [filter, setFilter] = useState<KitchenCategory | 'all' | 'layered'>('all');
  const kitchens = KITCHEN_DESIGNS.filter((kitchen) => filter === 'all' || (filter === 'layered' ? 'layered' in kitchen : kitchenCategory(kitchen) === filter));
  const filters: Array<{ value: KitchenCategory | 'all' | 'layered'; label: string }> = [
    { value: 'all', label: t.kitchens.all },
    { value: 'layered', label: t.kitchens.layered },
    ...LAYOUTS.map(({ id }) => ({ value: id, label: t.layouts.names[id].name })),
    { value: 'island', label: t.kitchens.island },
  ];

  return (
    <>
      <div className="sticky top-0 z-10 border-b border-zinc-100 bg-white px-4 py-3">
        <Segmented
          value={tab}
          onChange={setTab}
          ariaLabel={t.layouts.title}
          options={[
            { value: 'designs', label: t.kitchens.browse, title: t.kitchens.gallery },
            { value: 'photos', label: t.references.tab },
            { value: 'layouts', label: t.kitchens.roomTab, ariaLabel: t.kitchens.roomLayouts },
          ]}
        />
      </div>
      {tab === 'designs' ? (
        <div className="space-y-4 p-4 pb-[max(env(safe-area-inset-bottom),16px)]">
          <p className="text-[13px] leading-relaxed text-zinc-700">{t.kitchens.intro}</p>
          <details className="rounded-lg bg-zinc-50 p-3 text-xs leading-relaxed text-zinc-600">
            <summary className="cursor-pointer rounded font-medium text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
              {t.kitchens.replaceSummary}
            </summary>
            <p className="pt-2">{t.kitchens.replaces}</p>
          </details>
          <div role="group" aria-label={t.kitchens.filter} className="flex flex-wrap gap-1">
            {filters.map((option) => (
              <Button key={option.value} active={filter === option.value} className="h-11 px-3 sm:h-8" onClick={() => setFilter(option.value)}>
                {option.label}
              </Button>
            ))}
          </div>
          <p role="status" className="text-xs text-zinc-600">{t.kitchens.count(kitchens.length, KITCHEN_DESIGNS.length)}</p>
          <div className="grid grid-cols-1 gap-4 min-[540px]:grid-cols-2">
            {kitchens.map((kitchen) => <KitchenCard key={kitchen.id} kitchen={kitchen} onClose={onClose} />)}
          </div>
          <p className="text-xs leading-relaxed text-zinc-600">{t.kitchens.materialsNote}</p>
          <a
            href="https://www.pinterest.com/search/pins/?q=kitchen%20design%20ideas"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1.5 rounded text-[13px] font-medium text-blue-700 underline underline-offset-4 hover:text-blue-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            {t.kitchens.pinterest}<ExternalLink className="size-3.5" />
          </a>
        </div>
      ) : tab === 'photos' ? <PhotoReferenceGallery onClose={onClose} /> : (
        <div className="space-y-2 p-4 pb-[max(env(safe-area-inset-bottom),16px)]">
          <p className="pb-1 text-[13px] leading-relaxed text-zinc-600">
            {t.layouts.intro(room.width, room.depth)}
            {count > 0 && <span className="font-medium text-zinc-800">{t.layouts.replaces(count)}</span>}
          </p>
          {LAYOUTS.map((layout) => (
            <button
              key={layout.id}
              type="button"
              onClick={() => {
                applyLayout(layout.id);
                onClose();
              }}
              className="flex w-full touch-manipulation items-center gap-4 rounded-xl border border-zinc-200 bg-white p-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <LayoutSketch id={layout.id} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-zinc-900">{t.layouts.names[layout.id].name}</span>
                <span className="block text-xs leading-snug text-zinc-500">{t.layouts.names[layout.id].description}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

export function LayoutDialog() {
  const t = useT();
  const open = useUiStore((s) => s.layoutsOpen);
  const compact = useIsCompact();
  const close = () => useUiStore.getState().setLayoutsOpen(false);

  return (
    <Dialog open={open} title={t.layouts.title} sheet={compact} wide onClose={close}>
      <LayoutChoices onClose={close} />
    </Dialog>
  );
}
