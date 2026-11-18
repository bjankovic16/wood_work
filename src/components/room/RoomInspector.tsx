import { AppWindow, Palette, Ruler } from 'lucide-react';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { WallSegment } from '../../domain/walls';
import { useT } from '../../i18n';
import { useDesignStore } from '../../store/designStore';
import { useUiStore } from '../../store/uiStore';
import { AdvancedRoomSection, RoomDimensions, RoomObjectsSection, SelectedRoomCard } from '../properties/RoomPanel';
import { RoomSurfaces } from './RoomSurfaces';
import { WallMeasureFields, WallMeasurements } from './WallMeasures';

const tools = [{ key: 'dimensions', Icon: Ruler }, { key: 'objects', Icon: AppWindow }, { key: 'surfaces', Icon: Palette }] as const;
type Tool = typeof tools[number]['key'];

export function RoomInspector({ wall, wallNumber }: { wall?: WallSegment; wallNumber: number }) {
  const t = useT();
  const id = useId();
  const tabs = useRef<HTMLDivElement>(null);
  const selected = useUiStore((s) => s.roomSelection?.id);
  const room = useDesignStore((s) => s.design.room);
  const [tool, setTool] = useState<Tool>('dimensions');
  useLayoutEffect(() => { setTool(selected ? 'objects' : 'dimensions'); }, [selected, wall?.id]);
  return <>
    <div className="room-tool-tabs" ref={tabs} role="tablist" aria-label={t.room.setupTitle}>
      {tools.map(({ key, Icon }, i) => <button key={key} type="button" role="tab" id={`${id}-${key}`}
        aria-selected={tool === key} tabIndex={tool === key ? 0 : -1} aria-controls={`${id}-panel-${key}`}
        onClick={() => setTool(key)} onKeyDown={(e) => {
          const next = e.key === 'ArrowRight' ? (i + 1) % tools.length : e.key === 'ArrowLeft' ? (i + tools.length - 1) % tools.length
            : e.key === 'Home' ? 0 : e.key === 'End' ? tools.length - 1 : null;
          if (next === null) return;
          e.preventDefault(); e.stopPropagation();
          setTool(tools[next].key);
          tabs.current?.querySelectorAll('button')[next]?.focus();
        }}>
        <Icon size={16} aria-hidden="true" />{t.room[key]}
      </button>)}
    </div>
    {tools.map(({ key }) => <div key={key} role="tabpanel" hidden={tool !== key} tabIndex={0}
      id={`${id}-panel-${key}`} aria-labelledby={`${id}-${key}`} className="room-tool-panel">
      {tool === key && (key === 'dimensions' ? wall ? <>
        <section className="room-sizes">
          <h3>{t.advancedRoom.wall(wallNumber)}</h3>
          {wall.partitionId ? <p>{Math.round(wall.length)} × {wall.height} mm</p>
            : <div className="room-size-grid"><WallMeasureFields key={wall.id} wall={wall} ceiling /></div>}
        </section>
        <RoomObjectsSection workspace />
      </> : <>
        <RoomDimensions tiles />
        <details className="room-wall-details">
          <summary>{t.advancedRoom.title}</summary>
          <WallMeasurements />
        </details>
        <AdvancedRoomSection />
      </> : key === 'objects' ? <>
        <RoomObjectsSection workspace />
        {selected && <div className="flex flex-wrap items-baseline justify-between gap-1 border-b border-studio-line px-4 py-2 text-xs text-studio-muted">
          <strong>{t.room.roomSize}</strong><span>{room.width} × {room.depth} × {room.height} mm</span>
        </div>}
        <SelectedRoomCard />
      </> : <div className="p-4"><RoomSurfaces /></div>)}
    </div>)}
  </>;
}
