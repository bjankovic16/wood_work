import { AppWindow, DoorOpen, Hammer, LayoutTemplate, Plus, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { ROOM_LIMITS } from '../../domain/designOps';
import { isWallMounted } from '../../domain/geometry';
import { wallLength } from '../../domain/openings';
import type { Opening, Wall } from '../../domain/types';
import { useIsCompact } from '../../hooks/useMediaQuery';
import { useT } from '../../i18n';
import * as actions from '../../store/actions';
import { useDesignStore } from '../../store/designStore';
import { useUiStore } from '../../store/uiStore';
import { Button, Dialog, Kbd, PanelSection } from '../ui';
import { NumberField, SelectField } from './NumberField';

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
      <div className="text-lg font-semibold tabular-nums text-zinc-900">{value}</div>
      <div className="text-[11px] text-zinc-500">{label}</div>
    </div>
  );
}

function Shortcut({ keys, children }: { keys: string[]; children: ReactNode }) {
  return (
    <>
      <span>{children}</span>
      <span className="flex justify-end gap-1">
        {keys.map((k) => (
          <Kbd key={k}>{k}</Kbd>
        ))}
      </span>
    </>
  );
}

const WALLS: Wall[] = ['top', 'right', 'bottom', 'left'];

function OpeningCard({ opening, number }: { opening: Opening; number: number }) {
  const t = useT();
  const room = useDesignStore((s) => s.design.room);
  const window = opening.kind === 'window';
  const length = wallLength(room, opening.wall);
  const fromLabel = opening.wall === 'top' || opening.wall === 'bottom' ? t.room.fromLeft : t.room.fromTop;
  return (
    <div className="space-y-1.5 rounded-lg border border-zinc-200 p-3" data-testid="opening-card">
      <div className="flex items-center gap-2">
        {window ? <AppWindow className="size-4 text-sky-600" /> : <DoorOpen className="size-4 text-zinc-600" />}
        <span className="flex-1 text-xs font-semibold text-zinc-800">
          {t.room.opening(opening.kind)} {number}
        </span>
        <Button
          title={t.room.remove}
          aria-label={t.room.removeOpening(opening.kind, number)}
          className="-my-1 h-7 min-w-7 px-1"
          onClick={() => actions.removeOpening(opening.id)}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      <SelectField
        label={t.room.wall}
        value={opening.wall}
        options={WALLS.map((wall) => ({ value: wall, label: t.walls[wall] }))}
        onChange={(wall) => actions.updateOpening(opening.id, { wall })}
      />
      <NumberField label={fromLabel} value={opening.offset} min={0} max={length - opening.width} onCommit={(offset) => actions.updateOpening(opening.id, { offset })} />
      <NumberField label={t.room.width} value={opening.width} min={300} max={length} onCommit={(width) => actions.updateOpening(opening.id, { width })} />
      <NumberField label={t.room.height} value={opening.height} min={300} max={room.height} onCommit={(height) => actions.updateOpening(opening.id, { height })} />
      {window && (
        <NumberField
          label={t.room.sill}
          title={t.room.sillTitle}
          value={opening.sill}
          min={0}
          max={room.height - opening.height}
          onCommit={(sill) => actions.updateOpening(opening.id, { sill })}
        />
      )}
    </div>
  );
}

function OpeningsSection() {
  const t = useT();
  const openings = useDesignStore((s) => s.design.openings);
  const count = { window: 0, door: 0 };
  return (
    <PanelSection title={t.room.windowsAndDoors}>
      {openings.length === 0 && <p className="text-xs leading-relaxed text-zinc-500">{t.room.openingsHint}</p>}
      {openings.map((opening) => (
        <OpeningCard key={opening.id} opening={opening} number={++count[opening.kind]} />
      ))}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={() => actions.addOpening('window')}>
          <Plus className="size-4" />
          {t.room.opening('window')}
        </Button>
        <Button variant="outline" onClick={() => actions.addOpening('door')}>
          <Plus className="size-4" />
          {t.room.opening('door')}
        </Button>
      </div>
    </PanelSection>
  );
}

export function RoomSettings() {
  const t = useT();
  const room = useDesignStore((s) => s.design.room);
  return (
    <>
      <PanelSection title={t.room.roomSize}>
        <NumberField label={t.room.width} title={t.room.widthTitle} value={room.width} {...ROOM_LIMITS.width} onCommit={(v) => actions.setRoomSize({ width: v })} />
        <NumberField label={t.room.depth} title={t.room.depthTitle} value={room.depth} {...ROOM_LIMITS.depth} onCommit={(v) => actions.setRoomSize({ depth: v })} />
        <NumberField label={t.room.ceilingHeight} value={room.height} {...ROOM_LIMITS.height} onCommit={(v) => actions.setRoomSize({ height: v })} />
      </PanelSection>
      <OpeningsSection />
    </>
  );
}

/** Room size, windows and doors, a summary of the elements, and help. */
export function RoomPanel({ touch = false }: { touch?: boolean }) {
  const t = useT();
  const items = useDesignStore((s) => s.design.items);
  const wallUnits = items.filter(isWallMounted).length;
  const [confirming, setConfirming] = useState(false);
  const compact = useIsCompact();
  const keys = t.room.shortcuts;

  return (
    <>
      <RoomSettings />

      <PanelSection title={t.room.elements}>
        <div className="grid grid-cols-2 gap-2">
          <Stat label={t.room.floorUnits} value={items.length - wallUnits} />
          <Stat label={t.room.wallUnits} value={wallUnits} />
        </div>
        <Button variant="outline" className="w-full" onClick={() => useUiStore.getState().setLayoutsOpen(true)}>
          <LayoutTemplate className="size-4" />
          {t.room.readyMadeLayouts}
        </Button>
        <Button variant="outline" className="w-full" onClick={() => useUiStore.getState().setSettingsTab('construction')}>
          <Hammer className="size-4" />
          {t.room.constructionSettings}
        </Button>
        {items.length > 0 && (
          <Button variant="danger" className="w-full" onClick={() => setConfirming(true)}>
            <Trash2 className="size-4" />
            {t.room.removeAll}
          </Button>
        )}
        <Dialog
          open={confirming}
          title={t.room.removeAllQuestion}
          sheet={compact}
          onClose={() => setConfirming(false)}
          footer={
            <>
              <Button variant="outline" onClick={() => setConfirming(false)}>
                {t.common.cancel}
              </Button>
              <Button
                variant="primary"
                className="bg-red-600 px-4 hover:bg-red-700"
                onClick={() => {
                  setConfirming(false);
                  actions.clearAllItems();
                }}
              >
                {t.room.removeAllConfirm}
              </Button>
            </>
          }
        >
          <p className="px-5 py-4 text-[13px] leading-relaxed text-zinc-600">{t.room.removeAllText(items.length)}</p>
        </Dialog>
      </PanelSection>

      <PanelSection title={t.room.howItWorks}>
        <ul className="list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-zinc-600">
          {(touch ? t.room.touchTips : t.room.desktopTips).map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
        {!touch && (
          <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 pt-2 text-xs text-zinc-600">
            <Shortcut keys={['R']}>{keys.rotate}</Shortcut>
            <Shortcut keys={['Del']}>{keys.delete}</Shortcut>
            <Shortcut keys={['Ctrl', 'D']}>{keys.duplicate}</Shortcut>
            <Shortcut keys={['←', '→', '↑', '↓']}>{keys.move}</Shortcut>
            <Shortcut keys={['Ctrl', 'Z']}>{keys.undo}</Shortcut>
            <Shortcut keys={['Ctrl', 'Y']}>{keys.redo}</Shortcut>
            <Shortcut keys={['Esc']}>{keys.deselect}</Shortcut>
          </div>
        )}
      </PanelSection>
    </>
  );
}
