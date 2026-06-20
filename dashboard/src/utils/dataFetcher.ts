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
  aiChapters?: { time: number; label: string }[];
  transcriptUrl?: string;
  chatUrl?: string;
}

const _S = [
  atob('aHR0cHM6Ly9jZG4uanNkZWxpdnIubmV0L2doL3VzZXJtdW5lZWIxL1N0cmVhbS1SZWNvcmRlckBtYWlu'),
  atob('aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3VzZXJtdW5lZWIxL1N0cmVhbS1SZWNvcmRlci9tYWlu'),
];

async function _f(path: string): Promise<string | null> {
  for (const b of _S) {
    try { const r = await fetch(`${b}/${path}?_=${Date.now()}`); if (r.ok) return await r.text(); } catch {}
  }
  return null;
}

function cleanTitle(t: string): string {
  return (t || '').replace(/\s+\d{4}-\d{2}-\d{2}(?:\s+\d{1,2}:\d{2})?\s*$/g, '').replace(/\s{2,}/g, ' ').trim();
}

function fmtDuration(fmt: string): string {
  if (!fmt) return '';
  const p = fmt.split(':');
  if (p.length === 3) return `${parseInt(p[0])}h ${parseInt(p[1])}m`;
  return fmt;
}

function thumbUrl(videoId: string, thumb?: string): string {
  if (thumb && thumb.startsWith('http')) return thumb;
  if (videoId?.match?.(/^[a-zA-Z0-9_-]{11}$/)) return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  return '/thumbnail.jpg';
}

function dedup(recs: Recording[]): Recording[] {
  const map = new Map<string, Recording>();
  for (const r of recs) {
    const ytMatch = r.videoUrl?.match?.(/(?:v=|\/)([\w-]{11})/);
    const key = ytMatch ? ytMatch[1] : r.videoId;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...r, videoId: key });
    } else {
      const m = { ...existing };
      for (const k of ['archiveDirect','archiveNode','archiveLink','megaLink','pixeldrainLink','gofileLink','githubRelease','githubDirect','transcriptUrl','chatUrl'] as const) {
        if (!m[k] && r[k]) (m as any)[k] = r[k];
      }
      if (!m.aiChapters?.length && r.aiChapters?.length) m.aiChapters = r.aiChapters;
      if (!m.thumbnail?.startsWith('http') && r.thumbnail?.startsWith('http')) m.thumbnail = r.thumbnail;
      map.set(key, m);
    }
  }
  return Array.from(map.values());
}

export async function fetchRecordings(): Promise<Recording[]> {
  const text = await _f('data/recordings.json');
  if (!text) return [];
  try {
    const raw: any[] = JSON.parse(text);
    return dedup(
      raw
        .filter((r: any) => (r.channel || '').toLowerCase().includes('muslim lantern'))
        .map((r: any): Recording => ({
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
        }))
    ).sort((a, b) => b.date.localeCompare(a.date));
  } catch { return []; }
}
