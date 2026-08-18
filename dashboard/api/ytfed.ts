import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Latest videos from The Muslim Lantern's YouTube channel, split into
 * long-form and shorts. Uses YouTube's hidden per-type upload playlists
 * (UULF* = videos only, UUSH* = shorts only) via the public RSS feed —
 * no API key. Falls back client-side to the bundled /yt-feed.json snapshot.
 */
const CHANNEL_ID = 'UCeCAQhKbU2ETNWxWxB94HgA'; // The Muslim Lantern

interface FeedVideo {
  videoId: string;
  title: string;
  published: string;
  description: string;
  thumb: string;
  views: number;
}

function parseFeed(xml: string): FeedVideo[] {
  const decode = (s: string) => s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");

  return xml.split('<entry>').slice(1).map(block => {
    const pick = (re: RegExp): string => {
      const m = block.match(re);
      return m ? m[1].trim() : '';
    };
    return {
      videoId: pick(/<yt:videoId>([^<]+)<\/yt:videoId>/),
      title: decode(pick(/<media:title>([^<]*)<\/media:title>/) || pick(/<title>([^<]*)<\/title>/)),
      published: pick(/<published>([^<]+)<\/published>/),
      description: decode(pick(/<media:description>([^<]*)<\/media:description>/)).slice(0, 400),
      thumb: pick(/<media:thumbnail url="([^"]+)"/),
      views: parseInt(pick(/views="(\d+)"/) || '0', 10),
    };
  }).filter(v => v.videoId);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, max-age=1800, s-maxage=1800');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const fetchFeed = async (playlistId: string): Promise<FeedVideo[]> => {
    try {
      const r = await fetch(
        `https://www.youtube.com/feeds/videos.xml?playlist_id=${playlistId}`,
        { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MuslimLanternArchive/1.0)' } },
      );
      if (!r.ok) return [];
      return parseFeed(await r.text());
    } catch {
      return [];
    }
  };

  // UCxxxx → UULFxxxx (videos) / UUSHxxxx (shorts)
  const suffix = CHANNEL_ID.slice(2);
  const [videos, shorts] = await Promise.all([
    fetchFeed(`UULF${suffix}`),
    fetchFeed(`UUSH${suffix}`),
  ]);

  return res.status(200).json({ fetchedAt: new Date().toISOString(), channelId: CHANNEL_ID, videos, shorts });
}
