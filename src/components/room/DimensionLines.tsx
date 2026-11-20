/** Dimension-chain coordinates and witness offsets are screen pixels inside the parent's scale. */
export function DimensionLines({ half, witnesses, left = 3, right = 3 }: {
  half: number; witnesses: [number, number]; left?: number; right?: number;
}) {
  const lines = witnesses.map((offset, i) => {
    const sign = Math.sign(offset);
    return `M${i ? half : -half} ${offset - sign * 2}V${-sign * 3}`;
  }).join(' ');
  return <g>
    <path d={lines} fill="none" stroke="currentColor" strokeOpacity=".6" strokeWidth=".8" />
    <path d={`M${-half - left} 0H${half + right}`} stroke="currentColor" strokeWidth=".9" />
    <path d={`M${-half - 3} 3l6 -6 M${half - 3} 3l6 -6`} stroke="currentColor" strokeWidth="1.5" />
  </g>;
}
