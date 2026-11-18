import type { CameraPose } from '../domain/camera';
import type { Messages } from '../i18n';

const escapeText = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the exported model.'));
    reader.readAsDataURL(blob);
  });
}

/** The customer file contains a closed model and a camera pose, never an editor/project snapshot. */
export function customerHtml(name: string, modelBase64: string, poster: string, camera: CameraPose, script: string, t: Messages): Blob {
  if (!/^[\w+/=]+$/.test(modelBase64) || !/^data:image\/jpeg;base64,[\w+/=]+$/.test(poster)) throw new Error('Invalid embedded kitchen preview.');
  const title = escapeText(name);
  const words = t.customerView;
  return new Blob([`<!doctype html>
<html lang="${escapeText(t.locale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src data: blob:; base-uri 'none'; form-action 'none'">
<title>${title}</title><style>
*{box-sizing:border-box}body{margin:0;height:100dvh;background:#ebe8e3;color:#30352e;font:16px/1.4 system-ui,sans-serif;display:flex;flex-direction:column}header,footer{background:#fffefa;padding:.6rem 1rem}header{display:flex;justify-content:space-between;align-items:center;gap:1rem}h1{font-size:1.05rem;margin:0;overflow-wrap:anywhere}button{background:#fff;border:1px solid #9aab98;border-radius:.5rem;padding:.6rem;min-height:44px;color:inherit}main{position:relative;min-height:0;flex:1}img,canvas{width:100%;height:100%;display:block;position:absolute;inset:0}img{object-fit:contain}canvas{touch-action:none}footer{font-size:.875rem}#failure{color:#7d3424}[hidden]{display:none}
</style></head><body><header><h1>${title}</h1><button id="reset" type="button" disabled>${escapeText(words.reset)}</button></header>
<main><img id="poster" src="${poster}" alt="${title}"></main><footer><span id="hint">${escapeText(words.controls)}</span><strong id="failure" role="status" hidden>${escapeText(words.fallback)}</strong><noscript> ${escapeText(words.fallback)}</noscript></footer>
<script type="application/json" id="pose">${JSON.stringify(camera).replace(/</g, '\\u003c')}</script>
<script type="application/octet-stream" id="model">`, modelBase64, '</script><script>', script.replace(/<\/script/gi, '<\\/script'), '</script></body></html>'], { type: 'text/html;charset=utf-8' });
}
