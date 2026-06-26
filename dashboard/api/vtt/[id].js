/**
 * 🎞️ Storyboard VTT proxy (Vercel Node Serverless)
 *
 * Archive.org serves our storyboard .vtt files with:
 *   • content-type: text/plain          → Vidstack expects text/vtt
 *   • NO Access-Control-Allow-Origin    → browser blocks cross-origin fetch
 *
 * AND archive.org rejects requests from Cloudflare worker IPs with HTTP 400.
 * Vercel Edge runs on Cloudflare, so we MUST use the Node serverless runtime
 * (runs on AWS, archive.org accepts those IPs).
 *
 * Route:  /api/vtt/<video_id>   →  Archive.org VTT for that video
 */

export const config = {
  runtime: 'nodejs',
};

const ARCHIVE_ITEM = 'muslim-lantern-storyboards-v1';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  // Path looks like /api/vtt/<id>  — the id is in req.query.id thanks to
  // the [id].js dynamic-route filename.
  const id = String(req.query.id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
  if (!id || id.length < 8) {
    res.status(400).json({ error: 'Invalid storyboard id' });
    return;
  }

  const upstreamUrl = `https://archive.org/download/${ARCHIVE_ITEM}/${id}.vtt`;

  let upstream;
  try {
    upstream = await fetch(upstreamUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 Stream-Recorder/1.0',
        'Referer': 'https://muslim-lantern-archive.vercel.app/',
        'Accept': 'text/vtt, text/plain, */*',
      },
      // Node 18+ fetch supports AbortSignal.timeout
      signal: AbortSignal.timeout(10000),
    });
  } catch (e) {
    res.status(502).json({ error: 'Upstream fetch failed', detail: String(e?.message || e) });
    return;
  }

  if (!upstream.ok) {
    res.status(upstream.status === 404 ? 404 : 502).json({
      error: `Upstream ${upstream.status}`,
      url: upstreamUrl,
    });
    return;
  }

  const body = await upstream.text();
  if (!body.startsWith('WEBVTT')) {
    res.status(502).json({ error: 'Not a valid VTT file', firstChars: body.slice(0, 40) });
    return;
  }

  res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=604800, s-maxage=604800, stale-while-revalidate=86400');
  res.status(200).send(body);
}
