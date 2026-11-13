import { AppWindow, DoorOpen, Hammer, LayoutTemplate, Plus, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { ROOM_LIMITS } from '../../domain/designOps';
import { isWallMounted } from '../../domain/geometry';
import { wallLength } from '../../domain/openings';
import type { Opening, Wall } from '../../domain/types';
import { useIsCompact } from '../../hooks/useMediaQuery';
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

/** Room size, a summary of the elements, and help. Shared by the desktop panel and the phone sheet. */
const WALL_OPTIONS: Array<{ value: Wall; label: string }> = [
  { value: 'top', label: 'Top wall' },
  { value: 'right', label: 'Right wall' },
  { value: 'bottom', label: 'Bottom wall' },
  { value: 'left', label: 'Left wall' },
];

function OpeningCard({ opening, number }: { opening: Opening; number: number }) {
  const room = useDesignStore((s) => s.design.room);
  const window = opening.kind === 'window';
  const length = wallLength(room, opening.wall);
  const fromLabel = opening.wall === 'top' || opening.wall === 'bottom' ? 'From the left' : 'From the top';
  return (
    <div className="space-y-1.5 rounded-lg border border-zinc-200 p-3" data-testid="opening-card">
      <div className="flex items-center gap-2">
        {window ? <AppWindow className="size-4 text-sky-600" /> : <DoorOpen className="size-4 text-zinc-600" />}
        <span className="flex-1 text-xs font-semibold text-zinc-800">
          {window ? 'Window' : 'Door'} {number}
        </span>
        <Button
          title="Remove"
          aria-label={`Remove ${window ? 'window' : 'door'} ${number}`}
          className="-my-1 h-7 min-w-7 px-1"
          onClick={() => actions.removeOpening(opening.id)}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      <SelectField label="Wall" value={opening.wall} options={WALL_OPTIONS} onChange={(wall) => actions.updateOpening(opening.id, { wall })} />
      <NumberField label={fromLabel} value={opening.offset} min={0} max={length - opening.width} onCommit={(offset) => actions.updateOpening(opening.id, { offset })} />
      <NumberField label="Width" value={opening.width} min={300} max={length} onCommit={(width) => actions.updateOpening(opening.id, { width })} />
      <NumberField label="Height" value={opening.height} min={300} max={room.height} onCommit={(height) => actions.updateOpening(opening.id, { height })} />
      {window && (
        <NumberField label="Sill height" title="Floor to the bottom of the window" value={opening.sill} min={0} max={room.height - opening.height} onCommit={(sill) => actions.updateOpening(opening.id, { sill })} />
      )}
    </div>
  );
}

function OpeningsSection() {
  const openings = useDesignStore((s) => s.design.openings);
  const count = { window: 0, door: 0 };
  return (
    <PanelSection title="Windows and doors">
      {openings.length === 0 && (
        <p className="text-xs leading-relaxed text-zinc-500">Add them so cabinets are kept clear of them and the checks can warn you.</p>
      )}
      {openings.map((opening) => (
        <OpeningCard key={opening.id} opening={opening} number={++count[opening.kind]} />
      ))}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={() => actions.addOpening('window')}>
          <Plus className="size-4" />
          Window
        </Button>
        <Button variant="outline" onClick={() => actions.addOpening('door')}>
          <Plus className="size-4" />
          Door
        </Button>
      </div>
    </PanelSection>
  );
}

export function RoomPanel({ touch = false }: { touch?: boolean }) {
  const room = useDesignStore((s) => s.design.room);
  const items = useDesignStore((s) => s.design.items);
  const wallUnits = items.filter(isWallMounted).length;
  const [confirming, setConfirming] = useState(false);
  const compact = useIsCompact();

  return (
    <>
      <PanelSection title="Room size">
        <NumberField
          label="Width"
          title="Length of the top and bottom walls"
          value={room.width}
          {...ROOM_LIMITS.width}
          onCommit={(v) => actions.setRoomSize({ width: v })}
        />
        <NumberField
          label="Depth"
          title="Length of the left and right walls"
          value={room.depth}
          {...ROOM_LIMITS.depth}
          onCommit={(v) => actions.setRoomSize({ depth: v })}
        />
        <NumberField label="Ceiling height" value={room.height} {...ROOM_LIMITS.height} onCommit={(v) => actions.setRoomSize({ height: v })} />
      </PanelSection>

      <OpeningsSection />

      <PanelSection title="Elements">
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Floor units" value={items.length - wallUnits} />
          <Stat label="Wall units" value={wallUnits} />
        </div>
        <Button variant="outline" className="w-full" onClick={() => useUiStore.getState().setLayoutsOpen(true)}>
          <LayoutTemplate className="size-4" />
          Ready-made layouts
        </Button>
        <Button variant="outline" className="w-full" onClick={() => useUiStore.getState().setSettingsTab('construction')}>
          <Hammer className="size-4" />
          Construction settings
        </Button>
        {items.length > 0 && (
          <Button variant="danger" className="w-full" onClick={() => setConfirming(true)}>
            <Trash2 className="size-4" />
            Remove all elements
          </Button>
        )}
        <Dialog
          open={confirming}
          title="Remove all elements?"
          sheet={compact}
          onClose={() => setConfirming(false)}
          footer={
            <>
              <Button variant="outline" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                className="bg-red-600 px-4 hover:bg-red-700"
                onClick={() => {
                  setConfirming(false);
                  actions.clearAllItems();
                }}
              >
                Remove all
              </Button>
            </>
          }
        >
          <p className="px-5 py-4 text-[13px] leading-relaxed text-zinc-600">
            All {items.length} elements will be taken off the plan. You can bring them back with Undo.
          </p>
        </Dialog>
      </PanelSection>

      <PanelSection title="How it works">
        {touch ? (
          <ul className="list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-zinc-600">
            <li>Tap “Add element” and pick a cabinet. It goes into the first free spot along the walls.</li>
            <li>Drag a cabinet with one finger to move it. Near a wall it turns and snaps against it.</li>
            <li>Pinch to zoom, drag an empty area to pan.</li>
          </ul>
        ) : (
          <>
            <ul className="list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-zinc-600">
              <li>Drag an element from the left onto the plan. Near a wall it turns and snaps against it.</li>
              <li>Drag a placed element to move it; drag its blue handles to resize it.</li>
              <li>Scroll to zoom, drag an empty area to pan.</li>
            </ul>
            <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 pt-2 text-xs text-zinc-600">
              <Shortcut keys={['R']}>Rotate</Shortcut>
              <Shortcut keys={['Del']}>Delete</Shortcut>
              <Shortcut keys={['Ctrl', 'D']}>Duplicate</Shortcut>
              <Shortcut keys={['←', '→', '↑', '↓']}>Move 10 mm (Shift: 100)</Shortcut>
              <Shortcut keys={['Ctrl', 'Z']}>Undo</Shortcut>
              <Shortcut keys={['Ctrl', 'Y']}>Redo</Shortcut>
              <Shortcut keys={['Esc']}>Deselect</Shortcut>
            </div>
          </>
        )}
      </PanelSection>
    </>
  );
}
