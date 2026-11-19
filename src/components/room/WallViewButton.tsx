import { PanelsTopLeft } from 'lucide-react';
import { useRef } from 'react';
import { useT } from '../../i18n';

export function WallViewButton({ face, numbered = false, open }: {
  face: { id: string; number: number }; numbered?: boolean; open: (id: string) => void;
}) {
  const { room } = useT();
  const label = room.openWall(face.number);
  const start = useRef<{ x: number; y: number } | null>(null);
  return <button type="button" className="room-wall-view-button" title={label} aria-label={label}
    onPointerDown={(e) => { start.current = e.isPrimary ? { x: e.clientX, y: e.clientY } : null; }}
    onPointerMove={(e) => {
      if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 8) start.current = null;
    }}
    onPointerCancel={() => { start.current = null; }}
    onClick={(e) => { if (!e.detail || start.current) open(face.id); start.current = null; }}>
    <span><PanelsTopLeft size={16} aria-hidden="true" />{room.wallView}{numbered && ` ${face.number}`}</span>
  </button>;
}
