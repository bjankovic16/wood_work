import { Plus } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import type { KitchenItem } from '../../domain/types';
import { useT } from '../../i18n';
import { useDesignStore } from '../../store/designStore';
import { useUiStore } from '../../store/uiStore';
import { DesignCanvas } from '../canvas/DesignCanvas';
import { ConstructionDialog } from '../construction/ConstructionDialog';
import { CuttingListView } from '../cutting/CuttingListView';
import { LibrarySections } from '../library/LibraryPanel';
import { DeleteButton, DuplicateButton, ItemFields, ItemHeader, RotateButton, type ItemSection } from '../properties/ItemPanel';
import { SheetHandle, type SheetSnap } from '../sheets/SheetHandle';
import { RoomWorkspace } from '../room/RoomWorkspace';
import { Button, Dialog } from '../ui';
import { View3D } from '../three/View3D';
import { LayoutDialog } from '../layouts/LayoutDialog';
import { ProjectsDialog } from '../projects/ProjectsDialog';
import { MobileNavigation, TopBar } from './TopBar';
import { PhoneThreeChrome, PhoneViewButton } from './PhoneThreeChrome';

function AddButton({ open, iconOnly = false }: { open: () => void; iconOnly?: boolean }) {
  const t = useT();
  return <Button data-plan-controls data-add-trigger="" variant="primary" aria-label={t.phone.addElement} aria-haspopup="dialog"
    className="pointer-events-auto h-11 shrink-0 rounded-full px-3 text-sm" onClick={open}>
    <Plus className="size-4" aria-hidden="true" /><span className={iconOnly ? 'sr-only' : undefined}>{t.phone.addElement}</span>
  </Button>;
}

const sections: ItemSection[] = ['size', 'fronts', 'materials', 'parts'];

/** Not a modal: the exposed drawing stays interactive at every snap. */
function ItemSheet({ item, onAdd, adding }: { item: KitchenItem; onAdd: () => void; adding: boolean }) {
  const t = useT();
  const [snap, setSnap] = useState<SheetSnap>('small');
  const [section, setSection] = useState<ItemSection>('size');
  const id = useId();
  const focusWidth = useUiStore((s) => s.focusRequest === 'width');
  const manipulating = useUiStore((s) => s.view === '3d' && s.cabinetTool !== null);
  const inPlan = useUiStore((s) => s.view === 'plan');
  useEffect(() => {
    if (!adding && focusWidth) { setSection('size'); setSnap('half'); }
  }, [adding, focusWidth]);
  const small = snap === 'small';
  return (
    <section
      className={`studio-panel absolute inset-x-0 bottom-0 z-10 flex flex-col rounded-t-2xl border-t shadow-[0_-8px_30px_rgba(51,47,40,0.1)] ${inPlan ? 'phone-plan-dock' : ''}`}
      aria-label={`${t.kinds[item.kind]} · ${item.label}`}
      data-testid="item-sheet" data-plan-overlay="" data-sheet-panel="cabinet" data-snap={snap} data-manipulating={manipulating || undefined}
    >
      <ItemHeader item={item}
        handle={<SheetHandle snap={snap} onSnap={setSnap} onClose={() => useUiStore.getState().select(null)} controls={small ? undefined : id} />}
        action={!small && <AddButton iconOnly open={onAdd} />} />
      {small ? <div className="flex shrink-0 items-center justify-between gap-0.5 px-1 pb-1">
        <RotateButton />
        <DuplicateButton iconOnly />
        <DeleteButton iconOnly />
        <AddButton open={onAdd} />
      </div> : <div className="sheet-editor flex min-h-0 flex-1 flex-col">
        <div role="tablist" aria-label={t.sheet.tabs} className="grid shrink-0 grid-cols-4 border-y border-studio-line bg-[#f6f3ec] px-1">
          {sections.map((key, index) => <button key={key} type="button" role="tab" id={`${id}-${key}`} aria-controls={id}
            aria-selected={key === section} tabIndex={key === section ? 0 : -1} onClick={() => setSection(key)}
            className="min-w-0 border-b-2 border-transparent px-1 text-xs font-medium text-studio-muted aria-selected:border-studio-accent aria-selected:text-studio-accent"
            onKeyDown={(e) => {
              const next = e.key === 'Home' ? 0 : e.key === 'End' ? 3 : e.key === 'ArrowRight' ? (index + 1) % 4 : e.key === 'ArrowLeft' ? (index + 3) % 4 : null;
              if (next === null) return;
              e.preventDefault(); e.stopPropagation();
              setSection(sections[next]);
              document.getElementById(`${id}-${sections[next]}`)?.focus({ preventScroll: true });
            }}>{key === 'parts' ? t.report.parts : t.item[key]}</button>)}
        </div>
        <div key={section} role="tabpanel" id={id} aria-labelledby={`${id}-${section}`} tabIndex={0} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <ItemFields item={item} section={section} />
        </div>
      </div>}
    </section>
  );
}

function AddSheet({ close }: { close: () => void }) {
  const t = useT();
  const [added, setAdded] = useState<KitchenItem | null>(null);
  return <Dialog open title={t.phone.addElement} sheet onClose={close}
    headerNote={<p role="status" aria-atomic="true" className="text-xs font-medium text-studio-accent">{added && t.sheet.added(t.kinds[added.kind], added.label)}</p>}>
    <p className="px-4 pt-3 text-xs text-zinc-500">{t.phone.addHint}</p>
    <div className="space-y-1 px-3 pb-[max(env(safe-area-inset-bottom),16px)] pt-1">
      <LibrarySections wide multiple onAdded={() => {
        const id = useUiStore.getState().selectedId;
        setAdded(useDesignStore.getState().design.items.find((item) => item.id === id) ?? null);
      }} />
    </div>
  </Dialog>;
}

/**
 * Phones and small tablets: the plan fills the screen; the element library,
 * the room settings and the selected unit slide up from the bottom.
 */
export function CompactLayout() {
  const view = useUiStore((s) => s.view);
  const layoutsOpen = useUiStore((s) => s.layoutsOpen);
  const roomOpen = useUiStore((s) => s.roomOpen);
  const selectedId = useUiStore((s) => s.selectedId);
  const item = useDesignStore((s) => (selectedId ? s.design.items.find((i) => i.id === selectedId) : undefined));
  const [sheet, setSheet] = useState<'add' | null>(null);

  const designing = view !== 'list';
  const openAdd = () => setSheet('add');
  const closeAdd = () => {
    setSheet(null);
    // The trigger in the empty dock is replaced by the selected cabinet's Add button after a pick.
    requestAnimationFrame(() => {
      if (document.activeElement === document.body) document.querySelector<HTMLElement>('[data-add-trigger]')?.focus({ preventScroll: true });
    });
  };

  // Leaving the plan and 3D views closes anything that belongs to them.
  useEffect(() => {
    if (view === 'list' || layoutsOpen || roomOpen) setSheet(null);
  }, [view, layoutsOpen, roomOpen]);

  return (
    <PhoneThreeChrome mode={view === '3d' ? (roomOpen ? 'room' : 'editor') : null}>
      <TopBar compact />
      {roomOpen ? <RoomWorkspace compact /> : <main className="relative min-h-0 flex-1">
        {view === 'plan' && <DesignCanvas compact />}
        {view === '3d' && <View3D compact />}
        {view === '3d' && <div className="mobile-scene-tools"><PhoneViewButton /></div>}
        {view === 'list' && <CuttingListView />}
        {designing && !item && (
          <div className={`pointer-events-none absolute inset-x-0 bottom-0 flex justify-center gap-2 bg-gradient-to-t from-studio-canvas/90 to-transparent px-3 pb-[max(env(safe-area-inset-bottom),14px)] pt-6 ${view === 'plan' ? 'phone-plan-dock' : ''}`}>
            <AddButton open={openAdd} />
          </div>
        )}
        {designing && item && <ItemSheet key={item.id} item={item} adding={sheet === 'add'} onAdd={openAdd} />}
      </main>}
      <MobileNavigation />

      {sheet === 'add' && <AddSheet close={closeAdd} />}
      <ConstructionDialog />
      <LayoutDialog />
      <ProjectsDialog />
    </PhoneThreeChrome>
  );
}
