import { AppWindow, Box, BrickWall, Columns3, DoorOpen, Hammer, Info, Layers, Plus, Trash2 } from 'lucide-react';
import { useId, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { ROOM_LIMITS } from '../../domain/designOps';
import { isWallMounted } from '../../domain/geometry';
import { wallLength } from '../../domain/openings';
import type { Opening } from '../../domain/types';
import { MAX_ROOM_FEATURES } from '../../domain/roomGeometry';
import { useIsCompact } from '../../hooks/useMediaQuery';
import { useT } from '../../i18n';
import * as actions from '../../store/actions';
import { useDesignStore } from '../../store/designStore';
import { useUiStore } from '../../store/uiStore';
import { Button, Dialog, Kbd, PanelSection, TooltipButton } from '../ui';
import { NumberField, SelectField } from './NumberField';
import { RoomFeatureFields, RoomStructureSettings } from './RoomStructureSettings';
import { AdvancedRoomSettings } from './AdvancedRoomSettings';
import { openingOnWall, roomSegments } from '../../domain/walls';
import { editRoomPositionIn2D, RoomReadout, useRoomReadout } from '../room/RoomReadout';

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

export function OpeningCard({ opening, number }: { opening: Opening; number: number }) {
  const t = useT();
  const room = useDesignStore((s) => s.design.room);
  const window = opening.kind === 'window';
  const binding = openingOnWall(room, opening);
  const length = Math.floor(binding?.segment.length ?? wallLength(room, opening.wall));
  const ceiling = binding?.segment.height ?? room.height;
  const update = (patch: Partial<Opening>) => actions.updateOpening(opening.id, {
    ...(binding ? { wallId: binding.segment.id, offset: binding.offset } : {}), ...patch,
  });
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
        value={binding?.segment.id ?? opening.wall}
        options={roomSegments(room).map((s, i) => ({ value: s.id, label: t.advancedRoom.wall(i + 1) }))}
        onChange={(wallId) => { update({ wallId }); useUiStore.getState().selectRoomObject({ type: 'opening', id: opening.id }, wallId); }}
      />
      <NumberField label={t.advancedRoom.offset} value={Math.round(binding?.offset ?? opening.offset)} min={0} max={length - opening.width} onCommit={(offset) => update({ offset })} />
      <NumberField label={t.room.width} value={opening.width} min={100} max={length} onCommit={(width) => update({ width })} />
      <NumberField label={t.room.height} value={opening.height} min={100} max={ceiling - opening.sill} onCommit={(height) => update({ height })} />
      {window && (
        <NumberField
          label={t.room.sill}
          title={t.room.sillTitle}
          value={opening.sill}
          min={0}
          max={ceiling - opening.height}
          onCommit={(sill) => update({ sill })}
        />
      )}
    </div>
  );
}

export function RoomObjectButtons({ wallId, menu = false, facing = false }: { wallId?: string; menu?: boolean; facing?: boolean }) {
  const t = useT();
  const count = useDesignStore((s) => s.design.room.features?.length ?? 0);
  const [failed, setFailed] = useState(false);
  const add = (e: MouseEvent, operation: () => void) => {
    try { operation(); setFailed(false); }
    catch (error) { if (!(error instanceof RangeError)) throw error; e.stopPropagation(); setFailed(true); }
  };
  const groups = [
    { title: t.room.windowsAndDoors, choices: [{ kind: 'window', Icon: AppWindow }, { kind: 'door', Icon: DoorOpen }] },
    { title: t.room.fixedStructures, choices: [{ kind: 'chimney', Icon: BrickWall }, { kind: 'column', Icon: Columns3 }, { kind: 'projection', Icon: Box }] },
  ] as const;
  return <div className={menu ? 'room-add-choices' : 'flex flex-wrap gap-2'}>
    {groups.map(({ title, choices }) => <fieldset key={title} className={menu ? undefined : 'contents'}>
      <legend className={menu ? undefined : 'sr-only'}>{title}</legend>
      {choices.map(({ kind, Icon }) => {
        const opening = kind === 'door' || kind === 'window';
        return <Button key={kind} variant={menu ? 'ghost' : 'outline'} data-close-menu={menu || undefined}
          disabled={!opening && count >= MAX_ROOM_FEATURES} onClick={(e) => add(e, () => {
            if (opening) {
              actions.addOpening(kind, wallId);
              if (menu) useUiStore.getState().setRoomElevationOpen(true);
            }
            else actions.addRoomFeature(kind, facing || kind === 'chimney' ? wallId : undefined);
          })}>
          {menu ? <Icon size={17} aria-hidden="true" /> : <Plus className="size-4" />}{opening ? t.room.opening(kind) : t.engine.roomFeatures[kind]}
        </Button>;
      })}
    </fieldset>)}
    {menu && count >= MAX_ROOM_FEATURES && <p className="text-xs text-studio-muted">{t.roomStructure.limit}</p>}
    {failed && <p role="alert" className="w-full text-xs text-red-700">{t.room.noSpace}</p>}
  </div>;
}

export function RoomObjectsSection({ workspace = false }: { workspace?: boolean }) {
  const t = useT();
  const id = useId();
  const openings = useDesignStore((s) => s.design.openings);
  const room = useDesignStore((s) => s.design.room);
  const wallId = useUiStore((s) => s.selectedWallId);
  const selection = useUiStore((s) => s.roomSelection);
  const walls = roomSegments(room);
  const wall = walls.find((s) => s.id === wallId);
  const ui = useUiStore.getState();
  const count = { window: 0, door: 0 };
  const objects = [
    ...openings.map((o) => ({ type: 'opening' as const, id: o.id, wallId: openingOnWall(room, o)?.segment.id, name: `${t.room.opening(o.kind)} ${++count[o.kind]}` })),
    ...(room.features ?? []).map((f, i) => ({ type: 'feature' as const, id: f.id, wallId: f.wallId, name: `${t.engine.roomFeatures[f.kind]} ${i + 1}` })),
  ];
  return <section className="room-inventory">
    {!workspace && <RoomObjectButtons wallId={wall?.id} />}
    <div className="room-inventory-label"><Layers size={16} aria-hidden="true" />
      {objects.length ? <label htmlFor={id}>{t.room.roomObjects}</label> : <h3>{t.room.roomObjects}</h3>}<span>{objects.length}</span>
    </div>
    {objects.length ? <select id={id} value={selection ? `${selection.type}:${selection.id}` : ''}
      onChange={(e) => {
        const object = objects.find((o) => `${o.type}:${o.id}` === e.target.value);
        if (!object) { ui.selectRoomObject(null); return; }
        ui.selectRoomObject({ type: object.type, id: object.id }, object.wallId);
        if (workspace) ui.setRoomElevationOpen(!!object.wallId && (object.type === 'opening' || ui.roomElevationOpen));
      }}>
      <option value="">{t.room.chooseObject}</option>
      {objects.map((o) => {
        const i = walls.findIndex((w) => w.id === o.wallId);
        return <option key={`${o.type}:${o.id}`} value={`${o.type}:${o.id}`}>{o.name}{i >= 0 ? ` · ${t.advancedRoom.wall(i + 1)}` : ''}</option>;
      })}
    </select> : <p>{workspace ? t.room.emptyObjects : t.room.openingsHint}</p>}
  </section>;
}

export function SelectedRoomCard() {
  const t = useT();
  const selection = useUiStore((s) => s.roomSelection);
  const { room, openings } = useDesignStore((s) => s.design);
  const card = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = card.current;
    if (!el) return;
    const panel = el.closest<HTMLElement>('.room-tool-panel');
    if (!panel) { el.scrollIntoView({ block: 'nearest' }); return; }
    // Reveal the fields within the inspector, never scroll the drawing out from under a finger.
    const box = el.getBoundingClientRect(), viewport = panel.getBoundingClientRect();
    if (box.top < viewport.top || box.bottom > viewport.bottom) panel.scrollTop += box.top - viewport.top;
  }, [selection?.id]);
  const o = selection?.type === 'opening' ? openings.find((o) => o.id === selection.id) : undefined;
  const f = selection?.type === 'feature' ? room.features?.find((f) => f.id === selection.id) : undefined;
  if (!o && !f) return null;
  const number = o ? openings.filter((entry) => entry.kind === o.kind).indexOf(o) + 1 : room.features!.indexOf(f!) + 1;
  const name = `${o ? t.room.opening(o.kind) : t.engine.roomFeatures[f!.kind]} ${number}`;
  return <div ref={card} data-testid="selected-room-card" className="border-b border-studio-line bg-[#eff4ec] p-3">
    {o && <OpeningCard key={o.id} opening={o} number={number} />}
    {f && <div key={f.id} data-room-feature={f.id} className="space-y-1.5 rounded-lg border border-studio-line bg-studio-paper p-3">
      <div className="flex items-center gap-1">
        <h3 className="mr-auto text-xs font-semibold">{name}</h3>
        <TooltipButton tooltip={t.roomStructure.moveHint} aria-label={t.roomStructure.moveHint}><Info className="size-4" /></TooltipButton>
        <Button aria-label={t.roomStructure.remove(name)} onClick={() => actions.removeRoomFeature(f.id)}><Trash2 className="size-4" /></Button>
      </div>
      <RoomFeatureFields feature={f} />
      {f.kind === 'chimney' && <p className="pt-1 text-xs text-studio-muted">{t.roomStructure.fullHeight}</p>}
    </div>}
  </div>;
}

export function RoomDimensions({ tiles = false }: { tiles?: boolean }) {
  const t = useT();
  const room = useDesignStore((s) => s.design.room);
  const [failed, setFailed] = useState(false);
  const resize = (patch: Partial<typeof room>) => {
    try { actions.setRoomSize(patch); setFailed(false); }
    catch (error) { if (!(error instanceof RangeError)) throw error; setFailed(true); return false; }
  };
  const fields = <>
    <NumberField label={t.room.width} title={t.room.widthTitle} value={room.width} {...ROOM_LIMITS.width} onCommit={(v) => resize({ width: v })} />
    <NumberField label={t.room.depth} title={t.room.depthTitle} value={room.depth} {...ROOM_LIMITS.depth} onCommit={(v) => resize({ depth: v })} />
    <NumberField label={t.room.ceilingHeight} shortLabel={tiles ? t.room.height : undefined} title={t.room.ceilingHeight} value={room.height} {...ROOM_LIMITS.height} onCommit={(v) => resize({ height: v })} />
  </>;
  const error = failed && <p role="alert" className="text-xs text-red-700">{t.advancedRoom.invalid}</p>;
  if (!tiles) return <PanelSection title={t.room.roomSize}>{fields}{error}</PanelSection>;
  return <section className="room-sizes">
    <h3>{t.room.roomSize}</h3>
    <div className="room-size-grid">{fields}</div>
    {error}
  </section>;
}

export function AdvancedRoomSection({ children }: { children?: ReactNode }) {
  const t = useT();
  return <details className="border-b border-studio-line">
    <summary className="cursor-pointer px-4 py-4 text-xs font-medium text-studio-accent">{t.room.advanced}</summary>
    <RoomStructureSettings />
    <AdvancedRoomSettings />
    {children}
  </details>;
}

export function RoomPanel({ touch = false }: { touch?: boolean }) {
  const t = useT();
  const items = useDesignStore((s) => s.design.items);
  const room = useDesignStore((s) => s.design.room);
  const data = useRoomReadout();
  const wallUnits = items.filter(isWallMounted).length;
  const [confirming, setConfirming] = useState(false);
  const compact = useIsCompact();
  const keys = t.room.shortcuts;

  return (
    <>
      <PanelSection title={t.room.roomSize}>
        <p className="text-sm">{room.width} × {room.depth} × {room.height} mm</p>
        {data && <RoomReadout data={data} testId="selected-room-card" />}
        <Button variant="outline" onClick={data ? editRoomPositionIn2D : useUiStore.getState().openRoomPlan}>
          {data ? t.room.editIn2D : t.room.tab}
        </Button>
      </PanelSection>
      <PanelSection title={t.room.elements}>
        <div className="grid grid-cols-2 gap-2">
          <Stat label={t.room.floorUnits} value={items.length - wallUnits} />
          <Stat label={t.room.wallUnits} value={wallUnits} />
        </div>
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
