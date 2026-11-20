import { useState } from 'react';
import { roomFeaturePolygon } from '../../domain/roomGeometry';
import { dragFeatureSize } from '../../domain/roomObjectPlacement';
import type { Room, RoomFeature } from '../../domain/types';
import { useT } from '../../i18n';
import { updateRoomFeature } from '../../store/actions';
import { useUiStore, type RoomPlanAngle } from '../../store/uiStore';
import { useDrawingDrag } from './useDrawingDrag';
import { rotatePlanPoint } from './roomPlanView';

export function FeatureSizeGrips({ room, feature, px, angle = 0 }: { room: Room; feature: RoomFeature; px: number; angle?: RoomPlanAngle }) {
  const t = useT(), drag = useDrawingDrag(angle);
  const [blocked, setBlocked] = useState(false);
  const [a, b, c] = roomFeaturePolygon(room, feature);
  if (!a || !b || !c) return null;
  const centre = { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 };
  const edges = [
    { field: 'width', dx: (b.x - a.x) / feature.width, dy: (b.y - a.y) / feature.width, sides: [-1, 1] },
    { field: 'depth', dx: (c.x - b.x) / feature.depth, dy: (c.y - b.y) / feature.depth, sides: feature.wallId ? [1] : [-1, 1] },
  ] as const;
  return <>{edges.map(({ field, dx, dy, sides }) => sides.map((sign) => {
    const amount = feature[field], n = { x: sign * dx, y: sign * dy };
    const viewedNormal = rotatePlanPoint(n, angle);
    const edge = amount / 2, out = Math.max(edge + 8 * px, 38 * px);
    const resize = (delta: number) => {
      const desired = Math.max(100, amount + delta);
      const next = dragFeatureSize(room, feature, field, desired, sign === 1 ? 'start' : 'end');
      updateRoomFeature(feature.id, next);
      setBlocked(next[field] !== desired);
    };
    const label = field === 'width' ? (feature.wallId ? t.roomStructure.alongLength : t.roomStructure.width)
      : (feature.wallId ? t.roomStructure.projection : t.roomStructure.depth);
    return <g key={`${field}:${sign}`} data-feature-grip={`${field}:${sign}`} role="slider" tabIndex={0} aria-label={label}
      aria-orientation={Math.abs(viewedNormal.x) > Math.abs(viewedNormal.y) ? 'horizontal' : 'vertical'}
      aria-valuenow={amount} aria-valuemin={100} aria-valuemax={Math.ceil(Math.hypot(room.width, room.depth))} aria-valuetext={`${amount} mm`}
      aria-description={t.roomStructure.resizeHint} style={{ cursor: Math.abs(viewedNormal.x) > Math.abs(viewedNormal.y) ? 'ew-resize' : 'ns-resize' }}
      onPointerDown={(e) => {
        const { gridSize, snapEnabled } = useUiStore.getState(), step = snapEnabled ? gridSize : 1;
        if (drag.start(e, (d) => resize(Math.round((d.x * n.x + d.y * n.y) / step) * step), () => setBlocked(false))) e.preventDefault();
      }} {...drag.handlers} onKeyDown={(e) => {
        const direction = ['ArrowUp', 'ArrowRight'].includes(e.key) ? 1 : ['ArrowDown', 'ArrowLeft'].includes(e.key) ? -1 : 0;
        if (!direction) return;
        e.preventDefault(); e.stopPropagation(); resize(direction * (e.shiftKey ? 100 : 10));
      }}>
      <title>{label} · {amount} mm</title>
      <line x1={centre.x + edge * n.x} y1={centre.y + edge * n.y} x2={centre.x + out * n.x} y2={centre.y + out * n.y} stroke="#24558b" strokeWidth={2 * px} pointerEvents="none" />
      <g transform={`translate(${centre.x + out * n.x} ${centre.y + out * n.y}) scale(${px})`}>
        <circle r="22" fill="transparent" /><rect x="-6" y="-6" width="12" height="12" rx="2" fill="white" stroke="#24558b" strokeWidth="2" />
      </g>
    </g>;
  }))}
    {blocked && <text x={centre.x} y={centre.y} textAnchor="middle" pointerEvents="none" fontSize={12 * px} fill="#753908"
      transform={`rotate(${-angle} ${centre.x} ${centre.y})`}
      stroke="white" strokeWidth={3 * px} paintOrder="stroke">{t.room.noSpace}</text>}
  </>;
}
