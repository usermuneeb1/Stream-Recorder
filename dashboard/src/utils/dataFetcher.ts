// ── Data Types ───────────────────────────────────────────────────────────────

export interface Recording {
  videoId: string;
  title: string;
  channel: string;
  date: string;
  videoUrl: string;
  durationSec: number;
  durationFmt: string;
  sizeHuman: string;
  sizeGb: number;
  resolution: string;
  thumbnail: string;

  // Sources
  archiveLink?: string;
  archiveDirect?: string;
  archiveNode?: string;
  megaLink?: string;
  pixeldrainLink?: string;
  gofileLink?: string;
  githubRelease?: string;
  githubDirect?: string;
  gdriveLink?: string;
  telegramLink?: string;
  r2Link?: string;

  // AI
  aiChapters?: { time: number; label: string }[];
  transcriptUrl?: string;
  chatUrl?: string;
  clips?: { label: string; url: string; type: string; start_sec: number; duration_sec: number; size_mb: number }[];
}

export interface Stats {
  totalStreams: number;
  totalHours: number;
  totalGb: number;
}

// ── Fetch ────────────────────────────────────────────────────────────────────

const CDN = 'https://cdn.jsdelivr.net/gh/usermuneeb1/Stream-Recorder@main';
const RAW = 'https://raw.githubusercontent.com/usermuneeb1/Stream-Recorder/main';

async function fetchFile(path: string): Promise<string | null> {
  for (const base of [CDN, RAW]) {
    try {
      const res = await fetch(`${base}/${path}?t=${Date.now()}`);
      if (res.ok) return await res.text();
    } catch { /* next */ }
  }
  return null;
}

function cleanTitle(t: string): string {
  return (t || '')
    .replace(/\s+\d{4}-\d{2}-\d{2}(?:\s+\d{1,2}:\d{2})?\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function fmtDuration(fmt: string): string {
  if (!fmt) return '';
  const p = fmt.split(':');
  if (p.length === 3) return `${parseInt(p[0])}h ${parseInt(p[1])}m`;
  return fmt;
}

function thumbUrl(videoId: string, thumb?: string): string {
  if (thumb && thumb.startsWith('http')) return thumb;
  // YouTube thumbnail
  const ytId = videoId?.match?.(/^[a-zA-Z0-9_-]{11}$/);
  if (ytId) return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  return '/thumbnail.jpg';
}

// ── Deduplicate: keep only the entry with the most links per YouTube video ID ─
function dedup(recs: Recording[]): Recording[] {
  const map = new Map<string, Recording>();
  for (const r of recs) {
    // Derive YouTube video ID from videoUrl if the videoId is an archive identifier
    const ytMatch = r.videoUrl?.match?.(/(?:v=|\/)([\w-]{11})/);
    const key = ytMatch ? ytMatch[1] : r.videoId;

    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...r, videoId: key });
    } else {
      // Merge: keep whichever has more links / better data
      const merged = { ...existing };
      if (!merged.archiveDirect && r.archiveDirect) merged.archiveDirect = r.archiveDirect;
      if (!merged.archiveNode && r.archiveNode) merged.archiveNode = r.archiveNode;
      if (!merged.archiveLink && r.archiveLink) merged.archiveLink = r.archiveLink;
      if (!merged.megaLink && r.megaLink) merged.megaLink = r.megaLink;
      if (!merged.pixeldrainLink && r.pixeldrainLink) merged.pixeldrainLink = r.pixeldrainLink;
      if (!merged.gofileLink && r.gofileLink) merged.gofileLink = r.gofileLink;
      if (!merged.githubRelease && r.githubRelease) merged.githubRelease = r.githubRelease;
      if (!merged.githubDirect && r.githubDirect) merged.githubDirect = r.githubDirect;
      if (!merged.aiChapters?.length && r.aiChapters?.length) merged.aiChapters = r.aiChapters;
      if (!merged.transcriptUrl && r.transcriptUrl) merged.transcriptUrl = r.transcriptUrl;
      if (!merged.thumbnail?.startsWith('http') && r.thumbnail?.startsWith('http')) merged.thumbnail = r.thumbnail;
      map.set(key, merged);
    }
  }
  return Array.from(map.values());
}

export async function fetchRecordings(): Promise<Recording[]> {
  const text = await fetchFile('data/recordings.json');
  if (!text) return [];
  try {
    const raw: any[] = JSON.parse(text);
    const recs: Recording[] = raw
      .filter((r: any) => (r.channel || '').toLowerCase().includes('muslim lantern'))
      .map((r: any) => ({
        videoId: r.video_id || '',
        title: cleanTitle(r.title || ''),
        channel: r.channel || '',
        date: r.date || '',
        videoUrl: r.video_url || '',
        durationSec: r.duration_sec || 0,
        durationFmt: fmtDuration(r.duration_fmt || ''),
        sizeHuman: r.size_human || '',
        sizeGb: r.size_gb || 0,
        resolution: r.resolution || '',
        thumbnail: thumbUrl(r.video_id, r.thumbnail),
        archiveLink: r.archive_link || '',
        archiveDirect: r.archive_direct || '',
        archiveNode: r.archive_node || '',
        megaLink: r.mega_link || '',
        pixeldrainLink: r.pixeldrain_link || '',
        gofileLink: r.gofile_link || '',
        githubRelease: r.github_release || '',
        githubDirect: r.github_direct || '',
        gdriveLink: r.gdrive_link || '',
        telegramLink: r.telegram_link || '',
        r2Link: r.r2_link || '',
        aiChapters: r.ai_chapters || [],
        transcriptUrl: r.transcript_url || '',
        chatUrl: r.chat_url || '',
        clips: r.clips || [],
      }));
    return dedup(recs).sort((a, b) => b.date.localeCompare(a.date));
  } catch {
    return [];
  }
}

export async function fetchStats(): Promise<Stats> {
  const text = await fetchFile('stats.json');
  if (!text) return { totalStreams: 0, totalHours: 0, totalGb: 0 };
  try {
    const s = JSON.parse(text);
    return {
      totalStreams: s.total_streams || 0,
      totalHours: Math.round((s.total_hours || 0) * 10) / 10,
      totalGb: Math.round((s.total_gb || 0) * 10) / 10,
    };
  } catch {
    return { totalStreams: 0, totalHours: 0, totalGb: 0 };
  }
}
