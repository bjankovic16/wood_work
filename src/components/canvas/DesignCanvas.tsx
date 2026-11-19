import type { KonvaEventObject } from 'konva/lib/Node';
import type { Stage as KonvaStage } from 'konva/lib/Stage';
import { Maximize, Minus, Plus, Ruler } from 'lucide-react';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Layer, Stage } from 'react-konva';
import { replaceItem, updateItem } from '../../domain/designOps';
import { attachedWall, isWallMounted, itemRect } from '../../domain/geometry';
import { computeDragPlacement, computeHandleResize, type Guide, type HandleId, type ItemHandle } from '../../domain/snapping';
import type { Design, KitchenItem, Point, Wall } from '../../domain/types';
import { editableUpperRows, inUpperRow, type UpperRow } from '../../domain/upperCabinets';
import { cn } from '../../lib/cn';
import { pointerFrame } from '../../lib/pointerFrame';
import { clamp } from '../../domain/math';
import { useCoarsePointer } from '../../hooks/useMediaQuery';
import { useT } from '../../i18n';
import { clearTextMetrics } from '../../lib/measureText';
import { committedDesign, useDesignStore } from '../../store/designStore';
import { placeCabinetAt } from '../../store/actions';
import { useIssues } from '../../store/derived';
import { useProjectsStore } from '../../store/projects';
import { useUiStore, type ViewFilter } from '../../store/uiStore';
import {
  clientToPlan,
  MAX_ZOOM,
  MIN_ZOOM,
  REFERENCE_ZOOM,
  registerCanvasElement,
  revealPlanRect,
  snapSettings,
  zoomBy,
} from '../../store/viewport';
import { Button } from '../ui';
import { fitMeasuredPlan } from './fitMeasuredPlan';
import { CompactPlanCodes, ItemShape, UpperOutlines, type PlanItemMode } from './ItemShape';
import { Clearances, Ghost, Guides, IssueOutlines, SelectedUnitDimensions, Selection, WallDimensions } from './Overlays';
import { usePlanMessages } from './planMessages';
import { RoomPickTargets, RoomShape } from './RoomShape';
import { KitchenPlanRoomReadout } from '../room/RoomReadout';
import { StartGuide } from './StartGuide';
import { nearbyCabinet } from './touchPick';
import { planSelectionRect } from './planResizeEdges';

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
  | (GestureBase & { kind: 'pan'; startPan: Point; moved: boolean; pick?: () => void })
  | (GestureBase & {
      kind: 'move';
      base: Design;
      id: string;
      item: KitchenItem;
      grabOffset: Point;
      wall: Wall | null;
      started: boolean;
    })
  | (GestureBase & { kind: 'resize'; base: Design; id: string; item: KitchenItem; handle: HandleId; grabOffset: Point; started: boolean });

/** Two fingers on the plan: zoom and pan together. */
interface Pinch {
  ids: [number, number];
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

export function DesignCanvas({ compact = false, onAdd = () => useUiStore.getState().requestFocus('library-search') }: { compact?: boolean; onAdd?: () => void }) {
  const t = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<KonvaStage>(null);
  const gestureRef = useRef<Gesture | null>(null);
  /** Fingers currently on the plan, for pinch zoom. */
  const touchesRef = useRef(new Map<number, Point>());
  const pinchRef = useRef<Pinch | null>(null);
  const pendingReveal = useRef<'grips' | 'body' | null>(null);
  const coarse = useCoarsePointer();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [guides, setGuides] = useState<Guide[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [movingItem, setMovingItem] = useState<KitchenItem | null>(null);
  const [fontVersion, setFontVersion] = useState(0);
  const [allDimensions, setAllDimensions] = useState(false);
  const [placeBlocked, setPlaceBlocked] = useState(false);

  const room = useDesignStore((s) => s.design.room);
  const items = useDesignStore((s) => s.design.items);
  const zoom = useUiStore((s) => s.zoom);
  const pan = useUiStore((s) => s.pan);
  const selectedId = useUiStore((s) => s.selectedId);
  const placing = useUiStore((s) => s.cabinetTool === 'place');
  const planForegroundId = useUiStore((s) => s.planForegroundId);
  const manualFilter = useUiStore((s) => s.viewFilter);
  const wallElevation = useUiStore((s) => s.wallElevation);
  const committedItems = useDesignStore((s) => committedDesign(s).items);
  const rows = useMemo(() => editableUpperRows(committedItems), [committedItems]);
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
  }, [size.w, size.h, room.width, room.depth, room.height, room.vertices, room.cutout, fitRequest, projectId]);
  // Text and ticks keep their *screen* size. Recheck their actual ink bounds after
  // zooming (a previously hidden label can now fit), but never chase manual zoom/pan.
  useLayoutEffect(() => {
    if (fitPasses.current > 0 && stageRef.current) {
      fitPasses.current--;
      if (!fitMeasuredPlan(stageRef.current, compact)) fitPasses.current = 0;
    }
  });

  // Konva normally batches hit-canvas updates to the next frame. A click just
  // after switching rows must already belong to the newly visible cabinets.
  useLayoutEffect(() => {
    for (const layer of stageRef.current?.getLayers() ?? []) {
      if (layer.isListening()) layer.drawHit();
    }
  }, [manualFilter, wallElevation]);

  // A sheet snap is a viewport change, not a design edit. Never move the plan
  // underneath an active finger; finish the pick/drag first.
  const committedSelection = committedItems.find((item) => item.id === selectedId);
  useEffect(() => {
    if (placing && !committedSelection) useUiStore.getState().setCabinetTool(null);
    if (!placing) setPlaceBlocked(false);
  }, [placing, committedSelection]);
  const revealIfPending = useCallback(() => {
    if (!pendingReveal.current || gestureRef.current || touchesRef.current.size) return;
    const grips = pendingReveal.current === 'grips';
    pendingReveal.current = null;
    const { selectedId: id, zoom } = useUiStore.getState();
    const item = useDesignStore.getState().design.items.find((entry) => entry.id === id);
    if (item) revealPlanRect(grips ? planSelectionRect(item, 1 / zoom, coarse) : itemRect(item));
  }, [coarse]);
  useLayoutEffect(() => {
    if (compact && committedSelection && !placing) {
      pendingReveal.current ??= 'body';
      revealIfPending();
    }
  }, [compact, committedSelection, placing, revealIfPending]);
  useLayoutEffect(() => {
    if (!compact || !selectedId || placing) return;
    const sheet = containerRef.current?.closest('main')?.querySelector('[data-testid="item-sheet"][data-plan-overlay]');
    if (!sheet) return;
    pendingReveal.current = 'grips';
    revealIfPending();
    // When snapping the *form*, keep the footprint visible rather than chasing screen-sized grips.
    const observer = new ResizeObserver(() => { pendingReveal.current ??= 'body'; revealIfPending(); });
    observer.observe(sheet, { box: 'border-box' });
    return () => { observer.disconnect(); pendingReveal.current = null; };
  }, [compact, selectedId, placing, manualFilter, wallElevation, revealIfPending]);

  // Wheel zooms around the pointer. Registered by hand to be able to cancel browser zoom.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (gestureRef.current || pinchRef.current) return;
      const r = element.getBoundingClientRect();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? r.height : 1;
      zoomBy(Math.exp(-e.deltaY * unit * 0.0015), { x: e.clientX - r.left, y: e.clientY - r.top });
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  // Moving, resizing and panning follow the pointer anywhere on the page until it is released.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const touches = touchesRef.current;
    const frame = pointerFrame((e) => {
      const pinch = pinchRef.current;
      if (pinch) {
        const [a, b] = pinch.ids.map((id) => touches.get(id));
        if (!a || !b) return;
        const rect = element.getBoundingClientRect();
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
        const edgePoint = { x: pointer.x - g.grabOffset.x, y: pointer.y - g.grabOffset.y };
        const result = computeHandleResize({ room, others, item: g.item, handleId: g.handle, pointer: edgePoint, snap: snapSettings() });
        const { x, y, width, depth, width2 } = result.item;
        store.apply((d) => updateItem(d, g.id, { x, y, width, depth, ...(width2 !== undefined ? { width2 } : {}) }));
        showGuides(result.guides);
      }
    });

    function showGuides(next: Guide[]) {
      setGuides((last) => last.length === next.length && last.every((guide, i) => guide.axis === next[i].axis && guide.value === next[i].value) ? last : next);
    }
    // Capture the second contact before Konva can pick a cabinet, handle or wall.
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || !stageRef.current?.content.contains(e.target as Node)) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size !== 2 || pinchRef.current) return;
      const g = gestureRef.current;
      frame.cancel();
      if (g && g.kind !== 'pan' && g.started && useDesignStore.getState().gestureBase === g.base) useDesignStore.getState().cancelGesture();
      gestureRef.current = null;
      setMovingItem(null);
      setGuides([]);
      setCursor('');
      const [[idA, a], [idB, b]] = [...touches];
      const rect = element.getBoundingClientRect();
      const { zoom, pan } = useUiStore.getState();
      const mid = { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top };
      pinchRef.current = {
        ids: [idA, idB],
        startDistance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        anchor: { x: (mid.x - pan.x) / zoom, y: (mid.y - pan.y) / zoom },
        startZoom: zoom,
        startPan: g?.kind === 'pan' ? g.startPan : pan,
      };
    };
    const onMove = (e: PointerEvent) => {
      if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (gestureRef.current?.pointerId !== e.pointerId && !(pinchRef.current && touches.has(e.pointerId))) return;
      e.stopPropagation(); // No Konva hover hit-testing while this pointer belongs to the drag.
      frame.move(e);
    };

    const onUp = (e: PointerEvent) => {
      const pinching = pinchRef.current?.ids.includes(e.pointerId);
      if (pinching) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinching || gestureRef.current?.pointerId === e.pointerId) frame.release(e);
      touches.delete(e.pointerId);
      if (pinching) {
        pinchRef.current = null;
        pendingReveal.current = null; // The manual viewport takes precedence over a deferred initial reveal.
      }
      const g = gestureRef.current;
      if (!g || e.pointerId !== g.pointerId) return;
      gestureRef.current = null;
      setMovingItem(null);
      setGuides([]);
      if (g.kind === 'pan') {
        if (!g.moved) {
          if (g.pick) g.pick();
          else useUiStore.getState().select(null);
        }
        setCursor('');
      } else {
        if (g.started && useDesignStore.getState().gestureBase === g.base) useDesignStore.getState().endGesture();
        if (g.kind === 'move') setCursor('move');
      }
      revealIfPending();
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
      if (gestureRef.current?.pointerId === e.pointerId || touches.has(e.pointerId)) {
        if (pinchRef.current) pendingReveal.current = null;
        cancel();
        revealIfPending();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || (!gestureRef.current && !pinchRef.current)) return;
      e.stopImmediatePropagation();
      cancel();
    };
    const visibility = () => { if (document.visibilityState === 'hidden') cancel(); };
    element.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      element.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('blur', cancel);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('keydown', onKeyDown, true);
      cancel();
    };
  }, [setCursor, revealIfPending]);

  const onStagePointerDown = useCallback((e: KonvaEventObject<PointerEvent>, pick?: () => void) => {
    e.cancelBubble = true;
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
      pick: button === 0 ? pick : undefined,
    };
  }, []);

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

  const onHandlePointerDown = useCallback((handle: ItemHandle, e: KonvaEventObject<PointerEvent>) => {
    const { button, pointerId, pointerType, clientX, clientY } = e.evt;
    if (button !== 0) return;
    e.cancelBubble = true;
    if (pinchRef.current || gestureRef.current || useDesignStore.getState().gestureBase) return;
    blurActiveField();
    const id = useUiStore.getState().selectedId;
    const item = useDesignStore.getState().design.items.find((i) => i.id === id);
    const pointer = clientToPlan(clientX, clientY);
    if (!item || !pointer) return;
    gestureRef.current = {
      kind: 'resize',
      base: useDesignStore.getState().design,
      pointerId,
      threshold: thresholdFor(pointerType),
      start: { x: clientX, y: clientY },
      id: item.id,
      item,
      handle: handle.id,
      grabOffset: { x: pointer.x - handle.point.x, y: pointer.y - handle.point.y },
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

  const activeSelection = libraryDrag ? undefined : items.find((i) => i.id === selectedId);
  const activeId = activeSelection?.id;
  const foregroundId = activeSelection?.id === planForegroundId ? planForegroundId : null;
  const { dimmed, upperTargets, detailed } = useMemo(() => {
    const dimmed: KitchenItem[] = [], upperTargets: KitchenItem[] = [], detailed: KitchenItem[] = [];
    const ordered = [...items].sort((a, b) => Number(a.id === foregroundId) - Number(b.id === foregroundId)
      || Number(isWallMounted(a)) - Number(isWallMounted(b)) || a.elevation - b.elevation);
    for (const item of ordered) {
      if (viewFilter === 'all' && isWallMounted(item)) upperTargets.push(item);
      else if (item.id !== activeId && isDimmed(item, viewFilter, row)) dimmed.push(item);
      else detailed.push(item);
    }
    return { dimmed, upperTargets, detailed };
  }, [items, viewFilter, row, activeId, foregroundId]);
  // Neither upper rulers nor resize handles may cover the floor target in All,
  // even when an add, row edit or 3D selection left the upper selected.
  const selectedDetail = activeSelection && detailed.includes(activeSelection) ? activeSelection : undefined;
  const annotated = ghost ?? selectedDetail;
  const identified = dragging ? undefined : items.find((i) => i.id === hoveredId && !dimmed.includes(i)) ?? activeSelection;
  const gesture = gestureRef.current;
  const drawItem = (item: KitchenItem, mode: PlanItemMode) => <ItemShape key={item.id} item={item} px={px}
    compact={compact} mode={mode} hovered={hoveredId === item.id} onPointerDown={onItemPointerDown} onHoverChange={onHoverChange} />;

  return (
    <div
      ref={containerRef}
      className={cn('relative h-full w-full touch-none overflow-hidden bg-studio-canvas', placing && '[&_.konvajs-content]:cursor-crosshair')}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDownCapture={(e) => { if (e.pointerType === 'touch') setHoveredId(null); }}
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
          onPointerDown={(e) => {
            const { pointerType, clientX, clientY } = e.evt;
            if (placing && selectedId) {
              const destination = clientToPlan(clientX, clientY, true);
              // Only a completed tap places the cabinet. A swipe pans; two fingers can still pinch.
              onStagePointerDown(e, () => {
                if (destination) setPlaceBlocked(placeCabinetAt(selectedId, destination) === 'blocked');
              });
              return;
            }
            const point = compact && pointerType === 'touch' && e.target === stageRef.current && clientToPlan(clientX, clientY);
            const nearby = point && nearbyCabinet(detailed, point, px, upperTargets);
            // Once picked, a tiny cabinet's 44px touch target also works for dragging.
            if (nearby && nearby.id === selectedId) { onItemPointerDown(nearby, e); return; }
            onStagePointerDown(e, nearby ? () => useUiStore.getState().select(nearby.id, 'plan') : undefined);
          }}
        >
          <Layer name="plan-room" listening={false}>
            <PlanRoom key={fontVersion} room={room} zoom={zoom} openings={openings} compact={compact} />
          </Layer>
          <Layer listening={!placing}>
            <PlanRoomTargets room={room} openings={openings} px={px} onPress={onStagePointerDown} />
            {dimmed.map((item) => drawItem(item, 'dimmed'))}
            {upperTargets.map((item) => drawItem(item, 'upper-target'))}
            {detailed.map((item) => drawItem(item, 'detail'))}
            {upperTargets.length > 0 && <UpperOutlines items={upperTargets} px={px} selectedId={activeId} />}
          </Layer>
          <Layer listening={!placing}>
            {showDimensions && <DimensionChains key={`dimensions-${fontVersion}`} room={room} items={detailed} px={px} compact={compact} totalsOnly={compact && !allDimensions} />}
            <IssueOutlines items={detailed} issues={issues} px={px} />
            {annotated && (!compact || (allDimensions && showDimensions)) && (
              <Clearances room={room} items={items} item={annotated} px={px} compact={compact} />
            )}
            <Guides guides={ghost ? libraryDrag!.guides : guides} room={room} px={px} />
            {ghost && <Ghost item={ghost} px={px} compact={compact} />}
            {compact && <CompactPlanCodes key={`codes-${fontVersion}`} items={detailed} selected={annotated} px={px} measurements={showDimensions} />}
            {compact && showDimensions && annotated && <SelectedUnitDimensions item={annotated} room={room} px={px} />}
            {selectedDetail && !ghost && !placing && (
              <Selection
                item={selectedDetail}
                px={px}
                touch={coarse}
                resizing={gesture?.kind === 'resize' && gesture.id === selectedDetail.id ? gesture : undefined}
                onHandlePointerDown={onHandlePointerDown}
                onCursor={setCursor}
              />
            )}
          </Layer>
        </Stage>
      )}
      {placing && activeSelection ? <div data-plan-controls="" className="studio-panel absolute inset-x-2 top-2 mx-auto flex w-fit max-w-[calc(100%-1rem)] items-center gap-2 rounded-xl border p-1.5 shadow-sm">
        <p role="status" className="px-1 text-sm leading-tight">{placeBlocked ? t.canvas.placeBlocked : t.canvas.placeHint(activeSelection.label)}</p>
        <Button aria-label={t.canvas.fit} title={t.canvas.fit} onClick={requestFit}><Maximize className="size-4" aria-hidden="true" /></Button>
        <Button autoFocus variant="outline" onClick={() => useUiStore.getState().setCabinetTool(null)}>{t.common.cancel}</Button>
      </div> : <PlanControls zoom={zoom} viewFilter={viewFilter} compact={compact}
        rows={rows} row={row} manualRow={manualRow} requestFit={requestFit} upperOutlines={upperTargets.length > 0} identified={identified}
        allDimensions={allDimensions && showDimensions} setAllDimensions={setAllDimensions} />}
      {items.length === 0 && <StartGuide onAdd={onAdd} />}
      <KitchenPlanRoomReadout />
    </div>
  );
}

const FILTERS: ViewFilter[] = ['all', 'floor', 'wall'];

interface CanvasControlsProps {
  zoom: number;
  viewFilter: ViewFilter;
  compact: boolean;
  rows: UpperRow[];
  row?: UpperRow;
  manualRow?: UpperRow;
  upperOutlines: boolean;
  identified?: KitchenItem;
  requestFit: () => void;
  allDimensions: boolean;
  setAllDimensions: (show: boolean) => void;
}

function CanvasControls({ zoom, viewFilter, compact, rows, row, manualRow, upperOutlines, identified, requestFit, allDimensions, setAllDimensions }: CanvasControlsProps) {
  const t = useT();
  const labels = usePlanMessages();
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
        <div role="group" data-plan-filters="" aria-label={t.canvas.filterLabel} className="studio-panel pointer-events-auto flex rounded-lg border p-0.5 shadow-sm">
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
        {(upperOutlines || viewFilter !== 'all') && <p role="status" className="rounded-md bg-studio-paper/95 px-2 py-1 text-xs leading-tight text-studio-muted">
          {viewFilter === 'all' ? t.canvas.upperOutlines(compact ? t.canvas.filters.wall.short : t.canvas.filters.wall.label)
            : t.canvas.dimmed[viewFilter === 'wall' && rows.length > 1 ? 'row' : viewFilter]}
        </p>}
        {identified && <p data-plan-cabinet-name="" role="status" className="max-w-full break-words rounded-md bg-studio-paper/95 px-2 py-1 text-xs font-medium leading-tight text-studio-ink">
          {t.kinds[identified.kind]} · {identified.label}
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
        {compact ? <>
          <Button title={labels.allDimensions} aria-label={labels.allDimensions} active={allDimensions}
            className="h-11 min-w-11 px-2" onClick={() => {
              if (!allDimensions) useUiStore.getState().setShowDimensions(true);
              setAllDimensions(!allDimensions);
              requestFit();
            }}>
            <Ruler className="size-4" />
          </Button>
          <Button title={t.canvas.fit} aria-label={t.canvas.fit} aria-description={labels.pinch}
            className="h-11 min-w-11 px-2 text-xs" onClick={requestFit}>
            <Maximize className="size-4" />{labels.fit}
          </Button>
        </> : <>
          <Button title={t.canvas.zoomOut} aria-label={t.canvas.zoomOut} className="h-7 min-w-7 px-1.5" onClick={() => zoomBy(1 / 1.25)}>
            <Minus className="size-4" />
          </Button>
          <button
            type="button"
            title={t.canvas.fit}
            onClick={requestFit}
            className="h-7 w-12 rounded-md text-xs font-medium tabular-nums text-studio-muted hover:bg-[#ece8df] hover:text-studio-ink"
          >
            {Math.round((zoom / REFERENCE_ZOOM) * 100)}%
          </button>
          <Button title={t.canvas.zoomIn} aria-label={t.canvas.zoomIn} className="h-7 min-w-7 px-1.5" onClick={() => zoomBy(1.25)}>
            <Plus className="size-4" />
          </Button>
          <div className="mx-0.5 h-4 w-px bg-zinc-200" />
          <Button title={t.canvas.fit} aria-label={t.canvas.fit} className="h-7 min-w-7 px-1.5" onClick={requestFit}>
            <Maximize className="size-4" />
          </Button>
        </>}
      </div>

    </>
  );
}
