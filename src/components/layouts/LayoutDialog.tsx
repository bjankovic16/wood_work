import { ArrowRight, ChevronDown, Ellipsis, ExternalLink, Search, Shuffle, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KITCHEN_DESIGNS, kitchenCategory, type KitchenCategory, type KitchenPreset } from '../../domain/kitchens';
import { normalizeSearchText } from '../../domain/librarySearch';
import { randomSeed, shuffled } from '../../domain/shuffle';
import { COLLECTION_INSPIRATION, KITCHEN_COLLECTIONS, type KitchenCollection } from '../../domain/premiumKitchens';
import { FRONT_FINISHES, WORKTOP_FINISHES } from '../../domain/style';
import { LAYOUTS, type LayoutId } from '../../domain/templates';
import { useIsCompact } from '../../hooks/useMediaQuery';
import { useT } from '../../i18n';
import { openKitchenOriginal } from '../../store/actions';
import { preferredIdeaWall, prepareIdeaReview } from '../../store/ideaReview';
import { useDesignStore } from '../../store/designStore';
import { useUiStore } from '../../store/uiStore';
import { Button, Dialog, Menu, Segmented } from '../ui';
import { PhotoReferenceGallery } from '../references/PhotoReferences';
import { IdeaFitReview } from './IdeaFitReview';

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

function KitchenCard({ kitchen }: { kitchen: (typeof KITCHEN_DESIGNS)[number] }) {
  const t = useT();
  const [previewFailed, setPreviewFailed] = useState(false);
  const design = useDesignStore((s) => s.design);
  const wall = useUiStore((s) => s.selectedWallId);
  const card = useRef<HTMLElement>(null);
  const [nearby, setNearby] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setNearby(true); observer.disconnect(); }
    }, { rootMargin: '250px' });
    observer.observe(card.current!);
    return () => observer.disconnect();
  }, []);
  const badge = useMemo(() => {
    if (design.items.length) return t.fit.appearance;
    if (!nearby) return '';
    const { fit, issues } = prepareIdeaReview(design, { type: 'idea', id: kitchen.id }, { mainWallId: preferredIdeaWall(design.room, wall), prefixes: t.labelPrefix }, t.engine);
    return fit?.status === 'cannot-fit' ? t.fit.unavailable : issues.length ? t.fit.check : fit?.status === 'adjusted' ? t.fit.adapts : t.fit.fits;
  }, [nearby, design, kitchen, t, wall]);
  const name = t.kitchens.names[kitchen.id];
  const preset: KitchenPreset = kitchen;
  const palette = [
    { color: FRONT_FINISHES[kitchen.style.front].color, label: t.style.frontFinishes[kitchen.style.front] },
    ...(preset.middleFinish ? [{ color: FRONT_FINISHES[preset.middleFinish].color, label: t.style.frontFinishes[preset.middleFinish] }] : []),
    { color: WORKTOP_FINISHES[kitchen.style.worktop].color, label: t.style.worktopFinishes[kitchen.style.worktop] },
  ];
  return (
    <article ref={card} className="kitchen-card group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[#ded8ce] bg-[#fffefa]">
    <button
      type="button"
      data-kitchen-design={kitchen.id}
      aria-label={t.kitchens.open(name)}
      aria-describedby={`fit-badge-${kitchen.id}`}
      onClick={() => useUiStore.getState().reviewFit({ type: 'idea', id: kitchen.id })}
      className="flex w-full min-w-0 flex-1 flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#637362]"
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
      <span className="flex w-full flex-1 flex-col p-4">
        <span id={`fit-badge-${kitchen.id}`} className="mb-2 min-h-5 w-fit rounded-full bg-[#e6ecdf] px-2 py-1 text-[11px] font-semibold text-[#3e5539]" data-testid="fit-badge">{badge}</span>
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
        <span className="mt-auto flex min-h-11 items-end justify-between gap-2 pt-4 text-xs font-semibold text-[#4f6249]">
          {t.kitchens.customize}<ArrowRight className="size-4 shrink-0 transition-transform group-hover:translate-x-1" />
        </span>
      </span>
    </button>
    <div className="absolute right-2 top-2 rounded-lg bg-studio-paper shadow-sm [&>div>span>button]:size-11">
    <Menu label={t.kitchens.options(name)} icon={<Ellipsis className="size-5" />}>
    <button type="button" data-kitchen-original={kitchen.id} data-close-menu onClick={() => openKitchenOriginal(kitchen)}
      className="block min-h-11 w-full rounded-md px-2 text-left text-sm hover:bg-studio-canvas">
      {t.kitchens.original}
    </button>
    {preset.inspiration && (
      <a href={preset.inspiration} data-close-menu target="_blank" rel="noopener noreferrer" aria-label={`${t.kitchens.inspiration}: ${name}`} className="inline-flex min-h-11 items-center gap-1.5 px-2 text-xs text-[#59664f] underline underline-offset-4">
        {t.kitchens.inspiration}<ExternalLink className="size-3" />
      </a>
    )}
    </Menu></div>
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
  const [withinRoom, setWithinRoom] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  /** Seed of the order chosen with "Shuffle"; null shows the collections in their own order. */
  const [shuffle, setShuffle] = useState<number | null>(null);
  const ordered = useMemo(() => (shuffle === null ? KITCHEN_DESIGNS : shuffled(KITCHEN_DESIGNS, shuffle)), [shuffle]);
  const searchRef = useRef<HTMLInputElement>(null);
  const words = normalizeSearchText(query).trim().split(/[\s,]+/).filter(Boolean);
  const filtersActive = !!query || withinRoom || collection !== 'all' || filter !== 'all' || shuffle !== null;
  const resetFilters = () => {
    setQuery('');
    setWithinRoom(false);
    setCollection('all');
    setFilter('all');
    setShuffle(null);
    searchRef.current?.focus();
  };
  const kitchens = ordered.filter((kitchen) => {
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
            <div id="kitchen-design-filters" className={`${filtersOpen ? 'flex ' : 'hidden '}flex-wrap items-center gap-3 sm:flex`}>
              <select aria-label={t.kitchens.collection} value={collection} onChange={(event) => {
                const value = event.target.value;
                if (value === 'all' || value === 'warm' || value === 'dark' || value === 'japandi') setCollection(value);
              }} className="h-11 rounded-lg border border-studio-line bg-studio-paper px-3 text-sm text-studio-ink">
                <option value="all">{t.kitchens.collection}: {t.library.allCategories}</option>
                {KITCHEN_COLLECTIONS.map((value) => <option key={value} value={value}>{t.kitchens.collections[value]}</option>)}
              </select>
              <select aria-label={t.kitchens.filter} value={filter} onChange={(event) => {
                const option = filters.find((entry) => entry.value === event.target.value);
                if (option) setFilter(option.value);
              }} className="h-11 rounded-lg border border-studio-line bg-studio-paper px-3 text-sm text-studio-ink">
                {filters.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[13px] text-[#514c43]">
                <input type="checkbox" checked={withinRoom} onChange={(event) => setWithinRoom(event.target.checked)} aria-describedby="kitchen-room-limit" className="size-4 shrink-0 accent-[#637362]" />
                {t.kitchens.withinRoom}
              </label>
              <p id="kitchen-room-limit" hidden={!withinRoom} className="text-xs leading-relaxed tabular-nums text-zinc-600">{t.kitchens.roomLimit(room.width, room.depth, room.height)}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <p role="status" className="mr-auto text-xs text-zinc-600">
              {t.kitchens.count(kitchens.length, KITCHEN_DESIGNS.length)}
              {shuffle !== null && <span className="ml-2 rounded-full bg-[#e6ecdf] px-2 py-0.5 font-medium text-[#3e5539]">{t.kitchens.shuffled}</span>}
            </p>
            {filtersActive && <Button variant="outline" className="min-h-11" onClick={resetFilters}>{t.kitchens.resetFilters}</Button>}
            <Button variant="outline" className="min-h-11" title={t.kitchens.shuffleTitle} disabled={kitchens.length < 2} onClick={() => setShuffle(randomSeed())}>
              <Shuffle className="size-4" />{t.kitchens.shuffle}
            </Button>
          </div>
          {kitchens.length === 0 ? <div className="rounded-2xl border border-dashed border-[#d6d0c3] bg-[#fffefa] p-6 text-center">
            <h4 className="text-sm font-semibold text-[#332f28]">{t.kitchens.noResults}</h4>
            <p className="mt-2 text-[13px] leading-relaxed text-zinc-600">{t.kitchens.noResultsHint}</p>
          </div> : <div className="grid grid-cols-1 gap-5 min-[540px]:grid-cols-2 min-[1100px]:grid-cols-3">
            {kitchens.map((kitchen) => <KitchenCard key={kitchen.id} kitchen={kitchen} />)}
          </div>}
          <details className="rounded-lg p-2 text-xs leading-relaxed text-zinc-600">
            <summary className="cursor-pointer font-medium">{t.kitchens.replaceSummary}</summary>
            <p className="pt-2">{t.kitchens.replaces}</p>
          </details>
          <p className="text-xs leading-relaxed text-zinc-600">{t.kitchens.materialsNote}</p>
          <a
            href={COLLECTION_INSPIRATION.warm}
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
              onClick={() => useUiStore.getState().reviewFit({ type: 'starter', id: layout.id })}
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
  const fitRequest = useUiStore((s) => s.fitRequest);
  const compact = useIsCompact();
  const close = () => useUiStore.getState().setLayoutsOpen(false);

  return (
    <Dialog open={open} title={t.layouts.title} sheet={compact} wide onClose={close}>
      <div hidden={!!fitRequest}><LayoutChoices onClose={close} /></div>
      {fitRequest && <IdeaFitReview key={`${fitRequest.type}:${fitRequest.id}`} request={fitRequest} />}
    </Dialog>
  );
}
