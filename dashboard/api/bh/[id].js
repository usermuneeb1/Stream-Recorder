/**
 * ⚡ Buzzheavier Fast Proxy — Vercel Serverless Function
 *
 * Buzzheavier does not expose a stable direct media URL. Its download page holds
 * a button like <a hx-get="/<id>/download">; requesting that path with the
 * "HX-Request" header returns an "HX-Redirect" header pointing at the real,
 * short-lived direct file URL. We resolve that SERVER-SIDE (so the browser never
 * hotlinks Buzzheavier directly), then stream the bytes back to the player with
 * Range forwarding (seeking) and permissive CORS.
 *
 * Route:  /api/bh/<id>            -> inline stream (player)
 *         /api/bh/<id>?download   -> attachment (force download)
 *
 * If resolution fails (Buzzheavier down / domain changed / link expired), it
 * returns a clean JSON error and the player falls back to Archive automatically.
 */

export const config = { runtime: 'edge' };

// Buzzheavier rotates domains; try the main one first, then known mirrors.
const HOSTS = ['https://buzzheavier.com', 'https://bzzhr.co'];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

function cors(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Content-Type',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, Content-Type',
    ...extra,
  };
}

// Ask Buzzheavier for the real direct URL behind a file id.
async function resolveDirect(id) {
  for (const host of HOSTS) {
    const dlPath = `${host}/${id}/download`;
    try {
      const r = await fetch(dlPath, {
        method: 'GET',
        headers: {
          'HX-Request': 'true',
          'HX-Current-URL': `${host}/${id}`,
          'User-Agent': UA,
          Referer: `${host}/${id}`,
        },
        redirect: 'manual',
      });
      // The direct link is delivered in the HX-Redirect (or Location) header.
      const direct = r.headers.get('hx-redirect') || r.headers.get('location');
      if (direct) return direct.startsWith('http') ? direct : `${host}${direct}`;
    } catch {
      /* try next host */
    }
  }
  return '';
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors() });
  }

  const url = new URL(request.url);
  const id = (url.pathname.split('/').filter(Boolean).pop() || '').replace(/[^A-Za-z0-9_-]/g, '');
  if (!id || id.length < 3) {
    return new Response(JSON.stringify({ success: false, error: 'No valid file id' }), {
      status: 400, headers: cors({ 'Content-Type': 'application/json' }),
    });
  }

  const direct = await resolveDirect(id);
  if (!direct) {
    return new Response(
      JSON.stringify({ success: false, error: 'Buzzheavier link could not be resolved (host may be down or the link expired).' }),
      { status: 502, headers: cors({ 'Content-Type': 'application/json' }) },
    );
  }

  const forceDownload = url.searchParams.has('download');
  const range = request.headers.get('range') || '';
  const fwd = new Headers();
  if (range) fwd.set('Range', range);
  fwd.set('User-Agent', UA);

  let resp;
  try {
    resp = await fetch(direct, {
      method: request.method === 'HEAD' ? 'HEAD' : 'GET',
      headers: fwd,
      redirect: 'follow',
    });
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Upstream fetch failed.' }), {
      status: 502, headers: cors({ 'Content-Type': 'application/json' }),
    });
  }

  const ctype = (resp.headers.get('content-type') || '').toLowerCase();
  const isMedia =
    resp.ok && (ctype.startsWith('video/') || ctype === 'application/octet-stream' || ctype.startsWith('audio/'));
  if (!isMedia) {
    return new Response(
      JSON.stringify({ success: false, error: 'Buzzheavier did not return a video stream.' }),
      { status: resp.status || 502, headers: cors({ 'Content-Type': 'application/json' }) },
    );
  }

  const out = new Headers(cors());
  for (const k of ['Content-Length', 'Content-Range', 'Accept-Ranges', 'Last-Modified', 'ETag']) {
    const v = resp.headers.get(k);
    if (v) out.set(k, v);
  }
  out.set('Content-Type', ctype.startsWith('video/') ? ctype : 'video/mp4');
  out.set('Accept-Ranges', 'bytes');
  out.set('Cache-Control', 'public, max-age=604800, s-maxage=604800, stale-while-revalidate=86400');
  out.set('Content-Disposition', forceDownload ? `attachment; filename="${id}.mp4"` : 'inline');

  return new Response(resp.body, { status: resp.status, headers: out });
}
