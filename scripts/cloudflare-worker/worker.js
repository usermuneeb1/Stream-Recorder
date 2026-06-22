/**
 * Cloudflare Worker — Telegram Video Streaming Proxy
 * 
 * Streams videos from Telegram Bot API through Cloudflare's CDN.
 * First request fetches from Telegram, caches for 1 year.
 * All subsequent requests served from Cloudflare edge (blazing fast).
 *
 * URL format: https://your-worker.workers.dev/video/<bot_token>/<file_path>
 * Or with encoded: https://your-worker.workers.dev/?url=<encoded_telegram_url>
 *
 * Deploy: Cloudflare Dashboard → Workers → Create → Paste this code
 */

const CACHE_TTL = 31536000; // 1 year in seconds
const ALLOWED_ORIGINS = [
  'https://muslim-lantern-archive.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = getCors(request);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // Get Telegram file URL from query param or path
    let telegramUrl = '';

    // Method 1: ?url=<encoded_telegram_url>
    const encodedUrl = url.searchParams.get('url');
    if (encodedUrl) {
      telegramUrl = decodeURIComponent(encodedUrl);
    }

    // Method 2: ?file_id=<id>&bot_token=<token> (resolves file_id to URL)
    const fileId = url.searchParams.get('file_id');
    const botToken = url.searchParams.get('bot') || env.BOT_TOKEN || '';
    if (fileId && botToken) {
      try {
        const fileResp = await fetch(
          `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`
        );
        const fileData = await fileResp.json();
        if (fileData.ok && fileData.result.file_path) {
          telegramUrl = `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`;
        }
      } catch (e) {
        return new Response('Failed to resolve file_id', { status: 500, headers: cors });
      }
    }

    // Method 3: /stream/<base64_encoded_url>
    const pathMatch = url.pathname.match(/^\/stream\/(.+)$/);
    if (pathMatch) {
      try {
        telegramUrl = atob(pathMatch[1]);
      } catch (e) {
        return new Response('Invalid base64', { status: 400, headers: cors });
      }
    }

    if (!telegramUrl) {
      return new Response(JSON.stringify({
        service: 'Telegram Video Proxy',
        usage: [
          '?url=<encoded_telegram_url>',
          '?file_id=<id>&bot=<token>',
          '/stream/<base64_url>',
        ],
      }), {
        status: 200,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // Check cache first
    const cache = caches.default;
    const cacheKey = new Request(url.toString(), request);
    let response = await cache.match(cacheKey);

    if (response) {
      // Cache HIT — serve from Cloudflare edge
      const headers = new Headers(response.headers);
      Object.entries(cors).forEach(([k, v]) => headers.set(k, v));
      headers.set('X-Cache', 'HIT');
      return new Response(response.body, { status: response.status, headers });
    }

    // Cache MISS — fetch from Telegram
    try {
      const rangeHeader = request.headers.get('Range');
      const fetchHeaders = {};
      if (rangeHeader) fetchHeaders['Range'] = rangeHeader;

      const tgResponse = await fetch(telegramUrl, { headers: fetchHeaders });

      if (!tgResponse.ok && tgResponse.status !== 206) {
        return new Response('Telegram fetch failed', { status: tgResponse.status, headers: cors });
      }

      // Build response with cache headers
      const headers = new Headers({
        ...cors,
        'Content-Type': tgResponse.headers.get('Content-Type') || 'video/mp4',
        'Cache-Control': `public, max-age=${CACHE_TTL}, immutable`,
        'Accept-Ranges': 'bytes',
        'X-Cache': 'MISS',
      });

      // Pass through content-length and range headers
      const cl = tgResponse.headers.get('Content-Length');
      if (cl) headers.set('Content-Length', cl);
      const cr = tgResponse.headers.get('Content-Range');
      if (cr) headers.set('Content-Range', cr);

      response = new Response(tgResponse.body, {
        status: tgResponse.status,
        headers,
      });

      // Store in cache (only full responses, not partial/range)
      if (tgResponse.status === 200) {
        const cacheResponse = response.clone();
        await cache.put(cacheKey, cacheResponse);
      }

      return response;
    } catch (e) {
      return new Response(`Proxy error: ${e.message}`, { status: 502, headers: cors });
    }
  },
};

function getCors(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Content-Type',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, X-Cache',
  };
}
