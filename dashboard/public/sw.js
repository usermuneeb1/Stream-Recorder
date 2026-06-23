/**
 * 🚀 Muslim Lantern Archive — Service Worker v6 (cache-purge edition)
 *
 * KEY CHANGES from v5:
 *   • Version bumped to mla-v6 — old caches from v4/v5 are wiped on activate
 *   • The HTML shell is now network-only (no fallback to cached HTML), so
 *     a user with a stale cached index.html can never get pinned to an old
 *     deploy's asset hashes
 *   • Self-uninstall on aggressive-purge mode: if window posts {clear:true},
 *     wipe everything and unregister
 */

const BUILD_ID = '__BUILD_ID__'; // replaced at build time
const VERSION = `mla-v6-${BUILD_ID === '__BUILD_ID__' ? Date.now() : BUILD_ID}`;
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;

self.addEventListener('install', (e) => {
  // No pre-cache of shell. Always go network-first below.
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // Delete EVERY old cache (not just non-matching this version). Belt-and-
    // braces: clears the v4/v5 caches that pinned users to old asset hashes.
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  // Window can post { clear: true } to nuke all caches and unregister.
  if (e.data && e.data.clear) {
    e.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
      await self.registration.unregister();
    })());
  }
});

function isVideo(req) {
  const url = new URL(req.url);
  if (req.headers.get('range')) return true;
  return /\.(mp4|m4a|m4s|webm|mkv|mov|ts|m3u8)(\?|$)/i.test(url.pathname);
}

function isImmutableAsset(url) {
  return /\/assets\/.+-[A-Za-z0-9_]{6,}\.(js|css|woff2?|ttf)/.test(url.pathname);
}

function isFont(url) {
  return url.hostname.endsWith('gstatic.com') || url.hostname.endsWith('googleapis.com');
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 1. NEVER intercept video bytes
  if (isVideo(req)) return;

  // 2. HTML — NETWORK-ONLY (don't fall back to cached HTML; we'd rather show
  //    a network-error than serve a stale shell pointing at deleted asset
  //    hashes). The browser's own cache + Vercel's no-cache headers handle
  //    offline gracefully.
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    e.respondWith(fetch(req));
    return;
  }

  // 3. Immutable build assets — stale-while-revalidate. These are content-
  //    hashed so any new asset = new filename = no collision.
  if (isImmutableAsset(url) || isFont(url)) {
    e.respondWith(
      caches.open(ASSET_CACHE).then(async cache => {
        const cached = await cache.match(req);
        const fresh = fetch(req).then(r => {
          if (r.ok) cache.put(req, r.clone());
          return r;
        }).catch(() => cached);
        return cached || fresh;
      }),
    );
    return;
  }
});
