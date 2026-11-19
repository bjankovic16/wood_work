import type { KonvaEventObject } from 'konva/lib/Node';
import { Group, Line, Rect } from 'react-konva';
import { computeClearances, computeWallChains, computeSegmentChains, type WallChain } from '../../domain/dimensions';
import { footprintPolygon, itemRect, localDepthExtent, localToRoom, roomToLocal } from '../../domain/geometry';
import { polygonBounds } from '../../domain/polygons';
import { roomOutline } from '../../domain/roomGeometry';
import { itemHandles, type Guide, type HandleId } from '../../domain/snapping';
import type { KitchenItem, Room } from '../../domain/types';
import type { Issue } from '../../engine/checks';
import { WALL_THICKNESS } from '../../store/viewport';
import { DimensionLine } from './DimensionLine';
import { ItemShape } from './ItemShape';
import { ACCENT, CANVAS_BACKGROUND, COMPACT_LABEL_PX, DIMENSION_COLORS, GUIDE } from './theme';

/** Distance of each dimension row from the outside face of the wall, in screen pixels. */
const ROW_OFFSET_PX = { floor: 20, wall: 42, room: 64 };

function outsideWall(wall: WallChain['wall'], room: Room, offsetPx: number, px: number) {
  const out = WALL_THICKNESS + offsetPx * px;
  switch (wall) {
    case 'top':
      return { at: -out, face: -WALL_THICKNESS };
    case 'bottom':
      return { at: room.depth + out, face: room.depth + WALL_THICKNESS };
    case 'left':
      return { at: -out, face: -WALL_THICKNESS };
    case 'right':
      return { at: room.width + out, face: room.width + WALL_THICKNESS };
  }
}

function ExtensionLines({ ticks, horizontal, face, at, color, px }: {
  ticks: number[];
  horizontal: boolean;
  face: number;
  at: number;
  color: string;
  px: number;
}) {
  const direction = at > face ? 1 : -1;
  const start = face + direction * 3 * px;
  const end = at + direction * 4 * px;
  return (
    <>
      {ticks.map((t) => (
        <Line
          key={t}
          points={horizontal ? [t, start, t, end] : [start, t, end, t]}
          stroke={color}
          strokeWidth={px}
          opacity={0.45}
          listening={false}
        />
      ))}
    </>
  );
}

function ChainDimensions({ chain, room, px, fontPx }: { chain: WallChain; room: Room; px: number; fontPx: number }) {
  const horizontal = chain.wall === 'top' || chain.wall === 'bottom';
  const { at, face } = outsideWall(chain.wall, room, ROW_OFFSET_PX[chain.level], px);
  const color = chain.level === 'wall' ? DIMENSION_COLORS.wall : DIMENSION_COLORS.floor;
  const ticks = [...new Set(chain.segments.flatMap((s) => [s.from, s.to]))];
  return (
    <Group listening={false}>
      <ExtensionLines ticks={ticks} horizontal={horizontal} face={face} at={at} color={color} px={px} />
      {chain.segments.map((segment) => (
        <DimensionLine
          key={segment.from}
          axis={horizontal ? 'x' : 'y'}
          from={segment.from}
          to={segment.to}
          at={at}
          color={segment.occupied ? color : DIMENSION_COLORS.gap}
          background={CANVAS_BACKGROUND}
          px={px}
          fontPx={fontPx}
        />
      ))}
    </Group>
  );
}

function RoomTotals({ room, px, offset, fontPx }: { room: Room; px: number; offset: number; fontPx: number }) {
  const { x, y, w, h } = polygonBounds(roomOutline(room));
  const top = y - WALL_THICKNESS, left = x - WALL_THICKNESS;
  const props = { color: DIMENSION_COLORS.room, px };
  return <>
    <ExtensionLines ticks={[x, x + w]} horizontal face={top} at={top - offset * px} {...props} />
    <DimensionLine axis="x" from={x} to={x + w} at={top - offset * px} fontPx={fontPx} background={CANVAS_BACKGROUND} {...props} />
    <ExtensionLines ticks={[y, y + h]} horizontal={false} face={left} at={left - offset * px} {...props} />
    <DimensionLine axis="y" from={y} to={y + h} at={left - offset * px} fontPx={fontPx} background={CANVAS_BACKGROUND} {...props} />
  </>;
}

export function WallDimensions({ room, items, px, compact, totalsOnly }: {
  room: Room; items: KitchenItem[]; px: number; compact: boolean; totalsOnly: boolean;
}) {
  const fontPx = compact ? COMPACT_LABEL_PX : 11;
  if (totalsOnly) return <Group name="plan-dimensions" listening={false}><RoomTotals room={room} px={px} offset={12} fontPx={fontPx} /></Group>;
  if (room.vertices || room.partitions?.length) return <Group name="plan-dimensions" listening={false}>
    {computeSegmentChains(room, items).map(({ segment, level, segments }) =>
      <Group key={`${segment.id}-${level}`} x={segment.start.x} y={segment.start.y} rotation={segment.angle}>
        {segments.map((span) => <DimensionLine key={span.from} axis="x" from={span.from} to={span.to}
          at={-WALL_THICKNESS - ROW_OFFSET_PX[level] * px} angle={segment.angle} fontPx={fontPx} px={px}
          color={span.occupied ? DIMENSION_COLORS[level] : DIMENSION_COLORS.gap} background={CANVAS_BACKGROUND} />)}
      </Group>)}
    {compact && <RoomTotals room={room} px={px} offset={ROW_OFFSET_PX.room} fontPx={fontPx} />}
  </Group>;
  const chains = computeWallChains(room, items);
  return (
    <Group name="plan-dimensions" listening={false}>
      {chains.map((chain) => (
        <ChainDimensions key={`${chain.wall}-${chain.level}`} chain={chain} room={room} px={px} fontPx={fontPx} />
      ))}
      <RoomTotals room={room} px={px} offset={ROW_OFFSET_PX.room} fontPx={fontPx} />
    </Group>
  );
}

/** Dimension the actual footprint axes (including a corner's second arm), not its rotated bounding box. */
export function SelectedUnitDimensions({ item, room, px }: { item: KitchenItem; room: Room; px: number }) {
  const origin = localToRoom(item, 0, 0), depth = localDepthExtent(item);
  const bounds = polygonBounds(roomOutline(room));
  const centre = roomToLocal(item, { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 });
  // Place rulers towards the room, not underneath the overall dimensions or off the plan.
  const offset = Math.max(14 * px, 25 * px - Math.min(item.width, depth) / 2);
  const props = { px, angle: item.rotation, alwaysLabel: true, fontPx: COMPACT_LABEL_PX, color: ACCENT, background: '#fffefa' };
  return <Group name="selected-unit-dimensions" x={origin.x} y={origin.y} rotation={item.rotation} listening={false}>
    <DimensionLine axis="x" from={0} to={item.width} at={centre.y >= depth / 2 ? depth + offset : -offset} {...props} />
    <DimensionLine axis="y" from={0} to={depth} at={centre.x >= item.width / 2 ? item.width + offset : -offset} {...props} />
  </Group>;
}

/** Free space between the active item and the nearest wall or unit in each direction. */
export function Clearances({ room, items, item, px, compact }: { room: Room; items: KitchenItem[]; item: KitchenItem; px: number; compact: boolean }) {
  return (
    <Group listening={false}>
      {computeClearances(room, items, item).map((c) => (
        <DimensionLine
          key={`${c.axis}-${c.from}-${c.to}`}
          axis={c.axis}
          from={c.from}
          to={c.to}
          at={c.at}
          color={ACCENT}
          background="rgba(255, 255, 255, 0.92)"
          fontPx={compact ? COMPACT_LABEL_PX : undefined}
          px={px}
        />
      ))}
    </Group>
  );
}

export function Guides({ guides, room, px }: { guides: Guide[]; room: Room; px: number }) {
  return (
    <Group listening={false}>
      {guides.map((g) => (
        <Line
          key={`${g.axis}${g.value}`}
          points={
            g.axis === 'x'
              ? [g.value, -WALL_THICKNESS, g.value, room.depth + WALL_THICKNESS]
              : [-WALL_THICKNESS, g.value, room.width + WALL_THICKNESS, g.value]
          }
          stroke={GUIDE}
          strokeWidth={px}
          dash={[4 * px, 3 * px]}
        />
      ))}
    </Group>
  );
}

interface SelectionProps {
  item: KitchenItem;
  px: number;
  /** Touch screen: bigger handles that are easier to hit with a finger. */
  touch?: boolean;
  onHandlePointerDown: (handle: HandleId, event: KonvaEventObject<PointerEvent>) => void;
  onCursor: (cursor: string) => void;
}

export function Selection({ item, px, touch = false, onHandlePointerDown, onCursor }: SelectionProps) {
  const size = (touch ? 14 : 9) * px;
  // Below this on-screen size the handles would cover the whole unit, leaving nothing to grab.
  const minResizable = touch ? 44 : 28;
  const rect = itemRect(item);
  const handles = itemHandles(item).filter((handle) => {
    const extent = handle.side === 'left' || handle.side === 'right' ? rect.w : rect.h;
    return extent / px >= minResizable;
  });
  return (
    <Group>
      <Line points={footprintPolygon(item)} closed stroke={ACCENT} strokeWidth={2 * px} listening={false} />
      {handles.map((handle) => (
        <Rect
          key={handle.id}
          name="handle"
          x={handle.point.x - size / 2}
          y={handle.point.y - size / 2}
          width={size}
          height={size}
          fill="#ffffff"
          stroke={ACCENT}
          strokeWidth={1.5 * px}
          cornerRadius={2 * px}
          hitStrokeWidth={(touch ? 14 : 8) * px}
          onPointerDown={(e) => onHandlePointerDown(handle.id, e)}
          onMouseEnter={() => onCursor(handle.side === 'left' || handle.side === 'right' ? 'ew-resize' : 'ns-resize')}
          onMouseLeave={() => onCursor('')}
        />
      ))}
    </Group>
  );
}

/** Preview of a library element while it is dragged over the plan. */
export function Ghost({ item, px, compact }: { item: KitchenItem; px: number; compact: boolean }) {
  return (
    <Group listening={false}>
      <Group opacity={0.75}>
        <ItemShape item={item} px={px} compact={compact} />
      </Group>
      <Line points={footprintPolygon(item)} closed stroke={ACCENT} strokeWidth={2 * px} dash={[6 * px, 4 * px]} />
    </Group>
  );
}

/** Red or amber outlines around units the checks have a problem with. */
export function IssueOutlines({ items, issues, px }: { items: KitchenItem[]; issues: Issue[]; px: number }) {
  const severity = new Map<string, Issue['severity']>();
  for (const issue of issues) {
    for (const id of issue.itemIds) if (severity.get(id) !== 'error') severity.set(id, issue.severity);
  }
  return (
    <Group listening={false}>
      {items
        .filter((item) => severity.has(item.id))
        .map((item) => (
          <Line
            key={item.id}
            points={footprintPolygon(item)}
            closed
            stroke={severity.get(item.id) === 'error' ? '#dc2626' : '#d97706'}
            strokeWidth={2 * px}
            dash={[6 * px, 3 * px]}
          />
        ))}
    </Group>
  );
}
