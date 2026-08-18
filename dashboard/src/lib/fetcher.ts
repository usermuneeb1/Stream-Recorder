// Data fetcher — pulls the archive index from the GitHub-backed CDN with
// mirror failover, normalizes snake_case records, merges duplicates, and
// keeps the best resolution / longest duration per stream.

import type { Chapter, Recording, StreamPrediction, Storyboard, SystemStatus, YTVideo } from '../types';

const SOURCES = [
  'https://cdn.jsdelivr.net/gh/usermuneeb1/Stream-Recorder@main',
  'https://raw.githubusercontent.com/usermuneeb1/Stream-Recorder/main',
];

export interface ChatMessage {
  t: number;          // seconds into the stream
  a: string;          // author
  m: string;          // message
  p?: string;         // superchat amount ("US$5.00")
  k?: 'super' | 'member';
}

/** Archived live-chat replay for a recording (data/chat/<id>.json on CDN). */
export async function fetchChat(videoId: string): Promise<{ demo?: boolean; messages: ChatMessage[] } | null> {
  for (const base of SOURCES) {
    try {
      const r = await fetch(`${base}/data/chat/${videoId}.json`);
      if (!r.ok) continue;
      const j = await r.json();
      if (Array.isArray(j?.messages) && j.messages.length) return j;
    } catch { /* next mirror */ }
  }
  return null;
}

async function fetchFirstJson<T = unknown>(path: string): Promise<T | null> {
  for (const base of SOURCES) {
    try {
      const r = await fetch(`${base}/${path}?_=${Date.now()}`);
      if (!r.ok) continue;
      const txt = await r.text();
      // jsDelivr sometimes serves a stub HTML page with 200 during
      // propagation — detect non-JSON early and fall through.
      if (!txt || txt.trimStart().startsWith('<')) continue;
      try {
        return JSON.parse(txt) as T;
      } catch { continue; }
    } catch { /* network / DNS — next mirror */ }
  }
  return null;
}

function cleanTitle(t: string): string {
  return (t || '')
    .replace(/\s+\d{4}-\d{2}-\d{2}(?:\s+\d{1,2}:\d{2})?\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function fmtDuration(f: string): string {
  if (!f) return '';
  const p = f.split(':');
  if (p.length === 3) {
    const h = parseInt(p[0]); const m = parseInt(p[1]);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }
  return f;
}

function thumb(t?: string): string {
  // Real per-episode artwork when the archive mirror is alive; every <img>
  // in the UI carries an onError fallback to the branded /thumbnail.jpg.
  return t && /^https?:\/\//.test(t) ? t : '/thumbnail.jpg';
}

function sanitizeCfStream(raw: string): string {
  if (!raw) return '';
  try {
    const u = new URL(raw);
    if (u.searchParams.has('bot')) return '';  // expired worker links
    if (u.searchParams.has('url')) return '';
    return u.toString();
  } catch { return ''; }
}

function resHeight(res: string): number {
  if (!res) return 0;
  const m = res.match(/(\d{3,4})\s*[xp]/i) || res.match(/^(\d{3,4})$/);
  return m ? parseInt(m[1], 10) : 0;
}

function mapChapters(raw: unknown): Chapter[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const ch = raw
    .filter((c: any) => c && typeof c.time === 'number' && typeof c.label === 'string')
    .map((c: any) => ({ time: c.time, label: String(c.label).trim() }))
    .filter((c: Chapter) => c.label)
    .sort((a: Chapter, b: Chapter) => a.time - b.time);
  return ch.length ? ch : undefined;
}

function mapStoryboard(s: any): Storyboard | undefined {
  return s && s.url && s.vtt
    ? {
        url: s.url, vtt: s.vtt,
        interval: s.interval, cols: s.cols, rows: s.rows,
        n_frames: s.n_frames, w: s.w, h: s.h,
      }
    : undefined;
}

function dedupAndMerge(records: Recording[]): Recording[] {
  const map = new Map<string, Recording>();
  for (const r of records) {
    const m = r.videoUrl?.match?.(/(?:v=|\/)([\w-]{11})/);
    const ytId = m ? m[1] : '';
    if (!ytId) continue;

    const ex = map.get(ytId);
    if (!ex) {
      map.set(ytId, { ...r, videoId: ytId });
      continue;
    }
    const merged: Recording = { ...ex };
    const fields: (keyof Recording)[] = [
      'archiveDirect', 'archiveNode', 'archiveLink', 'megaLink', 'pixeldrainLink',
      'gofileLink', 'githubRelease', 'githubDirect',
      'telegramLink', 'cfStream', 'chatUrl', 'youtubeUnlisted', 'youtubeId', 'transcriptUrl',
    ];
    for (const f of fields) if (!merged[f] && r[f]) merged[f] = r[f] as never;
    if (!merged.storyboard && r.storyboard) merged.storyboard = r.storyboard;
    if (!merged.chapters && r.chapters) merged.chapters = r.chapters;
    if (resHeight(r.resolution) > resHeight(merged.resolution)) merged.resolution = r.resolution;
    if ((r.durationSec || 0) > (merged.durationSec || 0)) {
      merged.durationSec = r.durationSec;
      merged.durationFmt = r.durationFmt;
      merged.sizeHuman = r.sizeHuman || merged.sizeHuman;
      merged.sizeGb = r.sizeGb || merged.sizeGb;
    }
    map.set(ytId, merged);
  }
  return [...map.values()];
}

export async function fetchRecordings(): Promise<Recording[]> {
  const raw = await fetchFirstJson<any[]>('data/recordings.json');
  if (!raw || !Array.isArray(raw)) return [];

  const mapped: Recording[] = raw
    .filter(r => (r.channel || '').toLowerCase().includes('muslim lantern'))
    .map(r => ({
      videoId:         r.video_id || '',
      title:           cleanTitle(r.title || ''),
      channel:         r.channel || '',
      date:            r.date || '',
      recordedAt:      r.recorded_at || '',
      videoUrl:        r.video_url || '',
      durationSec:     r.duration_sec || 0,
      durationFmt:     fmtDuration(r.duration_fmt || ''),
      sizeHuman:       r.size_human || '',
      sizeGb:          r.size_gb || 0,
      resolution:      r.resolution || '',
      thumbnail:       thumb(r.thumbnail),
      archiveLink:     r.archive_link || '',
      archiveDirect:   r.archive_direct || '',
      archiveNode:     r.archive_node || '',
      megaLink:        r.mega_link || '',
      pixeldrainLink:  r.pixeldrain_link || '',
      gofileLink:      r.gofile_link || '',
      githubRelease:   r.github_release || '',
      githubDirect:    r.github_direct || '',
      telegramLink:    r.telegram_link || '',
      cfStream:        sanitizeCfStream(r.cf_stream || ''),
      chatUrl:         r.chat_url || '',
      youtubeUnlisted: r.youtube_unlisted || '',
      youtubeId:       r.youtube_id || '',
      storyboard:      mapStoryboard(r.storyboard),
      chapters:        mapChapters(r.ai_chapters),
      transcriptUrl:   r.transcript_url || '',
    }));

  return dedupAndMerge(mapped).sort((a, b) => b.date.localeCompare(a.date));
}

export async function fetchStatus(): Promise<SystemStatus | null> {
  const j = await fetchFirstJson<any>('data/system-status.json');
  if (!j) return null;
  const ageH = (Date.now() - new Date(j.updated_at || 0).getTime()) / 3.6e6;
  return {
    updatedAt:        j.updated_at || '',
    recordingsTotal:  j.recordings_total || 0,
    totalSizeGb:      j.total_size_gb || 0,
    totalHours:       j.total_hours || 0,
    ytSubscribers:    j.youtube?.subscribers || '',
    ytViews:          j.youtube?.views || '',
    ytVideos:         j.youtube?.videos || 0,
    ok:               ageH < 48,
  };
}

export async function fetchPrediction(): Promise<StreamPrediction | null> {
  const j = await fetchFirstJson<any>('data/predicted-schedule.json');
  if (!j) return null;
  return {
    peakDays:     Array.isArray(j.peak_days) ? j.peak_days : [],
    peakHoursPkt: Array.isArray(j.peak_hours_pkt) ? j.peak_hours_pkt : [],
    avgGapDays:   typeof j.avg_gap_days === 'number' ? j.avg_gap_days : 0,
  };
}

/** Latest channel videos and shorts — live endpoint first, bundled snapshot fallback. */
export async function fetchYouTubeFeed(): Promise<{ videos: YTVideo[]; shorts: YTVideo[] }> {
  const parse = (j: any): YTVideo[] =>
    Array.isArray(j?.videos)
      ? j.videos.filter((v: any) => v && typeof v.videoId === 'string' && v.videoId)
      : [];
  const parseShorts = (j: any): YTVideo[] =>
    Array.isArray(j?.shorts)
      ? j.shorts.filter((v: any) => v && typeof v.videoId === 'string' && v.videoId)
      : [];

  try {
    const r = await fetch('/api/ytfed');
    if (r.ok) {
      const j = await r.json();
      const vids = parse(j);
      if (vids.length) return { videos: vids, shorts: parseShorts(j) };
    }
  } catch { /* local preview has no serverless functions */ }

  try {
    const r = await fetch('/yt-feed.json');
    if (r.ok) {
      const j = await r.json();
      return { videos: parse(j), shorts: parseShorts(j) };
    }
  } catch { /* offline */ }

  return { videos: [], shorts: [] };
}

/** The channel's FULL uploads list (~every video, not just the 15 RSS shows).
 *  Live scraper endpoint first, bundled snapshot fallback, RSS as last resort. */
export async function fetchAllYouTube(): Promise<YTVideo[]> {
  const parse = (j: any): YTVideo[] =>
    Array.isArray(j?.videos)
      ? j.videos.filter((v: any) => v && typeof v.videoId === 'string' && v.videoId && v.title)
      : [];

  try {
    const r = await fetch('/api/ytall');
    if (r.ok) {
      const vids = parse(await r.json());
      if (vids.length) return vids;
    }
  } catch { /* local preview has no serverless functions */ }

  try {
    const r = await fetch('/yt-all.json');
    if (r.ok) {
      const vids = parse(await r.json());
      if (vids.length) return vids;
    }
  } catch { /* offline */ }

  return (await fetchYouTubeFeed()).videos;   // 15 newest via RSS
}
