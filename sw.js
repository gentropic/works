// Service worker for the Auditable Works PWA. The base (./ = the lean works-core
// shell) is one self-contained page, so precaching it = the shell offline.
// Provisioned packages live in the IndexedDB workspace VFS; the same-origin
// catalog + .gcupkgs (./packages/*) and the /full monolith are runtime-cached on
// visit, so a provisioned setup re-provisions offline. Cache-first.
const CACHE = 'works-shell-v2';   // bumped: base is now lean works-core (was the monolith)
const SHELL = ['./', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match('./'))));
});
