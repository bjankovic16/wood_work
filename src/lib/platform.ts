import type { StateStorage } from 'zustand/middleware';

/**
 * True when the app runs inside another page's frame (for example a hosted
 * preview). Such frames usually block file downloads, printing and confirm().
 */
export const embedded: boolean = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

interface HostDownloads {
  save(request: { filename: string; data: string | Blob }): Promise<unknown>;
}

type HostWindow = Window & { claude?: { use?: (name: string) => Promise<unknown> } };

let hostDownloadsPromise: Promise<HostDownloads | null> | null = null;

/** The hosting page's file-saving service, if the app is embedded in a page that offers one. */
export function hostDownloads(): Promise<HostDownloads | null> {
  if (!embedded) return Promise.resolve(null);
  hostDownloadsPromise ??= (async () => {
    const use = (window as HostWindow).claude?.use;
    if (typeof use !== 'function') return null;
    try {
      return ((await use('downloads')) as HostDownloads | null) ?? null;
    } catch {
      return null;
    }
  })();
  return hostDownloadsPromise;
}

export type SaveOutcome = 'saved' | 'declined' | 'unavailable';

/** Saves a generated text file: a normal download, or through the host page when embedded. */
export async function saveTextFile(filename: string, text: string, mimeType: string): Promise<SaveOutcome> {
  if (!embedded) {
    // The byte-order mark makes spreadsheet programs read the file as UTF-8.
    const blob = new Blob(['﻿', text], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    return 'saved';
  }
  const downloads = await hostDownloads();
  if (!downloads) return 'unavailable';
  try {
    await downloads.save({ filename, data: '﻿' + text });
    return 'saved';
  } catch (error) {
    return (error as { code?: string } | null)?.code === 'declined' ? 'declined' : 'unavailable';
  }
}

/** localStorage that never throws: where storage is blocked the app simply does not remember. */
export const safeStorage: StateStorage = {
  getItem: (name) => {
    try {
      return window.localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      window.localStorage.setItem(name, value);
    } catch {
      // Storage full or blocked: keep working without saving.
    }
  },
  removeItem: (name) => {
    try {
      window.localStorage.removeItem(name);
    } catch {
      // Nothing to do.
    }
  },
};
