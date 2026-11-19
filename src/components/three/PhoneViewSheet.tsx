import { ArrowDownToLine, ArrowLeft, Box, Camera, Check, ChevronRight, Palette, PanelsTopLeft, RotateCcw, X } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { CameraView } from '../../domain/camera';
import { useT } from '../../i18n';
import { Button, TooltipButton } from '../ui';
import { SheetHandle, type SheetSnap } from '../sheets/SheetHandle';

const views = [{ key: 'perspective', Icon: Box }, { key: 'studio', Icon: Camera }, { key: 'front', Icon: PanelsTopLeft }, { key: 'top', Icon: ArrowDownToLine }] as const;

/** One native modal keeps the scene in place and the background inert, including in the finishes subpage. */
export function PhoneViewSheet({ id, onClose, view, onView, stylePanel, children, help, hint, cameraHints }: {
  id: string; onClose: () => void; view: CameraView | null; onView: (preset: CameraView) => void;
  stylePanel?: ReactNode; children?: ReactNode; help: ReactNode; hint?: string; cameraHints?: Record<CameraView, string>;
}) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const previousStyle = useRef(false);
  const [style, setStyle] = useState(false);
  const [snap, setSnap] = useState<SheetSnap>('full');
  useLayoutEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  function chooseView(preset: CameraView) {
    onView(preset);
    onClose();
  }
  useLayoutEffect(() => {
    if (style || previousStyle.current) ref.current?.querySelector<HTMLButtonElement>('[data-style-nav]')?.focus({ preventScroll: true });
    previousStyle.current = style;
    ref.current?.querySelector('[data-sheet-body]')?.scrollTo(0, 0);
  }, [style]);
  return <dialog id={id} ref={ref} className="room-sheet max-w-full open:flex open:flex-col" data-testid="phone-view-sheet" data-sheet-panel="modal" data-snap={snap}
    aria-labelledby={`${id}-title`} onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <header className="flex shrink-0 items-center gap-2 border-b border-studio-line bg-studio-paper px-2 py-1">
      <SheetHandle snap={snap} onSnap={setSnap} onClose={onClose} controls={`${id}-body`} />
      {style && <Button data-style-nav="" aria-label={t.topBar.view} onClick={() => setStyle(false)}><ArrowLeft size={18} /></Button>}
      <h2 id={`${id}-title`} className="mr-auto font-semibold">{style ? t.style.style : t.topBar.view}</h2>
      <Button aria-label={t.common.close} onClick={onClose}><X size={18} /></Button>
    </header>
    <div id={`${id}-body`} data-sheet-body="" className="min-h-0 space-y-3 overflow-y-auto overscroll-contain p-4">
      {style ? stylePanel : <>
        <section>
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-sm font-semibold">{t.view3d.cameraShort}</h3>
            <TooltipButton tooltip={t.view3d.resetViewTitle} onClick={() => chooseView('perspective')}>
              <RotateCcw size={15} />{t.view3d.resetView}
            </TooltipButton>
          </div>
          <div role="group" aria-label={t.view3d.camera} className="room-preview-options grid grid-cols-2 gap-2 min-[380px]:grid-cols-4">
            {views.map(({ key, Icon }) => <TooltipButton key={key} tooltip={(cameraHints ?? t.view3d.cameraHints)[key]}
              variant="outline" active={view === key} className="relative h-16 w-full flex-col" onClick={() => chooseView(key)}>
              <Icon size={18} aria-hidden="true" />{t.view3d[key]}
              {view === key && <Check size={12} className="absolute right-1.5 top-1.5" aria-hidden="true" />}
            </TooltipButton>)}
          </div>
          {stylePanel && view && <p className="mt-2 text-sm text-studio-muted">{t.view3d.cameraHints[view]}</p>}
        </section>
        {stylePanel && <div className="[&>span]:flex">
          <TooltipButton data-style-nav="" tooltip={t.view3d.appearanceHint} variant="outline" className="w-full justify-start gap-2 px-3" onClick={() => setStyle(true)}>
            <Palette size={17} />{t.style.style}<ChevronRight size={15} className="ml-auto" />
          </TooltipButton>
        </div>}
        {children}
        <div className="border-t border-studio-line pt-1">
          {help}
          <p className="px-2 text-xs leading-relaxed text-studio-muted">{hint ?? t.feedback.touchHint}</p>
        </div>
      </>}
    </div>
  </dialog>;
}
