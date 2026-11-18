import type { Stage } from 'konva/lib/Stage';
import { clamp } from '../../domain/math';
import { useUiStore } from '../../store/uiStore';
import { clearPlanAreas, MAX_ZOOM, MIN_ZOOM } from '../../store/viewport';

type Box = { left: number; top: number; right: number; bottom: number };
const MARGIN = 16;

/** Measures the drawing, not the Stage (which would include pan, selection and hit targets).
 * A changed zoom needs a second measurement because dimension offsets and lettering stay in CSS pixels. */
export function fitMeasuredPlan(stage: Stage): boolean {
  const room = stage.findOne('.plan-room')?.getClientRect({ relativeTo: stage });
  if (!room?.width || !room.height) return false;
  const dimensions = stage.findOne('.plan-dimensions')?.getClientRect({ relativeTo: stage });
  const ink = dimensions?.width && dimensions.height ? dimensions : room;
  const current = stage.scaleX();
  const left = Math.max(0, room.x - ink.x) * current;
  const top = Math.max(0, room.y - ink.y) * current;
  const right = Math.max(0, ink.x + ink.width - room.x - room.width) * current;
  const bottom = Math.max(0, ink.y + ink.height - room.y - room.height) * current;

  const scale = (b: Box) => Math.min(
    (b.right - b.left - 2 * MARGIN - left - right) / room.width,
    (b.bottom - b.top - 2 * MARGIN - top - bottom) / room.height,
  );
  const canvas = { left: 0, top: 0, right: stage.width(), bottom: stage.height() };
  const areas = clearPlanAreas(stage.container(), stage.width(), stage.height(), MARGIN).filter((area) => scale(area) > 0);
  const area = areas.sort((a, b) => scale(b) - scale(a))[0] ?? canvas;
  const zoom = clamp(scale(area), MIN_ZOOM, MAX_ZOOM);
  const pan = {
    x: (area.left + area.right + left - right) / 2 - (room.x + room.width / 2) * zoom,
    y: (area.top + area.bottom + top - bottom) / 2 - (room.y + room.height / 2) * zoom,
  };
  useUiStore.getState().setViewport(zoom, pan);
  return Math.abs(zoom - current) * Math.max(room.width, room.height) > 0.1;
}
