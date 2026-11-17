import { Component, lazy, Suspense, useEffect, type ComponentProps, type ReactNode, type RefObject } from 'react';
import { Grip } from 'lucide-react';
import type { KitchenItem } from '../../domain/types';
import { useT } from '../../i18n';
import { Button } from '../ui';
import type { ResizeGripApi } from './CabinetResize';

const CabinetResize = lazy(() => import('./CabinetResize').then((module) => ({ default: module.CabinetResize })));

class ResizeBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function ResizeLoading({ onLoading }: { onLoading: () => void }) {
  useEffect(onLoading, [onLoading]);
  return null;
}

export function ResizeFeedback({ failed }: { failed: boolean }) {
  const t = useT();
  return <div role={failed ? 'alert' : 'status'} data-testid="resize-status"
    className="absolute left-3 top-3 z-20 w-60 max-w-[calc(100%-24px)] rounded-xl bg-white p-3 text-xs leading-relaxed text-zinc-700 shadow-lg"
    style={{ pointerEvents: failed ? 'auto' : 'none' }}>
    {failed ? t.view3d.resizeLoadFailed : t.view3d.loadingResize}
    {failed && <Button variant="outline" className="mt-2" onClick={() => window.location.reload()}>{t.view3d.reloadResize}</Button>}
  </div>;
}

export function CabinetResizeGrips({ item, overlay, api }: {
  item: KitchenItem; overlay: RefObject<HTMLDivElement | null>; api: RefObject<ResizeGripApi | null>;
}) {
  const t = useT();
  return <div ref={overlay} data-testid="resize-grips" className="pointer-events-none absolute inset-0 z-[5]">
    {(['width', 'height', 'depth', ...(item.kind === 'corner' ? ['width2'] as const : [])] as const).map((field) => {
      const label = field === 'width2' ? t.item.widthWallB : field === 'width' && item.kind === 'corner' ? t.item.widthWallA : t.item[field];
      return <button key={field} type="button" data-resize-field={field} style={{ visibility: 'hidden' }}
        aria-label={`${t.view3d.resizeShort}: ${label}`} title={t.view3d.resizeGripHint}
        onPointerDown={(event) => api.current?.begin(field, event.nativeEvent, event.currentTarget)}
        className={`pointer-events-auto absolute left-0 top-0 flex min-h-11 touch-none items-center gap-1 rounded-xl border-2 border-blue-500 bg-white px-2 py-1 text-blue-700 shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${field === 'height' ? 'cursor-ns-resize' : 'cursor-ew-resize'}`}>
        <Grip className="size-4 shrink-0" aria-hidden="true" />
        <span className="flex flex-col items-start whitespace-nowrap text-[11px] leading-tight"><span>{label}</span>
          <strong className="tabular-nums">{t.mm(field === 'width2' ? item.width2 ?? item.width : item[field])} mm</strong></span>
      </button>;
    })}
  </div>;
}

export function CabinetResizeTool({ onLoading, onError, ...props }: ComponentProps<typeof CabinetResize> & {
  onLoading: () => void; onError: () => void;
}) {
  return <ResizeBoundary onError={onError}>
    <Suspense fallback={<ResizeLoading onLoading={onLoading} />}><CabinetResize {...props} /></Suspense>
  </ResizeBoundary>;
}
