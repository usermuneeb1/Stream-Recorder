/**
 * 🚀 Muslim Lantern Archive — Service Worker
 *
 * Two jobs:
 *  1. APP SHELL CACHE — the website (HTML/JS/CSS/icons) is cached so the page
 *     opens INSTANTLY on the second visit, even on a slow/flaky connection.
 *  2. VIDEO "CACHE-WHAT-YOU-WATCH" — every video chunk (HTTP range request) the
 *     player fetches is saved. When you reload and re-watch a part you already
 *     saw, it is served from the browser instantly with NO network. We only
 *     cache what you actually played, so it never wastes your mobile data on
 *     parts you skipped.
 *
 * Safe by design: if anything fails, we fall straight through to the network,
 * so playback never breaks because of the cache.
 */

const APP_CACHE = 'mla-app-v1';
const VIDEO_CACHE = 'mla-video-v1';

// Hosts whose media we want to cache-as-you-watch. These are the only ones the
// player streams video from.
const VIDEO_HOST_PATTERNS = [
  /\.archive\.org$/i,        // Internet Archive storage nodes (dxture)
  /(^|\.)pixeldrain\.com$/i, // Pixeldrain official
  /pixeldrain\.eu\.cc$/i,    // Pixeldrain GameDrive CDN
];

// Same-origin video proxy paths (our Vercel functions) that serve video bytes.
const VIDEO_PATH_PATTERNS = [/^\/api\/pd\//i, /^\/api\/bh\//i];

self.addEventListener('install', () => {
  // Activate the new SW immediately instead of waiting for old tabs to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Clean up old cache versions.
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== APP_CACHE && k !== VIDEO_CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

function isVideoRequest(url) {
  try {
    const u = new URL(url);
    if (u.origin === self.location.origin) {
      return VIDEO_PATH_PATTERNS.some((re) => re.test(u.pathname));
    }
    return VIDEO_HOST_PATTERNS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

/**
 * Build a stable cache key for a ranged media request. Different byte ranges of
 * the same file must be cached separately, so we fold the Range header into the
 * key. We normalise to the start byte rounded down to a 1 MB block so repeated
 * slightly-different ranges of the same region reuse one entry.
 */
function videoCacheKey(request) {
  const url = new URL(request.url);
  const range = request.headers.get('range') || 'full';
  return new Request(`${url.origin}${url.pathname}__range__${range}`, {
    method: 'GET',
  });
}

async function handleVideo(request) {
  // Only GET is cacheable; let everything else go to the network untouched.
  if (request.method !== 'GET') return fetch(request);

  const key = videoCacheKey(request);
  const cache = await caches.open(VIDEO_CACHE);

  // 1. Already saved this exact chunk? Serve it instantly (no network).
  const hit = await cache.match(key);
  if (hit) return hit;

  // 2. Not cached — fetch from network, then save a copy for next time.
  try {
    const resp = await fetch(request);
    // Cache only successful full (200) or partial (206) media responses.
    if (resp && (resp.status === 200 || resp.status === 206)) {
      const copy = resp.clone();
      // Don't await — store in the background so playback isn't delayed.
      cache.put(key, copy).catch(() => {});
    }
    return resp;
  } catch (err) {
    // Network failed — last-ditch: any cached copy of this URL at all.
    const any = await cache.match(new URL(request.url).pathname);
    if (any) return any;
    throw err;
  }
}

async function handleAppShell(request) {
  const cache = await caches.open(APP_CACHE);
  const cached = await cache.match(request);
  // Stale-while-revalidate: serve cache instantly, refresh in the background.
  const network = fetch(request)
    .then((resp) => {
      if (resp && resp.status === 200 && resp.type === 'basic') {
        cache.put(request, resp.clone()).catch(() => {});
      }
      return resp;
    })
    .catch(() => cached);
  return cached || network;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never touch data fetches (recordings.json etc.) — they must stay fresh so
  // new chapters/AI data appear immediately. Let them hit the network normally.
  if (/recordings\.json|system-status|\/data\//i.test(url.pathname) || url.hostname.includes('githubusercontent') || url.hostname.includes('jsdelivr')) {
    return; // default browser behaviour
  }

  if (isVideoRequest(request.url)) {
    event.respondWith(handleVideo(request));
    return;
  }

  // App shell: same-origin navigations and static assets.
  if (url.origin === self.location.origin && request.method === 'GET') {
    event.respondWith(handleAppShell(request));
  }
});
