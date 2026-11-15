import { useIsCompact } from '../../hooks/useMediaQuery';
import { useT } from '../../i18n';
import { useDesignStore } from '../../store/designStore';
import { useUiStore } from '../../store/uiStore';
import { Button, Dialog } from '../ui';
import { RoomSettings } from './RoomPanel';

export function RoomDialog({ onDone }: { onDone?: () => void }) {
  const t = useT();
  const compact = useIsCompact();
  const open = useUiStore((state) => state.roomOpen);
  const empty = useDesignStore((state) => state.design.items.length === 0);
  const close = () => useUiStore.getState().setRoomOpen(false);

  return (
    <Dialog
      open={open}
      title={t.room.setupTitle}
      sheet={compact}
      onClose={close}
      footer={
        <>
          <Button variant="outline" onClick={() => { close(); useUiStore.getState().setLayoutsOpen(true); }}>{t.layouts.title}</Button>
          <Button variant="primary" onClick={() => {
            close();
            if (empty && !compact) useUiStore.getState().requestFocus('library-search');
            onDone?.();
          }}>
            {empty ? t.room.startAdding : t.common.done}
          </Button>
        </>
      }
    >
      <p className="px-4 pt-4 text-[13px] leading-relaxed text-zinc-600">{t.room.setupIntro}</p>
      <RoomSettings />
    </Dialog>
  );
}
