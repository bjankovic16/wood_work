import { ArrowLeft, Box, Check, ChevronRight, LayoutGrid, Palette, PanelsTopLeft, RotateCcw, X } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { CameraView } from '../../domain/camera';
import { useT } from '../../i18n';
import { useUiStore } from '../../store/uiStore';
import { Button, TooltipButton } from '../ui';
import { StylePicker } from './StylePicker';

const views = [{ key: 'perspective', Icon: Box }, { key: 'front', Icon: PanelsTopLeft }, { key: 'top', Icon: LayoutGrid }] as const;

/** One native modal keeps the scene in place and the background inert, including in the finishes subpage. */
export function PhoneViewSheet({ id, onClose, view, room, previews, nextKitchen, shuffleHint, customerExport, roomObjects, help }: {
  id: string; onClose: () => void; view: CameraView | null; room: boolean;
  previews: ReactNode; nextKitchen: ReactNode; shuffleHint?: string; customerExport: ReactNode; roomObjects: ReactNode; help: ReactNode;
}) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const previousStyle = useRef(false);
  const [style, setStyle] = useState(false);
  useLayoutEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  function chooseView(preset: CameraView) {
    useUiStore.getState().requestCamera(preset);
    onClose();
  }
  useLayoutEffect(() => {
    if (style || previousStyle.current) ref.current?.querySelector<HTMLButtonElement>('[data-style-nav]')?.focus({ preventScroll: true });
    previousStyle.current = style;
    ref.current?.scrollTo(0, 0);
  }, [style]);
  return <dialog id={id} ref={ref} className="room-sheet max-w-full overscroll-contain" data-testid="phone-view-sheet"
    aria-labelledby={`${id}-title`} onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-studio-line bg-studio-paper py-1 pl-4 pr-2">
      {style && <Button data-style-nav="" aria-label={t.topBar.view} onClick={() => setStyle(false)}><ArrowLeft size={18} /></Button>}
      <h2 id={`${id}-title`} className="mr-auto font-semibold">{style ? t.style.style : t.topBar.view}</h2>
      <Button aria-label={t.common.close} onClick={onClose}><X size={18} /></Button>
    </header>
    <div className="space-y-3 p-4">
      {style ? <StylePicker roomFirst={room} /> : <>
        <section>
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-sm font-semibold">{t.view3d.cameraShort}</h3>
            <TooltipButton tooltip={t.view3d.resetViewTitle} onClick={() => chooseView('perspective')}>
              <RotateCcw size={15} />{t.view3d.resetView}
            </TooltipButton>
          </div>
          <div role="group" aria-label={t.view3d.camera} className="room-preview-options grid grid-cols-3 gap-2">
            {views.map(({ key, Icon }) => <TooltipButton key={key} tooltip={t.view3d.cameraHints[key]}
              variant="outline" active={view === key} className="relative h-16 w-full flex-col" onClick={() => chooseView(key)}>
              <Icon size={18} aria-hidden="true" />{key === 'perspective' ? t.view3d.perspectiveName : t.view3d[key]}
              {view === key && <Check size={12} className="absolute right-1.5 top-1.5" aria-hidden="true" />}
            </TooltipButton>)}
          </div>
        </section>
        <div className="[&>span]:flex">
          <TooltipButton data-style-nav="" tooltip={t.view3d.appearanceHint} variant="outline" className="w-full justify-start gap-2 px-3" onClick={() => setStyle(true)}>
            <Palette size={17} />{t.style.style}<ChevronRight size={15} className="ml-auto" />
          </TooltipButton>
        </div>
        <section className="room-preview-actions">
          <h3>{t.view3d.cabinetPreview}</h3>
          <div className="flex flex-wrap gap-2">{previews}</div>
        </section>
        <section className="room-preview-actions border-t border-studio-line pt-3">
          <h3>{t.topBar.project}</h3>
          {nextKitchen}
          {shuffleHint && <p className="text-xs text-studio-muted">{shuffleHint}</p>}
          {customerExport}
        </section>
        {roomObjects}
        <div className="border-t border-studio-line pt-1">
          {help}
          <p className="px-2 text-xs leading-relaxed text-studio-muted">{t.view3d.selectHint}</p>
        </div>
      </>}
    </div>
  </dialog>;
}
