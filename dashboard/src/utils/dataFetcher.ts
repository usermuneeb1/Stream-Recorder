export interface StreamSource {
  label: string;
  url: string;
  type: 'archive' | 'mega' | 'pixeldrain' | 'gofile';
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
  sources: Record<string, StreamSource>;
}

export interface StatsData {
  total_streams: number;
  total_hours: number;
  total_gb: number;
}

const RAW_URL = 'https://raw.githubusercontent.com/usermuneeb1/Stream-Recorder/main';
const CHANNEL = 'the muslim lantern';

function isTML(ch?: string) {
  return (ch || '').toLowerCase().includes(CHANNEL);
}

function ytId(u?: string) {
  const m = (u || '').match(/(?:v=|\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : '';
}

function buildSources(links: any) {
  const s: Record<string, StreamSource> = {};
  if (links.archive_hd) s.archive = { label: '🏛️ Archive.org', url: links.archive_hd, type: 'archive' };
  if (links.mega_hd || links.mega_compressed) s.mega = { label: '🔴 MEGA.nz', url: links.mega_hd || links.mega_compressed, type: 'mega' };
  if (links.pixeldrain_hd || links.pixeldrain_compressed) s.pixel = { label: '🟣 Pixeldrain', url: links.pixeldrain_hd || links.pixeldrain_compressed, type: 'pixeldrain' };
  if (links.archive_compressed) s.archiveSmall = { label: '📱 Archive (small)', url: links.archive_compressed, type: 'archive' };
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
    out.push({
      videoId: vid,
      title: get('Title'),
      channel: get('Channel'),
      date: get('Date'),
      url,
      duration: get('Duration'),
      size: get('Size'),
      thumbnail: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
      sources: buildSources(links)
    });
  }
  return out;
}

function mergeData(list: StreamData[], recs: any[]): StreamData[] {
  const map: Record<string, StreamData> = {};
  list.forEach(s => { map[s.videoId] = s; });

  for (const r of recs || []) {
    if (!isTML(r.channel)) continue;
    const id = r.video_id || ytId(r.video_url);
    if (!id) continue;
    
    const s = map[id] || {
      videoId: id,
      title: r.title,
      channel: r.channel,
      date: r.date,
      url: r.video_url,
      duration: r.duration_fmt,
      size: r.size_human,
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      sources: {}
    };

    if (r.pixeldrain_link) s.sources.pixel = { label: '🟣 Pixeldrain', url: r.pixeldrain_link, type: 'pixeldrain' };
    if (r.archive_link) s.sources.archive = { label: '🏛️ Archive.org', url: r.archive_link, type: 'archive' };
    if (r.mega_link && r.mega_link.includes('mega.nz')) s.sources.mega = { label: '🔴 MEGA.nz', url: r.mega_link, type: 'mega' };
    
    if (!s.size && r.size_human) s.size = r.size_human;
    if (!s.duration && r.duration_fmt) s.duration = r.duration_fmt;
    
    map[id] = s;
  }
  
  return Object.values(map).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

export async function fetchStats(): Promise<StatsData> {
  try {
    const res = await fetch(`${RAW_URL}/stats.json?t=${Date.now()}`);
    return await res.json();
  } catch (e) {
    return { total_streams: 0, total_hours: 0, total_gb: 0 };
  }
}

export async function fetchStreams(): Promise<StreamData[]> {
  let list: StreamData[] = [];
  try {
    const res = await fetch(`${RAW_URL}/links.txt?t=${Date.now()}`);
    const text = await res.text();
    list = parseLinks(text);
  } catch (e) {
    console.warn('Could not parse links.txt');
  }

  try {
    const res = await fetch(`${RAW_URL}/data/recordings.json?t=${Date.now()}`);
    const recs = await res.json();
    list = mergeData(list, recs);
  } catch (e) {
    console.warn('Could not parse recordings.json');
  }

  return list.filter(s => isTML(s.channel));
}
