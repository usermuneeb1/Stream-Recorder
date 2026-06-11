export interface StreamSource {
  label: string;
  url: string;
  type: 'archive' | 'mega' | 'pixeldrain' | 'gofile' | 'odysee' | 'rumble';
}

export interface StreamData {
  videoId: string;
  title: string;
  channel: string;
  date: string;
  url: string;
  duration: string;
  size: string;
  thumbnail: string;
  archiveId?: string;
  chatUrl?: string;
  sources: Record<string, StreamSource>;
}

export interface StatsData {
  total_streams: number;
  total_hours: number;
  total_gb: number;
  sources?: {
    mega?: number;
    archive?: number;
    pixel?: number;
    pixeldrain?: number;
    gofile?: number;
  };
}

const RAW_URL = 'https://raw.githubusercontent.com/usermuneeb1/Stream-Recorder/main';
const CHANNEL = 'the muslim lantern';

// ── In-memory cache to prevent redundant network requests ──
let _cache: StreamData[] | null = null;
let _cacheTime = 0;
const CACHE_TTL = 60_000; // 1 minute

function isTML(ch?: string) {
  return (ch || '').toLowerCase().includes(CHANNEL);
}

function ytId(u?: string) {
  const m = (u || '').match(/(?:v=|\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : '';
}

function fallbackThumbnail(_id: string, customThumb?: string) {
  // Public UI default: use the repo-hosted thumbnail so Home, Gallery, and
  // Watch recommendations stay consistent and do not depend on YouTube/Archive
  // thumbnail availability. Admin overrides can still provide a custom image.
  return customThumb || `${import.meta.env.BASE_URL}thumbnail.jpg`;
}

function cleanTitle(title: string): string {
  return (title || '')
    .replace(/\s+\d{4}-\d{2}-\d{2}(?:\s+\d{1,2}:\d{2})?\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function buildSources(links: any) {
  const s: Record<string, StreamSource> = {};
  if (links.archive_hd) s.archive = { label: '🏛️ Archive.org', url: links.archive_hd, type: 'archive' };
  if (links.mega_hd || links.mega_compressed) s.mega = { label: '🔴 MEGA.nz', url: links.mega_hd || links.mega_compressed, type: 'mega' };
  if (links.pixeldrain_hd || links.pixeldrain_compressed) s.pixel = { label: '🟣 Pixeldrain', url: links.pixeldrain_hd || links.pixeldrain_compressed, type: 'pixeldrain' };
  if (links.gofile_hd || links.gofile_compressed) s.gofile = { label: '📁 Gofile', url: links.gofile_hd || links.gofile_compressed, type: 'gofile' };
  if (links.archive_compressed) s.archiveSmall = { label: '📱 Archive (small)', url: links.archive_compressed, type: 'archive' };
  
  // Permanent Web3 / Decentralized / Alternative Providers
  if (links.odysee_hd || links.odysee_compressed) s.odysee = { label: '🪐 Odysee (Permanent)', url: links.odysee_hd || links.odysee_compressed, type: 'odysee' };
  if (links.rumble_hd || links.rumble_compressed) s.rumble = { label: '🟢 Rumble', url: links.rumble_hd || links.rumble_compressed, type: 'rumble' };
  
  return s;
}

function parseLinks(text: string): StreamData[] {
  const out: StreamData[] = [];
  for (const block of text.split(/={10,}/)) {
    const b = block.trim();
    if (!b || b.startsWith('#')) continue;
    const get = (k: string) => {
      const m = b.match(new RegExp(`^${k}:\\s*(.+)$`, 'im'));
      return m ? m[1].trim() : '';
    };
    if (!isTML(get('Channel'))) continue;
    const url = get('URL');
    if (!url.includes('youtube')) continue;
    const links: any = {};
    for (const line of b.split('\n')) {
      const lm = line.match(/^\[(\w+):([^\]]+)\]\s+(https?\S+)/);
      if (lm) links[`${lm[1]}_${lm[2]}`.toLowerCase()] = lm[3].replace(/\s+\(PERMANENT\)$/, '');
    }
    const vid = ytId(url);
    
    const sources = buildSources(links);
    
    const archiveUrl = links.archive_hd || links.archive_compressed;
    let archiveId = undefined;
    if (archiveUrl) {
      archiveId = archiveUrl.split('/details/')[1]?.split('/')[0];
    }
    
    const customThumb = get('Thumbnail');

    out.push({
      videoId: vid,
      title: cleanTitle(get('Title')),
      channel: get('Channel'),
      date: formatDate(get('Date')),
      url,
      duration: formatDuration(get('Duration')),
      size: formatSize(get('Size')),
      thumbnail: fallbackThumbnail(vid, customThumb),
      archiveId: archiveId,
      chatUrl: '',
      sources: sources
    });
  }
  return out;
}

function formatDuration(fmt: string): string {
  if (!fmt) return '';
  const parts = fmt.split(':');
  if (parts.length === 3) {
    const [h, m] = parts;
    return `${parseInt(h)}h ${parseInt(m)}m`;
  }
  return fmt;
}

function formatSize(size: string): string {
  if (!size) return '';
  // Match "461.5M", "461.5 M", "461.5MB", "461.5 MB" etc.
  const mbMatch = size.match(/([\d.]+)\s*M(?:B)?/i);
  if (mbMatch) {
    return `${Math.round(parseFloat(mbMatch[1]))} MB`;
  }
  // Match "1.24G", "1.24 G", "1.24GB", "1.24 GB" etc.
  const gbMatch = size.match(/([\d.]+)\s*G(?:B)?/i);
  if (gbMatch) {
    return `${parseFloat(gbMatch[1]).toFixed(1)} GB`;
  }
  return size;
}

function formatDate(date: string): string {
  if (!date) return '';
  
  // Handle ISO format: "2026-05-17" or "2026-05-17 04:45:53 AM PKT"
  const isoMatch = date.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) {
    return isoMatch[1];
  }
  
  // Handle human format: "April 25, 2026" or "May 11, 2026"
  const humanMatch = date.match(/^([A-Za-z]+\s+\d{1,2},?\s+\d{4})/);
  if (humanMatch) {
    // Normalize to YYYY-MM-DD for consistent sorting
    try {
      const d = new Date(humanMatch[1]);
      if (!isNaN(d.getTime())) {
        return d.toISOString().split('T')[0];
      }
    } catch {
      // fallback
    }
    return humanMatch[1];
  }
  
  // Fallback: return as-is
  return date.trim();
}

function mergeData(list: StreamData[], recs: any[]): StreamData[] {
  const map: Record<string, StreamData> = {};
  list.forEach(s => { map[s.videoId] = s; });

  for (const r of recs || []) {
    if (!isTML(r.channel)) continue;
    const id = r.video_id || ytId(r.video_url);
    if (!id) continue;
    
    // Skip exact duplicates (same archive link already seen)
    if (map[id] && r.archive_link && map[id].sources.archive?.url === r.archive_link) {
      continue;
    }
    
    const s = map[id] || {
      videoId: id,
      title: cleanTitle(r.title || ''),
      channel: r.channel,
      date: formatDate(r.date),
      url: r.video_url,
      duration: formatDuration(r.duration_fmt),
      size: formatSize(r.size_human),
      thumbnail: fallbackThumbnail(id, r.thumbnail),
      archiveId: undefined,
      chatUrl: r.chat_url || '',
      sources: {}
    };

    // Trim titles on merge too
    if (s.title) s.title = cleanTitle(s.title);

    if (r.pixeldrain_link) s.sources.pixel = { label: '🟣 Pixeldrain', url: r.pixeldrain_link, type: 'pixeldrain' };
    if (r.archive_link) {
      s.sources.archive = { label: '🏛️ Archive.org', url: r.archive_link, type: 'archive' };
      if (!s.archiveId) s.archiveId = r.archive_link.split('/details/')[1]?.split('/')[0];
    }
    if (r.mega_link && r.mega_link.includes('mega.nz')) s.sources.mega = { label: '🔴 MEGA.nz', url: r.mega_link, type: 'mega' };
    if (r.gofile_link) s.sources.gofile = { label: '📁 Gofile', url: r.gofile_link, type: 'gofile' };
    
    if (r.chat_url && !s.chatUrl) s.chatUrl = r.chat_url;
    if (!s.size && r.size_human) s.size = formatSize(r.size_human);
    if (!s.duration && r.duration_fmt) s.duration = formatDuration(r.duration_fmt);
    if (!s.date && r.date) s.date = formatDate(r.date);
    
    map[id] = s;
  }
  
  return Object.values(map).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

export async function fetchStreams(): Promise<StreamData[]> {
  // Return cached data if still fresh
  if (_cache && Date.now() - _cacheTime < CACHE_TTL) {
    return _cache;
  }

  let list: StreamData[] = [];
  try {
    const res = await fetch(`${RAW_URL}/links.txt?t=${Date.now()}`);
    const text = await res.text();
    list = parseLinks(text);
  } catch {
    console.warn('Could not parse links.txt');
  }

  try {
    const res = await fetch(`${RAW_URL}/data/recordings.json?t=${Date.now()}`);
    const recs = await res.json();
    list = mergeData(list, recs);
  } catch {
    console.warn('Could not parse recordings.json');
  }

  const result = list.filter(s => isTML(s.channel));
  
  // Cache the result
  _cache = result;
  _cacheTime = Date.now();
  
  return result;
}
