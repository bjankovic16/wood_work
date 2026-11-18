import { lazy, Suspense } from 'react';
import { useT } from '../../i18n';
import type { RoomMeasure } from '../room/roomMeasurements';

// three.js is only downloaded when the 3D view is first opened.
const Kitchen3D = lazy(() => import('./Kitchen3D'));
const RoomReview3D = lazy(() => import('./RoomReview3D'));

export function View3D(props: { compact?: boolean } | { rows: RoomMeasure[]; split: boolean }) {
  const t = useT();
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center bg-[#ebe8e3] text-sm text-zinc-500">{t.view3d.loading}</div>}>
      {'rows' in props ? <RoomReview3D {...props} /> : <Kitchen3D {...props} />}
    </Suspense>
  );
}
