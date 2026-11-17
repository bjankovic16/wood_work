import { Component, lazy, Suspense, useEffect, type ComponentProps, type ReactNode, type RefObject } from 'react';
import type { SizeField } from '../../domain/catalog';
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
    className="absolute left-3 top-3 z-20 w-60 max-w-[calc(100%-24px)] rounded-xl bg-white p-3 text-xs leading-relaxed text-zinc-700 shadow-lg"
    style={{ pointerEvents: failed ? 'auto' : 'none' }}>
    {failed ? t.view3d.resizeLoadFailed : t.view3d.loadingResize}
    {failed && <Button variant="outline" className="mt-2" onClick={() => window.location.reload()}>{t.view3d.reloadResize}</Button>}
  </div>;
}

export function CabinetResizeLabels({ item, field, allAxes, overlay }: {
  item: KitchenItem; field: SizeField; allAxes: boolean; overlay: RefObject<HTMLDivElement | null>;
}) {
  const t = useT();
  return <div ref={overlay} className="pointer-events-none absolute inset-0 z-[5]">
    {(['X', 'Y', 'Z'] as const).map((axis) => {
      const dimension = axis === 'X' ? 'width' : axis === 'Y' ? 'height' : item.kind === 'corner' ? 'width2' : 'depth';
      if (!allAxes && dimension !== field && !(axis === 'Z' && field === 'depth')) return null;
      const shownField = allAxes ? dimension : field;
      const label = shownField === 'width2' ? t.item.widthWallB : shownField === 'width' && item.kind === 'corner' ? t.item.widthWallA : t.item[shownField];
      return <span key={axis} data-resize-axis={axis} style={{ visibility: 'hidden' }}
        className="pointer-events-none absolute left-0 top-0 whitespace-nowrap rounded-md bg-white/95 px-2 py-1 text-[11px] font-semibold tabular-nums text-blue-700 shadow-sm">
        {label} {t.mm(shownField === 'width2' ? item.width2 ?? item.width : item[shownField])} mm
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
