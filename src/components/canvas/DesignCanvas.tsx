import type { KonvaEventObject } from 'konva/lib/Node';
import type { Stage as KonvaStage } from 'konva/lib/Stage';
import { Maximize, Minus, Plus } from 'lucide-react';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Layer, Stage } from 'react-konva';
import { replaceItem, updateItem } from '../../domain/designOps';
import { attachedWall, isWallMounted, itemRect } from '../../domain/geometry';
import { computeDragPlacement, computeHandleResize, type Guide, type HandleId } from '../../domain/snapping';
import type { Design, KitchenItem, Point, Wall } from '../../domain/types';
import { inUpperRow, upperCabinetRows, type UpperRow } from '../../domain/upperCabinets';
import { cn } from '../../lib/cn';
import { pointerFrame } from '../../lib/pointerFrame';
import { clamp } from '../../domain/math';
import { useCoarsePointer } from '../../hooks/useMediaQuery';
import { useT } from '../../i18n';
import { clearTextMetrics } from '../../lib/measureText';
import { committedDesign, useDesignStore } from '../../store/designStore';
import { useIssues } from '../../store/derived';
import { useProjectsStore } from '../../store/projects';
import { useUiStore, type ViewFilter } from '../../store/uiStore';
import {
  clientToPlan,
  MAX_ZOOM,
  MIN_ZOOM,
  REFERENCE_ZOOM,
  registerCanvasElement,
  snapSettings,
  zoomBy,
} from '../../store/viewport';
import { Button } from '../ui';
import { fitMeasuredPlan } from './fitMeasuredPlan';
import { ItemShape } from './ItemShape';
import { Clearances, Ghost, Guides, IssueOutlines, Selection, WallDimensions } from './Overlays';
import { RoomPickTargets, RoomShape } from './RoomShape';
import { KitchenPlanRoomReadout } from '../room/RoomReadout';
import { StartGuide } from './StartGuide';
import { WallCorners } from './WallCorners';

/** Pointer travel (px) before a press turns into a drag; fingers wobble more than mice. */
const DRAG_START_PX = { mouse: 3, touch: 8 };
const PlanRoom = memo(RoomShape);
const PlanRoomTargets = memo(RoomPickTargets);
const DimensionChains = memo(WallDimensions);
const PlanControls = memo(CanvasControls);

interface GestureBase {
  pointerId: number;
  start: Point;
  /** Travel needed before the gesture starts. */
  threshold: number;
}

type Gesture =
  | (GestureBase & { kind: 'pan'; startPan: Point; moved: boolean })
  | (GestureBase & {
      kind: 'move';
      base: Design;
      id: string;
      item: KitchenItem;
      grabOffset: Point;
      wall: Wall | null;
      started: boolean;
    })
  | (GestureBase & { kind: 'resize'; base: Design; id: string; item: KitchenItem; handle: HandleId; started: boolean });

/** Two fingers on the plan: zoom and pan together. */
interface Pinch {
  startDistance: number;
  /** Plan point under the fingers' midpoint when the pinch started. */
  anchor: Point;
  startZoom: number;
  startPan: Point;
}

const thresholdFor = (pointerType: string) => (pointerType === 'touch' ? DRAG_START_PX.touch : DRAG_START_PX.mouse);

function isDimmed(item: KitchenItem, filter: ViewFilter, row?: UpperRow): boolean {
  if (filter === 'all') return false;
  return filter === 'floor' ? isWallMounted(item) : !isWallMounted(item) || Boolean(row && !inUpperRow(item, row));
}

/** Commits any half-typed value in the properties panel before the plan changes. */
function blurActiveField() {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body) active.blur();
}

export function DesignCanvas({ compact = false }: { compact?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<KonvaStage>(null);
  const gestureRef = useRef<Gesture | null>(null);
  /** Fingers currently on the plan, for pinch zoom. */
  const touchesRef = useRef(new Map<number, Point>());
  const pinchRef = useRef<Pinch | null>(null);
  const coarse = useCoarsePointer();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [guides, setGuides] = useState<Guide[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [movingItem, setMovingItem] = useState<KitchenItem | null>(null);
  const [fontVersion, setFontVersion] = useState(0);

  const room = useDesignStore((s) => s.design.room);
  const wallEditing = useUiStore((s) => s.wallEditing);
  const t = useT();
  const items = useDesignStore((s) => s.design.items);
  const zoom = useUiStore((s) => s.zoom);
  const pan = useUiStore((s) => s.pan);
  const selectedId = useUiStore((s) => s.selectedId);
  const planForegroundId = useUiStore((s) => s.planForegroundId);
  const manualFilter = useUiStore((s) => s.viewFilter);
  const wallElevation = useUiStore((s) => s.wallElevation);
  const committedItems = useDesignStore((s) => committedDesign(s).items);
  const rows = useMemo(() => upperCabinetRows(committedItems), [committedItems]);
  const showDimensions = useUiStore((s) => s.showDimensions);
  const libraryDrag = useUiStore((s) => s.libraryDrag);
  const ghost = libraryDrag?.ghost ?? null;
  const dragging = libraryDrag?.item ?? movingItem;
  // A drag previews a layer; it never writes the user's layer or row choice.
  const viewFilter = dragging ? (isWallMounted(dragging) ? 'wall' : 'floor') : manualFilter;
  const manualRow = rows.find((entry) => entry.elevation === wallElevation) ?? rows[0];
  const dragRow = dragging && viewFilter === 'wall' && (!manualRow || !inUpperRow(dragging, manualRow))
    ? rows.find((entry) => entry.elevation === dragging.elevation) ?? { elevation: dragging.elevation, top: dragging.elevation + dragging.height }
    : undefined;
  const row = viewFilter === 'wall' ? dragRow ?? manualRow : undefined;
  const openings = useDesignStore((s) => s.design.openings);
  const issues = useIssues();
  const px = 1 / zoom;

  const setCursor = useCallback((cursor: string) => {
    if (containerRef.current) containerRef.current.style.cursor = cursor;
  }, []);

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    registerCanvasElement(element);
    const measure = () => {
      const r = element.getBoundingClientRect();
      setSize({ w: Math.floor(r.width), h: Math.floor(r.height) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
      registerCanvasElement(null);
    };
  }, []);

  // Labels are measured with the web font, so measure again once it has loaded.
  useEffect(() => {
    let active = true;
    document.fonts?.ready.then(() => {
      if (!active) return;
      clearTextMetrics();
      setFontVersion((v) => v + 1);
    });
    return () => {
      active = false;
    };
  }, []);

  const projectId = useProjectsStore((s) => s.activeId);
  const [fitRequest, setFitRequest] = useState(0);
  const requestFit = useCallback(() => setFitRequest((n) => n + 1), []);
  const fitPasses = useRef(0);
  useLayoutEffect(() => {
    if (size.w > 0 && size.h > 0) fitPasses.current = 6;
  }, [size.w, size.h, room.width, room.depth, room.height, fitRequest, projectId]);
  // Text and ticks keep their *screen* size. Recheck their actual ink bounds after
  // zooming (a previously hidden label can now fit), but never chase manual zoom/pan.
  useLayoutEffect(() => {
    if (fitPasses.current > 0 && stageRef.current) {
      fitPasses.current--;
      if (!fitMeasuredPlan(stageRef.current)) fitPasses.current = 0;
    }
  });

  // Wheel zooms around the pointer. Registered by hand to be able to cancel browser zoom.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = element.getBoundingClientRect();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? r.height : 1;
      zoomBy(Math.exp(-e.deltaY * unit * 0.0015), { x: e.clientX - r.left, y: e.clientY - r.top });
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  // A second finger on the plan starts a pinch, which replaces whatever the first finger was doing.
  // Registered in the capture phase so it runs before the plan's own handlers.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const touches = touchesRef.current;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size !== 2) return;
      const g = gestureRef.current;
      if (g && g.kind !== 'pan' && g.started && useDesignStore.getState().gestureBase === g.base) useDesignStore.getState().cancelGesture();
      gestureRef.current = null;
      setMovingItem(null);
      setGuides([]);
      const [a, b] = [...touches.values()];
      const rect = element.getBoundingClientRect();
      const { zoom, pan } = useUiStore.getState();
      const mid = { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top };
      pinchRef.current = {
        startDistance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        anchor: { x: (mid.x - pan.x) / zoom, y: (mid.y - pan.y) / zoom },
        startZoom: zoom,
        startPan: pan,
      };
    };
    element.addEventListener('pointerdown', onDown, true);
    return () => element.removeEventListener('pointerdown', onDown, true);
  }, []);

  // Moving, resizing and panning follow the pointer anywhere on the page until it is released.
  useEffect(() => {
    const touches = touchesRef.current;
    const frame = pointerFrame((e) => {
      const pinch = pinchRef.current;
      if (pinch && touches.size >= 2 && containerRef.current) {
        const [a, b] = [...touches.values()];
        const rect = containerRef.current.getBoundingClientRect();
        const zoom = clamp((pinch.startZoom * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.startDistance, MIN_ZOOM, MAX_ZOOM);
        const mid = { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top };
        useUiStore.getState().setViewport(zoom, { x: mid.x - pinch.anchor.x * zoom, y: mid.y - pinch.anchor.y * zoom });
        return;
      }

      const g = gestureRef.current;
      if (!g || e.pointerId !== g.pointerId) return;
      const distance = Math.hypot(e.clientX - g.start.x, e.clientY - g.start.y);

      if (g.kind === 'pan') {
        if (!g.moved && distance < g.threshold) return;
        g.moved = true;
        setCursor('grabbing');
        const ui = useUiStore.getState();
        ui.setViewport(ui.zoom, { x: g.startPan.x + e.clientX - g.start.x, y: g.startPan.y + e.clientY - g.start.y });
        return;
      }

      const store = useDesignStore.getState();
      if ((g.started ? store.gestureBase : store.design) !== g.base || useUiStore.getState().selectedId !== g.id) { cancel(); return; }
      if (!g.started) {
        if (distance < g.threshold) return;
        g.started = true;
        store.beginGesture();
        if (g.kind === 'move') {
          setMovingItem(g.item);
          setCursor('grabbing');
        }
      }
      if (distance === 0) {
        store.apply((d) => replaceItem(d, g.item));
        if (g.kind === 'move') g.wall = attachedWall(g.item, g.base.room);
        showGuides([]);
        return;
      }
      const pointer = clientToPlan(e.clientX, e.clientY);
      if (!pointer) return;
      const { room, items } = store.design;
      const others = items.filter((i) => i.id !== g.id);

      if (g.kind === 'move') {
        const result = computeDragPlacement({
          room,
          others,
          item: g.item,
          pointer,
          grabOffset: g.grabOffset,
          previousWall: g.wall,
          snap: snapSettings(),
        });
        g.wall = result.wall;
        store.apply((d) => updateItem(d, g.id, { x: result.x, y: result.y, rotation: result.rotation }));
        showGuides(result.guides);
      } else {
        const result = computeHandleResize({ room, others, item: g.item, handleId: g.handle, pointer, snap: snapSettings() });
        const { x, y, width, depth, width2 } = result.item;
        store.apply((d) => updateItem(d, g.id, { x, y, width, depth, ...(width2 !== undefined ? { width2 } : {}) }));
        showGuides(result.guides);
      }
    });

    function showGuides(next: Guide[]) {
      setGuides((last) => last.length === next.length && last.every((guide, i) => guide.axis === next[i].axis && guide.value === next[i].value) ? last : next);
    }
    const onMove = (e: PointerEvent) => {
      if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (gestureRef.current?.pointerId !== e.pointerId && !(pinchRef.current && touches.has(e.pointerId))) return;
      e.stopPropagation(); // No Konva hover hit-testing while this pointer belongs to the drag.
      frame.move(e);
    };

    const onUp = (e: PointerEvent) => {
      const pinching = pinchRef.current && touches.has(e.pointerId);
      if (pinching) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinching || gestureRef.current?.pointerId === e.pointerId) frame.release(e);
      touches.delete(e.pointerId);
      if (pinchRef.current && touches.size < 2) pinchRef.current = null;
      const g = gestureRef.current;
      if (!g || e.pointerId !== g.pointerId) return;
      gestureRef.current = null;
      setMovingItem(null);
      setGuides([]);
      if (g.kind === 'pan') {
        if (!g.moved) useUiStore.getState().select(null);
        setCursor('');
      } else {
        if (g.started && useDesignStore.getState().gestureBase === g.base) useDesignStore.getState().endGesture();
        if (g.kind === 'move') setCursor('move');
      }
    };

    function cancel() {
      const g = gestureRef.current;
      const pinch = pinchRef.current;
      frame.cancel();
      touches.clear();
      pinchRef.current = null;
      gestureRef.current = null;
      setMovingItem(null);
      setGuides([]);
      const ui = useUiStore.getState();
      if (pinch) ui.setViewport(pinch.startZoom, pinch.startPan);
      else if (g?.kind === 'pan' && g.moved) ui.setViewport(ui.zoom, g.startPan);
      else if (g && g.kind !== 'pan' && g.started && useDesignStore.getState().gestureBase === g.base) useDesignStore.getState().cancelGesture();
      setCursor('');
    }
    const onPointerCancel = (e: PointerEvent) => {
      if (gestureRef.current?.pointerId === e.pointerId || touches.has(e.pointerId)) cancel();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || (!gestureRef.current && !pinchRef.current)) return;
      e.stopImmediatePropagation();
      cancel();
    };
    const visibility = () => { if (document.visibilityState === 'hidden') cancel(); };
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('blur', cancel);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('keydown', onKeyDown, true);
      cancel();
    };
  }, [setCursor]);

  const onStagePointerDown = (e: KonvaEventObject<PointerEvent>) => {
    if (pinchRef.current || gestureRef.current || useDesignStore.getState().gestureBase) return;
    blurActiveField();
    const { button, pointerId, pointerType, clientX, clientY } = e.evt;
    if (button !== 0 && button !== 1) return;
    gestureRef.current = {
      kind: 'pan',
      pointerId,
      threshold: thresholdFor(pointerType),
      start: { x: clientX, y: clientY },
      startPan: useUiStore.getState().pan,
      moved: false,
    };
  };

  const onItemPointerDown = useCallback((item: KitchenItem, e: KonvaEventObject<PointerEvent>) => {
    const { button, pointerId, pointerType, clientX, clientY } = e.evt;
    if (button === 1) return; // middle button pans, even over an item
    e.cancelBubble = true;
    if (pinchRef.current || gestureRef.current || useDesignStore.getState().gestureBase) return;
    blurActiveField();
    useUiStore.getState().select(item.id, 'plan');
    if (button !== 0) return;
    const pointer = clientToPlan(clientX, clientY);
    if (!pointer) return;
    const r = itemRect(item);
    gestureRef.current = {
      kind: 'move',
      base: useDesignStore.getState().design,
      pointerId,
      threshold: thresholdFor(pointerType),
      start: { x: clientX, y: clientY },
      id: item.id,
      item,
      grabOffset: { x: pointer.x - (r.x + r.w / 2), y: pointer.y - (r.y + r.h / 2) },
      wall: attachedWall(item, useDesignStore.getState().design.room),
      started: false,
    };
  }, []);

  const onHandlePointerDown = useCallback((handle: HandleId, e: KonvaEventObject<PointerEvent>) => {
    const { button, pointerId, pointerType, clientX, clientY } = e.evt;
    if (button !== 0) return;
    e.cancelBubble = true;
    if (pinchRef.current || gestureRef.current || useDesignStore.getState().gestureBase) return;
    blurActiveField();
    const id = useUiStore.getState().selectedId;
    const item = useDesignStore.getState().design.items.find((i) => i.id === id);
    if (!item) return;
    gestureRef.current = {
      kind: 'resize',
      base: useDesignStore.getState().design,
      pointerId,
      threshold: thresholdFor(pointerType),
      start: { x: clientX, y: clientY },
      id: item.id,
      item,
      handle,
      started: false,
    };
  }, []);

  const onHoverChange = useCallback(
    (id: string | null) => {
      setHoveredId(id);
      if (!gestureRef.current) setCursor(id ? 'move' : '');
    },
    [setCursor],
  );

  // Reveal an added unit or 3D edit target, even under another tier. Ordinary
  // plan clicks keep the natural stacking (upper at the back, base front exposed).
  const activeSelection = libraryDrag ? undefined : items.find((i) => i.id === selectedId);
  const foregroundId = activeSelection?.id === planForegroundId ? planForegroundId : null;
  const dimmed = useCallback((item: KitchenItem) => item.id !== activeSelection?.id && isDimmed(item, viewFilter, row), [activeSelection?.id, viewFilter, row]);
  const ordered = useMemo(() => [...items].sort((a, b) => Number(dimmed(b)) - Number(dimmed(a))
    || Number(a.id === foregroundId) - Number(b.id === foregroundId)
    || Number(isWallMounted(a)) - Number(isWallMounted(b)) || a.elevation - b.elevation), [items, dimmed, foregroundId]);
  const visibleItems = useMemo(() => ordered.filter((item) => !dimmed(item)), [ordered, dimmed]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full touch-none overflow-hidden bg-studio-canvas"
      onContextMenu={(e) => e.preventDefault()}
    >
      {size.w > 0 && size.h > 0 && (
        <Stage
          ref={stageRef}
          width={size.w}
          height={size.h}
          scaleX={zoom}
          scaleY={zoom}
          x={pan.x}
          y={pan.y}
          onPointerDown={onStagePointerDown}
        >
          <Layer name="plan-room" listening={false}>
            <PlanRoom key={fontVersion} room={room} zoom={zoom} openings={openings} />
          </Layer>
          <Layer listening={!wallEditing}>
            <PlanRoomTargets room={room} openings={openings} px={px} />
            {ordered.map((item) => (
              <ItemShape
                key={item.id}
                item={item}
                px={px}
                dimmed={dimmed(item)}
                hovered={hoveredId === item.id}
                onPointerDown={onItemPointerDown}
                onHoverChange={onHoverChange}
              />
            ))}
          </Layer>
          <Layer>
            {showDimensions && <DimensionChains key={fontVersion} room={room} items={visibleItems} px={px} />}
            <IssueOutlines items={visibleItems} issues={issues} px={px} />
            {(ghost ?? activeSelection) && (
              <Clearances room={room} items={items} item={(ghost ?? activeSelection)!} px={px} />
            )}
            <Guides guides={ghost ? libraryDrag!.guides : guides} room={room} px={px} />
            {ghost && <Ghost item={ghost} px={px} />}
            {activeSelection && !ghost && (
              <Selection
                item={activeSelection}
                px={px}
                touch={coarse}
                onHandlePointerDown={onHandlePointerDown}
                onCursor={setCursor}
              />
            )}
          </Layer>
          {wallEditing && <Layer><WallCorners px={px} /></Layer>}
        </Stage>
      )}
      <PlanControls zoom={zoom} viewFilter={viewFilter} isEmpty={items.length === 0 && !wallEditing} compact={compact}
        rows={rows} row={row} manualRow={manualRow} requestFit={requestFit} />
      <KitchenPlanRoomReadout />
      {wallEditing && <div className="absolute inset-x-3 top-3 flex items-center justify-between gap-2 rounded-xl border border-stone-200 bg-white/95 p-3 text-xs text-stone-700 shadow-sm">
        <span>{t.advancedRoom.editing}</span>
        <Button onClick={() => useUiStore.getState().setWallEditing(false)}>{t.common.done}</Button>
      </div>}
    </div>
  );
}

const FILTERS: ViewFilter[] = ['all', 'floor', 'wall'];

interface CanvasControlsProps {
  zoom: number;
  viewFilter: ViewFilter;
  isEmpty: boolean;
  compact: boolean;
  rows: UpperRow[];
  row?: UpperRow;
  manualRow?: UpperRow;
  requestFit: () => void;
}

function CanvasControls({ zoom, viewFilter, isEmpty, compact, rows, row, manualRow, requestFit }: CanvasControlsProps) {
  const t = useT();
  const projectId = useProjectsStore((state) => state.activeId);
  const chooseLayer = (filter: ViewFilter, upper = manualRow) => {
    const ui = useUiStore.getState();
    const selected = useDesignStore.getState().design.items.find((item) => item.id === ui.selectedId);
    if (selected && isDimmed(selected, filter, upper)) ui.select(null);
    ui.setViewFilter(filter);
    if (filter === 'wall' && upper) ui.setWallElevation(upper.elevation);
  };
  return (
    <>
      <div data-plan-controls className="pointer-events-none absolute left-3 top-3 flex max-w-[calc(100%-24px)] flex-col items-start gap-1">
        <div role="group" aria-label={t.canvas.filterLabel} className="studio-panel pointer-events-auto flex rounded-lg border p-0.5 shadow-sm">
          {FILTERS.map((id) => {
            const filter = t.canvas.filters[id];
            return (
              <button
                key={id}
                type="button"
                title={filter.title}
                aria-label={filter.label}
                aria-pressed={viewFilter === id}
                onClick={() => chooseLayer(id)}
                className={cn(
                  'h-7 touch-manipulation rounded-md text-xs font-medium transition-colors',
                  compact ? 'px-1.5' : 'px-2.5',
                  viewFilter === id ? 'bg-studio-accent text-white' : 'text-studio-muted hover:bg-[#ece8df] hover:text-studio-ink',
                )}
              >
                {compact ? filter.short : filter.label}
              </button>
            );
          })}
        </div>

        {rows.length > 1 && viewFilter === 'wall' && rows.some((entry) => entry.elevation === row?.elevation) && (
          <select
            aria-label={t.stacking.rowLabel}
            value={row?.elevation ?? ''}
            onChange={(event) => chooseLayer('wall', rows.find((entry) => entry.elevation === Number(event.target.value)))}
            className="pointer-events-auto h-9 max-w-full rounded-md border border-zinc-300 bg-white px-2 text-xs font-medium text-zinc-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            {rows.map((entry, index) => <option key={entry.elevation} value={entry.elevation}>{t.stacking.row(index + 1, t.mm(entry.elevation))}</option>)}
          </select>
        )}
        {viewFilter !== 'all' && <p role="status" className="rounded-md bg-studio-paper/95 px-2 py-1 text-[11px] leading-tight text-studio-muted">
          {t.canvas.dimmed[viewFilter === 'wall' && rows.length > 1 ? 'row' : viewFilter]}
        </p>}
      </div>

      <div
        data-plan-controls
        role="group"
        aria-label={t.canvas.zoomControls}
        className={cn(
          'studio-panel absolute right-3 flex items-center gap-0.5 rounded-lg border p-0.5 shadow-sm',
          compact ? 'phone-plan-zoom top-3' : 'bottom-3',
        )}
      >
        <Button title={t.canvas.zoomOut} aria-label={t.canvas.zoomOut} className="h-7 min-w-7 px-1.5" onClick={() => zoomBy(1 / 1.25)}>
          <Minus className="size-4" />
        </Button>
        <button
          type="button"
          title={t.canvas.fit}
          aria-label={compact ? t.canvas.fit : undefined}
          onClick={requestFit}
          className={cn('h-7 rounded-md text-xs font-medium tabular-nums text-studio-muted hover:bg-[#ece8df] hover:text-studio-ink', compact ? 'w-10' : 'w-12')}
        >
          {Math.round((zoom / REFERENCE_ZOOM) * 100)}%
        </button>
        <Button title={t.canvas.zoomIn} aria-label={t.canvas.zoomIn} className="h-7 min-w-7 px-1.5" onClick={() => zoomBy(1.25)}>
          <Plus className="size-4" />
        </Button>
        {!compact && <>
          <div className="mx-0.5 h-4 w-px bg-zinc-200" />
          <Button title={t.canvas.fit} aria-label={t.canvas.fit} className="h-7 min-w-7 px-1.5" onClick={requestFit}>
            <Maximize className="size-4" />
          </Button>
        </>}
      </div>

      <StartGuide key={projectId} compact={compact} isEmpty={isEmpty} />
    </>
  );
}
