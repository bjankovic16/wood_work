import { useId, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { moveRoomCorner } from '../../domain/roomCornerEdit';
import type { Design, Point } from '../../domain/types';
import type { WallSegment } from '../../domain/walls';
import { useT } from '../../i18n';
import { useDesignStore } from '../../store/designStore';
import { useUiStore } from '../../store/uiStore';
import type { useDrawingDrag } from './useDrawingDrag';

type Frame = Point & { px: number };
type Block = Extract<ReturnType<typeof moveRoomCorner>, { ok: false }>['reason'];
const arrows: Record<string, Point> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };

// Pointer samples can jump straight past a cabinet. Approach the constraint from the last good sample.
function cornerMotion(base: Design, id: string) {
  let last = { x: 0, y: 0 };
  let good = { design: base, shift: { x: 0, y: 0 } };
  return (delta: Point) => {
    const to = { x: Math.round(delta.x), y: Math.round(delta.y) };
    const result = moveRoomCorner(base, id, to);
    if (result.ok) {
      last = to;
      good = result;
      return { ...good, blocked: null };
    }
    let bad = to;
    while (Math.max(Math.abs(last.x - bad.x), Math.abs(last.y - bad.y)) > 1) {
      const mid = { x: Math.round((last.x + bad.x) / 2), y: Math.round((last.y + bad.y) / 2) };
      const candidate = moveRoomCorner(base, id, mid);
      if (candidate.ok) { last = mid; good = candidate; }
      else bad = mid;
    }
    return { ...good, blocked: result.reason };
  };
}

export function usePlanCorners(walls: WallSegment[], fitted: Frame, drag: ReturnType<typeof useDrawingDrag>, select: (id: string) => void) {
  const t = useT();
  const scope = useId();
  const selected = useUiStore((s) => s.selectedWallId);
  const [held, setHeld] = useState<Frame | null>(null);
  const [block, setBlock] = useState<{ reason: Block; design: Design } | null>(null);
  const frame = held ?? fitted;

  const begin = (e: PointerEvent<SVGGElement>, id: string, gripId: string) => {
    const motion = cornerMotion(useDesignStore.getState().design, id);
    if (!drag.start(e, (delta) => {
      const { design, shift, blocked } = motion(delta);
      useDesignStore.getState().apply(() => design);
      // Geometry may rebase its origin, but the drawing must not slide under the pointer.
      const x = frame.x + shift.x, y = frame.y + shift.y;
      setHeld((prev) => prev?.x === x && prev.y === y ? prev : { px: frame.px, x, y });
      setBlock(blocked ? { reason: blocked, design } : null);
    }, (cancelled) => { setHeld(null); if (cancelled) setBlock(null); })) return;
    e.preventDefault();
    document.getElementById(gripId)?.focus({ preventScroll: true });
    select(id);
    setHeld(frame);
    setBlock(null);
  };

  const keyDown = (e: KeyboardEvent<SVGGElement>, id: string) => {
    if (e.altKey || e.ctrlKey || e.metaKey || useDesignStore.getState().gestureBase) return;
    const step = arrows[e.key];
    if (!step && e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    e.stopPropagation();
    select(id);
    if (!step) return;
    const distance = e.shiftKey ? 100 : 10;
    const { design, blocked } = cornerMotion(useDesignStore.getState().design, id)({ x: step.x * distance, y: step.y * distance });
    useDesignStore.getState().apply(() => design);
    setBlock(blocked ? { reason: blocked, design } : null);
  };

  // Wide touch zones sit below dimensions and objects; the visible dot itself is always grabbable.
  const layer = (grips: boolean) => walls.map((wall, index) => {
    const { x, y } = wall.start;
    const gripId = `${scope}-corner-${index}`;
    const props = { onPointerDown: (e: PointerEvent<SVGGElement>) => begin(e, wall.id, gripId), ...drag.handlers };
    if (!grips) {
      const before = walls[(index + walls.length - 1) % walls.length].inward;
      const nx = before.x + wall.inward.x, ny = before.y + wall.inward.y;
      const offset = 12 * frame.px / (Math.hypot(nx, ny) || 1);
      return <g key={wall.id} {...props} aria-hidden="true" data-corner-target={wall.id} className="cursor-grab">
        <circle cx={x - nx * offset} cy={y - ny * offset} r={22 * frame.px} fill="transparent" />
      </g>;
    }
    const hint = selected === wall.id ? `${t.advancedRoom.start} · 0 mm. ${t.room.cornerKeys}` : t.room.cornerKeys;
    return <g key={wall.id} {...props} id={gripId} role="button" tabIndex={0} data-room-corner={wall.id}
      className="room-corner-grip" aria-label={t.room.cornerHandle(index + 1)}
      aria-description={hint} onClick={() => select(wall.id)} onKeyDown={(e) => keyDown(e, wall.id)}>
      <title>{t.room.cornerHandle(index + 1)} · {hint}</title>
      <circle cx={x} cy={y} r={6 * frame.px} fill={selected === wall.id ? '#376b4a' : '#fffefa'}
        stroke={selected === wall.id ? '#fffefa' : '#376b4a'} strokeWidth={2 * frame.px} />
    </g>;
  });
  return { frame, targets: layer(false), grips: layer(true),
    notice: block && block.design === useDesignStore.getState().design ? t.room.cornerBlocked[block.reason] : null };
}
