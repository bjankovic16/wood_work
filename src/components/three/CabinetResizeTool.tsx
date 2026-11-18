import { Component, lazy, Suspense, useEffect, type ComponentProps, type ReactNode, type RefObject } from 'react';
import type { KitchenItem } from '../../domain/types';
import { useT } from '../../i18n';
import { Button } from '../ui';

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
    className="three-resize-status absolute left-3 top-3 z-20 w-60 max-w-[calc(100%-24px)] rounded-xl bg-white p-3 text-xs leading-relaxed text-zinc-700 shadow-lg"
    style={{ pointerEvents: failed ? 'auto' : 'none' }}>
    {failed ? t.view3d.resizeLoadFailed : t.view3d.loadingResize}
    {failed && <Button variant="outline" className="mt-2" onClick={() => window.location.reload()}>{t.view3d.reloadResize}</Button>}
  </div>;
}

export function CabinetResizeLabels({ item, overlay }: {
  item: KitchenItem; overlay: RefObject<HTMLDivElement | null>;
}) {
  const t = useT();
  return <div ref={overlay} data-testid="resize-labels" className="pointer-events-none absolute inset-0 z-[5]">
    {(['width', 'height', 'depth', ...(item.kind === 'corner' ? ['width2'] as const : [])] as const).map((field) => {
      const label = field === 'width2' ? t.item.widthWallB : field === 'width' && item.kind === 'corner' ? t.item.widthWallA : t.item[field];
      return <span key={field} data-resize-field={field} style={{ visibility: 'hidden' }}
        className="absolute left-0 top-0 rounded-lg border border-blue-300 bg-white/95 px-2 py-1 text-blue-700 shadow-sm">
        <span className="flex flex-col items-start whitespace-nowrap text-[11px] leading-tight"><span>{label}</span>
          <strong className="tabular-nums">{t.mm(field === 'width2' ? item.width2 ?? item.width : item[field])} mm</strong></span>
      </span>;
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
