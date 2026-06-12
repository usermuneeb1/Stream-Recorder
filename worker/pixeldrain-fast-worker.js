/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  ⚡ PIXELDRAIN FAST PROXY — Cloudflare Worker                              ║
 * ║  Your own GameDrive-style speed-boost + hotlink/rate-limit bypass.         ║
 * ║                                                                            ║
 * ║  HOW IT WORKS                                                              ║
 * ║   • Browser asks the Worker for a file id.                                 ║
 * ║   • The Worker fetches it SERVER-SIDE from one of several upstreams        ║
 * ║     (GameDrive CDN proxy → official Pixeldrain), returning the first that  ║
 * ║     actually serves video.                                                 ║
 * ║   • The response is CACHED on Cloudflare's global edge, so every viewer    ║
 * ║     after the first gets the video INSTANTLY and Pixeldrain's per-file     ║
 * ║     rate limit never affects them again.                                   ║
 * ║   • Full Range (seeking) + CORS so it embeds in any <video> player.        ║
 * ║                                                                            ║
 * ║  USAGE (after deploy):                                                     ║
 * ║     https://YOUR-WORKER.workers.dev/<fileId>                               ║
 * ║     https://YOUR-WORKER.workers.dev/api/file/<fileId>                      ║
 * ║     https://YOUR-WORKER.workers.dev/<fileId>?download   (forces download)  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

// Upstreams tried in order. First one that returns real video wins.
// cdn.pixeldrain.eu.cc = GameDrive proxy (already bypasses limits, redirects to a
// cdnNN node). pixeldrain.com/api/file = official direct endpoint (fallback).
const UPSTREAMS = [
  (id) => `https://cdn.pixeldrain.eu.cc/${id}`,
  (id) => `https://pixeldrain.com/api/file/${id}`,
];

// How long Cloudflare keeps the file on its edge (seconds). 7 days.
const EDGE_TTL = 60 * 60 * 24 * 7;

function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Content-Type',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, Content-Type',
    ...extra,
  };
}

function extractId(pathname) {
  // Accepts /<id>, /api/file/<id>, /u/<id>
  const m = pathname.match(/(?:\/api\/file\/|\/u\/|\/)([A-Za-z0-9_-]{4,})\/?$/);
  return m ? m[1] : '';
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // Simple homepage / health check
    if (url.pathname === '/' || url.pathname === '') {
      return new Response(
        'Pixeldrain Fast Proxy is running.\nUse /<fileId> to stream a file.',
        { status: 200, headers: corsHeaders({ 'Content-Type': 'text/plain' }) }
      );
    }

    const id = extractId(url.pathname);
    if (!id) {
      return new Response(JSON.stringify({ success: false, error: 'No valid file id in path' }), {
        status: 400,
        headers: corsHeaders({ 'Content-Type': 'application/json' }),
      });
    }

    const forceDownload = url.searchParams.has('download');
    const rangeHeader = request.headers.get('Range') || '';

    // ── Edge cache: key by id + range so seeking works and repeats are instant.
    const cache = caches.default;
    const cacheKey = new Request(`https://pd-cache/${id}?r=${encodeURIComponent(rangeHeader)}`, { method: 'GET' });
    if (!forceDownload) {
      const hit = await cache.match(cacheKey);
      if (hit) {
        const h = new Headers(hit.headers);
        h.set('X-PD-Cache', 'HIT');
        return new Response(hit.body, { status: hit.status, headers: h });
      }
    }

    // ── Try each upstream until one serves real video.
    let lastStatus = 502;
    for (const build of UPSTREAMS) {
      const upstreamUrl = build(id);
      const fwd = new Headers();
      if (rangeHeader) fwd.set('Range', rangeHeader);
      // Deliberately send NO browser Origin/Referer (server-side request).
      fwd.set('User-Agent', 'Mozilla/5.0 (compatible; PD-Fast-Proxy/1.0)');

      let resp;
      try {
        resp = await fetch(upstreamUrl, {
          method: request.method === 'HEAD' ? 'HEAD' : 'GET',
          headers: fwd,
          redirect: 'follow',
          cf: { cacheEverything: true, cacheTtl: EDGE_TTL },
        });
      } catch (_e) {
        lastStatus = 502;
        continue;
      }

      const ctype = (resp.headers.get('Content-Type') || '').toLowerCase();
      const looksLikeVideo =
        resp.ok && (ctype.startsWith('video/') || ctype === 'application/octet-stream' || ctype.startsWith('audio/'));

      if (!looksLikeVideo) {
        lastStatus = resp.status || 403;
        continue; // try next upstream (e.g. this one is rate-limited)
      }

      // Build a clean streamable response.
      const outHeaders = new Headers(corsHeaders());
      const passthrough = ['Content-Length', 'Content-Range', 'Accept-Ranges', 'Last-Modified', 'ETag'];
      for (const k of passthrough) {
        const v = resp.headers.get(k);
        if (v) outHeaders.set(k, v);
      }
      outHeaders.set('Content-Type', ctype.startsWith('video/') ? ctype : 'video/mp4');
      outHeaders.set('Accept-Ranges', 'bytes');
      outHeaders.set('Cache-Control', `public, max-age=${EDGE_TTL}`);
      outHeaders.set('X-PD-Cache', 'MISS');
      outHeaders.set('X-PD-Upstream', new URL(upstreamUrl).host);
      if (forceDownload) {
        outHeaders.set('Content-Disposition', `attachment; filename="${id}.mp4"`);
      } else {
        outHeaders.set('Content-Disposition', 'inline');
      }

      const out = new Response(resp.body, { status: resp.status, headers: outHeaders });

      // Store a copy on the edge for the next viewer (only full/successful bodies).
      if (!forceDownload && (resp.status === 200 || resp.status === 206)) {
        ctx.waitUntil(cache.put(cacheKey, out.clone()));
      }
      return out;
    }

    // All upstreams blocked (file is genuinely rate-limited everywhere right now).
    return new Response(
      JSON.stringify({
        success: false,
        error: 'All upstreams unavailable (file may be temporarily rate-limited by Pixeldrain).',
      }),
      { status: lastStatus, headers: corsHeaders({ 'Content-Type': 'application/json' }) }
    );
  },
};
