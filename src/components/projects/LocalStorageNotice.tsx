import { HardDrive } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import { embedded, storageWorks } from '../../lib/platform';
import { useProjectsStore } from '../../store/projects';
import { Button } from '../ui';

type Retention = 'checking' | 'available' | 'requesting' | 'granted' | 'denied' | 'unsupported';

/** Reading the permission is silent. Only the explicit button may request it. */
export function LocalStorageNotice({ canSave }: { canSave: boolean }) {
  const t = useT();
  const writeFailed = useProjectsStore((s) => s.writeFailed);
  const local = storageWorks && !writeFailed;
  const [retention, setRetention] = useState<Retention>('checking');
  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const storage = navigator.storage;
        if (!local || embedded || !window.isSecureContext || typeof storage?.persist !== 'function') return 'unsupported';
        return await storage.persisted?.() ? 'granted' : 'available';
      } catch { return 'unsupported'; }
    };
    void check().then((result) => { if (active) setRetention(result); });
    return () => { active = false; };
  }, [local]);
  const request = async () => {
    setRetention('requesting');
    try { setRetention(await navigator.storage.persist() ? 'granted' : 'denied'); }
    catch { setRetention('denied'); }
  };
  return <section aria-label={t.feedback.localTitle} className="space-y-2 border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-950">
    <h3 className="flex items-center gap-2 font-semibold"><HardDrive size={17} aria-hidden="true" />{t.feedback.localTitle}</h3>
    <p>{local ? t.feedback.localWarning : t.feedback.sessionWarning} {canSave ? t.feedback.backupHint : t.files.unavailable}</p>
    {local && (retention === 'available' || retention === 'requesting') && <Button variant="outline" className="min-h-11" disabled={retention === 'requesting'}
      onClick={() => void request()}>{t.feedback.requestRetention}</Button>}
    <p role="status" className="empty:hidden">{retention === 'granted' ? t.feedback.retained : retention === 'denied' ? t.feedback.notRetained : ''}</p>
  </section>;
}
