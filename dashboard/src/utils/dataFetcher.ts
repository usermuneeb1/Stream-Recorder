export interface Chapter { time: number; label: string }

export interface Recording {
  videoId: string;
  title: string;
  channel: string;
  date: string;            // YYYY-MM-DD
  recordedAt: string;      // ISO
  videoUrl: string;
  durationSec: number;
  durationFmt: string;     // h:mm:ss
  sizeHuman: string;       // "573.62 MB"
  sizeGb: number;
  resolution: string;      // "1920x1080"
  thumbnail: string;
  // Mirrors (playback)
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
  // Other re-uploads
  youtubeUnlisted: string;
  youtubeId: string;
  // Enrichment
  aiChapters: Chapter[];
  aiEnrichedAt: string;
  transcriptUrl: string;
  chatUrl: string;
}

// ── Mirror sources for recordings.json ─────────────────────────────────────
const SOURCES = [
  'https://cdn.jsdelivr.net/gh/usermuneeb1/Stream-Recorder@main',
  'https://raw.githubusercontent.com/usermuneeb1/Stream-Recorder/main',
];

async function fetchFirst(path: string): Promise<string | null> {
  for (const base of SOURCES) {
    try {
      const r = await fetch(`${base}/${path}?_=${Date.now()}`);
      if (r.ok) return r.text();
    } catch { /* try next mirror */ }
  }
  return null;
}

// Clean trailing "YYYY-MM-DD HH:MM" from titles (yt-dlp adds them to live streams)
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

function thumb(id: string, t?: string): string {
  if (t && t.startsWith('http')) return t;
  if (id && /^[\w-]{11}$/.test(id)) return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  return '/thumbnail.jpg';
}

// ── SECURITY: strip the leaked bot token from cf_stream URLs ──────────────
// Older recordings.json entries contain `?bot=<TELEGRAM_BOT_TOKEN>` in the
// cf_stream URL — a serious credential leak. The dashboard refuses to serve
// any cf_stream URL with the `bot` parameter so a viewer's browser never
// transmits the token. The Cloudflare Worker must be updated to use only
// env.BOT_TOKEN; until then cf_stream is disabled.
function sanitizeCfStream(raw: string): string {
  if (!raw) return '';
  try {
    const u = new URL(raw);
    if (u.searchParams.has('bot')) return ''; // leaked token — refuse
    // Also refuse the legacy ?url= open-proxy form
    if (u.searchParams.has('url')) return '';
    return u.toString();
  } catch {
    return '';
  }
}

function dedupAndMerge(records: Recording[]): Recording[] {
  // Group entries by their YouTube video ID; merge to get the richest record
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
    // Merge: prefer non-empty fields from either
    const merged: any = { ...ex };
    const fields: (keyof Recording)[] = [
      'archiveDirect','archiveNode','archiveLink','megaLink','pixeldrainLink',
      'gofileLink','githubRelease','githubDirect','transcriptUrl','chatUrl',
      'telegramLink','cfStream','youtubeUnlisted','youtubeId','aiEnrichedAt',
    ];
    for (const f of fields) if (!merged[f] && (r as any)[f]) merged[f] = (r as any)[f];
    if (!merged.aiChapters?.length && r.aiChapters?.length) merged.aiChapters = r.aiChapters;
    if (!merged.thumbnail?.startsWith('http') && r.thumbnail?.startsWith('http')) merged.thumbnail = r.thumbnail;
    if (r.resolution?.includes('1080') && !merged.resolution?.includes('1080')) merged.resolution = r.resolution;
    map.set(ytId, merged);
  }
  return [...map.values()];
}

export async function fetchRecordings(): Promise<Recording[]> {
  const txt = await fetchFirst('data/recordings.json');
  if (!txt) return [];
  try {
    const raw = JSON.parse(txt) as any[];
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
        thumbnail:      thumb(r.video_id, r.thumbnail),
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
      }));
    return dedupAndMerge(mapped).sort((a, b) => b.date.localeCompare(a.date));
  } catch {
    return [];
  }
}

// ── System status (footer health badge) ───────────────────────────────────
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
  const txt = await fetchFirst('data/system-status.json');
  if (!txt) return null;
  try {
    const j = JSON.parse(txt);
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
  } catch {
    return null;
  }
}
