import { LoaderCircle, Share2 } from 'lucide-react';
import { lazy, Suspense, useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { Design } from '../../domain/types';
import { useCanSaveFiles } from '../../hooks/useCanSaveFiles';
import { useT, type Messages } from '../../i18n';
import { embedded, saveFile } from '../../lib/platform';
import { useDesignStore } from '../../store/designStore';
import { showFeedback } from '../../store/feedback';
import { useProjectsStore } from '../../store/projects';
import { Button, Dialog } from '../ui';

const CustomerExport = lazy(() => import('./CustomerExport'));
interface Job { design: Design; studio: boolean; t: Messages; share: boolean; project: string }
type Prepared = { file: File; failed: boolean };

function shareableFile(filename: string, blob: Blob): File | null {
  try {
    if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return null;
    const file = new File([blob], filename, { type: 'text/html' });
    return navigator.canShare({ files: [file] }) ? file : null;
  } catch { return null; }
}

/** Both buttons export the same read-only HTML. The large GLB may finish after the tap's share permission expires. */
export function useCustomerFile(studio: boolean, sceneReady: boolean, compact: boolean) {
  const t = useT();
  const canSave = useCanSaveFiles();
  const project = useProjectsStore((s) => s.activeId);
  const gesture = useDesignStore((s) => !!s.gestureBase);
  const active = useRef<Job | null>(null);
  const [building, setBuilding] = useState<Job | null>(null);
  const [sending, setSending] = useState(false);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  useLayoutEffect(() => {
    setBuilding(null); setSending(false); setPrepared(null);
    return () => { active.current = null; };
  }, [project]);
  const current = (job: Job) => job === active.current && job.project === useProjectsStore.getState().activeId;
  const finish = useCallback((job: Job, message: (t: Messages) => string) => {
    if (!current(job)) return;
    active.current = null;
    setBuilding(null); setSending(false); setPrepared(null);
    showFeedback(message);
  }, []);
  const download = useCallback(async (job: Job, filename: string, blob: Blob) => {
    setPrepared(null); setSending(true);
    try {
      const outcome = await saveFile(filename, blob, 'text/html');
      finish(job, (t) => outcome === 'saved'
        ? embedded ? t.files.saved(filename) : t.feedback.downloading(filename)
        : t.files[outcome]);
    } catch { finish(job, (t) => t.files.unavailable); }
  }, [finish]);
  const share = useCallback(async (job: Job, file: File) => {
    setPrepared(null); setSending(true);
    try {
      await navigator.share({ files: [file], title: job.design.name });
      finish(job, (t) => t.feedback.shared(file.name));
    } catch (error) {
      if (!current(job)) return;
      if ((error as { name?: string } | null)?.name === 'AbortError') finish(job, (t) => t.feedback.shareCancelled);
      else { setSending(false); setPrepared({ file, failed: true }); }
    }
  }, [finish]);
  const ready = useCallback((filename: string, blob: Blob) => {
    const job = active.current;
    if (!job || !current(job)) return;
    setBuilding(null);
    const file = job.share && shareableFile(filename, blob);
    if (!file) void download(job, filename, blob);
    else if (navigator.userActivation?.isActive === false) setPrepared({ file, failed: false });
    else void share(job, file);
  }, [download, share]);
  const failed = useCallback(() => { if (active.current) finish(active.current, (t) => t.customerView.failed); }, [finish]);
  const start = (share: boolean) => {
    const store = useDesignStore.getState();
    if (!sceneReady || active.current || store.gestureBase) return;
    const job = { design: store.design, studio, t, share, project };
    active.current = job;
    setBuilding(job);
  };
  const busy = Boolean(building || sending || prepared);
  return {
    model: building && <Suspense fallback={null}><CustomerExport {...building} ready={ready} failed={failed} /></Suspense>,
    desktop: <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" disabled={!canSave || !sceneReady || busy || gesture} title={!canSave ? t.files.unavailable : undefined} data-testid="customer-export"
        onClick={() => start(false)}>{t.customerView.export}</Button>
      {building && <span role="status" className="text-xs text-studio-muted">{t.customerView.busy}</span>}
    </div>,
    share: <Button variant="primary" data-testid="customer-share" className="h-11 whitespace-nowrap px-3" aria-busy={busy}
      disabled={!sceneReady || busy || gesture || !canSave && typeof navigator.share !== 'function'} onClick={() => start(true)}>
      {busy ? <LoaderCircle size={16} aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <Share2 size={16} aria-hidden="true" />}{t.feedback.share}
      {building && <span role="status" className="sr-only">{t.customerView.busy}</span>}
    </Button>,
    dialog: prepared && active.current && <Dialog open sheet={compact} title={t.feedback.share}
      onClose={() => { if (active.current) finish(active.current, (t) => t.feedback.shareCancelled); }}>
      <div className="space-y-3 p-4 pb-[max(env(safe-area-inset-bottom),16px)]">
        <p role="status" className="text-sm">{prepared.failed ? t.feedback.shareFailed : t.feedback.shareReady}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" className="min-h-11" onClick={() => { if (active.current) void share(active.current, prepared.file); }}>{t.feedback.shareFile}</Button>
          {canSave && <Button variant="outline" className="min-h-11" onClick={() => { if (active.current) void download(active.current, prepared.file.name, prepared.file); }}>{t.feedback.downloadHtml}</Button>}
        </div>
      </div>
    </Dialog>,
  };
}
