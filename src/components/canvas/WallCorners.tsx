import { useEffect, useRef, useState } from 'react';
import type Konva from 'konva';
import { Circle, Group, Line, Text } from 'react-konva';
import { editableRoomVertices, setRoomVertices } from '../../store/actions';
import { useDesignStore } from '../../store/designStore';
import { useUiStore } from '../../store/uiStore';
import { useT } from '../../i18n';
import type { RoomVertex } from '../../domain/types';

export function WallCorners({ px }: { px: number }) {
  const t = useT();
  const room = useDesignStore((s) => s.design.room);
  const selected = useUiStore((s) => s.selectedWallId);
  const vertices = editableRoomVertices(room);
  const dragging = useRef<{ node: Konva.Circle; vertices: RoomVertex[]; invalid: boolean } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const cancel = () => {
      if (!dragging.current) return;
      const { node, vertices: previous } = dragging.current;
      const original = previous.find((v) => v.id === node.id());
      dragging.current = null;
      node.stopDrag();
      if (original) node.position(original);
      useDesignStore.getState().cancelGesture();
      setFailed(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { cancel(); useUiStore.getState().setWallEditing(false); } };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    return () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('pointercancel', cancel); window.removeEventListener('blur', cancel); cancel(); };
  }, []);
  return <Group>
    {vertices.map((vertex, index) => {
      const end = vertices[(index + 1) % vertices.length];
      return <Group key={vertex.id}>
        <Line points={[vertex.x, vertex.y, end.x, end.y]} stroke={selected === vertex.id ? '#876444' : '#ac9276'} strokeWidth={8 * px} opacity={0.45}
          onPointerDown={(event) => { event.cancelBubble = true; useUiStore.getState().setSelectedWallId(vertex.id); }} />
        <Circle id={vertex.id} x={vertex.x} y={vertex.y} radius={9 * px} fill="#ffffff" stroke="#876444" strokeWidth={2 * px} draggable
          onPointerDown={(event) => { event.cancelBubble = true; useUiStore.getState().setSelectedWallId(vertex.id); }}
          onDragStart={(event) => {
            dragging.current = { node: event.target as Konva.Circle, vertices, invalid: false };
            useDesignStore.getState().beginGesture();
          }}
          onDragMove={(event) => {
            const gesture = dragging.current;
            if (!gesture) return;
            const next = gesture.vertices.map((v) => v.id === vertex.id ? { ...v, x: Math.round(event.target.x()), y: Math.round(event.target.y()) } : v);
            try { setRoomVertices(next); gesture.invalid = false; setFailed(false); }
            catch (error) { if (!(error instanceof RangeError)) throw error; gesture.invalid = true; setFailed(true); }
          }}
          onDragEnd={(event) => {
            const gesture = dragging.current;
            if (!gesture) return;
            dragging.current = null;
            if (gesture.invalid) useDesignStore.getState().cancelGesture();
            else useDesignStore.getState().endGesture();
            const saved = editableRoomVertices(useDesignStore.getState().design.room).find((v) => v.id === vertex.id);
            if (saved) event.target.position(saved);
          }} />
      </Group>;
    })}
    {failed && <Text x={0} y={room.depth + 160 * px} width={room.width} text={t.advancedRoom.invalid} fontSize={12 * px} fill="#b91c1c" />}
  </Group>;
}
