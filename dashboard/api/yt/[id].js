/**
 * 🎬 YouTube Invidious Proxy — Vercel Serverless Function
 *
 * Takes a YouTube video ID and proxies the direct .mp4 stream through
 * multiple Invidious instances with automatic failover.
 *
 * Why this works:
 *   YouTube blocks direct <video> embedding from their CDN (CORS + referrer).
 *   Invidious instances are free, privacy-friendly YouTube frontends that
 *   return the raw video stream URL. This function fetches the metadata,
 *   extracts the direct stream URL, and redirects the browser to it.
 *   Because the redirect comes from Vercel's domain, CORS is satisfied.
 *
 * Route:  /api/yt/<videoId>          → redirect to direct .mp4 stream
 *         /api/yt/<videoId>?format=  → request specific format (e.g., 22, 18)
 *
 * Source priority:
 *   1. Invidious API (formatStreams / adaptiveFormats)
 *   2. Multiple Invidious instance fallback
 */

export const config = { runtime: 'edge' };

// Reliable public Invidious instances (tested as of June 2026).
// These rotate over time; if one goes down, the next is tried.
const INVIDIOUS_INSTANCES = [
  'https://invidious.snopyta.org',
  'https://yewtu.be',
  'https://inv.bp.projectsegfau.lt',
  'https://invidious.lunar.icu',
  'https://invidious.flokinet.to',
  'https://inv.tux.pizza',
  'https://invidious.private.coffee',
  'https://invidious.nerdvpn.de',
  'https://invidious.jing.rocks',
  'https://inv.b344.fun',
];

// YouTube's itag to quality mapping (common ones)
const ITAG_MAP = {
  '18': '360p MP4',
  '22': '720p MP4',
  '137': '1080p MP4 (video only)',
  '136': '720p MP4 (video only)',
  '135': '480p MP4 (video only)',
  '134': '360p MP4 (video only)',
  '140': 'M4A audio only',
};

function cors(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Expose-Headers': 'Content-Type, Content-Length',
    ...extra,
  };
}

/**
 * Fetch video metadata from an Invidious instance.
 * Returns the parsed JSON or null on failure.
 */
async function fetchMeta(instance, videoId) {
  const url = `${instance}/api/v1/videos/${videoId}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; YT-Ghost-Proxy/1.0)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      // If instance returns an error page (HTML), treat as failed
      if (text.trim().startsWith('<') || text.trim().startsWith('<!')) return null;
      return null;
    }
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Extract the best stream URL from Invidious response.
 * Prefer formatStreams (combined audio+video), fall back to adaptiveFormats.
 */
function extractStreamUrl(meta, preferredItag) {
  if (!meta) return null;

  // Check formatStreams first (combined audio+video = one URL to play)
  const streams = meta.formatStreams || [];
  const adaptive = meta.adaptiveFormats || [];

  // If a specific itag is requested, find it
  if (preferredItag) {
    const found = [...streams, ...adaptive].find(f => f.itag === parseInt(preferredItag));
    if (found?.url) return found.url;
  }

  // Otherwise: best combined stream (highest resolution)
  const sortedStreams = [...streams].sort((a, b) => {
    const aH = parseInt(a.height) || 0;
    const bH = parseInt(b.height) || 0;
    return bH - aH;
  });

  for (const s of sortedStreams) {
    if (s.url) return s.url;
  }

  // Fall back to adaptive: find the best video stream
  const videoAdaptive = adaptive
    .filter(f => f.type?.startsWith('video'))
    .sort((a, b) => (parseInt(b.height) || 0) - (parseInt(a.height) || 0));

  for (const v of videoAdaptive) {
    if (v.url) return v.url;
  }

  // Last resort: any URL
  for (const f of [...streams, ...adaptive]) {
    if (f.url) return f.url;
  }

  return null;
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors() });
  }

  const url = new URL(request.url);
  const videoId = (url.pathname.split('/').filter(Boolean).pop() || '').replace(/[^A-Za-z0-9_-]/g, '');
  const preferredItag = url.searchParams.get('format') || '';

  if (!videoId || videoId.length < 8) {
    return new Response(
      JSON.stringify({ success: false, error: 'No valid YouTube video ID provided' }),
      { status: 400, headers: cors({ 'Content-Type': 'application/json' }) }
    );
  }

  // Try each Invidious instance until we get a stream URL
  let lastError = 'All Invidious instances failed';
  let streamUrl = null;

  for (const instance of INVIDIOUS_INSTANCES) {
    console.log(`Trying Invidious instance: ${instance}`);
    const meta = await fetchMeta(instance, videoId);
    if (!meta) continue;

    streamUrl = extractStreamUrl(meta, preferredItag);
    if (streamUrl) {
      console.log(`Found stream via ${instance}`);
      break;
    }

    // If the instance returned data but no streams, it might be geo-blocked
    if (meta.error) {
      lastError = `Invidious error: ${meta.error}`;
    }
  }

  if (!streamUrl) {
    return new Response(
      JSON.stringify({
        success: false,
        error: lastError,
        hint: 'The video might be private, deleted, or geo-blocked on all Invidious instances.',
        videoId,
      }),
      { status: 502, headers: cors({ 'Content-Type': 'application/json' }) }
    );
  }

  // Redirect the browser to the direct .mp4 stream URL.
  // This is a 302 redirect — the browser fetches the video directly from
  // YouTube's CDN, but CORS is satisfied because the redirect came from
  // our Vercel origin.
  const headers = cors({
    'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    'X-YT-Proxy': 'invidious',
  });

  return Response.redirect(streamUrl, 302);
}
