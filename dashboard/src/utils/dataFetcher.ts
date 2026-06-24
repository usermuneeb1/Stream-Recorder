// ───────────────────────────────────────────────────────────────────────────
// dataFetcher.ts — FIXED VERSION
//
// Fixes applied:
//   #4  fetchFirst() now try-parses JSON; falls through to the next mirror on
//       malformed responses (jsDelivr 200-OK stub HTML page).
//   #5  dedupAndMerge() now keeps the HIGHEST resolution, not the lowest.
//
// Drop-in replacement for dashboard/src/utils/dataFetcher.ts.
// ───────────────────────────────────────────────────────────────────────────

export interface Chapter { time: number; label: string }

export interface Storyboard {
  url: string;       // sprite-sheet JPEG (Catbox)
  vtt: string;       // WebVTT cues pointing into the sprite
  interval?: number;
  cols?: number;
  rows?: number;
  n_frames?: number;
  w?: number;
  h?: number;
}

export interface Recording {
  videoId: string;
  title: string;
  channel: string;
  date: string;
  recordedAt: string;
  videoUrl: string;
  durationSec: number;
  durationFmt: string;
  sizeHuman: string;
  sizeGb: number;
  resolution: string;
  thumbnail: string;
  archiveLink: string;
  archiveDirect: string;
  archiveNode: string;
  megaLink: string;
  pixeldrainLink: string;
  gofileLink: string;
  githubRelease: string;
  githubDirect: string;
  telegramLink: string;
  cfStream: string;
  youtubeUnlisted: string;
  youtubeId: string;
  aiChapters: Chapter[];
  aiEnrichedAt: string;
  transcriptUrl: string;
  chatUrl: string;
  storyboard?: Storyboard;
}

const SOURCES = [
  'https://cdn.jsdelivr.net/gh/usermuneeb1/Stream-Recorder@main',
  'https://raw.githubusercontent.com/usermuneeb1/Stream-Recorder/main',
];

// ── #4 fix: try-parse JSON inside fetchFirst, fall through on bad payloads ──
async function fetchFirstJson<T = unknown>(path: string): Promise<T | null> {
  for (const base of SOURCES) {
    try {
      const r = await fetch(`${base}/${path}?_=${Date.now()}`);
      if (!r.ok) continue;
      const txt = await r.text();
      // jsDelivr sometimes serves a stub HTML page with 200 during propagation;
      // detect non-JSON early so we fall through to raw.githubusercontent.
      if (!txt || txt.trimStart().startsWith('<')) continue;
      try {
        return JSON.parse(txt) as T;
      } catch {
        // malformed JSON — try the next mirror
        continue;
      }
    } catch {
      // network/DNS — try next
    }
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

function thumb(_id: string, _t?: string): string {
  // Per user request — ALL cards use the local /thumbnail.jpg lantern image
  // for a consistent branded look (instead of per-video YouTube thumbnails
  // which vary in quality, sometimes 404, and burn ytimg bandwidth).
  // The file lives at dashboard/public/thumbnail.jpg and is served from
  // Vercel's edge CDN — same speed for every card, every visit.
  return '/thumbnail.jpg';
}

function sanitizeCfStream(raw: string): string {
  if (!raw) return '';
  try {
    const u = new URL(raw);
    if (u.searchParams.has('bot')) return '';
    if (u.searchParams.has('url')) return '';
    return u.toString();
  } catch {
    return '';
  }
}

// ── #5 fix: compare resolutions by *height*, keep the larger one ──
function resHeight(res: string): number {
  if (!res) return 0;
  const m = res.match(/(\d{3,4})\s*[xp]/i) || res.match(/^(\d{3,4})$/);
  return m ? parseInt(m[1], 10) : 0;
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
    const merged: any = { ...ex };
    const fields: (keyof Recording)[] = [
      'archiveDirect','archiveNode','archiveLink','megaLink','pixeldrainLink',
      'gofileLink','githubRelease','githubDirect','transcriptUrl','chatUrl',
      'telegramLink','cfStream','youtubeUnlisted','youtubeId','aiEnrichedAt',
    ];
    for (const f of fields) if (!merged[f] && (r as any)[f]) merged[f] = (r as any)[f];
    if (!merged.aiChapters?.length && r.aiChapters?.length) merged.aiChapters = r.aiChapters;
    if (!merged.storyboard && r.storyboard) merged.storyboard = r.storyboard;
    // Thumbnails are all /thumbnail.jpg now (set by thumb() above) so no
    // merge preference needed — they're identical strings. Skip the
    // comparison entirely.
    // #5 — always upgrade to the highest resolution available
    if (resHeight(r.resolution) > resHeight(merged.resolution)) merged.resolution = r.resolution;
    // Same for duration — keep the longest (most-complete) recording
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
      videoId:        r.video_id || '',
      title:          cleanTitle(r.title || ''),
      channel:        r.channel || '',
      date:           r.date || '',
      recordedAt:     r.recorded_at || '',
      videoUrl:       r.video_url || '',
      durationSec:    r.duration_sec || 0,
      durationFmt:    fmtDuration(r.duration_fmt || ''),
      sizeHuman:      r.size_human || '',
      sizeGb:         r.size_gb || 0,
      resolution:     r.resolution || '',
      thumbnail:      thumb('', r.thumbnail),
      archiveLink:    r.archive_link || '',
      archiveDirect:  r.archive_direct || '',
      archiveNode:    r.archive_node || '',
      megaLink:       r.mega_link || '',
      pixeldrainLink: r.pixeldrain_link || '',
      gofileLink:     r.gofile_link || '',
      githubRelease:  r.github_release || '',
      githubDirect:   r.github_direct || '',
      telegramLink:   r.telegram_link || '',
      cfStream:       sanitizeCfStream(r.cf_stream || ''),
      youtubeUnlisted:r.youtube_unlisted || '',
      youtubeId:      r.youtube_id || '',
      aiChapters:     Array.isArray(r.ai_chapters) ? r.ai_chapters : [],
      aiEnrichedAt:   r.ai_enriched_at || '',
      transcriptUrl:  r.transcript_url || '',
      chatUrl:        r.chat_url || '',
      storyboard:     r.storyboard && r.storyboard.url && r.storyboard.vtt
        ? {
            url: r.storyboard.url,
            vtt: r.storyboard.vtt,
            interval: r.storyboard.interval,
            cols: r.storyboard.cols,
            rows: r.storyboard.rows,
            n_frames: r.storyboard.n_frames,
            w: r.storyboard.w,
            h: r.storyboard.h,
          }
        : undefined,
    }));
  return dedupAndMerge(mapped).sort((a, b) => b.date.localeCompare(a.date));
}

export interface SystemStatus {
  updatedAt: string;
  recordingsTotal: number;
  totalSizeGb: number;
  totalHours: number;
  ytSubscribers: string;
  ytViews: string;
  ytVideos: number;
  ok: boolean;
}

export async function fetchStatus(): Promise<SystemStatus | null> {
  const j = await fetchFirstJson<any>('data/system-status.json');
  if (!j) return null;
  const updated = new Date(j.updated_at || 0).getTime();
  const ageH = (Date.now() - updated) / 3.6e6;
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
