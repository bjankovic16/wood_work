import { useEffect, useState } from 'react';
import { embedded, hostDownloads } from '../lib/platform';

/** Whether files can be saved: always in a normal tab, only through the hosting page when embedded. */
export function useCanSaveFiles(): boolean {
  const [available, setAvailable] = useState(!embedded);
  useEffect(() => {
    if (!embedded) return;
    let active = true;
    hostDownloads().then((downloads) => {
      if (active) setAvailable(downloads !== null);
    });
    return () => {
      active = false;
    };
  }, []);
  return available;
}
