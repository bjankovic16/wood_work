import { ChevronDown, Search, X } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { findPreset, KIND_SPECS, LIBRARY, type LibraryPreset, type LibrarySection } from '../../domain/catalog';
import { searchLibrary, type LibraryCategory } from '../../domain/librarySearch';
import { useT, type Messages } from '../../i18n';
import { cn } from '../../lib/cn';
import { addPresetToPlan, finishLibraryDrag, updateLibraryDrag } from '../../store/actions';
import { useUiStore } from '../../store/uiStore';
import { Button, Dialog } from '../ui';
import { ModelBoundary } from '../three/ModelPreviewFallback';

const DRAG_START_DISTANCE = 4;
const ElementModel = lazy(() => import('./ElementModel'));
const picture = (preset: LibraryPreset) => `${import.meta.env.BASE_URL}elements/${preset.id}.jpg`;

function presetName(preset: LibraryPreset, t: Messages): string {
  const name = preset.placement === 'ceiling' ? t.library.ceiling : preset.name === 'island' ? t.library.island : t.kinds[preset.kind];
  return preset.width !== undefined ? t.library.withWidth(name, preset.width) : preset.custom ? t.library.customSize(name) : name;
}

/** What the tile shows: the width, "Custom", or the kind's name. */
function presetTitle(preset: LibraryPreset, t: Messages, layout: LibrarySection['layout']): string {
  if (layout === 'regular') return presetName(preset, t);
  return preset.width !== undefined ? String(preset.width) : preset.custom ? t.library.custom : t.kinds[preset.kind];
}

function presetSize(preset: LibraryPreset, t: Messages): string {
  const defaults = { ...KIND_SPECS[preset.kind].defaults, ...preset.options };
  const width = preset.width ?? defaults.width;
  return preset.kind === 'corner' ? t.library.cornerSize(width, defaults.width2 ?? width, defaults.depth) : t.library.size(width, defaults.height, defaults.depth);
}

/**
 * Click adds the element to the first free spot; dragging shows a live preview
 * on the plan and drops it where the pointer is released. Escape cancels.
 * On touch screens a vertical swipe scrolls the list instead (the browser
 * cancels the pointer), so only taps and sideways drags add elements.
 */
function startPointerDrag(presetId: string, event: ReactPointerEvent, onAdded?: () => void) {
  if (event.button !== 0) return;
  event.preventDefault();
  (document.activeElement as HTMLElement | null)?.blur?.();
  const { clientX: startX, clientY: startY, pointerId } = event;
  let dragging = false;

  const cleanup = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('blur', abort);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('keydown', onKey, true);
    document.documentElement.classList.remove('is-dragging');
  };
  const onMove = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    if (!dragging && Math.hypot(e.clientX - startX, e.clientY - startY) < DRAG_START_DISTANCE) return;
    if (!dragging) document.documentElement.classList.add('is-dragging');
    dragging = true;
    updateLibraryDrag(presetId, e.clientX, e.clientY);
  };
  const onUp = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    cleanup();
    if (dragging) updateLibraryDrag(presetId, e.clientX, e.clientY);
    const added = dragging ? finishLibraryDrag(true) : addPresetToPlan(presetId);
    if (added) onAdded?.();
  };
  const abort = () => {
    cleanup();
    finishLibraryDrag(false);
  };
  const onCancel = (e: PointerEvent) => { if (e.pointerId === pointerId) abort(); };
  const onVisibility = () => { if (document.visibilityState === 'hidden') abort(); };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    abort();
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  window.addEventListener('blur', abort);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('keydown', onKey, true);
}

interface PresetTileProps {
  preset: LibraryPreset;
  layout: LibrarySection['layout'];
  onAdded?: () => void;
  tapOnly?: boolean;
  onPreview?: (preset: LibraryPreset) => void;
}

function PresetTile({ preset, layout, onAdded, tapOnly, onPreview }: PresetTileProps) {
  const t = useT();
  const name = presetName(preset, t);
  // Mouse clicks are handled by the pointer logic; this covers Enter/Space from the keyboard.
  const onKeyboardClick = (e: MouseEvent) => {
    if (onPreview) onPreview(preset);
    else if ((tapOnly || e.detail === 0) && addPresetToPlan(preset.id)) onAdded?.();
  };
  return (
    <button
      type="button"
      title={onPreview || tapOnly ? name : `${name}\n${presetSize(preset, t)}\n${t.library.clickOrDrag}`}
      aria-label={onPreview ? t.library.preview(name) : t.library.add(name)}
      aria-haspopup={onPreview ? 'dialog' : undefined}
      data-preset={preset.id}
      onPointerDown={tapOnly || onPreview ? undefined : (e) => startPointerDrag(preset.id, e, onAdded)}
      onClick={onKeyboardClick}
      className={cn(
        'group flex scroll-mt-36 touch-pan-y select-none flex-col items-center justify-center rounded-xl border border-studio-line bg-studio-paper text-[#84785f] shadow-[0_1px_2px_#332f2804] transition-colors',
        tapOnly || onPreview ? 'cursor-pointer' : 'cursor-grab',
        'hover:border-[#acb59e] hover:bg-[#f1f3eb] hover:text-studio-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-studio-accent/50',
        layout === 'compact' ? 'min-h-[76px] gap-0.5 p-1' : 'min-h-[104px] gap-1 p-1.5',
      )}
    >
      <img src={picture(preset)} alt="" width={192} height={144} draggable={false} loading="lazy"
        className={cn('pointer-events-none w-full rounded-lg bg-[#f5f2eb] object-contain', layout === 'compact' ? 'h-12' : 'h-[70px]')} />
      <span
        className={cn(
          'font-medium text-zinc-700',
          layout === 'compact' ? 'text-xs tabular-nums' : 'text-center text-sm leading-tight',
        )}
      >
        {presetTitle(preset, t, layout)}
      </span>
    </button>
  );
}

/** The element sections, shared by the desktop sidebar and the phone's "Add" panel. */
export function LibrarySections({ onAdded, wide = false, multiple = false }: { onAdded?: () => void; wide?: boolean; multiple?: boolean }) {
  const t = useT();
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<LibraryCategory>('all');
  const [browseAll, setBrowseAll] = useState(false);
  const [previewFirst, setPreviewFirst] = useState(false);
  const [preview, setPreview] = useState<LibraryPreset | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ storage: true, appliances: true, islands: true });
  const focusRequest = useUiStore((state) => state.focusRequest);
  useEffect(() => {
    if (focusRequest !== 'library-search') return;
    setQuery('');
    setCategory('all');
    searchRef.current?.focus();
    useUiStore.getState().requestFocus(null);
  }, [focusRequest]);
  const filtering = query.trim().length > 0 || category !== 'all';
  const sections = searchLibrary(query, { kinds: t.kinds, sections: t.library.sections, custom: t.library.custom, island: t.library.island, keywords: t.library.keywords }, category);
  const count = sections.reduce((total, section) => total + section.presets.length, 0);
  const fallback = preview && <div className="flex h-full flex-col items-center justify-center">
    <img alt="" src={picture(preview)} className="min-h-0 flex-1 object-contain" />
    <p role="status" className="p-2 text-sm text-studio-muted">{t.library.sampleOnly}</p>
  </div>;
  return (
    <>
      <div data-sheet-sticky="" className="sticky top-0 z-10 space-y-2 bg-studio-paper pb-3 pt-1">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-3 size-4 text-zinc-500" />
          <input
            ref={searchRef}
            type="search"
            aria-label={t.library.search}
            placeholder={t.library.searchPlaceholder}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-10 w-full rounded-xl border border-studio-line bg-[#f5f2eb] pl-9 pr-9 text-base text-studio-ink caret-studio-accent placeholder:text-studio-muted focus:border-studio-accent focus:outline-none focus:ring-2 focus:ring-studio-accent/20 lg:text-sm [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <Button className="absolute right-1 top-1 h-8 w-8 px-0" aria-label={t.library.clearSearch} onClick={() => { setQuery(''); searchRef.current?.focus(); }}>
              <X className="size-4" />
            </Button>
          )}
        </div>
        <select
          aria-label={t.library.category}
          value={category}
          onChange={(event) => setCategory(event.target.value as LibraryCategory)}
          className="h-10 w-full rounded-lg border border-studio-line bg-studio-paper px-2 text-base text-[#696357] focus:border-studio-accent focus:outline-none focus:ring-2 focus:ring-studio-accent/20 lg:text-[13px]"
        >
          <option value="all">{t.library.allCategories}</option>
          {LIBRARY.map((section) => <option key={section.id} value={section.id}>{t.library.sections[section.id]}</option>)}
        </select>
        <div className="flex flex-wrap items-center justify-between gap-x-1">
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium text-studio-ink">
            <input type="checkbox" className="accent-studio-accent" checked={previewFirst} onChange={(e) => setPreviewFirst(e.target.checked)} />
            {t.library.previewFirst}
          </label>
          <p role="status" className="text-xs text-zinc-600">{t.library.results(count)}</p>
        </div>
      </div>
      <p className="pt-1 text-xs leading-relaxed text-studio-muted">{t.library.sampleFinishes}</p>
      {!filtering && !browseAll && <section aria-label={t.library.mostUsed}>
        <h3 className="py-2 text-xs font-semibold text-zinc-700">{t.library.mostUsed}</h3>
        <div className={cn('grid grid-cols-2 gap-2', wide && 'min-[380px]:grid-cols-3 sm:grid-cols-4')}>
          {LIBRARY.flatMap((section) => section.presets).filter((preset) => ['base-600', 'wall-600', 'drawer', 'sink', 'oven', 'dishwasher', 'tall', 'corner'].includes(preset.id)).map((preset) =>
            <PresetTile key={preset.id} preset={preset} layout="regular" onAdded={onAdded} tapOnly={multiple} onPreview={previewFirst ? setPreview : undefined} />,
          )}
        </div>
        <Button variant="outline" className="mt-3 w-full" onClick={() => setBrowseAll(true)}>{t.library.browseAll}</Button>
      </section>}
      {count === 0 && (
        <div className="space-y-3 rounded-lg bg-zinc-50 p-3">
          <p className="text-[13px] leading-relaxed text-zinc-600">{t.library.noResults}</p>
          <Button variant="outline" className="w-full" onClick={() => { setQuery(''); setCategory('all'); searchRef.current?.focus(); }}>{t.library.resetSearch}</Button>
        </div>
      )}
      {(filtering || browseAll) && sections.map((section) => {
        const open = filtering || !collapsed[section.id];
        return (
          <div key={section.id}>
            {filtering ? (
              <h3 className="px-1 pb-2 pt-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">{t.library.sections[section.id]}</h3>
            ) : <button
              type="button"
              onClick={() => setCollapsed((c) => ({ ...c, [section.id]: open }))}
              aria-expanded={open}
              className={cn('flex w-full items-center gap-1.5 rounded-md px-1 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-600 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40', wide ? 'min-h-11' : 'min-h-9')}
            >
              <ChevronDown className={cn('size-3.5 transition-transform', !open && '-rotate-90')} />
              {t.library.sections[section.id]}
            </button>}
            {open && (
              <>
              {section.id === 'ceiling' && <p className="pb-2 text-xs leading-relaxed text-zinc-600">{t.library.ceilingHint}</p>}
              <div
                className={cn(
                  'grid gap-1.5 pb-2',
                  section.layout === 'compact' ? (wide ? 'grid-cols-4 sm:grid-cols-8' : 'grid-cols-4') : wide ? 'grid-cols-3 sm:grid-cols-5' : 'grid-cols-2',
                )}
              >
                {section.presets.map((preset) => (
                  <PresetTile key={preset.id} preset={preset} layout={section.layout} onAdded={onAdded} tapOnly={multiple} onPreview={previewFirst ? setPreview : undefined} />
                ))}
              </div>
              </>
            )}
          </div>
        );
      })}
      {preview && <Dialog open title={t.library.preview(presetName(preview, t))} onClose={() => setPreview(null)}
        footer={<Button variant="primary" className="min-h-11" onClick={() => {
          if (addPresetToPlan(preview.id)) { setPreview(null); onAdded?.(); }
        }}>{t.library.add(presetName(preview, t))}</Button>}>
        <div className="space-y-2 p-3">
          <div data-element-model={preview.id} className="aspect-[4/3] max-h-[42dvh] w-full overflow-hidden rounded-xl bg-[#f5f2eb]">
            <ModelBoundary fallback={fallback}><Suspense fallback={<p role="status" className="p-4 text-sm">{t.view3d.loading}</p>}>
              <ElementModel preset={preview} fallback={fallback} />
            </Suspense></ModelBoundary>
          </div>
          <p className="text-sm font-medium">{presetSize(preview, t)}</p>
          <p className="text-sm text-studio-muted">{t.library.previewHint}</p>
        </div>
      </Dialog>}
    </>
  );
}

export function LibraryPanel() {
  const t = useT();
  return (
    <aside className="studio-panel flex w-[264px] shrink-0 flex-col border-r">
      <div className="mb-2 border-b border-studio-line/60 px-4 pb-4 pt-5">
        <h2 className="text-sm font-semibold text-zinc-900">{t.library.elements}</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-studio-muted">{t.library.hint}</p>
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        <LibrarySections />
      </div>
    </aside>
  );
}

/** Follows the pointer while a library element is dragged outside the plan. */
export function LibraryDragChip() {
  const t = useT();
  const drag = useUiStore((s) => s.libraryDrag);
  if (!drag || drag.ghost) return null;
  const preset = findPreset(drag.presetId);
  if (!preset) return null;
  return createPortal(
    <div
      className="pointer-events-none fixed z-50 flex items-center gap-2 rounded-lg border border-zinc-200 bg-white/95 py-1.5 pl-1.5 pr-3 text-xs font-medium text-zinc-700 shadow-lg"
      style={{ left: drag.clientX + 14, top: drag.clientY + 14 }}
    >
      <img alt="" src={picture(preset)} draggable={false} className="h-9 w-12 rounded object-contain" />
      {presetName(preset, t)}
    </div>,
    document.body,
  );
}
