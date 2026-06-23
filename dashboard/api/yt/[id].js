/**
 * 🎬 YouTube resolver — FIXED VERSION
 *
 * Fixes:
 *   #9   Replaces the sequential for-loop (up to 66s) with a Promise.any
 *        race across ALL Piped + Invidious instances in parallel.
 *   #10  Drops 302 cache TTL from 1800s → 300s so an expired YouTube
 *        signature can't be served from Vercel's edge cache for half an hour.
 *
 * Drop-in replacement for dashboard/api/yt/[id].js
 */

export const config = { runtime: 'edge' };

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

async function fromPiped(instance, id, signal) {
  const r = await fetch(`${instance}/streams/${id}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 yt-resolver/3' },
    signal,
  });
  if (!r.ok) throw new Error('not ok');
  const j = await r.json();
  const combined = (j.videoStreams || []).filter(s => s.videoOnly === false);
  combined.sort((a, b) => (b.height || 0) - (a.height || 0));
  const url = combined[0]?.url;
  if (!url) throw new Error('no stream');
  return url;
}

async function fromInvidious(instance, id, signal) {
  const r = await fetch(`${instance}/api/v1/videos/${id}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 yt-resolver/3' },
    signal,
  });
  if (!r.ok) throw new Error('not ok');
  const j = await r.json();
  const combined = (j.formatStreams || []).slice();
  combined.sort((a, b) => (parseInt(b.size) || 0) - (parseInt(a.size) || 0));
  const url = combined[0]?.url;
  if (!url) throw new Error('no stream');
  return url;
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors() });
  }

  const url = new URL(request.url);
  const id = (url.pathname.split('/').filter(Boolean).pop() || '')
    .replace(/[^A-Za-z0-9_-]/g, '').slice(0, 11);

  if (!id || id.length !== 11) {
    return new Response(JSON.stringify({ error: 'Invalid YouTube id' }), {
      status: 400, headers: cors({ 'Content-Type': 'application/json' }),
    });
  }

  // ── #9 FIX ── Race every instance in parallel, take the first success.
  // AbortController cancels the losers as soon as a winner resolves.
  const ctrl = new AbortController();
  const signal = AbortSignal.any([ctrl.signal, AbortSignal.timeout(8000)]);

  const probes = [
    ...PIPED.map(inst => fromPiped(inst, id, signal)),
    ...INVIDIOUS.map(inst => fromInvidious(inst, id, signal)),
  ];

  let streamUrl = null;
  try {
    streamUrl = await Promise.any(probes);
  } catch { /* all failed */ }
  ctrl.abort();

  if (!streamUrl) {
    return new Response(JSON.stringify({
      error: 'No working resolver instance returned a stream URL',
      hint: 'The video might be private, deleted, geo-blocked, or every backend is down.',
      videoId: id,
    }), { status: 502, headers: cors({ 'Content-Type': 'application/json' }) });
  }

  // ── #10 FIX ── 5-minute edge cache instead of 30, so expired YT
  // signatures don't get served from cache long after they break.
  return new Response(null, {
    status: 302,
    headers: cors({
      Location: streamUrl,
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    }),
  });
}
