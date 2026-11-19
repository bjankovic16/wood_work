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
type Viewport = { zoom: number; pan: Point };

/** Unobstructed regions in canvas coordinates, including space between floating controls in landscape. */
export function clearPlanAreas(element: HTMLElement, width: number, height: number, margin: number): PlanArea[] {
  const origin = element.getBoundingClientRect();
  let areas = [{ left: 0, top: 0, right: width, bottom: height }];
  for (const control of element.closest('main')?.querySelectorAll('[data-plan-controls], [data-plan-overlay]') ?? []) {
    const r = control.getBoundingClientRect();
    if (!r.width || !r.height) continue;
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

/** Keep the scale, then move the cabinet the shortest distance into unobstructed space. */
export function viewportRevealing(rect: Rect, view: Viewport, areas: PlanArea[], margin: number): Viewport {
  const centre = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
  const x = view.pan.x + centre.x * view.zoom, y = view.pan.y + centre.y * view.zoom;
  let best = view, bestZoom = 0, leastTravel = Infinity;
  for (const a of areas) {
    const zoom = Math.min(view.zoom, (a.right - a.left - 2 * margin) / rect.w, (a.bottom - a.top - 2 * margin) / rect.h);
    if (zoom < MIN_ZOOM || zoom < bestZoom) continue;
    const halfW = rect.w * zoom / 2 + margin, halfH = rect.h * zoom / 2 + margin;
    const cx = clamp(x, a.left + halfW, a.right - halfW), cy = clamp(y, a.top + halfH, a.bottom - halfH);
    const travel = Math.hypot(cx - x, cy - y);
    if (zoom === view.zoom && travel < 0.01) return view;
    if (zoom > bestZoom || travel < leastTravel) {
      best = { zoom, pan: { x: cx - centre.x * zoom, y: cy - centre.y * zoom } };
      bestZoom = zoom;
      leastTravel = travel;
    }
  }
  return best;
}

export function revealPlanRect(rect: Rect, margin = 12): void {
  if (!canvasElement) return;
  const canvas = canvasElement.getBoundingClientRect();
  const view = useUiStore.getState();
  const next = viewportRevealing(rect, view, clearPlanAreas(canvasElement, canvas.width, canvas.height, margin), margin);
  if (next !== view) view.setViewport(next.zoom, next.pan);
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
