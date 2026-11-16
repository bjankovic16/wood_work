import { ArrowRight, ChevronDown, ExternalLink, Search, SlidersHorizontal, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { KITCHEN_DESIGNS, kitchenCategory, type KitchenCategory, type KitchenPreset } from '../../domain/kitchens';
import { normalizeSearchText } from '../../domain/librarySearch';
import type { KitchenCollection } from '../../domain/premiumKitchens';
import { FRONT_FINISHES, WORKTOP_FINISHES } from '../../domain/style';
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
  const preset: KitchenPreset = kitchen;
  const palette = [
    { color: FRONT_FINISHES[kitchen.style.front].color, label: t.style.frontFinishes[kitchen.style.front] },
    ...(preset.middleFinish ? [{ color: FRONT_FINISHES[preset.middleFinish].color, label: t.style.frontFinishes[preset.middleFinish] }] : []),
    { color: WORKTOP_FINISHES[kitchen.style.worktop].color, label: t.style.worktopFinishes[kitchen.style.worktop] },
  ];
  return (
    <article className="kitchen-card group min-w-0 overflow-hidden rounded-2xl border border-[#ded8ce] bg-[#fffefa]">
    <button
      type="button"
      data-kitchen-design={kitchen.id}
      aria-label={t.kitchens.open(name)}
      onClick={() => {
        applyKitchenDesign(kitchen);
        onClose();
      }}
      className="block w-full min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#637362]"
    >
      {previewFailed ? (
        <span className="flex aspect-3/2 items-center justify-center bg-[#eae5da] p-6 text-center text-sm text-[#625b50]">
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
      <span className="block p-4">
        {preset.collection && <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.16em] text-[#74705f]">{t.kitchens.collections[preset.collection]}</span>}
        <span className="flex items-center justify-between gap-2 text-sm font-semibold text-zinc-900">
          {name}
        </span>
        <span className="mt-1 block text-xs text-zinc-600">
          {t.style.frontFinishes[kitchen.style.front]} · {t.style.worktopFinishes[kitchen.style.worktop]}
        </span>
        <span role="img" aria-label={`${t.kitchens.finishes}: ${palette.map((finish) => finish.label).join(', ')}`} className="mt-3 flex gap-1.5">
          {palette.map((finish, index) => <span key={index} aria-hidden className="size-5 rounded-full border border-black/10 shadow-xs" style={{ backgroundColor: finish.color }} />)}
        </span>
        <span className="mt-3 flex flex-wrap gap-1.5">
          {preset.framed && <span className="rounded-full border border-[#d1d9ca] bg-[#edf1e8] px-2 py-1 text-[10px] font-medium text-[#4f6249]">{t.kitchens.framed}</span>}
          {(preset.layered || preset.stacked) && <span className="inline-flex rounded-full border border-[#e1ddcf] bg-[#f3f0e7] px-2 py-1 text-[10px] font-medium text-[#5b6353]">{preset.stacked ? t.kitchens.threeTier : t.kitchens.layered}</span>}
          {preset.room.vertices && <span className="rounded-full border border-[#e1ddcf] px-2 py-1 text-[10px] text-[#625b50]">{t.kitchens.angledRoom}</span>}
          {preset.room.partitions?.some((partition) => partition.height < preset.room.height) && <span className="rounded-full border border-[#e1ddcf] px-2 py-1 text-[10px] text-[#625b50]">{t.kitchens.halfWall}</span>}
          {!!preset.room.treatments?.length && <span className="rounded-full border border-[#e1ddcf] px-2 py-1 text-[10px] text-[#625b50]">{t.kitchens.wallFinishes}</span>}
          {[...new Set(preset.room.features?.map((feature) => feature.kind))].map((kind) => <span key={kind} className="rounded-full border border-[#e1ddcf] px-2 py-1 text-[10px] text-[#625b50]">{t.engine.roomFeatures[kind]}</span>)}
        </span>
        <span className="mt-2 flex flex-wrap justify-between gap-x-2 gap-y-1 text-xs tabular-nums text-zinc-600">
          <span>{kitchenCategory(kitchen) === 'island' ? t.kitchens.island : t.layouts.names[kitchen.layout].name}</span>
          <span>{t.kitchens.roomSize(kitchen.room.width, kitchen.room.depth)}</span>
        </span>
        <span className="mt-1 block text-xs tabular-nums text-zinc-600">{t.kitchens.ceiling(kitchen.room.height)}</span>
        <span className="mt-4 flex items-center justify-between gap-2 border-t border-[#e3ded4] pt-3 text-xs font-semibold text-[#4f6249]">
          {t.kitchens.customize}<ArrowRight className="size-4 shrink-0 transition-transform group-hover:translate-x-1" />
        </span>
      </span>
    </button>
    {preset.inspiration && (
      <a href={preset.inspiration} target="_blank" rel="noopener noreferrer" aria-label={`${t.kitchens.inspiration}: ${name}`} className="mx-4 mb-2 inline-flex min-h-11 items-center gap-1.5 text-xs text-[#59664f] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#637362]">
        {t.kitchens.inspiration}<ExternalLink className="size-3" />
      </a>
    )}
    </article>
  );
}

function LayoutChoices({ onClose }: { onClose: () => void }) {
  const t = useT();
  const count = useDesignStore((s) => s.design.items.length);
  const room = useDesignStore((s) => s.design.room);
  const [tab, setTab] = useState<'designs' | 'photos' | 'layouts'>('designs');
  const [filter, setFilter] = useState<KitchenCategory | 'all' | 'layered' | 'framed'>('all');
  const [collection, setCollection] = useState<KitchenCollection | 'all'>('all');
  const [query, setQuery] = useState('');
  const [withinRoom, setWithinRoom] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const words = normalizeSearchText(query).trim().split(/[\s,]+/).filter(Boolean);
  const filtersActive = !!query || withinRoom || collection !== 'all' || filter !== 'all';
  const resetFilters = () => {
    setQuery('');
    setWithinRoom(false);
    setCollection('all');
    setFilter('all');
    searchRef.current?.focus();
  };
  const kitchens = KITCHEN_DESIGNS.filter((kitchen) => {
    const preset: KitchenPreset = kitchen;
    const text = normalizeSearchText([
      kitchen.id, t.kitchens.names[kitchen.id], t.style.frontFinishes[kitchen.style.front],
      preset.middleFinish ? t.style.frontFinishes[preset.middleFinish] : '',
      t.style.worktopFinishes[kitchen.style.worktop], t.layouts.names[kitchen.layout].name,
      preset.collection ? t.kitchens.collections[preset.collection] : '',
      preset.layered || preset.stacked ? `${t.kitchens.layered} ${t.kitchens.threeTier}` : '',
      preset.framed ? t.kitchens.framed : '',
      kitchenCategory(kitchen) === 'island' ? t.kitchens.island : '',
      preset.room.vertices ? t.kitchens.angledRoom : '',
      preset.room.partitions?.some((partition) => partition.height < preset.room.height) ? t.kitchens.halfWall : '',
      preset.room.treatments?.length ? t.kitchens.wallFinishes : '',
      ...(preset.room.features?.map((feature) => t.engine.roomFeatures[feature.kind]) ?? []),
    ].join(' '));
    return (collection === 'all' || preset.collection === collection)
      && (filter === 'all' || (filter === 'framed' ? preset.framed : filter === 'layered' ? preset.layered || preset.stacked : kitchenCategory(kitchen) === filter))
      && (!withinRoom || (preset.room.width <= room.width && preset.room.depth <= room.depth && preset.room.height <= room.height))
      && words.every((word) => text.includes(word));
  });
  const filters: Array<{ value: KitchenCategory | 'all' | 'layered' | 'framed'; label: string }> = [
    { value: 'all', label: t.kitchens.all },
    { value: 'framed', label: t.kitchens.framed },
    { value: 'layered', label: t.kitchens.layered },
    ...LAYOUTS.map(({ id }) => ({ value: id, label: t.layouts.names[id].name })),
    { value: 'island', label: t.kitchens.island },
  ];

  return (
    <>
      <div className="sticky top-0 z-10 border-b border-[#e3ded4] bg-[#fffefa] px-4 py-3">
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
        <div className="space-y-4 bg-[#f7f5ef] p-4 pb-[max(env(safe-area-inset-bottom),16px)] sm:p-6">
          <div className="rounded-2xl border border-[#e3ded4] bg-[#ede9df] p-4 sm:px-5">
            <p className="hidden text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6b705e] sm:block">{t.kitchens.studio}</p>
            <h3 className="max-w-lg text-xl font-medium leading-tight tracking-tight text-[#332f28] sm:mt-1 sm:text-2xl">{t.kitchens.headline}</h3>
            <p className="mt-2 hidden max-w-xl text-xs leading-relaxed text-[#625e53] sm:block">{collection === 'all' ? t.kitchens.intro : t.kitchens.collectionNotes[collection]}</p>
          </div>
          <details className="rounded-lg bg-zinc-50 p-3 text-xs leading-relaxed text-zinc-600">
            <summary className="cursor-pointer rounded font-medium text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
              {t.kitchens.replaceSummary}
            </summary>
            <p className="pt-2">{t.kitchens.replaces}</p>
          </details>
          <div className="space-y-3">
            <label htmlFor="kitchen-design-search" className="sr-only">{t.kitchens.search}</label>
            <div className="relative">
              <Search aria-hidden className="pointer-events-none absolute left-3 top-3 size-4 text-[#797364]" />
              <input
                ref={searchRef}
                id="kitchen-design-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t.kitchens.searchPlaceholder}
                className="h-11 w-full min-w-0 rounded-xl border border-[#d6d0c3] bg-[#fffefa] pl-10 pr-12 text-sm text-[#332f28] outline-none focus:border-[#637362] focus:ring-2 focus:ring-[#637362]/20"
              />
              {query && <Button aria-label={t.kitchens.clearSearch} className="absolute right-0 top-0 h-11 w-11" onClick={() => { setQuery(''); searchRef.current?.focus(); }}><X className="size-4" /></Button>}
            </div>
            <Button variant="outline" aria-expanded={filtersOpen} aria-controls="kitchen-design-filters" className="h-11 w-full justify-between sm:hidden" onClick={() => setFiltersOpen(!filtersOpen)}>
              <span className="flex items-center gap-2"><SlidersHorizontal aria-hidden className="size-4" />{t.kitchens.refine}</span>
              <ChevronDown aria-hidden className={`size-4 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
            </Button>
            <div id="kitchen-design-filters" className={`${filtersOpen ? '' : 'hidden '}space-y-3 sm:block`}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[13px] text-[#514c43]">
                <input type="checkbox" checked={withinRoom} onChange={(event) => setWithinRoom(event.target.checked)} aria-describedby="kitchen-room-limit" className="size-4 shrink-0 accent-[#637362]" />
                {t.kitchens.withinRoom}
              </label>
              <p id="kitchen-room-limit" hidden={!withinRoom} className="text-xs leading-relaxed tabular-nums text-zinc-600">{t.kitchens.roomLimit(room.width, room.depth, room.height)}</p>
              <div role="group" aria-label={t.kitchens.collection} className="flex flex-wrap gap-2">
                {(['all', 'warm', 'dark', 'japandi'] as const).map((value) => (
                  <Button key={value} variant="outline" active={collection === value} className="min-h-11 rounded-full px-4" onClick={() => setCollection(value)}>
                    {value === 'all' ? t.kitchens.all : t.kitchens.collections[value]}
                  </Button>
                ))}
              </div>
              <div role="group" aria-label={t.kitchens.filter} className="flex flex-wrap gap-1">
                {filters.map((option) => (
                  <Button key={option.value} active={filter === option.value} className="h-11 px-3 sm:h-8" onClick={() => setFilter(option.value)}>
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p role="status" className="text-xs text-zinc-600">{t.kitchens.count(kitchens.length, KITCHEN_DESIGNS.length)}</p>
            {filtersActive && <Button variant="outline" className="min-h-11" onClick={resetFilters}>{t.kitchens.resetFilters}</Button>}
          </div>
          {kitchens.length === 0 ? <div className="rounded-2xl border border-dashed border-[#d6d0c3] bg-[#fffefa] p-6 text-center">
            <h4 className="text-sm font-semibold text-[#332f28]">{t.kitchens.noResults}</h4>
            <p className="mt-2 text-[13px] leading-relaxed text-zinc-600">{t.kitchens.noResultsHint}</p>
          </div> : <div className="grid grid-cols-1 gap-5 min-[540px]:grid-cols-2 min-[1100px]:grid-cols-3">
            {kitchens.map((kitchen) => <KitchenCard key={kitchen.id} kitchen={kitchen} onClose={onClose} />)}
          </div>}
          <p className="text-xs leading-relaxed text-zinc-600">{t.kitchens.materialsNote}</p>
          <a
            href="https://www.pinterest.com/ideas/warm-contemporary-kitchen/955209864754/"
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
