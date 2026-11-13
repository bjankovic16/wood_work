export const FONT_FAMILY = '"Inter Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

let context: CanvasRenderingContext2D | null = null;
const cache = new Map<string, number>();

/** Width in screen pixels of a text drawn on the canvas. */
export function measureText(text: string, fontSizePx: number, weight = 400): number {
  const key = `${weight}|${fontSizePx}|${text}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  context ??= document.createElement('canvas').getContext('2d');
  if (!context) return text.length * fontSizePx * 0.6;
  context.font = `${weight} ${fontSizePx}px ${FONT_FAMILY}`;
  const width = context.measureText(text).width;
  cache.set(key, width);
  return width;
}

/** Call once web fonts have loaded, so text is measured with the final font. */
export function clearTextMetrics(): void {
  cache.clear();
}
