// Auditable Works service worker — SWR shell (the GCU-standard pattern, adapted
// from @gcu/ep → weir) + Works-specific hybrid routing for the package catalog.
//
// Routing:
//   ./ (the lean works-core shell) + everything else  → STALE-WHILE-REVALIDATE:
//       serve cached instantly (instant + offline), re-fetch in the background, and
//       if the bytes changed, postMessage 'works:update-available' → the page shows
//       a reload toast. A new deploy reaches installed users WITHOUT bumping this
//       file (byte-diff detects it).
//   ./packages/*  (registry.json + dist/*.gcupkg)      → NETWORK-FIRST:
//       the catalog must stay current (new packages), and a cached .gcupkg with
//       stale bytes would FAIL the catalog's fresh SRI check on install. Always
//       fetch latest online; fall back to cache offline (so re-provision still works
//       offline). When .gcupkg URLs become version-stamped (immutable), they can move
//       to cache-first — until then, network-first is the safe choice.
//
// Persistent storage: being a controlled PWA + the page's navigator.storage.persist()
// keep the IndexedDB workspace (provisioned /lib + projects) from being evicted —
// the whole point of a desktop that holds your work.

const CACHE = 'works-shell-v3';   // SWR + network-first packages (was naive cache-first)
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg'];

let _autoCheck = true;   // toggled by the page (Settings → Updates); gates background refresh

// Only cache full, basic 200s — never a 206 range (corrupts the cache), an opaque
// cross-origin, or an error.
const cacheable = (resp) => resp && resp.status === 200 && resp.type !== 'opaqueredirect';

self.addEventListener('install', (event) => {
  event.waitUntil(
    // `cache: 'reload'` → a newly-installing SW caches FRESH bytes, never an
    // HTTP-cached stale shell (which would trap the PWA on the old build despite a
    // successful deploy).
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .catch(() => { /* offline at install — best effort */ })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // leave cross-origin alone
  event.respondWith(
    url.pathname.includes('/packages/') ? networkFirst(req) : staleWhileRevalidate(req)
  );
});

// Network-first — the catalog + .gcupkgs. Latest when online; cached when offline.
async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(req);
    if (cacheable(fresh)) cache.put(req, fresh.clone()).catch(() => {});
    return fresh;
  } catch (e) {
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    throw e;
  }
}

// Stale-while-revalidate — the shell + everything else.
async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req, { ignoreSearch: true });
  if (cached) {
    if (_autoCheck) revalidate(req, cache, cached);   // background refresh + update toast
    return cached;
  }
  try {
    const resp = await fetch(req);
    if (cacheable(resp)) cache.put(req, resp.clone()).catch(() => {});
    return resp;
  } catch (e) {
    const navFallback = await cache.match('./index.html') || await cache.match('./');
    if (navFallback) return navFallback;
    throw e;
  }
}

// Re-fetch, byte-compare against the cached copy, replace it, and notify the page
// if it changed. Failures are swallowed — a background refresh must never break the
// session.
async function revalidate(req, cache, cached) {
  try {
    const fresh = await fetch(req, { cache: 'no-store' });
    if (!cacheable(fresh)) return;
    const a = await cached.clone().arrayBuffer();
    const b = await fresh.clone().arrayBuffer();
    await cache.put(req, fresh.clone());
    if (!bytesEqual(a, b)) {
      const clients = await self.clients.matchAll({ includeUncontrolled: true });
      for (const client of clients) client.postMessage({ type: 'works:update-available' });
    }
  } catch { /* offline / failed refresh — ignore */ }
}

function bytesEqual(a, b) {
  if (a.byteLength !== b.byteLength) return false;
  const va = new Uint8Array(a), vb = new Uint8Array(b);
  for (let i = 0; i < va.length; i++) if (va[i] !== vb[i]) return false;
  return true;
}

// Message protocol with the page (Settings → Updates): toggle background checks,
// or run one now and reply on the transferred port.
self.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (msg.type === 'works:set-auto-check') { _autoCheck = !!msg.value; return; }
  if (msg.type === 'works:check-now') {
    const port = event.ports && event.ports[0];
    event.waitUntil((async () => {
      const cache = await caches.open(CACHE);
      const root = new Request(new URL('./', self.location.href).toString());
      const cached = await cache.match(root, { ignoreSearch: true });
      if (cached) await revalidate(root, cache, cached);
      else { try { const r = await fetch(root); if (cacheable(r)) await cache.put(root, r.clone()); } catch { /* offline */ } }
      if (port) port.postMessage({ type: 'works:check-complete', at: Date.now() });
    })());
  }
});
