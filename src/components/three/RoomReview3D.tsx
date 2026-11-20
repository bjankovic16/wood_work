import type { OrbitControls } from '@react-three/drei';
import { CircleHelp, Maximize2, Ruler, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import type { CameraView } from '../../domain/camera';
import type { RoomObjectSelection } from '../../domain/roomObjectPlacement';
import { openingOnWall } from '../../domain/walls';
import { useCoarsePointer } from '../../hooks/useMediaQuery';
import { useT } from '../../i18n';
import { useDesignStore } from '../../store/designStore';
import { useUiStore } from '../../store/uiStore';
import { usePhoneThreeChrome } from '../layout/PhoneThreeChrome';
import type { RoomMeasure } from '../room/roomMeasurements';
import { editRoomPositionIn2D } from '../room/RoomReadout';
import { Button, TooltipButton } from '../ui';
import { createMaterials, disposeMaterials } from './materials';
import { PhoneViewSheet } from './PhoneViewSheet';
import { Room3D } from './Room3D';
import { ProjectRoomMeasures, RoomMeasureLabels } from './RoomMeasureLabels';
import { RoomObjectAnchor, RoomObjectAnnotation, RoomObjectTools } from './RoomObjectTools';
import { SceneCanvas, type CameraRequest } from './SceneCanvas';
import { useThreeNavigation } from './useThreeNavigation';

export default function RoomReview3D({ rows, closeInset, expandInset, onOpenWall }: { rows: RoomMeasure[]; closeInset?: () => void; expandInset?: () => void; onOpenWall: (id: string) => void }) {
  const t = useT();
  const { room, openings, style } = useDesignStore((s) => s.design);
  const picked = useUiStore((s) => s.roomSelection);
  const selection = picked && (picked.type === 'opening' ? openings : room.features)?.some((o) => o.id === picked.id) ? picked : null;
  const wallId = useUiStore((s) => s.selectedWallId);
  const ui = useUiStore.getState();
  const chrome = usePhoneThreeChrome();
  const touch = useCoarsePointer();
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const labels = useRef<HTMLDivElement>(null), selectedLabel = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const [request, setRequest] = useState<CameraRequest>({ view: 'perspective', token: 0 });
  const choose = (view: CameraView) => setRequest((prev) => ({ view, token: prev.token + 1 }));
  const studio = request.view === 'studio';
  const materials = useMemo(() => createMaterials(style, studio), [style, studio]);
  useEffect(() => () => disposeMaterials(materials), [materials]);
  const nav = useThreeNavigation(ready && !selection && !closeInset, Boolean(chrome?.open));
  const select = (s: RoomObjectSelection) => {
    const opening = s.type === 'opening' && openings.find((o) => o.id === s.id);
    ui.selectRoomObject(s, opening ? openingOnWall(room, opening)?.segment.id : room.features?.find((f) => f.id === s.id)?.wallId);
  };
  const toggle = <Button variant="outline" aria-label={t.room.showMeasures} title={t.room.showMeasures}
    aria-pressed={showLabels} active={showLabels} onClick={() => setShowLabels(!showLabels)}>
    <Ruler size={16} />{!closeInset && t.room.showMeasures}</Button>;
  const help = <Button aria-label={t.view3d.showTip} title={t.view3d.showTip} onClick={nav.showHelp}><CircleHelp size={17} />{chrome ? t.view3d.showTip : t.topBar.help}</Button>;
  return <div className="three-scene relative flex h-full min-h-0 flex-col">
    {chrome?.open && <PhoneViewSheet id={chrome.id} onClose={() => chrome.setOpen(false)} view={request.view} onView={choose}
      hint={t.room.reviewHint} cameraHints={t.room.cameraHints} help={help}>{toggle}</PhoneViewSheet>}
    {!chrome && <div role="toolbar" aria-label={t.room.view} className="studio-panel flex flex-wrap items-center gap-2 border-b p-2">
      {closeInset ? <strong className="mr-auto px-1 text-xs">{t.room.preview}</strong> : <div role="group" aria-label={t.view3d.camera} className="flex gap-1">
        {(['perspective', 'studio', 'front', 'top'] as const).map((v) =>
          <TooltipButton key={v} active={v === request.view} tooltip={t.room.cameraHints[v]} onClick={() => choose(v)}>{t.view3d[v]}</TooltipButton>)}
      </div>}{toggle}{expandInset && <TooltipButton aria-label={t.room.expandPreview} tooltip={t.room.expandPreview}
        onClick={expandInset}><Maximize2 size={16} /></TooltipButton>}
      {closeInset ? <TooltipButton aria-label={t.common.close} tooltip={t.common.close} onClick={closeInset}><X size={16} /></TooltipButton> : help}
    </div>}
    {selection && <div data-three-object-tools="" className="studio-panel shrink-0 border-b px-3 py-2">
      <RoomObjectTools key={`${selection.type}:${selection.id}`} selection={selection} sizing onClose={() => ui.selectRoomObject(null)}
        onEditPosition={() => { closeInset?.(); editRoomPositionIn2D(); }} />
    </div>}
    <div data-testid="three-viewport" className="relative min-h-0 flex-1 touch-none overflow-hidden" {...nav.handlers}>
      <SceneCanvas request={request} roomOnly controls={controls} onReady={() => setReady(true)} onMiss={() => ui.setSelectedWallId(null)}>
        <Room3D room={room} openings={openings} materials={materials} detailed={studio} selection={selection} onSelect={select}
          selectedWallId={wallId} onWallSelect={onOpenWall} />
        {showLabels && <ProjectRoomMeasures rows={rows} overlay={labels} />}
        {selection && <RoomObjectAnchor overlay={selectedLabel} />}
      </SceneCanvas>
      {showLabels && <RoomMeasureLabels rows={rows} overlay={labels} onOpenWall={onOpenWall} />}
      {selection && <RoomObjectAnnotation overlay={selectedLabel} />}
      {nav.showTip && <p role="status" data-testid="three-tip" className="three-tip pointer-events-none absolute inset-x-3 top-3 mx-auto w-fit rounded-full bg-studio-ink/85 px-4 py-2 text-center text-xs text-white">
        {touch ? t.view3d.tipTouch : t.room.reviewHint}</p>}
    </div>
  </div>;
}
