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

/** Saves a generated file: a normal download, or through the host page when embedded. */
export async function saveFile(filename: string, data: Blob, mimeType: string): Promise<SaveOutcome> {
  if (!embedded) {
    const url = URL.createObjectURL(data.type ? data : new Blob([data], { type: mimeType }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Give the browser a moment to start the download before letting go of the data.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return 'saved';
  }
  const downloads = await hostDownloads();
  if (!downloads) return 'unavailable';
  try {
    await downloads.save({ filename, data });
    return 'saved';
  } catch (error) {
    return (error as { code?: string } | null)?.code === 'declined' ? 'declined' : 'unavailable';
  }
}

/** Saves generated text. The byte-order mark makes spreadsheet programs read it as UTF-8. */
export function saveTextFile(filename: string, text: string, mimeType: string, byteOrderMark = true): Promise<SaveOutcome> {
  return saveFile(filename, new Blob([byteOrderMark ? '﻿' : '', text], { type: mimeType }), mimeType);
}

/** A file name without characters that file systems refuse. */
export function safeFileName(name: string, fallback = 'kitchen'): string {
  return name.replace(/[\\/:*?"<>|]+/g, '').trim() || fallback;
}

/** localStorage that never throws: where storage is blocked the app simply does not remember. */
export const safeStorage: StateStorage = {
  getItem: (name) => {
    try {
      return globalThis.localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      globalThis.localStorage.setItem(name, value);
    } catch {
      // Storage full or blocked: keep working without saving.
    }
  },
  removeItem: (name) => {
    try {
      globalThis.localStorage.removeItem(name);
    } catch {
      // Nothing to do.
    }
  },
};
