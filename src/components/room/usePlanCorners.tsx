import { MoveVertical } from 'lucide-react';
import { useId, useState, type KeyboardEvent, type PointerEvent, type TouchEvent } from 'react';
import { moveRoomCorner, moveRoomWall, snapRoomCorner } from '../../domain/roomCornerEdit';
import { normalizeAngle } from '../../domain/polygons';
import type { Design, Point } from '../../domain/types';
import type { WallSegment } from '../../domain/walls';
import { wallPoint } from '../../domain/walls';
import { useT } from '../../i18n';
import { useDesignStore } from '../../store/designStore';
import { useUiStore } from '../../store/uiStore';
import type { useDrawingDrag } from './useDrawingDrag';

type Frame = Point & { px: number };
type Block = Extract<ReturnType<typeof moveRoomCorner>, { ok: false }>['reason'];
const arrows: Record<string, Point> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };

// Pointer samples can jump straight past a cabinet. Approach the constraint from the last good sample.
function cornerMotion(base: Design, id: string, wholeWall = false, snapAngles = false) {
  const move = (delta: Point) => wholeWall ? moveRoomWall(base, id, delta)
    : moveRoomCorner(base, id, snapAngles ? snapRoomCorner(base.room, id, delta) : delta);
  let last = { x: 0, y: 0 };
  let good = { design: base, shift: { x: 0, y: 0 } };
  return (delta: Point) => {
    const to = { x: Math.round(delta.x), y: Math.round(delta.y) };
    const result = move(to);
    if (result.ok) {
      last = to;
      good = result;
      return { ...good, blocked: null };
    }
    let bad = to;
    let reason = result.reason;
    while (Math.max(Math.abs(last.x - bad.x), Math.abs(last.y - bad.y)) > 1) {
      const mid = { x: Math.round((last.x + bad.x) / 2), y: Math.round((last.y + bad.y) / 2) };
      const candidate = move(mid);
      if (candidate.ok) { last = mid; good = candidate; }
      else { bad = mid; reason = candidate.reason; }
    }
    return { ...good, blocked: reason };
  };
}

export function usePlanCorners(walls: WallSegment[], fitted: Frame, drag: ReturnType<typeof useDrawingDrag>, select: (id: string) => void) {
  const t = useT();
  const scope = useId();
  const selected = useUiStore((s) => s.selectedWallId);
  const [held, setHeld] = useState<Frame | null>(null);
  const [block, setBlock] = useState<{ reason: Block; design: Design } | null>(null);
  const frame = held ?? fitted;

  const begin = (e: PointerEvent<SVGGElement>, id: string, gripId?: string, wholeWall = false) => {
    const motion = cornerMotion(useDesignStore.getState().design, id, wholeWall, useUiStore.getState().roomAngleSnapEnabled && !e.altKey);
    if (!drag.start(e, (delta) => {
      const { design, shift, blocked } = motion(delta);
      useDesignStore.getState().apply(() => design);
      // Geometry may rebase its origin, but the drawing must not slide under the pointer.
      const x = frame.x + shift.x, y = frame.y + shift.y;
      setHeld((prev) => prev?.x === x && prev.y === y ? prev : { px: frame.px, x, y });
      setBlock(blocked ? { reason: blocked, design } : null);
    }, (cancelled) => { setHeld(null); if (cancelled) setBlock(null); })) return;
    e.preventDefault();
    if (gripId) document.getElementById(gripId)?.focus({ preventScroll: true });
    select(id);
    setHeld(frame);
    setBlock(null);
  };

  const keyDown = (e: KeyboardEvent<SVGGElement>, id: string, wholeWall = false) => {
    if (e.altKey || e.ctrlKey || e.metaKey || useDesignStore.getState().gestureBase) return;
    const step = arrows[e.key];
    if (!step && e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    e.stopPropagation();
    select(id);
    if (!step) return;
    const distance = e.shiftKey ? 100 : 10;
    const { design, blocked } = cornerMotion(useDesignStore.getState().design, id, wholeWall, !wholeWall && useUiStore.getState().roomAngleSnapEnabled)
      ({ x: step.x * distance, y: step.y * distance });
    useDesignStore.getState().apply(() => design);
    setBlock(blocked ? { reason: blocked, design } : null);
  };

  const wallProps = (id: string) => ({
    onPointerDown: (e: PointerEvent<SVGGElement>) => begin(e, id, undefined, true),
    onClick: () => select(id),
    onKeyDown: (e: KeyboardEvent<SVGGElement>) => keyDown(e, id, true),
    onTouchEnd: (e: TouchEvent<SVGGElement>) => e.preventDefault(),
    ...drag.handlers,
    className: 'room-wall-drag',
  });

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
  const i = walls.findIndex((w) => w.id === selected);
  const wall = walls[i], before = walls[(i + walls.length - 1) % walls.length];
  const gripId = `${scope}-wall-${i}`;
  const wallGrip = (at?: Point) => {
    if (!wall || !at) return null;
    const anchor = wallPoint(wall, wall.length / 2);
    return <g>
      <line x1={anchor.x} y1={anchor.y} x2={at.x} y2={at.y} stroke="#8d9f95" strokeWidth={frame.px} pointerEvents="none" />
      <g data-wall-move={wall.id} id={gripId} role="button" tabIndex={0}
        aria-label={t.room.wallHandle(i + 1)} aria-description={t.room.wallMoveHint} {...wallProps(wall.id)}
        onPointerDown={(e) => begin(e, wall.id, gripId, true)} transform={`translate(${at.x} ${at.y}) scale(${frame.px})`}>
        <title>{t.room.wallHandle(i + 1)} · {t.room.wallMoveHint}</title>
        <rect x="-22" y="-22" width="44" height="44" fill="transparent" />
        <rect x="-14" y="-14" width="28" height="28" rx="7" fill="#fffefa" stroke="#376b4a" strokeWidth="1.5" />
        <g transform={`rotate(${wall.angle})`}><MoveVertical x="-9" y="-9" size={18} color="#315a44" aria-hidden="true" /></g>
      </g>
    </g>;
  };
  let angle = null;
  if (wall && before) {
    // Clockwise in plan coordinates: sweep inside from the outgoing ray to the reversed incoming ray.
    const degrees = normalizeAngle(before.angle + 180 - wall.angle);
    const radius = Math.min(24, Math.min(wall.length, before.length) / frame.px / 3);
    const mid = (wall.angle + degrees / 2) * Math.PI / 180;
    const value = `${t.number(Math.round(degrees * 10) / 10)}°`;
    angle = <g data-corner-angle={wall.id} transform={`translate(${wall.start.x} ${wall.start.y}) scale(${frame.px})`}
      pointerEvents="none" role="img" aria-label={`${t.room.insideAngle}: ${value}`}>
      <path d={`M ${radius * wall.tangent.x} ${radius * wall.tangent.y} A ${radius} ${radius} 0 ${degrees > 180 ? 1 : 0} 1 ${-radius * before.tangent.x} ${-radius * before.tangent.y}`}
        fill="none" stroke="#34594d" strokeWidth="1.5" />
      <text x={(radius + 18) * Math.cos(mid)} y={(radius + 18) * Math.sin(mid)} textAnchor="middle" dominantBaseline="central"
        fontSize="14" fontWeight="650" fill="#264837" stroke="#fffefa" strokeWidth="4" paintOrder="stroke">{value}</text>
    </g>;
  }
  return { frame, targets: layer(false), grips: layer(true), angle, wallProps, wallGrip,
    notice: block && block.design === useDesignStore.getState().design ? t.room.cornerBlocked[block.reason] : null };
}
