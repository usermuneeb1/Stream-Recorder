/**
 * 🎬 YouTube → direct .mp4 resolver (Vercel Edge Function)
 *
 * Route: /api/yt/<youtubeId>  → 302 to direct .mp4 stream URL
 *
 * Tries (in order):
 *   1. Piped API (multi-instance, with failover)
 *   2. Invidious API (multi-instance, with failover)
 *
 * Both backends expose the underlying YouTube CDN URL, which the browser then
 * fetches directly. Because the redirect comes from this Vercel domain, CORS
 * is satisfied for the <video> element. The Vercel Edge cache holds the
 * resolution for 30 min so repeat viewers don't pay the resolution cost.
 */

export const config = { runtime: 'edge' };

// Verified working as of June 2026. Order matters — fastest first.
const PIPED = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.r4fo.com',
  'https://pipedapi.leptons.xyz',
  'https://api.piped.private.coffee',
];
const INVIDIOUS = [
  'https://invidious.private.coffee',
  'https://invidious.nerdvpn.de',
  'https://invidious.f5.si',
  'https://invidious.jing.rocks',
  'https://yewtu.be',
  'https://invidious.lunar.icu',
];

function cors(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    ...extra,
  };
}

// ── Backend probes ─────────────────────────────────────────────────────────
async function fromPiped(instance, id) {
  try {
    const r = await fetch(`${instance}/streams/${id}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 yt-resolver/2' },
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    // Combined streams (video+audio in one URL)
    const combined = (j.videoStreams || []).filter(s => s.videoOnly === false);
    combined.sort((a, b) => (b.height || 0) - (a.height || 0));
    return combined[0]?.url || null;
  } catch { return null; }
}

async function fromInvidious(instance, id) {
  try {
    const r = await fetch(`${instance}/api/v1/videos/${id}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 yt-resolver/2' },
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const combined = (j.formatStreams || []).slice();
    combined.sort((a, b) => (parseInt(b.size) || 0) - (parseInt(a.size) || 0));
    return combined[0]?.url || null;
  } catch { return null; }
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors() });
  }

  const url = new URL(request.url);
  const id = (url.pathname.split('/').filter(Boolean).pop() || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 11);

  if (!id || id.length !== 11) {
    return new Response(JSON.stringify({ error: 'Invalid YouTube id' }), {
      status: 400, headers: cors({ 'Content-Type': 'application/json' }),
    });
  }

  let streamUrl = null;

  // Try Piped first (more reliable in 2026)
  for (const inst of PIPED) {
    streamUrl = await fromPiped(inst, id);
    if (streamUrl) break;
  }

  // Fallback to Invidious
  if (!streamUrl) {
    for (const inst of INVIDIOUS) {
      streamUrl = await fromInvidious(inst, id);
      if (streamUrl) break;
    }
  }

  if (!streamUrl) {
    return new Response(JSON.stringify({
      error: 'No working resolver instance returned a stream URL',
      hint: 'The video might be private, deleted, geo-blocked, or every backend is down.',
      videoId: id,
    }), { status: 502, headers: cors({ 'Content-Type': 'application/json' }) });
  }

  // 302 with edge cache so repeat views don't re-resolve
  return new Response(null, {
    status: 302,
    headers: cors({
      Location: streamUrl,
      'Cache-Control': 'public, max-age=1800, s-maxage=1800',
    }),
  });
}
