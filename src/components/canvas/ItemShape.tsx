import type { KonvaEventObject } from 'konva/lib/Node';
import { memo } from 'react';
import { Circle, Group, Line, Rect, Text } from 'react-konva';
import {
  footprintPolygon,
  frontEdges,
  isWallMounted,
  itemRect,
  localDepthExtent,
  localRectToRoom,
  localToRoom,
} from '../../domain/geometry';
import type { KitchenItem, Point, Rect as PlanRect } from '../../domain/types';
import { FONT_FAMILY, measureText } from '../../lib/measureText';

interface ItemStyle {
  fill: string;
  stroke: string;
  hoverStroke: string;
  front: string;
  symbol: string;
  text: string;
  dashed: boolean;
}

const FLOOR_STYLE: ItemStyle = {
  fill: '#ffffff',
  stroke: '#71717a',
  hoverStroke: '#18181b',
  front: '#27272a',
  symbol: '#a1a1aa',
  text: '#3f3f46',
  dashed: false,
};

const WALL_STYLE: ItemStyle = {
  fill: 'rgba(59, 130, 246, 0.08)',
  stroke: '#60a5fa',
  hoverStroke: '#1d4ed8',
  front: '#2563eb',
  symbol: '#93c5fd',
  text: '#1d4ed8',
  dashed: true,
};

function itemStyle(item: KitchenItem): ItemStyle {
  if (isWallMounted(item)) return WALL_STYLE;
  switch (item.kind) {
    case 'fridge':
      return { ...FLOOR_STYLE, fill: '#f1f5f9' };
    case 'dishwasher':
      return { ...FLOOR_STYLE, fill: '#f8fafc' };
    case 'endPanel':
      return { ...FLOOR_STYLE, fill: '#d4d4d8', stroke: '#52525b' };
    case 'filler':
      return { ...FLOOR_STYLE, fill: '#fafafa', stroke: '#a1a1aa' };
    default:
      return FLOOR_STYLE;
  }
}

const line = (a: Point, b: Point) => [a.x, a.y, b.x, b.y];

/** Plan symbol for each type: sink bowl, hob rings, the cross used for tall units, and so on. */
function ItemSymbol({ item, px, color }: { item: KitchenItem; px: number; color: string }) {
  const w = item.width;
  const d = localDepthExtent(item);
  const at = (u: number, v: number) => localToRoom(item, u, v);
  const stroke = { stroke: color, strokeWidth: px, listening: false } as const;

  switch (item.kind) {
    case 'sink': {
      const margin = Math.min(Math.max(w * 0.12, 40), 120);
      const bowl = localRectToRoom(item, margin, d * 0.2, w - margin, d * 0.82);
      // Towards the back of the bowl, clear of the label.
      const drain = at(w / 2, d * 0.38);
      return (
        <>
          <Rect
            x={bowl.x}
            y={bowl.y}
            width={bowl.w}
            height={bowl.h}
            cornerRadius={Math.min(bowl.w, bowl.h) * 0.16}
            {...stroke}
          />
          <Circle x={drain.x} y={drain.y} radius={Math.min(bowl.w, bowl.h) * 0.07} {...stroke} />
        </>
      );
    }
    case 'oven': {
      return <HobSymbol item={item} px={px} color={color} />;
    }
    case 'hob': {
      return <HobSymbol item={item} px={px} color={color} />;
    }
    case 'hood': {
      const centre = at(w / 2, d / 2);
      return <><Circle x={centre.x} y={centre.y} radius={Math.min(w, d) * 0.22} {...stroke} /><Line points={line(at(w * 0.25, d * 0.5), at(w * 0.75, d * 0.5))} {...stroke} /></>;
    }
    case 'pullOut':
      return <><Line points={line(at(w / 2, d * 0.2), at(w / 2, d * 0.8))} {...stroke} /><Line points={[...line(at(w * 0.3, d * 0.65), at(w / 2, d * 0.8)), ...line(at(w / 2, d * 0.8), at(w * 0.7, d * 0.65))]} {...stroke} /></>;
    case 'bar':
      return <>{[[0.08, 0.12], [0.92, 0.12], [0.08, 0.88], [0.92, 0.88]].map(([u, v]) => { const p = at(w * u, d * v); return <Circle key={`${u}-${v}`} x={p.x} y={p.y} radius={Math.min(w, d) * 0.035} {...stroke} />; })}</>;
    case 'drawer':
      return (
        <>
          {[0.16, 0.28, 0.4].map((fv) => (
            <Line key={fv} points={line(at(w * 0.12, d * fv), at(w * 0.88, d * fv))} {...stroke} />
          ))}
        </>
      );
    case 'tall':
    case 'ovenTower':
    case 'integratedFridge':
    case 'fridge':
      return (
        <>
          <Line points={line(at(0, 0), at(w, d))} {...stroke} />
          <Line points={line(at(w, 0), at(0, d))} {...stroke} />
        </>
      );
    case 'dishwasher': {
      const inset = Math.min(w, d) * 0.1;
      const r = localRectToRoom(item, inset, inset, w - inset, d - inset);
      return <Rect x={r.x} y={r.y} width={r.w} height={r.h} dash={[4 * px, 3 * px]} {...stroke} />;
    }
    case 'shelf':
    case 'glassWall':
      return (
        <>
          {[0.35, 0.65].map((fv) => (
            <Line key={fv} points={line(at(0, d * fv), at(w, d * fv))} dash={[2 * px, 3 * px]} {...stroke} />
          ))}
        </>
      );
    case 'filler': {
      const r = itemRect(item);
      const spacing = 7 * px;
      const hatch = [];
      for (let t = spacing; t < r.w + r.h; t += spacing) {
        hatch.push(<Line key={t} points={[r.x + t, r.y, r.x + t - r.h, r.y + r.h]} {...stroke} />);
      }
      return (
        <Group clipX={r.x} clipY={r.y} clipWidth={r.w} clipHeight={r.h} listening={false}>
          {hatch}
        </Group>
      );
    }
    default:
      return null;
  }
}

function HobSymbol({ item, px, color }: { item: KitchenItem; px: number; color: string }) {
  const w = item.width;
  const d = localDepthExtent(item);
  const at = (u: number, v: number) => localToRoom(item, u, v);
  const stroke = { stroke: color, strokeWidth: px, listening: false } as const;
      // Hob rings on the worktop above the oven, kept to the sides so the label fits between them.
      const radius = Math.min(w, d) * 0.12;
      const rings: Array<[number, number, number]> = [
        [0.24, 0.3, 1],
        [0.76, 0.3, 0.75],
        [0.24, 0.72, 0.75],
        [0.76, 0.72, 1],
      ];
      return (
        <>
          {rings.map(([fu, fv, scale]) => {
            const c = at(w * fu, d * fv);
            return <Circle key={`${fu}-${fv}`} x={c.x} y={c.y} radius={radius * scale} {...stroke} />;
          })}
        </>
      );
}

const LABEL_FONT_PX = 11;
const LINE_HEIGHT_PX = 14;

/**
 * Item code and width, written where they fit. Floor units are labelled towards
 * the front and wall units towards the back, so the two labels do not collide
 * where a wall unit hangs above a base unit. Corner units are labelled near the
 * inner corner, which wall units on either wall leave uncovered.
 */
function ItemLabel({ item, px, color }: { item: KitchenItem; px: number; color: string }) {
  const corner = item.kind === 'corner';
  const box: PlanRect = itemRect(item);
  const anchor = corner
    ? localToRoom(item, item.depth * 0.75, item.depth * 0.75)
    : localToRoom(item, item.width / 2, localDepthExtent(item) * (isWallMounted(item) ? 0.42 : 0.72));

  const availableWidth = (2 * Math.min(anchor.x - box.x, box.x + box.w - anchor.x)) / px;
  const availableHeight = (2 * Math.min(anchor.y - box.y, box.y + box.h - anchor.y)) / px;
  const size = corner ? `${item.width}×${item.width2 ?? item.width}` : String(item.width);
  const codeWidth = measureText(item.label, LABEL_FONT_PX, 600);
  const sizeWidth = measureText(size, LABEL_FONT_PX, 400);

  if (codeWidth + 6 > availableWidth || LINE_HEIGHT_PX + 2 > availableHeight) return null;
  const twoLines = sizeWidth + 6 <= availableWidth && 2 * LINE_HEIGHT_PX + 4 <= availableHeight;
  const top = anchor.y - ((twoLines ? 2 : 1) * LINE_HEIGHT_PX * px) / 2;
  const textProps = {
    x: anchor.x - (availableWidth * px) / 2,
    width: availableWidth * px,
    height: LINE_HEIGHT_PX * px,
    align: 'center',
    verticalAlign: 'middle',
    fontSize: LABEL_FONT_PX * px,
    fontFamily: FONT_FAMILY,
    fill: color,
    listening: false,
  } as const;

  return (
    <>
      <Text {...textProps} y={top} text={item.label} fontStyle="600" />
      {twoLines && <Text {...textProps} y={top + LINE_HEIGHT_PX * px} text={size} opacity={0.7} />}
    </>
  );
}

interface ItemShapeProps {
  item: KitchenItem;
  /** Plan millimetres per screen pixel. */
  px: number;
  /** Shown faded and not clickable (hidden by the view filter). */
  dimmed?: boolean;
  hovered?: boolean;
  onPointerDown?: (item: KitchenItem, event: KonvaEventObject<PointerEvent>) => void;
  onHoverChange?: (id: string | null) => void;
}

export const ItemShape = memo(function ItemShape({
  item,
  px,
  dimmed = false,
  hovered = false,
  onPointerDown,
  onHoverChange,
}: ItemShapeProps) {
  const style = itemStyle(item);
  const interactive = !dimmed && Boolean(onPointerDown);
  return (
    <Group
      name="item"
      opacity={dimmed ? 0.28 : 1}
      listening={interactive}
      onPointerDown={(e) => onPointerDown?.(item, e)}
      onMouseEnter={() => onHoverChange?.(item.id)}
      onMouseLeave={() => onHoverChange?.(null)}
    >
      <Line
        points={footprintPolygon(item)}
        closed
        fill={style.fill}
        stroke={hovered ? style.hoverStroke : style.stroke}
        strokeWidth={(hovered ? 1.5 : 1) * px}
        dash={style.dashed ? [5 * px, 3 * px] : undefined}
        hitStrokeWidth={10 * px}
        perfectDrawEnabled={false}
      />
      <ItemSymbol item={item} px={px} color={style.symbol} />
      {frontEdges(item).map(([a, b], i) => (
        <Line key={i} points={line(a, b)} stroke={style.front} strokeWidth={2 * px} listening={false} />
      ))}
      <ItemLabel item={item} px={px} color={style.text} />
    </Group>
  );
});
