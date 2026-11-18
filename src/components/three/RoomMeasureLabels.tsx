import { useFrame } from '@react-three/fiber';
import { useMemo, type RefObject } from 'react';
import { Vector3 } from 'three';
import type { RoomMeasure } from '../room/roomMeasurements';
import { overlayTopInset } from './overlayInset';

type Props = { rows: RoomMeasure[]; overlay: RefObject<HTMLDivElement | null> };

export function RoomMeasureLabels({ rows, overlay }: Props) {
  return <div ref={overlay} aria-hidden="true" className="room-measure-labels pointer-events-none absolute inset-0 overflow-hidden">
    {rows.map((row) => row.at && <span key={row.id} data-room-measure={row.id}>{row.name} · <b>{row.value}</b></span>)}
  </div>;
}

export function ProjectRoomMeasures({ rows, overlay }: Props) {
  const anchors = useMemo(() => rows.flatMap(({ at, elevation }) => at ? [new Vector3(at.x / 1000, (elevation ?? 0) / 1000, at.y / 1000)] : []), [rows]);
  const projected = useMemo(() => new Vector3(), []);
  useFrame(({ camera, size, gl }) => {
    const el = overlay.current;
    if (!el) return;
    const top = overlayTopInset(el, gl.domElement.getBoundingClientRect().top);
    const placed: Array<{ x: number; y: number; w: number; h: number }> = [];
    for (let i = 0; i < anchors.length; i++) {
      const label = el.children[i] as HTMLElement | undefined;
      if (!label) continue;
      projected.copy(anchors[i]).project(camera);
      const w = label.offsetWidth, h = label.offsetHeight;
      const x = Math.round((1 + projected.x) * size.width / 2 - w / 2);
      const y = Math.round((1 - projected.y) * size.height / 2 - h / 2);
      // Don't pile off-screen measurements on the viewport edge. The list always retains every value.
      const visible = Math.abs(projected.z) < 1 && x >= 0 && x + w <= size.width && y >= top && y + h <= size.height &&
        !placed.some((p) => x < p.x + p.w + 2 && x + w + 2 > p.x && y < p.y + p.h + 2 && y + h + 2 > p.y);
      label.style.visibility = visible ? 'visible' : 'hidden';
      if (visible) { label.style.transform = `translate(${x}px,${y}px)`; placed.push({ x, y, w, h }); }
    }
  });
  return null;
}
