import { useT } from '../../i18n';
import { useDesignStore } from '../../store/designStore';
import { useUiStore } from '../../store/uiStore';
import { DeleteButton, DuplicateButton, ItemFields, ItemHeader, RotateButtons } from './ItemPanel';
import { RoomPanel } from './RoomPanel';

/** Right-hand sidebar on large screens: the selected unit, or the room when nothing is selected. */
export function PropertiesPanel() {
  const t = useT();
  const selectedId = useUiStore((s) => s.selectedId);
  const item = useDesignStore((s) => (selectedId ? s.design.items.find((i) => i.id === selectedId) : undefined));
  return (
    <aside className="flex w-[300px] shrink-0 flex-col border-l border-zinc-200 bg-white">
      {item ? (
        <>
          <ItemHeader item={item} />
          <div className="flex items-center gap-1.5 border-b border-zinc-100 px-4 py-2.5">
            <RotateButtons />
            <div className="flex-1" />
            <DuplicateButton />
            <DeleteButton />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ItemFields key={item.id} item={item} />
          </div>
        </>
      ) : (
        <>
          <div className="border-b border-zinc-100 px-4 py-4">
            <div className="text-sm font-semibold text-zinc-900">{t.item.room}</div>
            <div className="text-xs text-zinc-500">{t.item.roomHint}</div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <RoomPanel />
          </div>
        </>
      )}
    </aside>
  );
}
