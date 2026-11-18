import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build, type Plugin } from 'vite';

/** Ship a real browser bundle inside the downloaded HTML, including in dev; file:// cannot load module chunks. */
export function offlineViewerPlugin(): Plugin {
  const id = 'virtual:kitchen-offline-viewer';
  let root: string;
  return {
    name: 'kitchen-offline-viewer',
    configResolved(config) { root = config.root; },
    resolveId(source) { if (source === id) return `\0${id}`; },
    async load(source) {
      if (source !== `\0${id}`) return;
      const entry = resolve(root, 'src/export/customerViewer.ts');
      this.addWatchFile(entry);
      const result = await build({
        configFile: false, root, publicDir: false, logLevel: 'error',
        build: { write: false, minify: true, lib: { entry, name: 'KitchenViewer', formats: ['iife'] } },
      });
      for (const output of Array.isArray(result) ? result : [result]) {
        if (!('output' in output)) continue;
        const chunk = output.output.find((file) => file.type === 'chunk' && file.isEntry);
        if (chunk?.type === 'chunk' && !chunk.imports.length && !chunk.dynamicImports.length) {
          const license = await readFile(resolve(root, 'node_modules/three/LICENSE'), 'utf8');
          return `export default ${JSON.stringify(`/* Three.js\n${license}\n*/\n${chunk.code}`)}`;
        }
      }
      throw new Error('The offline kitchen viewer must compile to a single standalone script.');
    },
  };
}
