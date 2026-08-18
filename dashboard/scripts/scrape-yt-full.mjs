// Scrapes The Muslim Lantern's FULL uploads list without an API key:
// page HTML → ytInitialData → video entries, then follows continuation
// tokens through the public innertube browse endpoint.
// Usage: node scripts/scrape-yt-full.mjs  → writes public/yt-all.json

import fs from 'node:fs';

const CHANNEL = '@TheMuslimLantern';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const MAX_CONTINUATIONS = 12; // ~30 per page → ~350 videos ceiling

const relToIso = (rel) => {
  const m = rel.match(/(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i);
  if (!m) return '';
  const n = parseInt(m[1], 10);
  const unit = { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800, month: 2592000, year: 31536000 }[m[2].toLowerCase()];
  return new Date(Date.now() - n * unit * 1000).toISOString();
};

const parseViews = (s) => {
  if (!s) return 0;
  const m = s.replace(/,/g, '').match(/([\d.]+)\s*([KMB])?/i);
  if (!m) return 0;
  const mult = { K: 1e3, M: 1e6, B: 1e9 }[(m[2] || '').toUpperCase()] || 1;
  return Math.round(parseFloat(m[1]) * mult);
};

function extractVideos(data) {
  const out = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }

    // Classic renderer (older clients / some tabs)
    const vr = node.videoRenderer || node.gridVideoRenderer;
    if (vr && vr.videoId) {
      out.push({
        videoId: vr.videoId,
        title: (vr.title?.runs?.[0]?.text || vr.title?.simpleText || '').trim(),
        published: relToIso(vr.publishedTimeText?.simpleText || ''),
        rel: vr.publishedTimeText?.simpleText || '',
        views: parseViews(vr.viewCountText?.simpleText || vr.shortViewCountText?.simpleText || ''),
        thumb: `https://i.ytimg.com/vi/${vr.videoId}/hqdefault.jpg`,
      });
    }

    // New lockup view model (current YouTube web)
    const lv = node.lockupViewModel;
    if (lv && lv.contentId && !out.some(o => o.videoId === lv.contentId)) {
      const meta = lv.metadata?.lockupMetadataViewModel;
      const title = (meta?.title?.content || '').trim();
      const parts = [];
      const collect = (rows) => JSON.stringify(rows || [])
        .match(/"content":"[^"]*"/g)?.map(s => s.slice(12, -1)) || [];
      parts.push(...collect(meta?.metadata?.contentMetadataViewModel?.metadataRows));
      const viewsPart = parts.find(p => /view/i.test(p)) || '';
      const relPart = parts.find(p => /ago|streamed/i.test(p)) || '';
      out.push({
        videoId: lv.contentId,
        title,
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

function findContinuation(data) {
  let token = null;
  const walk = (node) => {
    if (!node || typeof node !== 'object' || token) return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token) {
      token = node.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
      return;
    }
    for (const k of Object.keys(node)) walk(node[k]);
  };
  walk(data);
  return token;
}

const main = async () => {
  const r = await fetch(`https://www.youtube.com/${CHANNEL}/videos`, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' } });
  if (!r.ok) throw new Error(`channel page ${r.status}`);
  const html = await r.text();

  const m = html.match(/ytInitialData\s*=\s*(\{.+?\});</s);
  if (!m) throw new Error('ytInitialData not found');
  const data = JSON.parse(m[1]);

  const key = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1] || '';
  const ver = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1] || '2.20240701.00.00';

  const seen = new Map();
  for (const v of extractVideos(data)) if (v.videoId && !seen.has(v.videoId)) seen.set(v.videoId, v);

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
    const vids = extractVideos(cdata);
    const before = seen.size;
    for (const v of vids) if (v.videoId && !seen.has(v.videoId)) seen.set(v.videoId, v);
    pages++;
    if (seen.size === before) break; // no progress → stop
    token = findContinuation(cdata);
  }

  // Merge exact dates from the RSS snapshot where available.
  let rss = {};
  try { rss = Object.fromEntries(JSON.parse(fs.readFileSync('public/yt-feed.json', 'utf8')).videos.map(v => [v.videoId, v])); } catch { /* none */ }

  const videos = [...seen.values()].map(v => {
    const hit = rss[v.videoId];
    return {
      videoId: v.videoId,
      title: v.title,
      published: hit?.published || v.published,
      description: hit?.description || '',
      thumb: v.thumb,
      views: hit?.views || v.views || 0,   // RSS carries exact counts
    };
  }).sort((a, b) => (b.published || '').localeCompare(a.published || ''));

  fs.writeFileSync('public/yt-all.json', JSON.stringify({ fetchedAt: new Date().toISOString(), channel: CHANNEL, total: videos.length, videos }, null, 2));
  console.log(`videos: ${videos.length} (continuation pages: ${pages})`);
  videos.slice(0, 3).forEach(v => console.log(' ', (v.published || '').slice(0, 10), v.videoId, v.title.slice(0, 50), v.views));
  console.log('  …');
  videos.slice(-2).forEach(v => console.log(' ', (v.published || '').slice(0, 10), v.videoId, v.title.slice(0, 50), v.views));
};

main().catch(e => { console.error(e); process.exit(1); });
