/**
 * 🎞️ Storyboard VTT proxy (Vercel Edge)
 *
 * Archive.org serves our storyboard .vtt files with:
 *   • content-type: text/plain          → Vidstack expects text/vtt
 *   • NO Access-Control-Allow-Origin    → browser blocks cross-origin fetch()
 *
 * Without this proxy the seek-bar trickplay previews silently fail —
 * the storyboard URL is set on the player but the VTT load throws CORS
 * in DevTools and no thumbnail ever appears.
 *
 * This proxy fetches the VTT from Archive.org server-side, returns it with
 * the correct content-type + permissive CORS + long edge cache. Each VTT
 * is ~2 KB and rarely changes, so caching for a week is safe.
 *
 * Route:  /api/vtt/<video_id>   →  Archive.org VTT for that video
 *
 * The video_id is the same filename used by generate_storyboard.py:
 *   PYkqrEBc_zY                        → muslim-lantern-storyboards-v1/PYkqrEBc_zY.vtt
 *   tml-2026-06-PYkqrEBc_zY-178...     → muslim-lantern-storyboards-v1/tml-2026-06-PYkqrEBc_zY-178....vtt
 */

export const config = { runtime: 'edge' };

const ARCHIVE_ITEM = 'muslim-lantern-storyboards-v1';

function cors() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Content-Type',
  };
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors() });
  }

  const url = new URL(request.url);
  // Sanitise the id — must match the patterns used by generate_storyboard.py.
  // Allow [A-Za-z0-9_-] and limit length.
  const id = (url.pathname.split('/').filter(Boolean).pop() || '')
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 80);

  if (!id || id.length < 8) {
    return new Response(JSON.stringify({ error: 'Invalid storyboard id' }), {
      status: 400,
      headers: { ...cors(), 'Content-Type': 'application/json' },
    });
  }

  const upstreamUrl = `https://archive.org/download/${ARCHIVE_ITEM}/${id}.vtt`;

  let upstream;
  try {
    upstream = await fetch(upstreamUrl, {
      signal: AbortSignal.timeout(8000),
      // No special headers — Archive.org accepts plain GETs.
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Upstream fetch failed', detail: String(e) }), {
      status: 502,
      headers: { ...cors(), 'Content-Type': 'application/json' },
    });
  }

  if (!upstream.ok) {
    return new Response(JSON.stringify({ error: `Upstream ${upstream.status}`, url: upstreamUrl }), {
      status: upstream.status === 404 ? 404 : 502,
      headers: { ...cors(), 'Content-Type': 'application/json' },
    });
  }

  const body = await upstream.text();

  // Quick sanity — VTT files always start with "WEBVTT".
  if (!body.startsWith('WEBVTT')) {
    return new Response(JSON.stringify({ error: 'Not a valid VTT file' }), {
      status: 502,
      headers: { ...cors(), 'Content-Type': 'application/json' },
    });
  }

  return new Response(body, {
    status: 200,
    headers: {
      ...cors(),
      'Content-Type': 'text/vtt; charset=utf-8',
      // 1-week edge cache + 1-day stale-while-revalidate. VTTs change only
      // when storyboards are regenerated (rare).
      'Cache-Control': 'public, max-age=604800, s-maxage=604800, stale-while-revalidate=86400',
    },
  });
}
