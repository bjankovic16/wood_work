import { Group, Line, Rect, Text } from 'react-konva';
import { FONT_FAMILY, measureText } from '../../lib/measureText';

const FONT_PX = 11;
const LABEL_HEIGHT_PX = 15;

interface DimensionLineProps {
  /** Direction being measured. */
  axis: 'x' | 'y';
  from: number;
  to: number;
  /** Position of the line on the other axis. */
  at: number;
  color: string;
  /** Plan millimetres per screen pixel. */
  px: number;
  /** Fill behind the label, so the line does not run through the text. */
  background: string;
  label?: string;
}

/** A measured line with architectural tick marks and the length written in the middle. */
export function DimensionLine({ axis, from, to, at, color, px, background, label }: DimensionLineProps) {
  const horizontal = axis === 'x';
  const point = (along: number): [number, number] => (horizontal ? [along, at] : [at, along]);
  const tick = 3.5 * px;
  const text = label ?? String(Math.round(Math.abs(to - from)));
  const textWidth = measureText(text, FONT_PX, 500) + 8;
  const showLabel = textWidth + 6 <= Math.abs(to - from) / px;
  const [mx, my] = point((from + to) / 2);

  return (
    <Group listening={false}>
      <Line points={[...point(from), ...point(to)]} stroke={color} strokeWidth={px} />
      {[from, to].map((p) => {
        const [x, y] = point(p);
        return <Line key={p} points={[x - tick, y + tick, x + tick, y - tick]} stroke={color} strokeWidth={1.4 * px} />;
      })}
      {showLabel && (
        <Group x={mx} y={my} rotation={horizontal ? 0 : -90}>
          <Rect
            x={(-textWidth / 2) * px}
            y={(-LABEL_HEIGHT_PX / 2) * px}
            width={textWidth * px}
            height={LABEL_HEIGHT_PX * px}
            fill={background}
            cornerRadius={3 * px}
          />
          <Text
            x={(-textWidth / 2) * px}
            y={(-LABEL_HEIGHT_PX / 2) * px}
            width={textWidth * px}
            height={LABEL_HEIGHT_PX * px}
            align="center"
            verticalAlign="middle"
            text={text}
            fontSize={FONT_PX * px}
            fontFamily={FONT_FAMILY}
            fontStyle="500"
            fill={color}
          />
        </Group>
      )}
    </Group>
  );
}
