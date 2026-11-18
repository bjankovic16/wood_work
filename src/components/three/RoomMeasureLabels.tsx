import { useFrame } from '@react-three/fiber';
import { useMemo, type RefObject } from 'react';
import { Vector3 } from 'three';
import type { RoomMeasure } from '../room/roomMeasurements';
import { WallViewButton } from '../room/WallViewButton';
import { overlayTopInset } from './overlayInset';

type Props = { rows: RoomMeasure[]; overlay: RefObject<HTMLDivElement | null> };

export function RoomMeasureLabels({ rows, overlay, onOpenWall }: Props & { onOpenWall: (id: string) => void }) {
  return <div ref={overlay} className="room-measure-labels pointer-events-none absolute inset-0 overflow-hidden">
    {rows.map(({ id, at, name, value, faces = [] }) => at && <div key={id} data-room-measure={id}>
      <span className="room-measure-text" aria-hidden="true">{name} · <b>{value}</b></span>
      {faces.map((face) => <WallViewButton key={face.id} face={face} numbered={faces.length > 1} open={onOpenWall} />)}
    </div>)}
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
    // Measure the labels together; interleaving layout reads and writes stalls camera gestures.
    const sizes = Array.from(el.children, (node) => {
      const label = node as HTMLElement;
      return { label, w: label.offsetWidth, h: label.offsetHeight };
    });
    for (let i = 0; i < anchors.length; i++) {
      if (!sizes[i]) continue;
      const { label, w, h } = sizes[i];
      projected.copy(anchors[i]).project(camera);
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
