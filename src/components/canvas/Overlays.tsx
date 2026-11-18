import type { KonvaEventObject } from 'konva/lib/Node';
import { Group, Line, Rect, Text } from 'react-konva';
import { computeClearances, computeWallChains, computeSegmentChains, type WallChain } from '../../domain/dimensions';
import { footprintPolygon, itemRect } from '../../domain/geometry';
import { itemHandles, type Guide, type HandleId } from '../../domain/snapping';
import type { KitchenItem, Room } from '../../domain/types';
import type { Issue } from '../../engine/checks';
import { WALL_THICKNESS } from '../../store/viewport';
import { DimensionLine } from './DimensionLine';
import { ItemShape } from './ItemShape';
import { ACCENT, CANVAS_BACKGROUND, DIMENSION_COLORS, GUIDE } from './theme';

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

function ChainDimensions({ chain, room, px }: { chain: WallChain; room: Room; px: number }) {
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
        />
      ))}
    </Group>
  );
}

/** Chained dimensions along every wall that has units against it, plus the overall room size. */
export function WallDimensions({ room, items, px }: { room: Room; items: KitchenItem[]; px: number }) {
  if (room.vertices || room.partitions?.length) return <Group name="plan-dimensions" listening={false}>
    {computeSegmentChains(room, items).map(({ segment, level, segments }) =>
      <Group key={`${segment.id}-${level}`} x={segment.start.x} y={segment.start.y} rotation={segment.angle}>
        {segments.map((span) => <Group key={span.from}>
          <Line points={[span.from, -WALL_THICKNESS - (level === 'wall' ? 45 : 20) * px, span.to, -WALL_THICKNESS - (level === 'wall' ? 45 : 20) * px]}
            stroke={span.occupied ? DIMENSION_COLORS.floor : DIMENSION_COLORS.gap} strokeWidth={px} />
          <Text x={span.from} y={-WALL_THICKNESS - (level === 'wall' ? 58 : 33) * px} width={span.to - span.from} text={String(Math.round(span.to - span.from))}
            fontSize={10 * px} align="center" fill={span.occupied ? DIMENSION_COLORS.floor : DIMENSION_COLORS.gap} />
        </Group>)}
      </Group>)}
  </Group>;
  const chains = computeWallChains(room, items);
  const top = outsideWall('top', room, ROW_OFFSET_PX.room, px);
  const left = outsideWall('left', room, ROW_OFFSET_PX.room, px);
  return (
    <Group name="plan-dimensions" listening={false}>
      {chains.map((chain) => (
        <ChainDimensions key={`${chain.wall}-${chain.level}`} chain={chain} room={room} px={px} />
      ))}
      <ExtensionLines ticks={[0, room.width]} horizontal face={top.face} at={top.at} color={DIMENSION_COLORS.room} px={px} />
      <DimensionLine axis="x" from={0} to={room.width} at={top.at} color={DIMENSION_COLORS.room} background={CANVAS_BACKGROUND} px={px} />
      <ExtensionLines ticks={[0, room.depth]} horizontal={false} face={left.face} at={left.at} color={DIMENSION_COLORS.room} px={px} />
      <DimensionLine axis="y" from={0} to={room.depth} at={left.at} color={DIMENSION_COLORS.room} background={CANVAS_BACKGROUND} px={px} />
    </Group>
  );
}

/** Free space between the active item and the nearest wall or unit in each direction. */
export function Clearances({ room, items, item, px }: { room: Room; items: KitchenItem[]; item: KitchenItem; px: number }) {
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
  const minResizable = touch ? 64 : 28;
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
export function Ghost({ item, px }: { item: KitchenItem; px: number }) {
  return (
    <Group listening={false}>
      <Group opacity={0.75}>
        <ItemShape item={item} px={px} />
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
