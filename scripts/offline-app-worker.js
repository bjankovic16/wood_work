// VERSION and FILES are generated from the contents of the release.
const prefix = `wood-work:${self.registration.scope}:`;
const current = prefix + VERSION;
const url = (file) => new URL(file, self.registration.scope).href;
const assets = new Set(FILES.map(url));
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(current).then((cache) => cache.addAll([...assets].map((path) => new Request(path, { cache: 'reload' })))));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith(prefix) && k !== current).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const path = new URL(req.url);
  path.search = '';
  if (req.mode === 'navigate' && (path.href === url('./') || path.href === url('index.html'))) {
    event.respondWith(fetch(req).catch(() => caches.open(current).then((cache) => cache.match(url('index.html')))));
  } else if (assets.has(path.href)) {
    event.respondWith(caches.open(current).then(async (cache) => (await cache.match(path.href)) ?? fetch(req)));
  }
});
