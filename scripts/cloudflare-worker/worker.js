/**
 * Cloudflare Worker — Telegram Video Streaming Proxy (HARDENED)
 *
 * Streams videos that live in a Telegram channel through Cloudflare's CDN.
 * First request fetches from Telegram; the result is cached for 1 year at the edge.
 *
 * HARDENED vs the original (June 2026):
 *   ✗ Removed ?bot=<token> — the bot token MUST come from env.BOT_TOKEN.
 *     Accepting it from the URL leaked it into browser histories, public JSON
 *     files committed to git, and CDN access logs.
 *   ✗ Removed ?url=<encoded_telegram_url> — that turned the Worker into an
 *     open proxy (SSRF + free bandwidth for anyone on the internet).
 *   ✗ Removed /stream/<base64_url> — same open-proxy risk.
 *   ✓ Only accepts ?file_id=<id>. Token is read from env.BOT_TOKEN only.
 *   ✓ Cache key is derived from file_id only (so the token never appears
 *     anywhere in cache metadata or CDN logs).
 *   ✓ Tighter CORS allow-list, explicit Vary: Origin, method allow-list.
 *   ✓ file_id is regex-validated (Telegram file_ids are 20–200 chars of
 *     [A-Za-z0-9_-]).
 *
 * Deploy:
 *   wrangler secret put BOT_TOKEN     # paste your Telegram bot token
 *   wrangler deploy
 */

const CACHE_TTL = 31536000; // 1 year
const FILE_ID_RE = /^[A-Za-z0-9_-]{20,200}$/;

const ALLOWED_ORIGINS = [
  'https://muslim-lantern-archive.vercel.app',
  'https://muslim-lantern.com',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:4321',
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: cors });
    }

    const fileId = url.searchParams.get('file_id') || '';
    const botToken = env.BOT_TOKEN || '';

    if (!fileId || !FILE_ID_RE.test(fileId)) {
      return new Response(
        JSON.stringify({
          service: 'Telegram Video CDN Proxy',
          version: '2.0',
          usage: '?file_id=<telegram_file_id>',
        }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } },
      );
    }

    if (!botToken) {
      return new Response('Worker not configured (BOT_TOKEN secret missing)', {
        status: 500, headers: cors,
      });
    }

    // ── Edge cache check — key is file_id only, never the token ────────────
    const cacheKey = new Request(`https://cache.local/file/${fileId}`, request);
    const cache = caches.default;
    let cached = await cache.match(cacheKey);
    if (cached) {
      const headers = new Headers(cached.headers);
      Object.entries(cors).forEach(([k, v]) => headers.set(k, v));
      headers.set('X-Cache', 'HIT');
      return new Response(cached.body, { status: cached.status, headers });
    }

    // ── Resolve file_id → temporary Telegram CDN path ──────────────────────
    let telegramUrl;
    try {
      const fileResp = await fetch(
        `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`,
        { signal: AbortSignal.timeout(10000) },
      );
      const fileData = await fileResp.json();
      if (!fileData?.ok || !fileData?.result?.file_path) {
        return new Response('Failed to resolve file_id', { status: 502, headers: cors });
      }
      telegramUrl = `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`;
    } catch (e) {
      return new Response(`Resolve error: ${e.message}`, { status: 502, headers: cors });
    }

    // ── Proxy the bytes (with Range forwarding for video seeking) ──────────
    try {
      const fwd = {};
      const range = request.headers.get('Range');
      if (range) fwd['Range'] = range;

      const upstream = await fetch(telegramUrl, { headers: fwd });
      if (!upstream.ok && upstream.status !== 206) {
        return new Response('Telegram fetch failed', { status: upstream.status, headers: cors });
      }

      const headers = new Headers({
        ...cors,
        'Content-Type': upstream.headers.get('Content-Type') || 'video/mp4',
        'Cache-Control': `public, max-age=${CACHE_TTL}, immutable`,
        'Accept-Ranges': 'bytes',
        'X-Cache': 'MISS',
      });
      const cl = upstream.headers.get('Content-Length');
      if (cl) headers.set('Content-Length', cl);
      const cr = upstream.headers.get('Content-Range');
      if (cr) headers.set('Content-Range', cr);

      const response = new Response(upstream.body, { status: upstream.status, headers });

      // Cache only complete (200) responses, never partial (206) ranges
      if (upstream.status === 200) {
        const toCache = response.clone();
        await cache.put(cacheKey, toCache);
      }
      return response;
    } catch (e) {
      return new Response(`Proxy error: ${e.message}`, { status: 502, headers: cors });
    }
  },
};

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Content-Type',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, X-Cache',
    'Vary': 'Origin',
  };
}
