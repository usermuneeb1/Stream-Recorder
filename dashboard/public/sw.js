/**
 * 🚀 Muslim Lantern Archive — Service Worker (APP SHELL ONLY)
 *
 * IMPORTANT: This worker deliberately does NOT cache video.
 * Caching ranged media (HTTP 206 partial responses) through the Cache API is
 * unreliable and was causing the player to spin forever — so video requests are
 * left 100% untouched and stream straight from the network as normal.
 *
 * What it DOES do: cache the website shell (HTML/JS/CSS/icons) so the PAGE opens
 * instantly on repeat visits. Browsers already cache the actual video bytes in
 * their own HTTP media cache, so re-watching a video you just played is still
 * fast — without us risking playback by intercepting it.
 *
 * Safe by design: any failure falls straight through to the network.
 */

const APP_CACHE = 'mla-app-v3';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Remove ALL old caches (including the broken video cache from v1/v2).
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== APP_CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

// Hosts/paths that serve VIDEO bytes — we must NEVER intercept these.
function isMediaRequest(url) {
  try {
    const u = new URL(url);
    if (u.origin === self.location.origin && /^\/api\/(pd|bh)\//i.test(u.pathname)) return true;
    return /(\.archive\.org|pixeldrain\.com|pixeldrain\.eu\.cc|buzzheavier\.com|bzzhr\.co)$/i.test(u.hostname);
  } catch {
    return false;
  }
}

async function handleAppShell(request) {
  const cache = await caches.open(APP_CACHE);
  const cached = await cache.match(request);
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

  // Only handle simple GET navigations/assets.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 1. NEVER touch video — let it stream straight from the network.
  if (isMediaRequest(request.url)) return;

  // 2. NEVER cache data files — chapters/AI must stay fresh.
  if (
    /recordings\.json|system-status|\/data\//i.test(url.pathname) ||
    url.hostname.includes('githubusercontent') ||
    url.hostname.includes('jsdelivr')
  ) {
    return;
  }

  // 3. Range requests (media) — leave alone as an extra safety net.
  if (request.headers.has('range')) return;

  // 4. App shell only (same-origin HTML/JS/CSS/icons).
  if (url.origin === self.location.origin) {
    event.respondWith(handleAppShell(request));
  }
});
