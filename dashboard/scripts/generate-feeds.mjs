#!/usr/bin/env node
// Feed generator (Node) — the build-time twin of scripts/generate-feeds.py.
//
// Why this exists: the primary deploy (Vercel) runs `npm run build` from
// dashboard/ and never ran the Python generator, so dashboard/public/*.xml
// were served exactly as committed — last rebuilt 2026-06-23 with 5 of 20
// recordings, while RSS / podcast / JSON Feed / sitemap kept advertising an
// archive that stopped growing in June. The build now regenerates them.
//
// Output is byte-compatible with the Python generator (tests/feeds-freshness-test.sh
// diffs the two) so the GitHub Pages workflow can keep calling either one.
//
// Usage:  node dashboard/scripts/generate-feeds.mjs [--out DIR]

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');

export const SITE = 'https://muslim-lantern-archive.vercel.app';
const TITLE = 'The Muslim Lantern, Stream Archive';
const DESC = 'Live stream archive of The Muslim Lantern. Recorded, mirrored, and chaptered automatically.';
const AUTHOR = 'Muneeb Ahmad';
const EMAIL = 'noreply@muslim-lantern-archive.invalid';
const LANG = 'en';
const COVER = `${SITE}/logo.png`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const xmlEscape = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Same contract as Python's quoteattr() for the values we emit: always
// double-quoted, escaping everything that could close the attribute.
const attr = (s) => `"${String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}"`;

function parseWhen(r) {
  const raw = r.recorded_at || `${r.date || ''}T00:00:00Z`;
  const d = new Date(raw.replace('Z', '+00:00'));
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function pubDate(r) {
  const d = parseWhen(r);
  const pad = (n) => String(n).padStart(2, '0');
  return `${DAYS[d.getUTCDay()]}, ${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} `
    + `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} +0000`;
}

function iso(r) {
  const d = parseWhen(r);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T`
    + `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+00:00`;
}

function loadRecordings(root = ROOT) {
  const rows = JSON.parse(readFileSync(resolve(root, 'data/recordings.json'), 'utf8'));
  if (!Array.isArray(rows)) return [];
  const byId = new Map();
  for (const r of rows) {
    if (!String(r.channel || '').toLowerCase().includes('muslim lantern')) continue;
    const m = /(?:v=|\/)([\w-]{11})/.exec(r.video_url || '');
    if (!m) continue;
    const yt = m[1];
    const ex = byId.get(yt);
    if (!ex) {
      byId.set(yt, { ...r });
    } else {
      // Fill-only-empty (mirrors fetchRecordings' dedup): a longer record must
      // never wipe good mirrors with "".
      for (const [k, v] of Object.entries(r)) {
        const empty = v === '' || v === null || v === undefined
          || (Array.isArray(v) && v.length === 0);
        if (!empty && !ex[k]) ex[k] = v;
      }
      if (String(r.title || '').length > String(ex.title || '').length) ex.title = r.title;
    }
    byId.get(yt).video_id = yt;
  }
  return [...byId.values()].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

// Direct-media only — never a watch/details page (that was the 2026-10-23 bug
// where every enclosure was `<... type="video/mp4">` pointing at HTML).
export function bestMediaUrl(r) {
  for (const k of ['archive_node', 'archive_direct', 'github_direct', 'github_release', 'st0807_link']) {
    const u = String(r[k] || '').trim();
    if (u.startsWith('http')) return u;
  }
  const pd = /pixeldrain\.com\/(?:u|api\/file)\/([\w-]+)/.exec(r.pixeldrain_link || '');
  return pd ? `https://pixeldrain.com/api/file/${pd[1]}` : '';
}

const watchUrl = (r) => `${SITE}/#/watch/${r.video_id}`;
const thumbUrl = (r) => (r.thumbnail && String(r.thumbnail).startsWith('http')
  ? r.thumbnail
  : `https://i.ytimg.com/vi/${r.video_id}/hqdefault.jpg`);

function makeRss(items, podcast) {
  const now = pubDate({ recorded_at: new Date().toISOString() });
  const ns = podcast
    ? ' xmlns:itunes="http://www.itunes.apple.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/"'
    : '';
  const itunesChannel = podcast ? `
    <itunes:author>${xmlEscape(AUTHOR)}</itunes:author>
    <itunes:summary>${xmlEscape(DESC)}</itunes:summary>
    <itunes:owner><itunes:name>${xmlEscape(AUTHOR)}</itunes:name><itunes:email>${xmlEscape(EMAIL)}</itunes:email></itunes:owner>
    <itunes:image href=${attr(COVER)}/>
    <itunes:category text="Religion &amp; Spirituality"><itunes:category text="Islam"/></itunes:category>
    <itunes:explicit>false</itunes:explicit>` : '';

  const xmlItems = items.slice(0, 50).map((r) => {
    const media = bestMediaUrl(r);
    const size = r.size_bytes || 0;
    const dur = Math.trunc(r.duration_sec || 0);
    const title = r.title || 'Untitled';
    const pad = (n) => String(n).padStart(2, '0');
    const itunesItem = podcast
      ? `
      <itunes:duration>${pad(Math.floor(dur / 3600))}:${pad(Math.floor((dur % 3600) / 60))}:${pad(dur % 60)}</itunes:duration>
      <itunes:image href=${attr(thumbUrl(r))}/>
      <itunes:explicit>false</itunes:explicit>`
      : '';
    const enclosure = media ? `<enclosure url=${attr(media)} length="${size}" type="video/mp4"/>` : '';
    return `    <item>
      <title>${xmlEscape(title)}</title>
      <link>${xmlEscape(watchUrl(r))}</link>
      <guid isPermaLink="false">${xmlEscape(r.video_id)}</guid>
      <pubDate>${pubDate(r)}</pubDate>
      <description>${xmlEscape(`${title}, ${DESC}`)}</description>
      ${enclosure}${itunesItem}
    </item>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"${ns}>
  <channel>
    <title>${xmlEscape(TITLE)}</title>
    <link>${xmlEscape(SITE)}</link>
    <description>${xmlEscape(DESC)}</description>
    <language>${LANG}</language>
    <lastBuildDate>${now}</lastBuildDate>
    <generator>generate-feeds.py</generator>
    <image><url>${xmlEscape(COVER)}</url><title>${xmlEscape(TITLE)}</title><link>${xmlEscape(SITE)}</link></image>${itunesChannel}
${xmlItems}
  </channel>
</rss>
`;
}

function makeJsonFeed(items) {
  const out = {
    version: 'https://jsonfeed.org/version/1.1',
    title: TITLE,
    home_page_url: SITE,
    feed_url: `${SITE}/feed.json`,
    description: DESC,
    icon: COVER,
    favicon: `${SITE}/logo-vertical.jpg`,
    authors: [{ name: AUTHOR }],
    language: LANG,
    items: items.slice(0, 100).map((r) => {
      const media = bestMediaUrl(r);
      return {
        id: r.video_id,
        url: watchUrl(r),
        title: r.title || 'Untitled',
        summary: r.title || '',
        image: thumbUrl(r),
        date_published: iso(r),
        attachments: media ? [{
          url: media,
          mime_type: 'video/mp4',
          size_in_bytes: r.size_bytes || 0,
          duration_in_seconds: Math.trunc(r.duration_sec || 0),
        }] : [],
      };
    }),
  };
  return JSON.stringify(out, null, 2);
}

function makeSitemap(items) {
  const now = new Date().toISOString().slice(0, 10);
  const urls = [`<url><loc>${SITE}/</loc><lastmod>${now}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>`];
  for (const r of items) {
    urls.push(`<url><loc>${xmlEscape(watchUrl(r))}</loc>`
      + `<lastmod>${iso(r).slice(0, 10)}</lastmod>`
      + '<changefreq>monthly</changefreq><priority>0.8</priority></url>');
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;
}

/** Generate all four feeds. Returns the number of items written. */
export function generateFeeds({ root = ROOT, out } = {}) {
  const items = loadRecordings(root);
  const dir = out || process.env.FEEDS_OUT || resolve(root, 'dashboard/public');
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'feed.xml'), makeRss(items, false));
  writeFileSync(resolve(dir, 'podcast.xml'), makeRss(items, true));
  writeFileSync(resolve(dir, 'feed.json'), makeJsonFeed(items));
  writeFileSync(resolve(dir, 'sitemap.xml'), makeSitemap(items));
  return items.length;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const flag = process.argv.indexOf('--out');
  const out = flag > -1 ? process.argv[flag + 1] : undefined;
  try {
    const n = generateFeeds({ out });
    console.log(`generate-feeds.mjs: ${n} recordings -> ${out || process.env.FEEDS_OUT || 'dashboard/public'}`);
  } catch (err) {
    // A build must not fail because data is temporarily unreadable; the
    // committed feeds stay in place and the next build refreshes them.
    console.warn(`generate-feeds.mjs: skipped (${err.message})`);
    process.exit(0);
  }
}
