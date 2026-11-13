import { lazy, Suspense } from 'react';

// three.js is only downloaded when the 3D view is first opened.
const Kitchen3D = lazy(() => import('./Kitchen3D'));

export function View3D({ compact = false }: { compact?: boolean }) {
  return (
    <Suspense
      fallback={<div className="flex h-full items-center justify-center bg-[#ebe8e3] text-sm text-zinc-500">Loading the 3D view…</div>}
    >
      <Kitchen3D compact={compact} />
    </Suspense>
  );
}
