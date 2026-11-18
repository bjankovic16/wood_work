import { roomFeaturePose } from '../../domain/roomGeometry';
import type { RoomObjectSelection } from '../../domain/roomObjectPlacement';
import type { Opening, Room } from '../../domain/types';
import { openingFrame, openingOnWall, roomSegments, wallPoint } from '../../domain/walls';
import { useT, type Messages } from '../../i18n';
import { useDesignStore } from '../../store/designStore';
import { useUiStore } from '../../store/uiStore';

export function useRoomReadout() {
  const t = useT();
  const selection = useUiStore((s) => s.roomSelection);
  const { room, openings } = useDesignStore((s) => s.design);
  return selection && roomObjectReadout(room, openings, selection, t);
}

export function roomObjectReadout(room: Room, openings: Opening[], selection: RoomObjectSelection, t: Messages) {
  const segments = roomSegments(room);
  const mm = (value: number) => `${t.number(Math.round(value))} mm`;
  if (selection.type === 'opening') {
    const o = openings.find((o) => o.id === selection.id);
    if (!o) return null;
    const frame = openingFrame(room, o);
    if (!frame) return null;
    const binding = openingOnWall(room, o);
    return {
      name: `${t.room.opening(o.kind)} ${openings.filter((entry) => entry.kind === o.kind).indexOf(o) + 1}`,
      centre: wallPoint(frame, o.offset + o.width / 2), elevation: o.sill + o.height / 2, wallId: binding?.segment.id,
      lines: [`${o.width} × ${o.height} mm`, binding
        ? `${t.advancedRoom.wall(segments.findIndex((s) => s.id === binding.segment.id) + 1)} · ${t.advancedRoom.offset}: ${mm(binding.offset)}`
        : `${t.walls[o.wall]} · ${o.wall === 'top' || o.wall === 'bottom' ? t.item.fromLeftWall : t.item.fromTopWall}: ${mm(o.offset)}`,
        `${o.kind === 'window' ? t.room.sill : t.item.heightFromFloor}: ${mm(o.sill)}`],
    };
  }

  const f = room.features?.find((f) => f.id === selection.id);
  if (!f) return null;
  return {
    name: `${t.engine.roomFeatures[f.kind]} ${room.features!.indexOf(f) + 1}`,
    centre: roomFeaturePose(room, f).centre, elevation: room.height / 2, wallId: f.wallId,
    lines: [`${f.width} × ${f.depth} × ${room.height} mm`, ...(f.wallId
      ? [`${t.advancedRoom.wall(segments.findIndex((s) => s.id === f.wallId) + 1)} · ${t.advancedRoom.offset}: ${mm(f.offset ?? 0)}`]
      : [`${t.item.fromLeftWall}: ${mm(f.x)}`, `${t.item.fromTopWall}: ${mm(f.y)}`])],
  };
}

export function KitchenPlanRoomReadout() {
  const selection = useUiStore((s) => s.roomSelection);
  return selection && <PlacedReadout />;
}

function PlacedReadout() {
  const data = useRoomReadout();
  const pan = useUiStore((s) => s.pan);
  const zoom = useUiStore((s) => s.zoom);
  return data && <DrawingReadout data={data} x={pan.x + data.centre.x * zoom} y={pan.y + data.centre.y * zoom} minTop={40} />;
}

type Readout = NonNullable<ReturnType<typeof useRoomReadout>>;

export function DrawingReadout({ data, x, y, minTop = 4 }: { data: Readout; x: number; y: number; minTop?: number }) {
  return <div className="pointer-events-none absolute" style={{ left: `clamp(4px, ${x + 8}px, calc(100% - 194px))`,
    top: `clamp(${minTop}px, ${y + 8}px, calc(100% - 70px))` }}>
    <RoomReadout data={data} testId="room-readout-2d" />
  </div>;
}

export function RoomReadout({ data, testId }: { data: Readout; testId?: string }) {
  return <div data-testid={testId} className="pointer-events-none w-max max-w-48 rounded-lg border border-[#c0cdbb] bg-[#fffffaf5] px-2 py-1 text-[11px] leading-snug text-studio-ink shadow-sm">
    <strong>{data.name}</strong>{data.lines.map((line) => <div key={line}>{line}</div>)}
  </div>;
}

export function editRoomPositionIn2D() {
  const ui = useUiStore.getState();
  const { room, openings } = useDesignStore.getState().design;
  const selected = ui.roomSelection;
  const o = selected?.type === 'opening' && openings.find((o) => o.id === selected.id);
  const wall = o ? openingOnWall(room, o)?.segment : undefined;
  ui.setRoomOpen(true);
  if (selected) ui.selectRoomObject(selected, wall?.id);
  ui.setRoomElevationOpen(!!wall);
  if (selected) requestAnimationFrame(() => {
    // In a split view the button still exists. Return keyboard focus to the actual 2D drawing.
    const target = selected.type === 'opening' ? 'data-elevation-opening' : 'data-plan-feature';
    document.querySelector<SVGElement>(`[${target}="${CSS.escape(selected.id)}"]`)?.focus({ preventScroll: true });
  });
}
