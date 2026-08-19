// Episode metadata — turns flat recordings into a series model:
// chronological episode numbers, monthly seasons, deterministic match %.

import type { Ep, Recording, YTVideo } from '../types';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function enrichRecordings(recs: Recording[], topics: Record<string, string[]> = {}): Ep[] {
  const chrono = [...recs].sort((a, b) => a.date.localeCompare(b.date));
  const epOf = new Map<string, number>();
  chrono.forEach((r, i) => epOf.set(r.videoId, i + 1));

  return recs.map(r => {
    const d = new Date(r.recordedAt || `${r.date}T00:00:00Z`);
    const season = `${MONTHS[d.getUTCMonth()] || ''} ${d.getUTCFullYear()}`.trim();
    return {
      ...r,
      ep: epOf.get(r.videoId) || 0,
      season,
      matchPct: 91 + (hash(r.videoId) % 9),
      isNew: Date.now() - d.getTime() < 14 * 864e5,
      isForced: /forced\s+recording/i.test(r.title || ''),
      topics: topics[r.videoId] || [],
    };
  });
}

/** Channel-feed video → Ep. Plays via the YouTube provider; no archive mirrors. */
export function enrichYouTube(v: YTVideo, isShort = false, topics: Record<string, string[]> = {}): Ep {
  const d = new Date(v.published || 0);
  return {
    videoId: v.videoId,
    title: v.title,
    channel: 'The Muslim Lantern',
    date: (v.published || '').slice(0, 10),
    recordedAt: v.published || '',
    videoUrl: `https://www.youtube.com/watch?v=${v.videoId}`,
    durationSec: 0,
    durationFmt: '',
    sizeHuman: '',
    sizeGb: 0,
    resolution: '',
    thumbnail: v.thumb || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
    archiveLink: '', archiveDirect: '', archiveNode: '',
    megaLink: '', pixeldrainLink: '', gofileLink: '',
    githubRelease: '', githubDirect: '',
    telegramLink: '', cfStream: '',
    youtubeUnlisted: '',
    youtubeId: v.videoId,
    ep: 0,
    season: `${MONTHS[d.getUTCMonth()] || ''} ${d.getUTCFullYear()}`.trim(),
    matchPct: 91 + (hash(v.videoId) % 9),
    isNew: Date.now() - d.getTime() < 14 * 864e5,
    fromYouTube: true,
    isShort,
    viewCount: v.views || 0,
    topics: topics[v.videoId] || [],
  };
}

/** The natural next episode in date-descending order (autoplay target). */
export function nextUp(list: Ep[], currentId: string): Ep | undefined {
  const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date));
  const idx = sorted.findIndex(x => x.videoId === currentId);
  if (idx === -1) return sorted[0];
  return sorted[idx + 1];
}

/** Recordings grouped into monthly seasons, newest season first. */
export function seasons(list: Ep[]): { season: string; recs: Ep[] }[] {
  const map = new Map<string, Ep[]>();
  for (const r of list) {
    const arr = map.get(r.season) || [];
    arr.push(r);
    map.set(r.season, arr);
  }
  return [...map.entries()]
    .map(([season, recs]) => ({ season, recs: recs.sort((a, b) => b.date.localeCompare(a.date)) }))
    .sort((a, b) => b.recs[0].date.localeCompare(a.recs[0].date));
}
