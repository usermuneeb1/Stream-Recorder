import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * API endpoint to check if The Muslim Lantern is currently live on YouTube.
 * Uses YouTube RSS feed (free, no API key required) to detect active live streams.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const CHANNEL_ID = 'UC5gkByQmQ1wQKZqQZqZqZq'; // The Muslim Lantern channel ID
    const RSS_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;

    // Fetch RSS feed
    const response = await fetch(RSS_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MuslimLanternArchive/1.0)',
      },
    });

    if (!response.ok) {
      return res.status(200).json({ isLive: false });
    }

    const xml = await response.text();

    // Check for live broadcast indicators in RSS
    // YouTube adds <yt:liveBroadcast> element for live videos
    const isLive = xml.includes('<yt:liveBroadcast>true</yt:liveBroadcast>') ||
                   xml.includes('isLive="true"');

    // Try to extract live video info
    let title = '';
    let videoId = '';

    if (isLive) {
      const titleMatch = xml.match(/<title>([^<]+)<\/title>/);
      const videoIdMatch = xml.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);

      if (titleMatch) title = titleMatch[1];
      if (videoIdMatch) videoId = videoIdMatch[1];
    }

    return res.status(200).json({
      isLive,
      title: title || undefined,
      videoId: videoId || undefined,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Live status check error:', error);
    return res.status(200).json({ isLive: false, error: 'Failed to check live status' });
  }
}
