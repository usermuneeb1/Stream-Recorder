import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * The channel's FULL uploads list — no API key. Scrapes the /videos page
 * (ytInitialData), follows continuation tokens through the public innertube
 * browse endpoint, and parses the lockup view-model structure.
 * Client falls back to the bundled /yt-all.json snapshot when offline.
 */
const CHANNEL = '@TheMuslimLantern';
const UA = 'Mozilla/5.0 (compatible; MuslimLanternArchive/1.0)';
const MAX_CONTINUATIONS = 10; // ~30 per page → ~300 videos per request

interface FeedVideo {
  videoId: string;
  title: string;
  published: string;
  rel: string;
  views: number;
  thumb: string;
}

const relToIso = (rel: string): string => {
  const m = rel.match(/(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i);
  if (!m) return '';
  const n = parseInt(m[1], 10);
  const unit: Record<string, number> = { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800, month: 2592000, year: 31536000 };
  return new Date(Date.now() - n * (unit[m[2].toLowerCase()] || 0) * 1000).toISOString();
};

const parseViews = (s: string): number => {
  if (!s) return 0;
  const m = s.replace(/,/g, '').match(/([\d.]+)\s*([KMB])?/i);
  if (!m) return 0;
  const mult = ({ K: 1e3, M: 1e6, B: 1e9 } as Record<string, number>)[(m[2] || '').toUpperCase()] || 1;
  return Math.round(parseFloat(m[1]) * mult);
};

function extractVideos(data: unknown): FeedVideo[] {
  const out: FeedVideo[] = [];
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }

    const vr = node.videoRenderer || node.gridVideoRenderer;
    if (vr?.videoId) {
      out.push({
        videoId: vr.videoId,
        title: (vr.title?.runs?.[0]?.text || vr.title?.simpleText || '').trim(),
        published: relToIso(vr.publishedTimeText?.simpleText || ''),
        rel: vr.publishedTimeText?.simpleText || '',
        views: parseViews(vr.viewCountText?.simpleText || vr.shortViewCountText?.simpleText || ''),
        thumb: `https://i.ytimg.com/vi/${vr.videoId}/hqdefault.jpg`,
      });
    }

    const lv = node.lockupViewModel;
    if (lv?.contentId && !out.some(o => o.videoId === lv.contentId)) {
      const meta = lv.metadata?.lockupMetadataViewModel;
      const parts = (JSON.stringify(meta?.metadata?.contentMetadataViewModel?.metadataRows || [])
        .match(/"content":"[^"]*"/g) || []).map(s => s.slice(12, -1));
      const viewsPart = parts.find(p => /view/i.test(p)) || '';
      const relPart = parts.find(p => /ago|streamed/i.test(p)) || '';
      out.push({
        videoId: lv.contentId,
        title: (meta?.title?.content || '').trim(),
        published: relToIso(relPart),
        rel: relPart,
        views: parseViews(viewsPart),
        thumb: `https://i.ytimg.com/vi/${lv.contentId}/hqdefault.jpg`,
      });
    }

    for (const k of Object.keys(node)) walk(node[k]);
  };
  walk(data);
  return out;
}

function findContinuation(data: unknown): string | null {
  let token: string | null = null;
  const walk = (node: any) => {
    if (!node || typeof node !== 'object' || token) return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    const t = node.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
    if (t) { token = t; return; }
    for (const k of Object.keys(node)) walk(node[k]);
  };
  walk(data);
  return token;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=21600');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const r = await fetch(`https://www.youtube.com/${CHANNEL}/videos`, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
    });
    if (!r.ok) return res.status(200).json({ fetchedAt: new Date().toISOString(), total: 0, videos: [] });

    const html = await r.text();
    const m = html.match(/ytInitialData\s*=\s*(\{.+?\});</s);
    if (!m) return res.status(200).json({ fetchedAt: new Date().toISOString(), total: 0, videos: [] });
    const data = JSON.parse(m[1]);

    const key = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1] || '';
    const ver = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1] || '2.20240701.00.00';

    const seen = new Map<string, FeedVideo>();
    for (const v of extractVideos(data)) if (v.videoId && v.title) seen.set(v.videoId, v);

    let token = findContinuation(data);
    let pages = 0;
    while (token && pages < MAX_CONTINUATIONS) {
      const cr = await fetch(`https://www.youtube.com/youtubei/v1/browse?key=${key}&prettyPrint=false`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
        body: JSON.stringify({
          context: { client: { clientName: 'WEB', clientVersion: ver, hl: 'en', gl: 'US' } },
          continuation: token,
        }),
      });
      if (!cr.ok) break;
      const cdata = await cr.json();
      const before = seen.size;
      for (const v of extractVideos(cdata)) if (v.videoId && v.title && !seen.has(v.videoId)) seen.set(v.videoId, v);
      pages++;
      if (seen.size === before) break;
      token = findContinuation(cdata);
    }

    const videos = [...seen.values()]
      .sort((a, b) => (b.published || '').localeCompare(a.published || ''))
      .map(({ rel, ...v }) => v);

    return res.status(200).json({ fetchedAt: new Date().toISOString(), total: videos.length, videos });
  } catch (error) {
    console.error('ytall error:', error);
    return res.status(200).json({ fetchedAt: new Date().toISOString(), total: 0, videos: [] });
  }
}
