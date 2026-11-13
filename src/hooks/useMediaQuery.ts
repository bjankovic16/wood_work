import { useCallback, useSyncExternalStore } from 'react';

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}

/** Phones and portrait tablets get the full-screen plan with slide-up panels. */
export const COMPACT_QUERY = '(max-width: 1023px)';

export function useIsCompact(): boolean {
  return useMediaQuery(COMPACT_QUERY);
}

/** Touch screens: bigger handles and a larger dead zone before a press becomes a drag. */
export function useCoarsePointer(): boolean {
  return useMediaQuery('(pointer: coarse)');
}

export function isCoarsePointer(): boolean {
  return window.matchMedia('(pointer: coarse)').matches;
}
