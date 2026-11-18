import { Box, Check, ChevronDown, LayoutGrid, Orbit, Palette, PanelsTopLeft, RotateCcw, X } from 'lucide-react';
import { useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import type { CameraView } from '../../domain/camera';
import { useT } from '../../i18n';
import { useUiStore } from '../../store/uiStore';
import { StylePicker } from '../three/StylePicker';
import { Button, TooltipButton } from '../ui';

const groups = [{ key: 'camera', Icon: Orbit }, { key: 'style', Icon: Palette }, { key: 'kitchen', Icon: PanelsTopLeft }] as const;
export type RoomPreviewPanel = typeof groups[number]['key'];
const views = [{ key: 'perspective', Icon: Box }, { key: 'front', Icon: PanelsTopLeft }, { key: 'top', Icon: LayoutGrid }] as const;

export function RoomPreviewToolbar({ panel, onPanel, view, previews, nextKitchen, shuffleHint, customerExport }: {
  panel: RoomPreviewPanel | null;
  onPanel: (panel: RoomPreviewPanel | null) => void;
  view: CameraView | null;
  previews: ReactNode;
  nextKitchen: ReactNode;
  shuffleHint?: string;
  customerExport: ReactNode;
}) {
  const t = useT();
  const id = useId();
  const sheet = useRef<HTMLDialogElement>(null);
  const labels = { camera: t.view3d.cameraShort, style: t.style.style, kitchen: t.view3d.kitchenShort };
  const hints = { camera: t.view3d.cameraMenuHint, style: t.view3d.appearanceHint, kitchen: t.view3d.kitchenMenuHint };
  useLayoutEffect(() => {
    if (!panel) return;
    const dialog = sheet.current!;
    dialog.showModal();
    return () => dialog.close();
  }, [panel]);

  const chooseView = (preset: CameraView) => {
    useUiStore.getState().requestCamera(preset);
    onPanel(null);
  };
  return <>
    <div role="toolbar" aria-label={t.view3d.toolbar} data-testid="three-toolbar" className="room-preview-bar">
      {groups.map(({ key, Icon }) => <TooltipButton key={key} tooltip={hints[key]} variant="outline"
        aria-haspopup="dialog" aria-expanded={key === panel} aria-controls={id} onClick={() => onPanel(key)}>
        <Icon size={17} aria-hidden="true" />{labels[key]}<ChevronDown size={12} aria-hidden="true" />
      </TooltipButton>)}
    </div>
    <dialog id={id} ref={sheet} className="room-sheet max-w-full overscroll-contain" aria-labelledby={`${id}-title`}
      onCancel={(event) => { event.preventDefault(); onPanel(null); }}
      onClick={(event) => { if (event.target === event.currentTarget) onPanel(null); }}>
      {panel && <>
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-studio-line bg-studio-paper py-1 pl-4 pr-2">
          <h2 id={`${id}-title`} className="font-semibold">{labels[panel]}</h2>
          <Button aria-label={t.common.close} onClick={() => onPanel(null)}><X size={18} /></Button>
        </header>
        <div className="space-y-4 p-4">
          {panel === 'camera' && <>
            <div role="group" aria-label={t.view3d.camera} className="room-preview-options grid grid-cols-3 gap-2">
              {views.map(({ key, Icon }) => <TooltipButton key={key} tooltip={t.view3d.cameraHints[key]}
                variant="outline" active={view === key} className="relative h-16 w-full flex-col" onClick={() => chooseView(key)}>
                <Icon size={20} aria-hidden="true" />{key === 'perspective' ? t.view3d.perspectiveName : t.view3d[key]}
                {view === key && <Check size={13} className="absolute right-1.5 top-1.5" aria-hidden="true" />}
              </TooltipButton>)}
            </div>
            <TooltipButton tooltip={t.view3d.resetViewTitle} onClick={() => chooseView('perspective')}>
              <RotateCcw size={16} />{t.view3d.resetView}
            </TooltipButton>
            <details className="border-t border-studio-line text-sm text-studio-muted">
              <summary className="cursor-pointer pt-3">{t.view3d.help}</summary>
              <p>{t.view3d.selectHint}</p>
            </details>
          </>}
          {panel === 'style' && <StylePicker roomFirst />}
          {panel === 'kitchen' && <>
            <section className="room-preview-actions">
              <h3>{t.view3d.cabinetPreview}</h3>
              {previews}
            </section>
            <section className="room-preview-actions border-t border-studio-line pt-3">
              <h3>{t.topBar.project}</h3>
              {nextKitchen}
              {shuffleHint && <p className="text-xs text-studio-muted">{shuffleHint}</p>}
              {customerExport}
            </section>
          </>}
        </div>
      </>}
    </dialog>
  </>;
}
