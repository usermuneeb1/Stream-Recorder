/**
 * 🚀 Muslim Lantern Archive — Service Worker v4
 *
 * Strategy:
 *   1. Network-first for the HTML shell (so updates land instantly).
 *   2. Stale-while-revalidate for fonts and immutable build assets.
 *   3. Cache-first for the static logo / thumbnail images.
 *   4. NEVER intercept video (range requests + Cache API don't play well).
 *
 * Any failure falls straight through to the network — the page works the
 * same with or without this worker installed.
 */

// FIX #21 — version stamp includes a build timestamp so each new deploy
// instantly invalidates the previous shell cache. Without this, a user on
// the old SW could see an old index.html that references hashed asset
// filenames no longer on the server → white screen.
const BUILD_ID = '__BUILD_ID__'; // replaced at build time; falls back to literal in dev
const VERSION = `mla-v5-${BUILD_ID === '__BUILD_ID__' ? Date.now() : BUILD_ID}`;
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;

const SHELL_URLS = ['/', '/index.html', '/logo.png', '/logo-vertical.pn.jpg', '/site.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL_CACHE).then(c => c.addAll(SHELL_URLS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k))
    )),
  );
  self.clients.claim();
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

  // 2. HTML shell — network-first, fall back to cache
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    e.respondWith(
      fetch(req).then(r => {
        const copy = r.clone();
        caches.open(SHELL_CACHE).then(c => c.put('/', copy)).catch(() => {});
        return r;
      }).catch(() => caches.match('/') || caches.match(req)),
    );
    return;
  }

  // 3. Immutable build assets — stale-while-revalidate
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
