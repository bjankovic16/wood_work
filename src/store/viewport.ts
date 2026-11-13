import { clamp } from '../domain/math';
import type { SnapSettings } from '../domain/snapping';
import type { Point } from '../domain/types';
import { useDesignStore } from './designStore';
import { useUiStore } from './uiStore';

/** Drawn thickness of the room walls (mm). */
export const WALL_THICKNESS = 120;
export const MIN_ZOOM = 0.03;
export const MAX_ZOOM = 3;
/** The zoom shown as 100 % (1 m = 200 px). */
export const REFERENCE_ZOOM = 0.2;
/** Screen distance at which edges snap together. */
export const SNAP_DISTANCE_PX = 10;
/** Space kept around the room when fitting it into view, for the dimension lines. */
const FIT_MARGIN_PX = 96;

let canvasElement: HTMLElement | null = null;

export function registerCanvasElement(element: HTMLElement | null): void {
  canvasElement = element;
}

export function canvasSize(): { w: number; h: number } | null {
  if (!canvasElement) return null;
  const r = canvasElement.getBoundingClientRect();
  return { w: r.width, h: r.height };
}

/**
 * Converts a screen position to plan millimetres. With `insideOnly`, returns
 * null when the position is not over the canvas.
 */
export function clientToPlan(clientX: number, clientY: number, insideOnly = false): Point | null {
  if (!canvasElement) return null;
  const r = canvasElement.getBoundingClientRect();
  const sx = clientX - r.left;
  const sy = clientY - r.top;
  if (insideOnly && (sx < 0 || sy < 0 || sx > r.width || sy > r.height)) return null;
  const { zoom, pan } = useUiStore.getState();
  return { x: (sx - pan.x) / zoom, y: (sy - pan.y) / zoom };
}

/** Screen space covered by controls floating over the canvas (e.g. the phone's bottom buttons). */
let fitInsets = { top: 0, bottom: 0 };

export function setFitInsets(insets: { top: number; bottom: number }): void {
  fitInsets = insets;
}

export function fitRoomInView(): void {
  const size = canvasSize();
  if (!size || size.w === 0 || size.h === 0) return;
  const { room } = useDesignStore.getState().design;
  // Small screens cannot spare the full margin for dimension lines.
  const margin = clamp(Math.min(size.w, size.h) * 0.12, 28, FIT_MARGIN_PX);
  const height = size.h - fitInsets.top - fitInsets.bottom;
  const zoom = clamp(
    Math.min(
      (size.w - 2 * margin) / (room.width + 2 * WALL_THICKNESS),
      (height - 2 * margin) / (room.depth + 2 * WALL_THICKNESS),
    ),
    MIN_ZOOM,
    MAX_ZOOM,
  );
  useUiStore.getState().setViewport(zoom, {
    x: size.w / 2 - (room.width / 2) * zoom,
    y: fitInsets.top + height / 2 - (room.depth / 2) * zoom,
  });
}

/** Zooms by `factor`, keeping the plan point under `anchor` (canvas pixels) still. Defaults to the canvas centre. */
export function zoomBy(factor: number, anchor?: Point): void {
  const { zoom, pan, setViewport } = useUiStore.getState();
  const size = canvasSize();
  const a = anchor ?? (size ? { x: size.w / 2, y: size.h / 2 } : { x: 0, y: 0 });
  const next = clamp(zoom * factor, MIN_ZOOM, MAX_ZOOM);
  if (next === zoom) return;
  const planX = (a.x - pan.x) / zoom;
  const planY = (a.y - pan.y) / zoom;
  setViewport(next, { x: a.x - planX * next, y: a.y - planY * next });
}

export function snapSettings(): SnapSettings {
  const { snapEnabled, gridSize, zoom } = useUiStore.getState();
  return { enabled: snapEnabled, grid: gridSize, threshold: SNAP_DISTANCE_PX / zoom };
}
