import { lazy, Suspense } from 'react';
import { useT } from '../../i18n';

// three.js is only downloaded when the 3D view is first opened.
const Kitchen3D = lazy(() => import('./Kitchen3D'));

export function View3D({ compact = false }: { compact?: boolean }) {
  const t = useT();
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center bg-[#ebe8e3] text-sm text-zinc-500">{t.view3d.loading}</div>}>
      <Kitchen3D compact={compact} />
    </Suspense>
  );
}
