import { clamp } from '../domain/math';
import type { SnapSettings } from '../domain/snapping';
import type { Point, Rect } from '../domain/types';
import { useUiStore } from './uiStore';

/** Drawn thickness of the room walls (mm). */
export const WALL_THICKNESS = 120;
// Large rooms must still fit a narrow phone, including the screen-sized dimension labels.
export const MIN_ZOOM = 0.001;
export const MAX_ZOOM = 3;
/** The zoom shown as 100 % (1 m = 200 px). */
export const REFERENCE_ZOOM = 0.2;
/** Screen distance at which edges snap together. */
export const SNAP_DISTANCE_PX = 10;

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

type PlanArea = { left: number; top: number; right: number; bottom: number };

/** Unobstructed regions in canvas coordinates, including space between floating controls in landscape. */
export function clearPlanAreas(element: HTMLElement, width: number, height: number, margin: number): PlanArea[] {
  const origin = element.getBoundingClientRect();
  let areas = [{ left: 0, top: 0, right: width, bottom: height }];
  for (const control of element.closest('main')?.querySelectorAll('[data-plan-controls], [data-plan-overlay]') ?? []) {
    const r = control.getBoundingClientRect();
    const left = r.left - origin.left, right = r.right - origin.left;
    const top = r.top - origin.top, bottom = r.bottom - origin.top;
    areas = areas.flatMap((area) => {
      if (right <= area.left || left >= area.right || bottom <= area.top || top >= area.bottom) return [area];
      return [{ ...area, top: bottom }, { ...area, bottom: top }, { ...area, left: right }, { ...area, right: left }]
        .filter((a) => a.right - a.left > 2 * margin && a.bottom - a.top > 2 * margin);
    });
  }
  return areas;
}

/** Reveal a reported cabinet, retaining the current zoom/pan if it is already fully visible. */
export function revealPlanRect(rect: Rect): void {
  if (!canvasElement) return;
  const canvas = canvasElement.getBoundingClientRect();
  const margin = 12;
  const areas = clearPlanAreas(canvasElement, canvas.width, canvas.height, margin);
  const ui = useUiStore.getState();
  const x = ui.pan.x + rect.x * ui.zoom, y = ui.pan.y + rect.y * ui.zoom;
  if (areas.some((a) => x >= a.left + margin && x + rect.w * ui.zoom <= a.right - margin
    && y >= a.top + margin && y + rect.h * ui.zoom <= a.bottom - margin)) return;
  const scale = (a: PlanArea) => Math.min((a.right - a.left - 2 * margin) / rect.w, (a.bottom - a.top - 2 * margin) / rect.h);
  const area = areas.sort((a, b) => scale(b) - scale(a))[0];
  if (!area) return;
  const zoom = Math.max(MIN_ZOOM, Math.min(ui.zoom, scale(area)));
  ui.setViewport(zoom, {
    x: (area.left + area.right) / 2 - (rect.x + rect.w / 2) * zoom,
    y: (area.top + area.bottom) / 2 - (rect.y + rect.h / 2) * zoom,
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
