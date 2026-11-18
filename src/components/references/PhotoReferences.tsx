import { ExternalLink, ImagePlus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { PAIRED_PHOTOS, PHOTO_REFERENCES, REFERENCE_ONLY_PHOTOS, validReferenceSource, type CatalogPhoto } from '../../domain/photoReferences';
import { COLLECTION_INSPIRATION, KITCHEN_COLLECTIONS } from '../../domain/premiumKitchens';
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

const photoAsset = (filename: string) => `${import.meta.env.BASE_URL}references/${filename}`;

function ReferenceImage({ src, alt, className, lazy }: { src: string; alt: string; className?: string; lazy?: boolean }) {
  const t = useT();
  const [failed, setFailed] = useState(false);
  return failed
    ? <p role="alert" className="p-4 text-xs text-red-700">{t.references.imageUnavailable}</p>
    : <img src={src} alt={alt} loading={lazy ? 'lazy' : undefined} decoding="async" onError={() => setFailed(true)} className={className} />;
}

function SourceLink({ href, children }: { href: string; children: string }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 underline underline-offset-4">
    {children}<ExternalLink aria-hidden className="size-3 shrink-0" />
  </a>;
}

function PhotoCredit({ photo }: { photo: CatalogPhoto }) {
  const t = useT();
  return <div className="space-y-1 text-xs text-zinc-600">
    <p>{t.references.by(photo.photographer, photo.provider)}</p>
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      <SourceLink href={photo.source}>{t.references.source}</SourceLink>
      <SourceLink href={photo.licenseUrl}>{photo.license}</SourceLink>
    </div>
  </div>;
}

export function PhotoReferencePanel() {
  const t = useT();
  const reference = useDesignStore((state) => state.design.referencePhoto);
  const projectId = useProjectsStore((state) => state.activeId);
  const [fullOpen, setFullOpen] = useState(false);
  const builtin = reference?.kind === 'builtin' ? PHOTO_REFERENCES.find((photo) => photo.id === reference.id) : undefined;
  const src = reference?.kind === 'upload' ? reference.dataUrl : builtin ? photoAsset(builtin.image) : undefined;
  const title = reference?.kind === 'upload' ? reference.name : builtin ? t.references.names[builtin.id] : t.references.original;
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
        {builtin && <PhotoCredit photo={builtin} />}
        {reference?.kind === 'upload' && reference.sourceUrl && <SourceLink href={reference.sourceUrl}>{t.references.source}</SourceLink>}
        {reference && <p className="text-xs leading-relaxed text-zinc-600">{builtin && 'modelPreview' in builtin ? t.references.estimated : t.references.referenceOnly}</p>}
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

function PhotoCard({ photo, onOpen }: { photo: CatalogPhoto; onOpen: () => void }) {
  const t = useT();
  const paired = 'modelPreview' in photo;
  return (
    <article className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <h4 className="p-3 text-sm font-semibold text-zinc-900">{t.references.names[photo.id]}</h4>
      <div className={paired ? 'grid grid-cols-2 gap-1 bg-zinc-50' : 'bg-zinc-50'}>
        <figure>
          <ReferenceImage lazy src={photoAsset(photo.image)} alt={t.references.names[photo.id]} className="aspect-3/2 w-full object-contain" />
          <figcaption className="p-2 text-xs font-medium text-zinc-700">{paired ? t.references.original : t.references.referenceOnly}</figcaption>
        </figure>
        {paired && <figure>
          <ReferenceImage lazy src={photoAsset(photo.modelPreview)} alt={t.references.model} className="aspect-3/2 w-full object-contain" />
          <figcaption className="p-2 text-xs font-medium text-zinc-700">{t.references.model}</figcaption>
        </figure>}
      </div>
      <div className="space-y-3 p-3">
        <PhotoCredit photo={photo} />
        <Button data-photo-design={paired ? photo.id : undefined} data-photo-reference={paired ? undefined : photo.id}
          variant={paired ? 'primary' : 'outline'} className="h-11 w-full" onClick={onOpen}>{paired ? t.references.open : t.references.compare}</Button>
      </div>
    </article>
  );
}

export function PhotoReferenceGallery({ onClose }: { onClose: () => void }) {
  const t = useT();
  const reference = useDesignStore((state) => state.design.referencePhoto);
  const showComparison = () => {
    onClose();
    const ui = useUiStore.getState();
    ui.setReferenceOpen(true);
    ui.setView('3d');
  };
  return (
    <div className="space-y-5 p-4">
      <p className="text-[13px] leading-relaxed text-zinc-700">{t.references.intro}</p>
      <Button variant="outline" className="min-h-11" onClick={showComparison}>
        <ImagePlus className="size-4" />{reference ? t.references.currentComparison : t.references.ownPhoto}
      </Button>
      <section aria-labelledby="studio-paired" className="space-y-2">
        <h3 id="studio-paired" className="text-sm font-semibold">{t.references.paired}</h3>
        <p className="text-xs leading-relaxed text-zinc-600">{t.references.replaces} {t.references.estimated}</p>
        <div className="grid gap-3 md:grid-cols-2">
          {PAIRED_PHOTOS.map((photo) => <PhotoCard key={photo.id} photo={photo} onOpen={() => { openPhotoDesign(photo.id); onClose(); }} />)}
        </div>
      </section>
      <section aria-labelledby="studio-reference-only" className="space-y-2">
        <h3 id="studio-reference-only" className="text-sm font-semibold">{t.references.onlyPhotos}</h3>
        <p className="text-xs leading-relaxed text-zinc-600">{t.references.compareHint}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {REFERENCE_ONLY_PHOTOS.map((photo) => <PhotoCard key={photo.id} photo={photo} onOpen={() => {
            setReferencePhoto({ kind: 'builtin', id: photo.id });
            showComparison();
          }} />)}
        </div>
      </section>
      <section aria-labelledby="studio-collections" className="space-y-2 rounded-xl border border-zinc-200 p-3">
        <h3 id="studio-collections" className="text-sm font-semibold">{t.references.collections}</h3>
        <p className="text-xs leading-relaxed text-zinc-600">{t.references.collectionsHint}</p>
        <ul className="flex flex-wrap gap-x-4 gap-y-2">
          {KITCHEN_COLLECTIONS.map((id) => <li key={id}><SourceLink href={COLLECTION_INSPIRATION[id]}>{t.references.collectionNames[id]}</SourceLink></li>)}
        </ul>
      </section>
    </div>
  );
}
