import { embedded, saveFile, type SaveOutcome } from './platform';

export type BackupOutcome = SaveOutcome | 'download-started';
type Picker = (options: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) =>
  Promise<{ createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }> }>;

/** A download link cannot tell us whether the user kept the file. Only a closed writer or a confirmed host save can. */
export async function saveBackupFile(filename: string, data: Blob): Promise<BackupOutcome> {
  try {
    const picker = (window as Window & { showSaveFilePicker?: Picker }).showSaveFilePicker;
    if (!embedded && typeof picker === 'function') {
      const handle = await picker.call(window, { suggestedName: filename, types: [{ description: 'Kitchen JSON', accept: { 'application/json': ['.json'] } }] });
      const stream = await handle.createWritable();
      await stream.write(data);
      await stream.close();
      return 'saved';
    }
    const outcome = await saveFile(filename, data, 'application/json');
    return !embedded && outcome === 'saved' ? 'download-started' : outcome;
  } catch (error) {
    return (error as { name?: string } | null)?.name === 'AbortError' ? 'declined' : 'unavailable';
  }
}
