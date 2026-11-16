import { ExternalLink, ImagePlus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { PHOTO_LICENSE_URL, PHOTO_REFERENCES, validReferenceSource } from '../../domain/photoReferences';
import { useT } from '../../i18n';
import { readReferencePhoto, ReferencePhotoError } from '../../lib/referencePhoto';
import { openPhotoDesign, setReferencePhoto } from '../../store/actions';
import { useDesignStore } from '../../store/designStore';
import { useProjectsStore } from '../../store/projects';
import { useUiStore } from '../../store/uiStore';
import { Button, Dialog } from '../ui';

function ReferenceUpload() {
  const t = useT();
  const current = useDesignStore((state) => state.design.referencePhoto);
  const [sourceUrl, setSourceUrl] = useState(current?.kind === 'upload' ? current.sourceUrl ?? '' : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-zinc-600">{t.references.uploadHint}</p>
      <label className="block space-y-1 text-xs text-zinc-700">
        <span>{t.references.sourceLabel}</span>
        <input
          type="url"
          value={sourceUrl}
          disabled={busy}
          placeholder="https://"
          onChange={(event) => { setSourceUrl(event.target.value); setError(''); }}
          onBlur={() => {
            const source = sourceUrl.trim();
            if (source && !validReferenceSource(source)) { setError(t.references.sourceInvalid); return; }
            if (current?.kind === 'upload') setReferencePhoto({ ...current, sourceUrl: source || undefined });
          }}
          className="h-10 w-full rounded-md border border-zinc-300 px-2 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-zinc-50 disabled:text-zinc-500 lg:text-sm"
        />
      </label>
      <label className="block space-y-1 text-xs font-medium text-zinc-700">
        <span>{t.references.upload}</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={(event) => {
            const input = event.currentTarget;
            const file = input.files?.[0];
            if (!file) return;
            const source = sourceUrl.trim();
            if (source && !validReferenceSource(source)) { setError(t.references.sourceInvalid); input.value = ''; return; }
            const projectId = useProjectsStore.getState().activeId;
            const isCurrentUpload = () => mounted.current && useProjectsStore.getState().activeId === projectId
              && useDesignStore.getState().design.referencePhoto === current;
            setBusy(true);
            setError('');
            void readReferencePhoto(file).then((photo) => {
              if (!isCurrentUpload()) return;
              setReferencePhoto({ ...photo, ...(source ? { sourceUrl: source } : {}) });
            }, (failure: unknown) => {
              if (!isCurrentUpload()) return;
              console.error('Reference photo could not be prepared', failure);
              setError(failure instanceof ReferencePhotoError ? t.references[failure.code] : t.references.errorDecode);
            }).finally(() => {
              if (!mounted.current) return;
              setBusy(false);
              input.value = '';
            });
          }}
          className="block w-full text-xs font-normal text-zinc-600 file:mr-2 file:min-h-9 file:rounded-md file:border file:border-zinc-300 file:bg-white file:px-2 file:text-xs file:text-zinc-800"
        />
      </label>
      {busy && <p role="status" className="text-xs text-zinc-600">{t.references.busy}</p>}
      {error && <p role="alert" className="text-xs leading-relaxed text-red-700">{error}</p>}
    </div>
  );
}

function ReferenceImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const t = useT();
  const [failed, setFailed] = useState(false);
  return failed
    ? <p role="alert" className="p-4 text-xs text-red-700">{t.references.imageUnavailable}</p>
    : <img src={src} alt={alt} onError={() => setFailed(true)} className={className} />;
}

export function PhotoReferencePanel() {
  const t = useT();
  const reference = useDesignStore((state) => state.design.referencePhoto);
  const projectId = useProjectsStore((state) => state.activeId);
  const [fullOpen, setFullOpen] = useState(false);
  const builtin = reference?.kind === 'builtin' ? PHOTO_REFERENCES.find((photo) => photo.id === reference.id) : undefined;
  const src = reference?.kind === 'upload' ? reference.dataUrl : builtin ? `${import.meta.env.BASE_URL}references/${builtin.image}` : undefined;
  const title = reference?.kind === 'upload' ? reference.name : builtin ? t.references.names[builtin.id] : t.references.original;
  const source = reference?.kind === 'upload' ? reference.sourceUrl : builtin?.source;
  return (
    <aside aria-label={t.references.original} className="max-h-[36%] shrink-0 overflow-y-auto border-b border-zinc-200 bg-white touch-pan-y lg:max-h-none lg:w-[40%] lg:max-w-[560px] lg:border-b-0 lg:border-r">
      <div className="flex items-center justify-between gap-2 px-4 py-2">
        <h2 className="text-sm font-semibold text-zinc-900">{t.references.original}</h2>
        <Button aria-label={t.references.close} onClick={() => useUiStore.getState().setReferenceOpen(false)}><X className="size-4" /></Button>
      </div>
      {src ? (
        <button type="button" className="block w-full bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" aria-label={t.references.viewFull} onClick={() => setFullOpen(true)}>
          <ReferenceImage key={src} src={src} alt={title} className="h-36 w-full object-contain lg:h-auto lg:max-h-[55dvh]" />
        </button>
      ) : <p className="px-4 pb-2 text-[13px] text-zinc-600">{t.references.noPhoto}</p>}
      <div className="space-y-3 p-4">
        {builtin && <p className="text-xs text-zinc-600">{t.references.by(builtin.photographer)}</p>}
        {source && <a href={source} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 underline underline-offset-4">{t.references.source}<ExternalLink className="size-3" /></a>}
        {builtin && <a href={PHOTO_LICENSE_URL} target="_blank" rel="noopener noreferrer" className="ml-3 text-xs text-blue-700 underline underline-offset-4">{t.references.license}</a>}
        <p className="text-xs leading-relaxed text-zinc-600">{t.references.estimated}</p>
        <details open={!reference || undefined}>
          <summary className="cursor-pointer rounded py-1 text-xs font-medium text-zinc-700">{t.references.ownPhoto}</summary>
          <div className="pt-2"><ReferenceUpload key={`${projectId}:${reference?.kind}:${reference?.kind === 'upload' ? reference.name : reference?.id ?? 'new'}`} /></div>
        </details>
        {reference && <Button variant="outline" className="text-xs" onClick={() => setReferencePhoto(undefined)}>{t.references.remove}</Button>}
      </div>
      <Dialog open={fullOpen && Boolean(src)} title={title} wide onClose={() => setFullOpen(false)}>
        {src && <ReferenceImage key={src} src={src} alt={title} className="max-h-[75dvh] w-full object-contain" />}
      </Dialog>
    </aside>
  );
}

export function PhotoReferenceGallery({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <div className="space-y-4 p-4">
      <p className="text-[13px] leading-relaxed text-zinc-700">{t.references.intro}</p>
      <p className="rounded-lg bg-zinc-50 p-3 text-xs leading-relaxed text-zinc-600">{t.references.replaces}</p>
      {PHOTO_REFERENCES.map((photo) => (
        <article key={photo.id} className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div className="px-3 py-3"><h3 className="text-sm font-semibold text-zinc-900">{t.references.names[photo.id]}</h3></div>
          <div className="grid grid-cols-2 gap-1 bg-zinc-50">
            <figure>
              <ReferenceImage src={`${import.meta.env.BASE_URL}references/${photo.image}`} alt={t.references.names[photo.id]} className="aspect-3/2 w-full object-contain" />
              <figcaption className="p-2 text-xs font-medium text-zinc-700">{t.references.original}</figcaption>
            </figure>
            <figure>
              <ReferenceImage src={`${import.meta.env.BASE_URL}references/${photo.id}-model.jpg`} alt={t.references.model} className="aspect-3/2 w-full object-contain" />
              <figcaption className="p-2 text-xs font-medium text-zinc-700">{t.references.model}</figcaption>
            </figure>
          </div>
          <div className="space-y-2 p-3">
            <p className="text-xs text-zinc-600">{t.references.by(photo.photographer)} · <a href={photo.source} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline underline-offset-4">{t.references.source}</a></p>
            <p className="text-xs leading-relaxed text-zinc-600">{t.references.estimated}</p>
            <Button data-photo-design={photo.id} variant="primary" className="h-10 w-full" onClick={() => { openPhotoDesign(photo.id); onClose(); }}>{t.references.open}</Button>
          </div>
        </article>
      ))}
      <Button variant="outline" className="h-10 w-full" onClick={() => { onClose(); useUiStore.getState().setReferenceOpen(true); useUiStore.getState().setView('3d'); }}>
        <ImagePlus className="size-4" />{t.references.ownPhoto}
      </Button>
    </div>
  );
}
