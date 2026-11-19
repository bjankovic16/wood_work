import { Group, Line, Rect, Text } from 'react-konva';
import { FONT_FAMILY, measureText } from '../../lib/measureText';

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
  fontPx?: number;
  /** Parent plan frame, for keeping labels upright. */
  angle?: number;
  alwaysLabel?: boolean;
}

/** A measured line with architectural tick marks and the length written in the middle. */
export function DimensionLine({ axis, from, to, at, color, px, background, label, fontPx = 11, angle = 0, alwaysLabel }: DimensionLineProps) {
  const horizontal = axis === 'x';
  const point = (along: number): [number, number] => (horizontal ? [along, at] : [at, along]);
  const tick = 3.5 * px;
  const text = label ?? String(Math.round(Math.abs(to - from)));
  const textWidth = measureText(text, fontPx, 500) + 8;
  const labelHeight = fontPx + 4;
  const showLabel = alwaysLabel || textWidth + 6 <= Math.abs(to - from) / px;
  const rotation = horizontal ? 0 : -90;
  const textAngle = ((angle + rotation) % 360 + 360) % 360;
  const [mx, my] = point((from + to) / 2);

  return (
    <Group listening={false}>
      <Line points={[...point(from), ...point(to)]} stroke={color} strokeWidth={px} />
      {[from, to].map((p) => {
        const [x, y] = point(p);
        return <Line key={p} points={[x - tick, y + tick, x + tick, y - tick]} stroke={color} strokeWidth={1.4 * px} />;
      })}
      {showLabel && (
        <Group x={mx} y={my} rotation={rotation + (textAngle >= 90 && textAngle < 270 ? 180 : 0)}>
          <Rect
            x={(-textWidth / 2) * px}
            y={(-labelHeight / 2) * px}
            width={textWidth * px}
            height={labelHeight * px}
            fill={background}
            cornerRadius={3 * px}
          />
          <Text
            x={(-textWidth / 2) * px}
            y={(-labelHeight / 2) * px}
            width={textWidth * px}
            height={labelHeight * px}
            align="center"
            verticalAlign="middle"
            text={text}
            fontSize={fontPx * px}
            fontFamily={FONT_FAMILY}
            fontStyle="500"
            fill={color}
          />
        </Group>
      )}
    </Group>
  );
}
