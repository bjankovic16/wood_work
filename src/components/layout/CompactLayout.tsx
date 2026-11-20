import { Layers, MousePointer2, Plus, Ruler } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { isWallMounted } from '../../domain/geometry';
import type { KitchenItem } from '../../domain/types';
import { editableUpperRows, inUpperRow } from '../../domain/upperCabinets';
import { useT } from '../../i18n';
import { useDesignStore } from '../../store/designStore';
import { useUiStore } from '../../store/uiStore';
import { DesignCanvas } from '../canvas/DesignCanvas';
import { ConstructionDialog } from '../construction/ConstructionDialog';
import { CuttingListView } from '../cutting/CuttingListView';
import { LibrarySections } from '../library/LibraryPanel';
import { CabinetEditor } from '../properties/CabinetEditor';
import { DeleteButton, DuplicateButton, ItemHeader, PlanMoveButton, RotateButton } from '../properties/ItemPanel';
import { SheetHandle, type SheetSnap } from '../sheets/SheetHandle';
import { RoomWorkspace } from '../room/RoomWorkspace';
import { Button, Dialog } from '../ui';
import { View3D } from '../three/View3D';
import { LayoutDialog } from '../layouts/LayoutDialog';
import { ProjectsDialog } from '../projects/ProjectsDialog';
import { MobileNavigation, RoomNextStep, TopBar } from './TopBar';
import { ChecksButton } from '../checks/ChecksButton';
import { PhoneThreeChrome, PhoneViewButton } from './PhoneThreeChrome';

function AddButton({ open, iconOnly = false }: { open: () => void; iconOnly?: boolean }) {
  const t = useT();
  return <Button data-plan-controls data-add-trigger="" variant="primary" aria-label={t.phone.addElement} aria-haspopup="dialog"
    className="pointer-events-auto h-11 shrink-0 rounded-full px-3 text-sm" onClick={open}>
    <Plus className="size-4" aria-hidden="true" /><span className={iconOnly ? 'sr-only' : undefined}>{t.phone.addElement}</span>
  </Button>;
}

function SizeButton({ onEdit, short = false }: { onEdit?: () => void; short?: boolean }) {
  const t = useT();
  return <Button variant="outline" aria-label={t.canvas.editSize} onClick={() => {
    useUiStore.getState().requestFocus('width');
    onEdit?.();
  }}><Ruler className="size-4" aria-hidden="true" />{short ? t.canvas.sizeShort : t.canvas.editSize}</Button>;
}

/** Not a modal: the exposed drawing stays interactive at every snap. */
function ItemSheet({ item, onAdd, adding }: { item: KitchenItem; onAdd: () => void; adding: boolean }) {
  const t = useT();
  const [snap, setSnap] = useState<SheetSnap>('small');
  const id = useId();
  const focusWidth = useUiStore((s) => s.focusRequest === 'width');
  const manipulating = useUiStore((s) => s.view === '3d' && s.cabinetTool !== null);
  const inPlan = useUiStore((s) => s.view === 'plan');
  useEffect(() => {
    if (!adding && focusWidth) setSnap('half');
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
        action={(!small || inPlan) && <AddButton iconOnly open={onAdd} />} />
      {small && <div className="flex shrink-0 items-center justify-between gap-0.5 px-1 pb-1">
        {inPlan ? <><PlanMoveButton /><SizeButton short /></> : <Button variant="outline" onClick={() => {
          useUiStore.getState().requestFocus('parts');
          setSnap('half');
        }}><Layers className="size-4" aria-hidden="true" />{t.report.parts}</Button>}
        <RotateButton />
        <DuplicateButton iconOnly />
        <DeleteButton iconOnly />
        {!inPlan && <AddButton open={onAdd} />}
      </div>}
      <CabinetEditor key={inPlan ? 'plan' : '3d'} item={item} expanded={!small && !adding} id={id} />
    </section>
  );
}

function AddSheet({ close }: { close: () => void }) {
  const t = useT();
  const [added, setAdded] = useState<KitchenItem | null>(null);
  const selectedId = useUiStore((s) => s.selectedId), inPlan = useUiStore((s) => s.view === 'plan');
  const editOnDrawing = (item: KitchenItem) => {
    const ui = useUiStore.getState();
    ui.requestFocus(null); // A custom pick normally opens the width field; this choice keeps the drawing exposed.
    if (isWallMounted(item)) {
      const row = editableUpperRows(useDesignStore.getState().design.items).find((row) => inUpperRow(item, row));
      ui.setWallElevation(row?.elevation ?? null);
      ui.setViewFilter('wall');
    } else if (ui.viewFilter === 'wall') ui.setViewFilter('floor');
    close();
  };
  return <Dialog open title={t.phone.addElement} sheet onClose={close}
    footer={inPlan && added && added.id === selectedId && <>
      <Button variant="primary" onClick={() => editOnDrawing(added)}><MousePointer2 className="size-4" aria-hidden="true" />{t.canvas.onDrawing}</Button>
      <PlanMoveButton onStart={close} /><SizeButton short onEdit={close} />
    </>}
    headerNote={<p role="status" aria-atomic="true" className="text-xs font-medium text-studio-accent">{added && t.sheet.added(t.kinds[added.kind], added.label)}</p>}>
    <p className="px-4 pt-3 text-sm text-studio-muted">{inPlan && added ? t.canvas.drawingHint : t.phone.addHint}</p>
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
  const placing = useUiStore((s) => s.cabinetTool === 'place');
  const empty = useDesignStore((s) => s.design.items.length === 0);
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
        {view === 'plan' && <DesignCanvas compact onAdd={openAdd} />}
        {view === '3d' && <View3D compact />}
        {view === '3d' && <div className="mobile-scene-tools"><PhoneViewButton /></div>}
        {view === 'list' && <CuttingListView />}
        {designing && !item && !(view === 'plan' && empty) && (
          <div className={`pointer-events-none absolute inset-x-0 bottom-0 flex justify-center gap-2 bg-gradient-to-t from-studio-canvas/90 to-transparent px-3 pb-[max(env(safe-area-inset-bottom),14px)] pt-6 ${view === 'plan' ? 'phone-plan-dock' : ''}`}>
            <AddButton open={openAdd} />
          </div>
        )}
        {designing && item && !placing && <ItemSheet key={item.id} item={item} adding={sheet === 'add'} onAdd={openAdd} />}
      </main>}
      {roomOpen && <div className="phone-flow-actions"><ChecksButton variant="chip" /><RoomNextStep /></div>}
      <MobileNavigation />

      {sheet === 'add' && <AddSheet close={closeAdd} />}
      <ConstructionDialog />
      <LayoutDialog />
      <ProjectsDialog />
    </PhoneThreeChrome>
  );
}
