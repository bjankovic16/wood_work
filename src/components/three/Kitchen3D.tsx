import { OrbitControls } from '@react-three/drei';
import { CircleHelp, Copy, DoorClosed, DoorOpen, LayoutGrid, Palette, PanelsTopLeft, Pencil, RotateCcw, Ruler, Scan, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { createPortal } from 'react-dom';
import { KIND_OPTIONS } from '../../engine/config';
import type { KitchenItem } from '../../domain/types';
import { useCoarsePointer } from '../../hooks/useMediaQuery';
import type { RoomObjectSelection } from '../../domain/roomObjectPlacement';
import { openingOnWall } from '../../domain/walls';
import { useT } from '../../i18n';
import { cn } from '../../lib/cn';
import { committedDesign, useDesignStore } from '../../store/designStore';
import { useBuildContext, useIssues } from '../../store/derived';
import { deleteSelected, duplicateSelected, editCabinetPositionInPlan } from '../../store/actions';
import { useUiStore } from '../../store/uiStore';
import { Button, Dialog, TooltipButton } from '../ui';
import { usePhoneThreeChrome } from '../layout/PhoneThreeChrome';
import { PhoneViewSheet } from './PhoneViewSheet';
import { useCustomerFile } from './useCustomerFile';
import { SceneCanvas, type CameraRequest } from './SceneCanvas';
import { useThreeNavigation } from './useThreeNavigation';
import { createMaterials, disposeMaterials } from './materials';
import { Room3D } from './Room3D';
import { RoomObjectAnchor, RoomObjectAnnotation, RoomObjectTools } from './RoomObjectTools';
import { CabinetResizeLabels, CabinetResizeTool, ResizeFeedback } from './CabinetResizeTool';
import { SelectionOverlay } from './SelectionOverlay';
import { StylePicker } from './StylePicker';
import { Unit3D } from './Unit3D';
import { PhotoReferencePanel } from '../references/PhotoReferences';
import { ItemFields } from '../properties/ItemPanel';
import { StackAboveButton } from '../properties/StackAboveButton';

const SceneRoom = memo(Room3D);

const canOpen = (item: KitchenItem) => KIND_OPTIONS[item.kind].carcass && KIND_OPTIONS[item.kind].fronts;

/**
 * The kitchen in 3D: body drags orbit the camera; placement belongs to the plan.
 */
export default function Kitchen3D({ compact = false }: { compact?: boolean }) {
  const text = useT();
  const toolsId = useId();
  const room = useDesignStore((s) => s.design.room);
  const items = useDesignStore((s) => s.design.items);
  const committedItems = useDesignStore((s) => committedDesign(s).items);
  const openings = useDesignStore((s) => s.design.openings);
  const ctx = useBuildContext();
  const style = useDesignStore((s) => s.design.style);
  const selectedId = useUiStore((s) => s.selectedId);
  const cabinetTool = useUiStore((s) => s.cabinetTool);
  const previewLockedIds = useUiStore((s) => s.previewLockedIds);
  const chrome = usePhoneThreeChrome();
  const touch = useCoarsePointer();
  const [sceneReady, setSceneReady] = useState(false);
  const referenceOpen = useUiStore((state) => state.referenceOpen);
  const cameraView = useUiStore((state) => state.cameraView);
  const cameraFocusId = useUiStore((state) => state.cameraFocusId);
  const cameraReturn = useUiStore((state) => state.cameraReturn);
  const cameraToken = useUiStore((state) => state.cameraToken);
  const request = useMemo<CameraRequest>(() => ({ view: cameraView, focusId: cameraFocusId ?? undefined, back: cameraReturn, token: cameraToken }), [cameraView, cameraFocusId, cameraReturn, cameraToken]);
  const issues = useIssues();
  const invalid = useMemo(() => new Set(issues.filter((issue) => issue.severity === 'error').flatMap((issue) => issue.itemIds)), [issues]);
  const selected = items.find((item) => item.id === selectedId);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const handlesRef = useRef<HTMLDivElement>(null);
  const resizeLabelsRef = useRef<HTMLDivElement>(null);
  const roomLabelRef = useRef<HTMLDivElement>(null);
  const [resizeInset, setResizeInset] = useState(0);
  const stopCamera = useCallback(() => {
    if (controls.current) controls.current.dispatchEvent({ type: 'start', target: controls.current });
  }, []);
  const [styleOpen, setStyleOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [interior, setInterior] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const [openedCabinets, setOpenedCabinets] = useState<Set<string>>(() => new Set());
  const opened = useRef(openedCabinets);
  opened.current = openedCabinets;
  /** Opens one cabinet and brings the camera to it, or closes it and takes the camera back. */
  const toggleOpening = useCallback((id: string) => {
    const ui = useUiStore.getState();
    if (ui.cabinetTool === 'resize' && ui.selectedId !== id) return;
    const existing = new Set(useDesignStore.getState().design.items.map((item) => item.id));
    const next = new Set([...opened.current].filter((entry) => existing.has(entry)));
    ui.setCabinetTool(null);
    if (next.delete(id)) {
      if (next.size === 0) ui.returnCamera();
    } else {
      next.add(id);
      ui.focusCamera(id);
    }
    opened.current = next;
    setOpenedCabinets(next);
  }, []);
  const openable = useMemo(() => committedItems.filter(canOpen), [committedItems]);
  const allOpen = openable.length > 0 && openable.every((item) => openedCabinets.has(item.id));
  const toggleAll = () => {
    useUiStore.getState().setCabinetTool(null);
    setOpenedCabinets(allOpen ? new Set() : new Set(openable.map((item) => item.id)));
    if (allOpen) useUiStore.getState().returnCamera();
  };

  const [resizeBlocked, setResizeBlocked] = useState(false);
  const [resizeStatus, setResizeStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const readyResize = useCallback(() => setResizeStatus('ready'), []);
  const loadingResize = useCallback(() => setResizeStatus('loading'), []);
  const failedResize = useCallback(() => setResizeStatus('error'), []);
  const cancelResize = useCallback(() => setResizeBlocked(false), []);
  const roomSelection = useUiStore((s) => s.roomSelection);
  const selectRoomObject = useCallback((selection: RoomObjectSelection | null) => {
    if (selection && useUiStore.getState().cabinetTool === 'resize') return;
    const { room, openings } = useDesignStore.getState().design;
    const opening = selection?.type === 'opening' && openings.find((o) => o.id === selection.id);
    const wallId = opening ? openingOnWall(room, opening)?.segment.id
      : selection?.type === 'feature' ? room.features?.find((f) => f.id === selection.id)?.wallId : undefined;
    useUiStore.getState().selectRoomObject(selection, wallId);
    setResizeBlocked(false);
  }, []);
  const roomOptions = [
    ...openings.map((opening, index) => ({ type: 'opening' as const, id: opening.id, name: `${text.room.opening(opening.kind)} ${openings.slice(0, index + 1).filter((entry) => entry.kind === opening.kind).length}` })),
    ...(room.features ?? []).map((feature, index) => ({ type: 'feature' as const, id: feature.id, name: `${text.engine.roomFeatures[feature.kind]} ${index + 1}` })),
  ];
  const activeRoomSelection = roomSelection && roomOptions.some((option) => option.type === roomSelection.type && option.id === roomSelection.id) ? roomSelection : null;
  const selectedLocked = !!selected && previewLockedIds.includes(selected.id);
  const canResize = !!selected && cabinetTool === 'resize' && !selectedLocked;
  useLayoutEffect(() => {
    if (!compact || !canResize) { setResizeInset(0); return; }
    const sheet = document.querySelector('[data-testid="item-sheet"]');
    if (!sheet) return;
    const measure = () => setResizeInset(sheet.getBoundingClientRect().height);
    const observer = new ResizeObserver(measure);
    observer.observe(sheet);
    measure();
    return () => observer.disconnect();
  }, [compact, canResize, selectedId]);
  const navigation = useThreeNavigation(sceneReady && !selected && !activeRoomSelection, Boolean(chrome?.open || toolsOpen || styleOpen));

  const studio = cameraView === 'studio';
  const customer = useCustomerFile(studio, sceneReady, compact);
  const materials = useMemo(() => createMaterials(style, studio), [style, studio]);
  useEffect(() => () => disposeMaterials(materials), [materials]);
  useLayoutEffect(() => {
    useUiStore.getState().setPreviewLockedIds(committedItems.filter((item) => interior || openedCabinets.has(item.id)).map((item) => item.id));
  }, [committedItems, interior, openedCabinets]);
  useEffect(() => {
    if (!selectedId) useUiStore.getState().setCabinetTool(null);
    else selectRoomObject(null);
  }, [selectedId, selected?.kind, selectRoomObject]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.target instanceof HTMLElement && (event.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName))) return;
      if (document.querySelector('dialog:modal, [role="dialog"][aria-modal="true"]')) return;
      selectRoomObject(null);
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [selectRoomObject]);
  useEffect(() => () => {
    document.body.style.cursor = '';
    // Cabinets close when the 3D view is left, so it should not come back zoomed in on one.
    const ui = useUiStore.getState();
    ui.setCabinetTool(null);
    ui.setPreviewLockedIds([]);
    if (ui.cameraFocusId) ui.requestCamera(ui.cameraView);
  }, []);

  const select = useCallback((id: string) => {
    const ui = useUiStore.getState();
    if (ui.selectedId === id || ui.cabinetTool === 'resize') return;
    selectRoomObject(null);
    ui.select(id);
  }, [selectRoomObject]);

  const selectedOpen = !!selected && openedCabinets.has(selected.id);
  const startResize = () => {
    const ui = useUiStore.getState();
    if (ui.cabinetTool === 'resize') return;
    ui.setCabinetTool('resize');
    setResizeBlocked(false);
    if (ui.selectedId && useUiStore.getState().cabinetTool === 'resize') ui.focusCamera(ui.selectedId);
  };
  const interiorButton = (
    <TooltipButton tooltip={text.view3d.interiorHint} className="h-10" variant="outline" active={interior} onClick={() => {
      useUiStore.getState().setCabinetTool(null); setInterior((shown) => !shown); chrome?.setOpen(false);
    }}>
      <PanelsTopLeft className="size-4" />{text.view3d.interior}
    </TooltipButton>
  );
  const openAllButton = <TooltipButton tooltip={allOpen ? text.view3d.closeAllHint : text.view3d.openAllHint} className="h-10 flex-1 whitespace-nowrap lg:flex-none"
    variant="outline" active={allOpen} disabled={interior || openable.length === 0} onClick={() => { toggleAll(); chrome?.setOpen(false); }}>
    {allOpen ? <DoorClosed className="size-4" /> : <DoorOpen className="size-4" />}
    {allOpen ? text.view3d.closeAll : text.view3d.openAll}
  </TooltipButton>;
  const toolsButton = <TooltipButton tooltip={text.view3d.toolsHint} data-testid="three-tools-toggle" aria-expanded={toolsOpen} aria-controls={toolsId} aria-label={text.view3d.tools}
    className="h-10 min-w-10" active={toolsOpen} onClick={() => setToolsOpen(!toolsOpen)}>
    <SlidersHorizontal className="size-4" />
    <span className={cn(compact && 'sr-only')}>{text.view3d.toolsShort}</span>
  </TooltipButton>;
  const roomObjects = roomOptions.length > 0 && <select aria-label={text.view3d.roomObjects} value={activeRoomSelection ? `${activeRoomSelection.type}:${activeRoomSelection.id}` : ''}
    className="min-h-9 min-w-0 max-w-full rounded-lg border border-zinc-200 bg-white px-2 text-xs text-zinc-800 shadow-sm"
    onChange={(event) => {
      const option = roomOptions.find((option) => `${option.type}:${option.id}` === event.target.value);
      selectRoomObject(option ? { type: option.type, id: option.id } : null);
      chrome?.setOpen(false);
    }}>
    <option value="">{text.view3d.roomObjects}</option>
    {roomOptions.map((option) => <option key={`${option.type}:${option.id}`} value={`${option.type}:${option.id}`}>{option.name}</option>)}
  </select>;
  const helpButton = <TooltipButton tooltip={text.view3d.showTip} aria-label={text.view3d.showTip} variant={chrome ? 'ghost' : 'outline'} onClick={() => {
    setToolsOpen(false); setStyleOpen(false); navigation.showHelp();
  }}><CircleHelp size={17} aria-hidden="true" />{chrome && text.view3d.showTip}</TooltipButton>;

  return (
    <div className="three-scene flex h-full min-h-0 w-full flex-col bg-[#ebe8e3] lg:flex-row">
      {chrome?.shareSlot && createPortal(customer.share, chrome.shareSlot)}
      {customer.dialog}
      {referenceOpen && <PhotoReferencePanel />}
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      {chrome?.open && <PhoneViewSheet id={chrome.id} onClose={() => chrome.setOpen(false)} view={request.focusId ? null : request.view} onView={useUiStore.getState().requestCamera}
        stylePanel={<StylePicker />} help={helpButton}>
        <section className="room-preview-actions"><h3>{text.view3d.cabinetPreview}</h3>
          <div className="flex flex-wrap gap-2">{openAllButton}{interiorButton}</div></section>
        {roomObjects}
      </PhoneViewSheet>}
      {!chrome && <div role="toolbar" aria-label={text.view3d.toolbar} data-testid="three-toolbar" className="studio-panel flex shrink-0 flex-col gap-2 border-b px-3 py-2 lg:flex-row lg:flex-wrap lg:items-center lg:gap-3">
        <div className="flex items-center justify-between gap-2">
        <div role="group" aria-label={text.view3d.camera} className="flex shrink-0 rounded-xl border border-studio-line bg-[#efede5] p-0.5">
          {(['perspective', 'studio', 'front', 'top'] as const).map((view) => <TooltipButton key={view} tooltip={text.view3d.cameraHints[view]}
            className="h-10 px-2.5" active={request.view === view && !request.focusId}
            onClick={() => useUiStore.getState().requestCamera(view)}>{text.view3d[view]}</TooltipButton>)}
        </div>
        <TooltipButton tooltip={text.view3d.appearanceHint} variant="outline" className="h-10 min-w-10" active={styleOpen} aria-label={text.style.style} onClick={() => setStyleOpen((open) => !open)}>
          <Palette className="size-4" />
          <span className={cn(compact && 'sr-only')}>{text.style.style}</span>
        </TooltipButton>
        </div>
        <TooltipButton tooltip={text.view3d.resetViewTitle} className="h-10 min-w-10" variant="outline" aria-label={text.view3d.resetView} onClick={() => useUiStore.getState().requestCamera('perspective')}>
          <RotateCcw className="size-4" />
        </TooltipButton>
        <div role="group" aria-label={text.view3d.kitchenActions} className="flex items-center gap-2 lg:border-l lg:border-studio-line lg:pl-3">
        {openAllButton}
        </div>
        {interiorButton}
        <div className="min-w-0 flex-1" />{customer.share}{toolsButton}
      </div>}

      {activeRoomSelection && <div data-three-object-tools="" className="studio-panel shrink-0 border-b px-3 py-2">
        <RoomObjectTools selection={activeRoomSelection} onClose={() => selectRoomObject(null)} />
      </div>}

      {toolsOpen && <div id={toolsId} data-testid="three-tools" className="flex max-h-[35dvh] shrink-0 flex-col items-start gap-2 overflow-y-auto overscroll-contain border-b border-studio-line bg-[#f7f5f0] px-3 py-3">
        {customer.desktop}
        {roomObjects}
        {!compact && selected && <SelectedCabinetTools key={selected.id} item={selected}
          invalid={invalid.has(selected.id)} onFocus={() => useUiStore.getState().focusCamera(selected.id)} />}
        {interior && <p className="max-w-xl text-xs leading-relaxed text-zinc-600">{text.view3d.interiorHint}</p>}
        {/* Closed by default: its text changes with the tool in use, and an open paragraph would resize the kitchen each time. */}
        <details className="text-xs text-zinc-600">
          <summary className="cursor-pointer py-1">{text.view3d.help}</summary>
          <p className="max-w-xl py-2 leading-relaxed">{touch ? text.feedback.touchHint : text.view3d.selectHint}</p>
        </details>
      </div>}

      <div className="relative min-h-0 flex-1 touch-none overflow-hidden" data-testid="three-viewport" {...navigation.handlers}>
      <SceneCanvas request={request} controls={controls} inset={resizeInset} onReady={() => setSceneReady(true)}
        onMiss={() => {
          if (useUiStore.getState().cabinetTool !== 'resize') {
            useUiStore.getState().select(null);
            selectRoomObject(null);
          }
        }}>
        <SceneRoom room={room} openings={openings} items={committedItems} materials={materials} studio={studio} selection={activeRoomSelection} onSelect={selectRoomObject} />
        {items.map((item) => (
          <Unit3D
            key={item.id}
            item={item}
            ctx={ctx}
            materials={materials}
            studio={studio}
            selected={item.id === selectedId}
            onSelect={select}
            invalid={invalid.has(item.id)}
            interior={interior}
            opened={openedCabinets.has(item.id)}
            onToggleOpening={!interior && canOpen(item) ? toggleOpening : undefined}
            hovered={item.id === hoveredId}
            onHover={setHoveredId}
          />
        ))}
        {selected && <SelectionOverlay item={selected} overlay={handlesRef} />}
        {canResize && selected && <CabinetResizeTool key={selected.id} item={selected} overlay={resizeLabelsRef} onStart={stopCamera}
          onLoading={loadingResize} onError={failedResize} onReady={readyResize} onCancel={cancelResize} onBlocked={setResizeBlocked} />}
        {activeRoomSelection && <RoomObjectAnchor overlay={roomLabelRef} />}
        {customer.model}
      </SceneCanvas>
      {activeRoomSelection && <RoomObjectAnnotation overlay={roomLabelRef} />}

      {canResize && selected && <>
        {resizeStatus !== 'error' && <CabinetResizeLabels item={selected} overlay={resizeLabelsRef} />}
        {resizeStatus !== 'ready' && <ResizeFeedback failed={resizeStatus === 'error'} />}
      </>}

      {selected && <div ref={handlesRef} data-testid="cabinet-tools" className="studio-panel absolute left-0 top-0 z-10 flex items-center gap-1 rounded-2xl border p-1 shadow-[0_6px_24px_#332f2826]" style={{ visibility: 'hidden' }}>
        <TooltipButton aria-label={text.room.editIn2D} tooltip={text.room.editIn2D}
          onClick={() => editCabinetPositionInPlan(selected.id)} className="h-11 min-w-11 rounded-xl px-2">
          <LayoutGrid className="size-5" aria-hidden="true" />
          <span className={cn('text-[13px] font-semibold', compact && 'sr-only')}>{text.view3d.planShort}</span>
        </TooltipButton>
        <TooltipButton disabled={selectedLocked} active={cabinetTool === 'resize'} aria-pressed={cabinetTool === 'resize'} aria-label={text.view3d.resize} tooltip={selectedLocked ? text.view3d.previewLocked : text.view3d.resizeModeHint}
          onClick={startResize} className="h-11 min-w-11 rounded-xl px-2">
          <Ruler className="size-5" aria-hidden="true" /><span className={cn('text-[13px] font-semibold', compact && 'sr-only')}>{text.view3d.resizeShort}</span>
        </TooltipButton>
        {!interior && canOpen(selected) && <TooltipButton
          aria-label={selectedOpen ? text.view3d.closeCabinet : text.view3d.openCabinet}
          tooltip={selectedOpen ? text.view3d.closeCabinet : text.view3d.openCabinet}
          aria-pressed={selectedOpen} onClick={() => toggleOpening(selected.id)}
          className="flex h-11 touch-manipulation items-center justify-center gap-2 rounded-xl px-3 text-studio-ink transition-colors hover:bg-[#ece8df] aria-pressed:bg-[#e6ecdf] aria-pressed:text-[#3e5539] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-studio-accent">
          {selectedOpen ? <DoorClosed className="size-5" aria-hidden="true" /> : <DoorOpen className="size-5" aria-hidden="true" />}
          <span className={cn('text-[13px] font-semibold', compact && 'sr-only')}>{selectedOpen ? text.view3d.closeShort : text.view3d.openShort}</span>
        </TooltipButton>}
        {cabinetTool && <TooltipButton aria-label={text.common.done} tooltip={text.common.done} onClick={() => useUiStore.getState().setCabinetTool(null)} className="h-11 min-w-11 rounded-xl"><X className="size-5" /></TooltipButton>}
      </div>}

      {selected && (selectedLocked || cabinetTool && (!canResize || resizeStatus === 'ready')) && <p role="status" data-testid="cabinet-mode-hint"
        className="three-mode-hint pointer-events-none absolute inset-x-3 top-3 z-10 mx-auto w-fit max-w-sm rounded-xl bg-studio-ink/90 px-3 py-2 text-center text-xs leading-snug text-white shadow-lg">
        {selectedLocked ? text.view3d.previewLocked : text.view3d.resizeModeHint}
      </p>}

      {!chrome && <div className="absolute right-2 top-2 z-10">{helpButton}</div>}
      {navigation.showTip && <p role="status" data-testid="three-tip" className="three-tip pointer-events-none absolute inset-x-3 top-3 z-10 mx-auto w-fit max-w-full rounded-full bg-studio-ink/85 px-4 py-2 text-center text-xs font-medium leading-snug text-white shadow-lg backdrop-blur-sm">
        {touch ? text.view3d.tipTouch : text.view3d.tipMouse}
      </p>}

      {canResize && resizeBlocked && <p role="status" className="pointer-events-none absolute inset-x-3 bottom-20 z-10 mx-auto w-fit max-w-sm rounded-xl bg-amber-50 px-3 py-2 text-center text-xs leading-snug text-amber-900 shadow-lg ring-1 ring-amber-200">
        {text.view3d.resizeBlocked}
      </p>}

      {!compact && styleOpen && (
        <div className="studio-panel absolute left-3 top-3 z-20 max-h-[calc(100%-24px)] w-64 max-w-full overflow-y-auto rounded-xl border p-3 shadow-xl">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[13px] font-semibold text-studio-ink">{text.style.style}</span>
            <Button aria-label={text.style.hide} className="-my-1 -mr-1 h-6 min-w-6 px-1" onClick={() => setStyleOpen(false)}>
              <X className="size-3.5" />
            </Button>
          </div>
          <StylePicker />
        </div>
      )}

      </div>

      </div>
    </div>
  );
}

function SelectedCabinetTools({ item, invalid, onFocus }: {
  item: KitchenItem; invalid: boolean; onFocus: () => void;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  return (
    <div className="pointer-events-auto max-w-full space-y-1">
      <div role="group" aria-label={t.view3d.selectedActions} className="flex max-w-full flex-wrap items-center gap-1 rounded-lg border border-zinc-200 bg-white p-1 shadow-sm">
        <span className="px-2 text-xs font-semibold text-zinc-800">{item.label}</span>
        <div className="flex items-center gap-1">
          <TooltipButton aria-label={t.view3d.focusSelection} tooltip={t.view3d.focusSelection} onClick={onFocus}><Scan className="size-4" /></TooltipButton>
          <TooltipButton aria-label={t.view3d.copySelected} tooltip={t.view3d.copySelected} onClick={duplicateSelected}><Copy className="size-4" /></TooltipButton>
          <StackAboveButton key={item.id} item={item} iconOnly />
          <TooltipButton aria-label={t.view3d.editSelected} tooltip={t.view3d.editSelected} onClick={() => setEditing(true)}><Pencil className="size-4" /></TooltipButton>
          <TooltipButton aria-label={t.view3d.deleteSelected} tooltip={t.view3d.deleteSelected} onClick={deleteSelected}><Trash2 className="size-4" /></TooltipButton>
        </div>
      </div>
      {invalid && <p role="status" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">{t.view3d.invalidSelection}</p>}
      <Dialog open={editing} title={`${t.kinds[item.kind]} ${item.label}`} onClose={() => setEditing(false)} footer={<Button variant="primary" onClick={() => setEditing(false)}>{t.common.done}</Button>}>
        <ItemFields item={item} />
      </Dialog>
    </div>
  );
}
