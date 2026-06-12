/**
 * ⚡ Pixeldrain Fast Proxy — Vercel Serverless Function
 *
 * Streams a Pixeldrain file SERVER-SIDE (from Vercel's network, not the
 * browser) to bypass Pixeldrain's hotlink/rate-limit 403. Tries the GameDrive
 * CDN first, then official Pixeldrain, returning whichever serves real video.
 * Forwards Range so the player can seek, and sets permissive CORS.
 *
 * Route:  /api/pd/<fileId>            -> inline stream (for the player)
 *         /api/pd/<fileId>?download   -> attachment (force download)
 */

export const config = { runtime: 'edge' };

const UPSTREAMS = [
  (id) => `https://cdn.pixeldrain.eu.cc/${id}`,
  (id) => `https://pixeldrain.com/api/file/${id}`,
];

function cors(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Content-Type',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, Content-Type',
    ...extra,
  };
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors() });
  }

  const url = new URL(request.url);
  // /api/pd/<id>  -> last path segment
  const id = (url.pathname.split('/').filter(Boolean).pop() || '').replace(/[^A-Za-z0-9_-]/g, '');
  if (!id || id.length < 4) {
    return new Response(JSON.stringify({ success: false, error: 'No valid file id' }), {
      status: 400, headers: cors({ 'Content-Type': 'application/json' }),
    });
  }

  const forceDownload = url.searchParams.has('download');
  const range = request.headers.get('range') || '';

  let lastStatus = 502;
  for (const build of UPSTREAMS) {
    const upstream = build(id);
    const fwd = new Headers();
    if (range) fwd.set('Range', range);
    fwd.set('User-Agent', 'Mozilla/5.0 (compatible; PD-Fast-Proxy/1.0)');

    let resp;
    try {
      resp = await fetch(upstream, {
        method: request.method === 'HEAD' ? 'HEAD' : 'GET',
        headers: fwd,
        redirect: 'follow',
      });
    } catch {
      lastStatus = 502;
      continue;
    }

    const ctype = (resp.headers.get('content-type') || '').toLowerCase();
    const isVideo =
      resp.ok && (ctype.startsWith('video/') || ctype === 'application/octet-stream' || ctype.startsWith('audio/'));
    if (!isVideo) {
      lastStatus = resp.status || 403;
      continue;
    }

    const out = new Headers(cors());
    for (const k of ['Content-Length', 'Content-Range', 'Accept-Ranges', 'Last-Modified', 'ETag']) {
      const v = resp.headers.get(k);
      if (v) out.set(k, v);
    }
    out.set('Content-Type', ctype.startsWith('video/') ? ctype : 'video/mp4');
    out.set('Accept-Ranges', 'bytes');
    // Cache on Vercel's edge so repeat plays are fast.
    out.set('Cache-Control', 'public, max-age=604800, s-maxage=604800');
    out.set('X-PD-Upstream', new URL(upstream).host);
    out.set('Content-Disposition', forceDownload ? `attachment; filename="${id}.mp4"` : 'inline');

    return new Response(resp.body, { status: resp.status, headers: out });
  }

  return new Response(
    JSON.stringify({ success: false, error: 'All upstreams unavailable (Pixeldrain may be blocking proxies).' }),
    { status: lastStatus, headers: cors({ 'Content-Type': 'application/json' }) }
  );
}
