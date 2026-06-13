import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  ArrowLeft,
  Bookmark,
  Check,
  ChevronRight,
  Clock,
  Copy,
  Download,
  HardDrive,
  Keyboard,
  MessageSquare,
  X,
} from 'lucide-react';
import { MediaPlayer, MediaProvider } from '@vidstack/react';
import { DefaultVideoLayout, defaultLayoutIcons } from '@vidstack/react/player/layouts/default';
import { StreamData, StreamSource, fetchStreams } from '../utils/dataFetcher';

const PLAYER_NAMES = ['Dxture', 'Heart', 'Jatt', 'Helicopter'];
const SOURCE_PRIORITY = ['archive', 'archiveSmall', 'pixel', 'odysee', 'rumble'];

// ── Pixeldrain "fast playback" configuration ──
// EVERYTHING goes through our OWN Vercel proxy (/api/pd/<id>). The proxy fetches
// the file server-side (bypassing Pixeldrain's hotlink/rate-limit 403) and
// edge-caches it, so repeat plays never re-hit Pixeldrain. We deliberately do
// NOT stream directly from the browser to Pixeldrain anymore, because every
// direct request counts as a "download" and trips Pixeldrain's 3:1 rate limit.
//
//   Fast  -> /api/pd/<id>                  (GameDrive CDN first, then official)
//   Heart -> /api/pd/<id>?prefer=official  (official first, then GameDrive)
//
// Both are the SAME cached proxy URL family, so a play through one warms the
// cache for the other. The proxy itself handles all fallback server-side.

function pixeldrainId(url?: string) {
  return (url || '').match(/pixeldrain(?:\.com|-bypass\.gamedrive\.org|\.eu\.cc)?\/(?:u|api\/file)\/([a-zA-Z0-9_-]+)/)?.[1]
    || (url || '').match(/(?:eu\.cc|gamedrive\.org)\/([a-zA-Z0-9_-]+)$/)?.[1]
    || '';
}

// Same-origin Vercel proxy stream (server-side fetch + edge cache).
function pixeldrainProxyUrl(url?: string, mode: 'fast' | 'direct' = 'fast') {
  const id = pixeldrainId(url);
  if (!id) return '';
  return mode === 'direct' ? `/api/pd/${id}?prefer=official` : `/api/pd/${id}`;
}

// Official direct stream. For our account-uploaded (hotlink-enabled) files this
// is the FASTEST path — measured ~40MB/s vs ~7MB/s through the GameDrive CDN —
// so it is tried first.
function pixeldrainOfficialUrl(url?: string) {
  const id = pixeldrainId(url);
  return id ? `https://pixeldrain.com/api/file/${id}` : '';
}

// GameDrive CDN proxy. Slower than direct, but it can serve a file even when the
// account's monthly transfer budget is temporarily exhausted (official returns
// 403). Used as a fallback so playback keeps working.
function pixeldrainGamedriveUrl(url?: string) {
  const id = pixeldrainId(url);
  return id ? `https://cdn.pixeldrain.eu.cc/${id}` : '';
}

// Candidate order (each declared video/mp4 because the URLs have no extension).
// Official direct is the FASTEST for our hotlink-enabled account files (~1.4s vs
// ~3s through the proxy), so BOTH modes try it first. The other sources are only
// silent fallbacks for when official is rate-limited.
//   fast   : official direct → GameDrive CDN → Vercel proxy
//   direct : official direct → Vercel proxy → GameDrive CDN
// The player streams the first one immediately and auto-fails-over via onError.
function pixeldrainStreamCandidates(url?: string, mode: 'fast' | 'direct' = 'fast'): DirectSource[] {
  const official = pixeldrainOfficialUrl(url);
  const gamedrive = pixeldrainGamedriveUrl(url);
  const proxy = pixeldrainProxyUrl(url, mode);
  const officialSrc: DirectSource | null = official ? { id: 'pixel-direct', quality: 'Direct', url: official, mime: 'video/mp4' } : null;
  const gamedriveSrc: DirectSource | null = gamedrive ? { id: 'pixel-cdn', quality: 'CDN', url: gamedrive, mime: 'video/mp4' } : null;
  const proxySrc: DirectSource | null = proxy ? { id: 'pixel-proxy', quality: 'Proxy', url: proxy, mime: 'video/mp4' } : null;
  const ordered = mode === 'direct'
    ? [officialSrc, proxySrc, gamedriveSrc]
    : [officialSrc, gamedriveSrc, proxySrc];
  return ordered.filter(Boolean) as DirectSource[];
}

// Download URL: route through the proxy too (forces attachment + bypasses limit).
function pixeldrainDownload(url?: string) {
  const id = pixeldrainId(url);
  return id ? `/api/pd/${id}?download` : '';
}

// Single lightweight probe (HEAD-equivalent via tiny GET) against the proxy to
// decide if this file is currently playable. Runs ONCE per source, not per
// candidate, so it adds at most one request. Result is cached per id+mode.
// Build the ordered list of stream candidates. We do NOT pre-probe them (that
// used to download each file just to check the type, causing the long
// "Preparing server…" delay). Instead we hand the candidates straight to the
// player, which starts streaming immediately and uses onError to fail over to
// the next candidate. This makes playback start almost instantly.
function resolvePixeldrainSources(url: string | undefined, mode: 'fast' | 'direct'): DirectSource[] {
  return pixeldrainStreamCandidates(url, mode);
}

interface PlayerOption {
  key: string;
  label: string;
  source: StreamSource;
  // For Pixeldrain sources: 'fast' = GameDrive proxy CDN first, 'direct' =
  // official pixeldrain.com first. Each still keeps the other as silent fallback.
  pixeldrainMode?: 'fast' | 'direct';
}

interface DirectSource {
  id: string;
  quality: string;
  url: string;
  mime?: 'video/mp4' | 'video/webm' | 'video/ogg';
}

interface ChatMessage {
  time: number;
  author: string;
  message: string;
  amount?: string;
  type?: string;
}

function formatClock(seconds: number) {
  if (!Number.isFinite(seconds)) return '0:00';
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

function sortSourceEntries(sources: Record<string, StreamSource>): [string, StreamSource][] {
  return Object.entries(sources)
    // Pixeldrain is hidden from playback sources: free Pixeldrain rate-limits
    // embedded playback (403), so it is unreliable as a player. It remains a
    // Download mirror. Archive is the reliable player source.
    .filter(([key]) => key !== 'mega' && key !== 'gofile' && key !== 'pixel' && key !== 'pixeldrain')
    .sort(([a], [b]) => {
    const ai = SOURCE_PRIORITY.indexOf(a);
    const bi = SOURCE_PRIORITY.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}




async function gofileDirectSources(url?: string): Promise<DirectSource[]> {
  const folderId = (url || '').match(/gofile\.io\/d\/([a-zA-Z0-9_-]+)/)?.[1];
  if (!folderId) return [];
  // Gofile public direct links require their content API. If anonymous access is
  // blocked/rate-limited, this returns [] and the UI will show a clean error.
  const api = `https://api.gofile.io/contents/${folderId}`;
  const res = await fetch(api);
  if (!res.ok) return [];
  const data = await res.json();
  const children = Object.values(data?.data?.children || {}) as any[];
  const videos = children.filter((item) => /video|mp4|webm|mkv/i.test(`${item?.mimetype || ''} ${item?.name || ''}`));
  return videos.map((item, index) => ({
    id: `gofile-${index}`,
    quality: index === 0 ? 'Auto' : `Alt ${index}`,
    url: item.link || item.directLink || item.downloadPage || '',
  })).filter((item) => item.url);
}

function embedUrl(source: StreamSource) {
  if (source.type === 'archive') {
    const id = source.url.split('/details/')[1]?.split('/')[0];
    return id ? `https://archive.org/embed/${id}` : '';
  }
  if (source.type === 'mega') {
    const old = source.url.match(/mega\.nz\/#!([^!]+)!([^/?#]+)/);
    if (old) return `https://mega.nz/embed/${old[1]}#${old[2]}`;
    return source.url.replace('/file/', '/embed/');
  }
  if (source.type === 'pixeldrain') {
    // Pixeldrain is handled as a proxied direct stream, never an iframe embed.
    return pixeldrainProxyUrl(source.url, 'fast');
  }
  if (source.type === 'odysee') return source.url.replace('odysee.com/', 'odysee.com/$/embed/');
  if (source.type === 'rumble') return source.url.replace('/v', '/embed/v');
  return '';
}

async function archiveDirectSources(archiveId: string): Promise<DirectSource[]> {
  const res = await fetch(`https://archive.org/metadata/${archiveId}?t=${Date.now()}`);
  if (!res.ok) throw new Error(`Archive metadata HTTP ${res.status}`);
  const data = await res.json();
  const files = Array.isArray(data.files) ? data.files : [];
  return files
    .filter((file: { name?: string; format?: string; size?: string }) => {
      const name = file.name || '';
      const format = (file.format || '').toLowerCase();
      return /\.(mp4|m4v|webm|mkv)$/i.test(name)
        && !name.includes('_thumb')
        && !name.includes('_ia_thumb')
        && !format.includes('thumbnail');
    })
    .sort((a: { name?: string; format?: string; size?: string }, b: { name?: string; format?: string; size?: string }) => {
      const score = (file: { name?: string; format?: string; size?: string }) => {
        const name = (file.name || '').toLowerCase();
        const format = (file.format || '').toLowerCase();
        let value = 0;
        if (name.endsWith('.mp4')) value += 120;
        if (format.includes('mpeg4') || format.includes('h.264')) value += 60;
        if (!name.includes('compressed')) value += 30;
        value += Math.min(Number(file.size || 0) / 1_000_000_000, 30);
        return value;
      };
      return score(b) - score(a);
    })
    .slice(0, 4)
    .map((file: { name: string }, index: number) => {
      const encodedName = file.name.split('/').map(encodeURIComponent).join('/');
      const lower = file.name.toLowerCase();
      return {
        id: `archive-${index}`,
        quality: lower.includes('compressed') ? 'Compact' : index === 0 ? 'Best' : `Alt ${index}`,
        url: `https://archive.org/download/${archiveId}/${encodedName}`,
      };
    });
}

function parseChatPayload(payload: unknown): ChatMessage[] {
  const normalize = (raw: any): ChatMessage | null => {
    const message = raw.message || raw.message_text || raw.text || raw.messageText || '';
    const author = raw.author?.name || raw.author_name || raw.name || raw.author || 'Viewer';
    const time = Number(raw.time_in_seconds ?? raw.time_text_seconds ?? raw.timestamp ?? raw.elapsed_time ?? 0);
    const amount = raw.money?.amount_text || raw.amount || raw.purchase_amount || raw.header_subtext;
    const type = raw.message_type || raw.type || '';
    if (!message && !amount) return null;
    return { time: Number.isFinite(time) ? Math.max(0, time) : 0, author, message: String(message), amount, type };
  };
  const source = Array.isArray(payload) ? payload : Array.isArray((payload as any)?.messages) ? (payload as any).messages : [];
  return source.map(normalize).filter(Boolean).sort((a: ChatMessage, b: ChatMessage) => a.time - b.time) as ChatMessage[];
}

async function fetchChatMessages(chatUrl?: string, archiveId?: string): Promise<ChatMessage[]> {
  const candidates = [chatUrl, archiveId ? `https://archive.org/download/${archiveId}/chat.json` : ''].filter(Boolean) as string[];
  for (const url of candidates) {
    try {
      const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`);
      if (!res.ok) continue;
      const text = await res.text();
      try { return parseChatPayload(JSON.parse(text)); }
      catch {
        const parsed = text.split('\n').map(line => line.trim()).filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
        return parseChatPayload(parsed);
      }
    } catch {}
  }
  return [];
}

function PremiumVideoPlayer({ stream, option, archiveId, onTime }: { stream: StreamData; option: PlayerOption; archiveId?: string; onTime: (time: number) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [directSources, setDirectSources] = useState<DirectSource[]>([]);
  const [activeQuality, setActiveQuality] = useState(0);
  const [iframeSrc, setIframeSrc] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [failedSources, setFailedSources] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      setLoading(true);
      setError('');
      setDirectSources([]);
      setIframeSrc('');
      setActiveQuality(0);
      setFailedSources([]);
      try {
        let direct: DirectSource[] = [];
        if (option.source.type === 'archive') {
          // Fast path: stream the precomputed direct storage-node URL instantly
          // (skips Archive's 302 redirect + metadata lookup). Keep the /download
          // URL as an automatic fallback in case the node changes, then the
          // metadata resolver as a last resort.
          const fast: DirectSource[] = [];
          if (option.source.directUrl) fast.push({ id: 'archive-node', quality: 'Best', url: option.source.directUrl, mime: 'video/mp4' });
          if (option.source.fallbackUrl && option.source.fallbackUrl !== option.source.directUrl) {
            fast.push({ id: 'archive-dl', quality: 'Backup', url: option.source.fallbackUrl, mime: 'video/mp4' });
          }
          if (fast.length > 0) {
            direct = fast;
          } else if (archiveId) {
            direct = await archiveDirectSources(archiveId);
          }
        }
        if (option.source.type === 'pixeldrain') {
          // No pre-probe: hand candidates straight to the player so it starts
          // streaming instantly. onError fails over to the next candidate.
          direct = resolvePixeldrainSources(option.source.url, option.pixeldrainMode || 'fast');
          // Cross-source safety net: append the permanent Archive .mp4 as the
          // FINAL fallback. Free Pixeldrain files can be rate-limited (403) at
          // any time, so if every Pixeldrain candidate fails the player silently
          // switches to Archive — the viewer always gets video, never an error.
          const archiveFallback = stream.sources.archive?.directUrl || stream.sources.archiveSmall?.directUrl;
          if (archiveFallback) {
            direct = [...direct, { id: 'archive-fallback', quality: 'Backup', url: archiveFallback, mime: 'video/mp4' }];
          }
          if (!cancelled && direct.length === 0) {
            throw new Error('This file is temporarily rate-limited by Pixeldrain. Switch to the Dxture (Archive) source — it always works — or try again in a little while');
          }
        }
        if (option.source.type === 'gofile') {
          direct = await gofileDirectSources(option.source.url);
        }
        if (!cancelled && direct.length > 0) {
          setDirectSources(direct);
          return;
        }
        const iframe = embedUrl(option.source);
        if (!iframe) throw new Error('This playback option cannot be prepared');
        if (!cancelled) setIframeSrc(iframe);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not prepare this player');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    resolve();
    return () => { cancelled = true; };
    // Re-resolve only when the chosen server actually changes (URL/type/mode),
    // not on every parent re-render. This keeps Fast vs Heart distinct.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [option.source.url, option.source.type, option.pixeldrainMode, archiveId]);

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black text-white">
        <div className="text-center">
          <div className="mx-auto mb-5 h-12 w-12 rounded-full border-4 border-brand-500 border-t-transparent animate-spin" />
          <p className="text-sm font-semibold text-white/70">Preparing player…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black p-8 text-center text-white">
        <div className="max-w-md">
          <AlertTriangle size={34} className="mx-auto mb-4 text-brand-400" />
          <h3 className="text-xl font-bold">Playback unavailable</h3>
          <p className="mt-2 text-sm leading-relaxed text-white/55">{error}. Please choose another player source.</p>
        </div>
      </div>
    );
  }

  if (iframeSrc) {
    return (
      <div ref={wrapRef} className="relative h-full w-full overflow-hidden bg-black">
        <iframe src={iframeSrc} title={option.label} className="h-full w-full border-0" allowFullScreen allow="fullscreen; autoplay; encrypted-media; picture-in-picture" />
      </div>
    );
  }

  const activeSrc = directSources[activeQuality];

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden bg-black">
      <MediaPlayer
        key={activeSrc?.url}
        title={stream.title}
        src={activeSrc?.mime ? { src: activeSrc.url, type: activeSrc.mime } : activeSrc?.url}
        poster={archiveId ? `https://archive.org/services/img/${archiveId}` : stream.thumbnail}
        aspectRatio="16/9"
        playsInline
        load="visible"
        className="vidstack-premium-player h-full w-full bg-black"
        onTimeUpdate={(event: any) => {
          const target = event?.target as HTMLMediaElement | undefined;
          onTime(target?.currentTime || 0);
        }}
        onError={() => {
          // Auto-failover: if the current stream candidate (e.g. the Fast proxy)
          // genuinely fails, advance to the next candidate ONCE. We only show the
          // hard error after every candidate has actually been tried, so a single
          // transient hiccup never cascades into "all sources unavailable".
          const previousTime = videoRef.current?.currentTime || 0;
          setFailedSources(prevFailed => {
            const currentUrl = directSources[activeQuality]?.url;
            if (currentUrl && prevFailed.includes(currentUrl)) return prevFailed;
            const nextFailed = currentUrl ? [...prevFailed, currentUrl] : prevFailed;
            // Find the next candidate that has not failed yet.
            const nextIndex = directSources.findIndex(s => !nextFailed.includes(s.url));
            if (nextIndex === -1) {
              setError(
                option.source.type === 'pixeldrain'
                  ? 'This file is temporarily rate-limited by Pixeldrain. Switch to the Dxture (Archive) source — it always works.'
                  : 'All playback sources are unavailable right now'
              );
            } else {
              setActiveQuality(nextIndex);
              window.setTimeout(() => {
                const v = videoRef.current;
                if (v && previousTime > 0) v.currentTime = previousTime;
              }, 200);
            }
            return nextFailed;
          });
        }}
      >
        <MediaProvider />
        <DefaultVideoLayout icons={defaultLayoutIcons} />
      </MediaPlayer>
    </div>
  );
}
function ChatReplay({ chatUrl, archiveId, currentTime }: { chatUrl?: string; archiveId?: string; currentTime: number }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchChatMessages(chatUrl, archiveId).then(items => { if (!cancelled) setMessages(items); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [chatUrl, archiveId]);

  const visible = useMemo(() => messages.filter(msg => msg.time <= currentTime + 2).slice(-80), [messages, currentTime]);

  if (loading) return <div className="h-56 flex items-center justify-center text-dark-400 text-sm">Loading chat replay…</div>;
  if (!messages.length) return <div className="h-56 flex flex-col items-center justify-center border-2 border-dashed border-dark-200 dark:border-dark-700 rounded-xl text-dark-400 text-center p-4"><MessageSquare size={20} className="mb-2 opacity-50" /><p className="text-xs font-medium">Chat replay unavailable</p><p className="text-[10px] mt-1 opacity-70">Chat data may not have been captured for this recording.</p></div>;

  return <div className="h-[420px] overflow-y-auto pr-1 space-y-2 chat-replay-scroll">{visible.map((msg, index) => { const paid = Boolean(msg.amount) || /paid|super/i.test(msg.type || ''); return <div key={`${msg.time}-${index}`} className={`rounded-2xl p-3 border ${paid ? 'bg-amber-500/15 border-amber-500/30' : 'bg-dark-50 dark:bg-dark-800/70 border-dark-200 dark:border-dark-700'}`}><div className="flex items-center gap-2 mb-1"><span className="text-[10px] font-mono text-dark-400">{formatClock(msg.time)}</span><span className={`text-xs font-bold ${paid ? 'text-amber-600 dark:text-amber-300' : 'text-brand-600 dark:text-brand-300'}`}>{msg.author}</span>{paid && <span className="ml-auto rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-black text-white">{msg.amount || 'Super Chat'}</span>}</div><p className="text-sm text-dark-700 dark:text-dark-100 leading-relaxed break-words">{msg.message}</p></div>; })}</div>;
}

export default function Watch() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [stream, setStream] = useState<StreamData | null>(location.state?.stream || null);
  const [notFound, setNotFound] = useState(false);
  const [allStreams, setAllStreams] = useState<StreamData[]>([]);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showDownloads, setShowDownloads] = useState(false);
  const [bookmarks, setBookmarks] = useState<{time: number, note: string}[]>([]);
  const [copied, setCopied] = useState(false);
  const [playerTime, setPlayerTime] = useState(0);
  const [activePlayer, setActivePlayer] = useState(0);

  useEffect(() => {
    fetchStreams().then(data => {
      setAllStreams(data);
      if (!stream) {
        const found = data.find(s => s.videoId === id);
        if (found) setStream(found);
        else setNotFound(true);
      }
    });
  }, [id, stream]);

  useEffect(() => { if (id) { try { const saved = localStorage.getItem(`bookmarks_${id}`); if (saved) setBookmarks(JSON.parse(saved)); } catch {} } }, [id]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key.toLowerCase() === 's') {
        const count = stream ? sortSourceEntries(stream.sources).length : 0;
        if (count > 1) setActivePlayer(prev => (prev + 1) % count);
      }
      if (e.key === '?') { e.preventDefault(); setShowShortcuts(prev => !prev); }
      if (e.key === 'Escape') setShowShortcuts(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [stream]);

  if (notFound) return <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4"><div className="max-w-md"><div className="w-24 h-24 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-6"><AlertTriangle size={44} className="text-red-500" /></div><h2 className="text-3xl font-bold font-display mb-3">Video Not Found</h2><p className="text-dark-500 mb-8">This recording does not exist in the archive.</p><button onClick={() => navigate('/gallery')} className="btn-primary">Browse Gallery</button></div></div>;
  if (!stream) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-12 h-12 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>;

  // Pixeldrain is excluded above, so the playback list is Archive-only (Dxture).
  const entries: PlayerOption[] = sortSourceEntries(stream.sources).map(([key, source], index) => ({
    key,
    source,
    label: PLAYER_NAMES[index] || `Player ${index + 1}`,
  }));
  const currentOption = entries[Math.min(activePlayer, Math.max(entries.length - 1, 0))];
  const archiveSource = stream.sources.archive || stream.sources.archiveSmall;
  const archiveId = stream.archiveId || archiveSource?.url.split('/details/')[1]?.split('/')[0];
  const relatedStreams = allStreams.filter(s => s.videoId !== id).slice(0, 4);
  const downloadLinks = [
    stream.sources.pixel && { label: 'Pixeldrain (Fast)', url: pixeldrainDownload(stream.sources.pixel.url) },
    stream.sources.mega && { label: 'MEGA.nz', url: stream.sources.mega.url },
    stream.sources.gofile && { label: 'Gofile', url: stream.sources.gofile.url },
  ].filter((item) => item && item.url) as { label: string; url: string }[];

  const handleAddBookmark = () => { const timeStr = prompt('Enter timestamp to bookmark (e.g., 01:23:45):'); if (!timeStr) return; const newBms = [...bookmarks, { time: Date.now(), note: `Bookmark at ${timeStr}` }]; setBookmarks(newBms); localStorage.setItem(`bookmarks_${id}`, JSON.stringify(newBms)); };
  const removeBookmark = (index: number) => { const newBms = bookmarks.filter((_, i) => i !== index); setBookmarks(newBms); localStorage.setItem(`bookmarks_${id}`, JSON.stringify(newBms)); };
  const handleShare = async () => { const shareUrl = window.location.href; try { await navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { prompt('Copy this link:', shareUrl); } };
  const shortcuts = [
    { key: 'Space / K', desc: 'Play or pause', hint: 'Control video playback' },
    { key: '← / →', desc: 'Seek 10 seconds', hint: 'Jump backward or forward' },
    { key: 'M', desc: 'Mute audio', hint: 'Toggle sound' },
    { key: 'F', desc: 'Fullscreen', hint: 'Enter cinema mode' },
    { key: 'S', desc: 'Switch player', hint: 'Cycle Dxture / Heart / Jatt / Helicopter' },
    { key: '?', desc: 'Shortcuts', hint: 'Show this panel' },
  ];

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-dark-500 hover:text-brand-500 mb-4 transition-colors font-medium group"><ArrowLeft size={18} /> Back to Gallery</button>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-6">
          <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10">
            {currentOption ? <PremiumVideoPlayer stream={stream} option={currentOption} archiveId={archiveId} onTime={setPlayerTime} /> : <div className="w-full h-full flex items-center justify-center text-white">No player available</div>}
          </div>
          <div><h1 className="text-2xl sm:text-3xl font-bold font-display leading-tight mb-3">{stream.title}</h1><div className="flex flex-wrap items-center gap-4 text-sm text-dark-500 dark:text-dark-400 font-medium"><span className="flex items-center gap-1.5"><Clock size={16} /> {stream.date} • {stream.duration}</span>{stream.size && <span className="flex items-center gap-1.5"><HardDrive size={16} /> {stream.size}</span>}</div><div className="flex flex-wrap items-center gap-3 mt-6 pb-6 border-b border-dark-200 dark:border-dark-800"><button onClick={handleAddBookmark} className="btn-secondary flex items-center gap-2"><Bookmark size={18} /> Bookmark</button><button onClick={handleShare} className="btn-secondary flex items-center gap-2">{copied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}{copied ? 'Copied!' : 'Share'}</button>{downloadLinks.length > 0 && <button onClick={() => setShowDownloads(true)} className="btn-primary flex items-center gap-2 bg-brand-600 hover:bg-brand-500"><Download size={18} /> Download</button>}<button onClick={() => setShowShortcuts(true)} className="btn-secondary flex items-center gap-2 ml-auto"><Keyboard size={16} /> Shortcuts</button></div></div>
          {relatedStreams.length > 0 && <div><div className="flex items-center justify-between mb-4"><h3 className="text-lg font-bold font-display">More Recordings</h3><Link to="/gallery" className="text-sm text-brand-500 font-medium flex items-center gap-1">View All <ChevronRight size={14} /></Link></div><div className="grid grid-cols-2 md:grid-cols-4 gap-4">{relatedStreams.map(rs => <Link key={rs.videoId} to={`/watch/${rs.videoId}`} state={{ stream: rs }} className="group"><div className="relative aspect-video rounded-xl overflow-hidden bg-dark-200 dark:bg-dark-800 mb-2"><img src={rs.thumbnail} alt={rs.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" onError={(e) => { (e.target as HTMLImageElement).src = `${import.meta.env.BASE_URL}thumbnail.jpg`; }} /></div><h4 className="text-xs font-semibold line-clamp-2 group-hover:text-brand-500 transition-colors">{rs.title}</h4></Link>)}</div></div>}
        </div>
        <div className="space-y-5">
          <div className="glass-panel p-5 rounded-2xl border border-dark-200 dark:border-dark-800"><h3 className="font-bold mb-4 text-base">Player Sources</h3><div className="space-y-2">{entries.map((entry, index) => <button key={entry.key} onClick={() => setActivePlayer(index)} className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${index === activePlayer ? 'bg-brand-50 dark:bg-brand-900/30 border border-brand-200 dark:border-brand-800 text-brand-700 dark:text-brand-300' : 'bg-dark-50 dark:bg-dark-800 hover:bg-dark-100 dark:hover:bg-dark-700 border border-transparent'}`}><span className="font-bold text-sm flex items-center gap-2"><span>{index === 0 ? '▶' : '↻'}</span>{entry.label}</span>{index === activePlayer && <span className="w-2 h-2 rounded-full bg-brand-500" />}</button>)}</div></div>
          <div className="glass-panel p-5 rounded-2xl border border-dark-200 dark:border-dark-800"><h3 className="font-bold mb-4 text-base">My Highlights</h3>{bookmarks.length === 0 ? <p className="text-sm text-dark-400">No bookmarks saved yet. Click Bookmark to save important moments.</p> : <div className="space-y-2">{bookmarks.map((bm, i) => <div key={bm.time} className="p-3 bg-dark-50 dark:bg-dark-800 rounded-xl text-sm border border-dark-200 dark:border-dark-700 flex items-start justify-between gap-2"><div><div className="font-medium text-brand-600 dark:text-brand-400 text-xs">Highlight {i + 1}</div><div className="text-dark-600 dark:text-dark-300">{bm.note}</div></div><button onClick={() => removeBookmark(i)} className="text-dark-400 hover:text-red-500 p-1"><X size={14} /></button></div>)}</div>}</div>
          <div className="glass-panel p-5 rounded-2xl border border-dark-200 dark:border-dark-800"><h3 className="font-bold mb-4 text-base flex items-center gap-2"><MessageSquare size={16} /> Live Chat Replay</h3><ChatReplay chatUrl={stream.chatUrl} archiveId={archiveId} currentTime={playerTime} /></div>
        </div>
      </div>
      <AnimatePresence>
        {showDownloads && (
          <motion.div className="fixed inset-0 z-[105] flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <button type="button" aria-label="Close downloads" onClick={() => setShowDownloads(false)} className="absolute inset-0 bg-black/75 backdrop-blur-md" />
            <motion.div initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 24, scale: 0.96 }} className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-[#111114]/95 p-6 shadow-2xl">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-500 via-orange-500 to-yellow-400" />
              <div className="flex items-start justify-between gap-4 mb-5">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.25em] text-brand-500 mb-2">Private Downloads</div>
                  <h2 className="text-2xl font-black font-display text-white">Download Recording</h2>
                  <p className="text-sm text-white/50 mt-1">Use these mirrors for saving the recording offline.</p>
                </div>
                <button onClick={() => setShowDownloads(false)} className="p-2 rounded-full hover:bg-white/10 text-white/70"><X size={18} /></button>
              </div>
              <div className="space-y-3">
                {downloadLinks.map((item, index) => (
                  <a key={item.url} href={item.url} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4 text-white hover:border-brand-500/40 hover:bg-brand-500/10 transition-all">
                    <div>
                      <div className="font-bold">{item.label}</div>
                      <div className="text-xs text-white/45">{index === 0 ? 'Encrypted storage mirror' : 'Fast file mirror'}</div>
                    </div>
                    <Download size={18} className="text-brand-400" />
                  </a>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>{showShortcuts && <motion.div className="fixed inset-0 z-[110] flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><button onClick={() => setShowShortcuts(false)} className="absolute inset-0 bg-black/70 backdrop-blur-md" /><motion.div initial={{ opacity: 0, y: 24, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 24, scale: 0.94 }} className="relative w-full max-w-lg glass-panel rounded-3xl z-[111] shadow-2xl border border-white/20 dark:border-white/10 overflow-hidden"><div className="p-6 border-b border-dark-200 dark:border-dark-800 flex justify-between"><div><div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 text-brand-500 text-xs font-bold mb-3 border border-brand-500/20"><Keyboard size={14} /> Watch Controls</div><h2 className="text-2xl font-bold font-display">Keyboard Shortcuts</h2></div><button onClick={() => setShowShortcuts(false)}><X size={18} /></button></div><div className="p-6 space-y-3">{shortcuts.map(item => <div key={item.key} className="flex items-center justify-between gap-4 p-4 bg-white/70 dark:bg-dark-800/80 rounded-2xl border border-dark-200/80 dark:border-dark-700/80"><div><span className="block text-sm font-semibold">{item.desc}</span><span className="block text-xs text-dark-400 mt-0.5">{item.hint}</span></div><kbd className="min-w-12 text-center px-3 py-2 rounded-xl bg-dark-900 text-white dark:bg-white dark:text-dark-900 text-xs font-mono font-black">{item.key}</kbd></div>)}</div></motion.div></motion.div>}</AnimatePresence>
    </div>
  );
}
