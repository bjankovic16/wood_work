import { ChevronDown, ChevronUp, Plus, Ruler } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { KitchenItem } from '../../domain/types';
import { useT } from '../../i18n';
import { useDesignStore } from '../../store/designStore';
import { useUiStore } from '../../store/uiStore';
import { DesignCanvas } from '../canvas/DesignCanvas';
import { ConstructionDialog } from '../construction/ConstructionDialog';
import { CuttingListView } from '../cutting/CuttingListView';
import { LibrarySections } from '../library/LibraryPanel';
import { DeleteButton, DuplicateButton, ItemFields, ItemHeader, RotateButtons } from '../properties/ItemPanel';
import { RoomWorkspace } from '../room/RoomWorkspace';
import { Button, Dialog } from '../ui';
import { View3D } from '../three/View3D';
import { LayoutDialog } from '../layouts/LayoutDialog';
import { ProjectsDialog } from '../projects/ProjectsDialog';
import { TopBar } from './TopBar';

/** The selected unit, docked at the bottom of the plan; expands to show all its settings. */
function ItemSheet({ item }: { item: KitchenItem }) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const manipulating = useUiStore((s) => s.view === '3d' && s.cabinetTool !== null);
  return (
    <div
      className={`studio-panel absolute inset-x-0 bottom-0 z-10 flex flex-col rounded-t-3xl border-t shadow-[0_-8px_30px_rgba(51,47,40,0.1)] ${manipulating ? 'max-h-[42%]' : 'max-h-[62%]'}`}
      data-testid="item-sheet"
    >
      <ItemHeader item={item} compact />
      <div className="flex items-center gap-1.5 px-4 pb-3">
        <RotateButtons />
        <DuplicateButton iconOnly />
        <DeleteButton iconOnly />
        <div className="flex-1" />
        <Button variant="outline" aria-expanded={expanded} onClick={() => setExpanded((e) => !e)}>
          {expanded ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
          {expanded ? t.phone.less : t.phone.edit}
        </Button>
      </div>
      {expanded && (
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-zinc-100 pb-[env(safe-area-inset-bottom)]">
          <ItemFields key={item.id} item={item} />
        </div>
      )}
    </div>
  );
}

/**
 * Phones and small tablets: the plan fills the screen; the element library,
 * the room settings and the selected unit slide up from the bottom.
 */
export function CompactLayout() {
  const t = useT();
  const view = useUiStore((s) => s.view);
  const layoutsOpen = useUiStore((s) => s.layoutsOpen);
  const roomOpen = useUiStore((s) => s.roomOpen);
  const selectedId = useUiStore((s) => s.selectedId);
  const item = useDesignStore((s) => (selectedId ? s.design.items.find((i) => i.id === selectedId) : undefined));
  const [sheet, setSheet] = useState<'add' | null>(null);

  const designing = view !== 'list';

  // Leaving the plan and 3D views closes anything that belongs to them.
  useEffect(() => {
    if (view === 'list' || layoutsOpen || roomOpen) setSheet(null);
  }, [view, layoutsOpen, roomOpen]);

  return (
    <div className="flex h-dvh select-none flex-col bg-studio-canvas text-studio-ink">
      <TopBar compact />
      {roomOpen ? <RoomWorkspace compact /> : <main className="relative min-h-0 flex-1">
        {view === 'plan' && <DesignCanvas compact />}
        {view === '3d' && <View3D compact />}
        {view === 'list' && <CuttingListView />}
        {designing && !item && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center gap-2 bg-gradient-to-t from-studio-canvas/90 to-transparent px-3 pb-[max(env(safe-area-inset-bottom),14px)] pt-6">
            <Button variant="primary" className="pointer-events-auto h-11 rounded-full px-5 text-sm shadow-lg" onClick={() => setSheet('add')}>
              <Plus className="size-4" />
              {t.phone.addElement}
            </Button>
            <Button variant="outline" className="pointer-events-auto h-11 rounded-full px-4 text-sm shadow-lg" onClick={() => useUiStore.getState().setRoomOpen(true)}>
              <Ruler className="size-4" />
              {t.phone.room}
            </Button>
          </div>
        )}
        {designing && item && <ItemSheet key={item.id} item={item} />}
      </main>}

      <Dialog open={sheet === 'add'} title={t.phone.addElement} sheet onClose={() => setSheet(null)}>
        <p className="px-4 pt-3 text-xs text-zinc-500">{t.phone.addHint}</p>
        <div className="space-y-1 px-3 pb-[max(env(safe-area-inset-bottom),16px)] pt-1">
          <LibrarySections wide onAdded={() => setSheet(null)} />
        </div>
      </Dialog>
      <ConstructionDialog />
      <LayoutDialog />
      <ProjectsDialog />
    </div>
  );
}
