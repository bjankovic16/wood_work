import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';

/** Cache the complete static build, including lazy 3D/export chunks and gallery images. */
export function offlineAppPlugin(): Plugin {
  return {
    name: 'wood-work-offline', apply: 'build',
    async writeBundle({ dir }) {
      if (!dir) return;
      const entries = await readdir(dir, { recursive: true, withFileTypes: true });
      const files = entries.filter((f) => f.isFile() && f.name !== 'sw.js')
        .map((f) => relative(dir, resolve(f.parentPath, f.name)).split(sep).join('/')).sort();
      const worker = await readFile(new URL('./offline-app-worker.js', import.meta.url), 'utf8');
      const hash = createHash('sha256').update(worker);
      for (const file of files) hash.update(file).update(await readFile(resolve(dir, file)));
      await writeFile(resolve(dir, 'sw.js'), `const VERSION=${JSON.stringify(hash.digest('hex').slice(0, 20))};\nconst FILES=${JSON.stringify(files)};\n${worker}`);
    },
  };
}
