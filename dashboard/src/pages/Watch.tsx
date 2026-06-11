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
  Gauge,
  HardDrive,
  Keyboard,
  Maximize,
  MessageSquare,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Settings,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { StreamData, StreamSource, fetchStreams } from '../utils/dataFetcher';

const PLAYER_NAMES = ['D3xture', 'Heart', 'Jatt', 'Helicopter'];
const SOURCE_PRIORITY = ['archive', 'pixel', 'mega', 'archiveSmall', 'gofile', 'odysee', 'rumble'];

interface PlayerOption {
  key: string;
  label: string;
  source: StreamSource;
}

interface DirectSource {
  id: string;
  quality: string;
  url: string;
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
  return Object.entries(sources).sort(([a], [b]) => {
    const ai = SOURCE_PRIORITY.indexOf(a);
    const bi = SOURCE_PRIORITY.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}

function pixeldrainDirect(url?: string) {
  const id = (url || '').match(/pixeldrain\.com\/u\/([a-zA-Z0-9_-]+)/)?.[1];
  return id ? `https://pixeldrain.com/api/file/${id}` : '';
}

function embedUrl(source: StreamSource) {
  if (source.type === 'archive') {
    const id = source.url.split('/details/')[1]?.split('/')[0];
    return id ? `https://archive.org/embed/${id}` : '';
  }
  if (source.type === 'mega') return source.url.replace('/file/', '/embed/');
  if (source.type === 'pixeldrain') {
    const id = source.url.match(/pixeldrain\.com\/u\/([a-zA-Z0-9_-]+)/)?.[1];
    return id ? `https://pixeldrain.com/api/file/${id}?embed` : '';
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
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [volume, setVolume] = useState(0.9);
  const [muted, setMuted] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      setLoading(true);
      setError('');
      setDirectSources([]);
      setIframeSrc('');
      setActiveQuality(0);
      try {
        let direct: DirectSource[] = [];
        if (option.source.type === 'archive' && archiveId) direct = await archiveDirectSources(archiveId);
        if (option.source.type === 'pixeldrain') {
          const url = pixeldrainDirect(option.source.url);
          if (url) direct = [{ id: 'pixel-direct', quality: 'Fast', url }];
        }
        if (!cancelled && direct.length > 0) {
          setDirectSources(direct);
          return;
        }
        const iframe = embedUrl(option.source);
        if (!iframe) throw new Error('This playback option cannot be embedded');
        if (!cancelled) setIframeSrc(iframe);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not prepare this player');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    resolve();
    return () => { cancelled = true; };
  }, [option, archiveId]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
    video.muted = muted;
    video.playbackRate = speed;
  }, [volume, muted, speed, activeQuality]);

  const togglePlay = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) await video.play();
    else video.pause();
  };

  const seekTo = (value: number) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    video.currentTime = (value / 100) * duration;
  };

  const switchQuality = (index: number) => {
    const video = videoRef.current;
    const previousTime = video?.currentTime || 0;
    const wasPlaying = video ? !video.paused : false;
    setActiveQuality(index);
    window.setTimeout(() => {
      const next = videoRef.current;
      if (!next) return;
      next.currentTime = previousTime;
      if (wasPlaying) next.play().catch(() => undefined);
    }, 150);
  };

  const toggleFullscreen = async () => {
    const el = wrapRef.current;
    if (!el) return;
    if (!document.fullscreenElement) await el.requestFullscreen();
    else await document.exitFullscreen();
  };

  useEffect(() => {
    const handler = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const video = videoRef.current;
      switch (e.key.toLowerCase()) {
        case ' ':
        case 'k': e.preventDefault(); togglePlay(); break;
        case 'm': setMuted(prev => !prev); break;
        case 'f': toggleFullscreen(); break;
        case 'arrowright': if (video) video.currentTime += 10; break;
        case 'arrowleft': if (video) video.currentTime -= 10; break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (loading) return <div className="w-full h-full flex flex-col items-center justify-center bg-black text-white"><div className="w-12 h-12 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mb-4" /><p className="text-sm text-white/70">Preparing {option.label}…</p></div>;
  if (error) return <div className="w-full h-full flex flex-col items-center justify-center bg-black text-center p-6 text-white"><AlertTriangle size={34} className="text-brand-400 mb-4" /><h3 className="text-xl font-bold mb-2">Playback unavailable</h3><p className="text-white/60 max-w-md text-sm">{error}. Please choose another player.</p></div>;

  if (iframeSrc) {
    return (
      <div ref={wrapRef} className="relative w-full h-full bg-black overflow-hidden">
        <iframe src={iframeSrc} title={option.label} className="w-full h-full border-0" allowFullScreen allow="fullscreen; autoplay; encrypted-media; picture-in-picture" />
        <div className="pointer-events-none absolute top-4 left-4 flex items-center gap-2 rounded-full bg-black/45 px-3 py-2 backdrop-blur-md border border-white/10 text-white">
          <img src={`${import.meta.env.BASE_URL}logo-vertical.pn.jpg`} alt="" className="h-7 w-7 rounded-full object-cover" />
          <span className="text-xs font-bold">{option.label}</span>
        </div>
      </div>
    );
  }

  const activeSrc = directSources[activeQuality];
  const progress = duration ? (current / duration) * 100 : 0;

  return (
    <div ref={wrapRef} className="premium-player-shell relative w-full h-full bg-black text-white group overflow-hidden">
      <video
        ref={videoRef}
        key={activeSrc?.url}
        src={activeSrc?.url}
        poster={archiveId ? `https://archive.org/services/img/${archiveId}` : stream.thumbnail}
        className="w-full h-full object-contain bg-black"
        playsInline
        preload="metadata"
        controlsList="nodownload noplaybackrate"
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => { setCurrent(e.currentTarget.currentTime); onTime(e.currentTarget.currentTime); }}
      />

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/95 via-black/5 to-black/55" />
      <div className="pointer-events-none absolute inset-0 premium-player-vignette" />

      <div className="absolute left-4 right-4 top-4 flex items-center justify-between gap-4 opacity-0 translate-y-[-8px] group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
        <div className="flex min-w-0 items-center gap-3 rounded-2xl bg-black/42 px-3 py-2 backdrop-blur-xl border border-white/10 shadow-2xl">
          <img src={`${import.meta.env.BASE_URL}logo-vertical.pn.jpg`} alt="" className="h-10 w-10 rounded-xl object-cover ring-1 ring-white/20" />
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.24em] text-brand-300 font-black">The Muslim Lantern Archive</div>
            <div className="truncate text-sm font-bold text-white/95 max-w-[520px]">{stream.title}</div>
          </div>
        </div>
        <div className="rounded-full bg-black/45 px-3 py-1.5 text-xs font-black backdrop-blur-xl border border-white/10 shadow-xl">
          {option.label} <span className="text-white/45">•</span> {activeSrc?.quality || 'Auto'}
        </div>
      </div>

      <button
        onClick={togglePlay}
        aria-label={playing ? 'Pause video' : 'Play video'}
        className="absolute inset-0 m-auto h-24 w-24 rounded-full bg-white/12 backdrop-blur-2xl border border-white/25 flex items-center justify-center opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100 transition-all duration-300 shadow-[0_20px_80px_rgba(0,0,0,.45)] hover:bg-brand-500/80"
      >
        {playing ? <Pause size={40} fill="currentColor" /> : <Play size={46} fill="currentColor" className="ml-1" />}
      </button>

      <div className="absolute left-0 right-0 bottom-0 p-4 md:p-6 opacity-100 md:opacity-0 md:translate-y-3 md:group-hover:opacity-100 md:group-hover:translate-y-0 transition-all duration-300">
        <div className="rounded-[1.6rem] bg-black/46 border border-white/10 backdrop-blur-2xl p-3 md:p-4 shadow-2xl">
          <input
            aria-label="Seek video"
            type="range"
            min="0"
            max="100"
            value={progress || 0}
            onChange={(e) => seekTo(Number(e.target.value))}
            className="premium-video-range w-full mb-3"
          />
          <div className="flex items-center gap-2 md:gap-3">
            <button aria-label={playing ? 'Pause' : 'Play'} onClick={togglePlay} className="player-btn player-btn-primary">{playing ? <Pause size={19} /> : <Play size={19} />}</button>
            <button aria-label="Back 10 seconds" onClick={() => { const video = videoRef.current; if (video) video.currentTime -= 10; }} className="player-btn"><RotateCcw size={17} /></button>
            <button aria-label="Forward 10 seconds" onClick={() => { const video = videoRef.current; if (video) video.currentTime += 10; }} className="player-btn"><RotateCw size={17} /></button>
            <div className="hidden sm:block text-xs font-mono text-white/80 min-w-[104px]">{formatClock(current)} / {formatClock(duration)}</div>
            <button aria-label={muted ? 'Unmute' : 'Mute'} onClick={() => setMuted(prev => !prev)} className="player-btn">{muted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
            <input aria-label="Volume" type="range" min="0" max="1" step="0.01" value={muted ? 0 : volume} onChange={(e) => { setVolume(Number(e.target.value)); setMuted(false); }} className="premium-volume-range w-20 hidden lg:block" />
            <div className="ml-auto flex items-center gap-2">
              <div className="hidden md:flex rounded-full bg-white/8 border border-white/10 p-1">
                {directSources.map((src, i) => (
                  <button key={src.id} onClick={() => switchQuality(i)} className={`px-3 py-1.5 rounded-full text-xs font-black transition-all ${i === activeQuality ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/25' : 'text-white/65 hover:text-white hover:bg-white/10'}`}>{src.quality}</button>
                ))}
              </div>
              <div className="relative">
                <button aria-label="Player settings" onClick={() => setShowSettings(prev => !prev)} className="player-btn"><Settings size={18} /></button>
                <AnimatePresence>
                  {showSettings && <motion.div initial={{ opacity: 0, y: 8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.96 }} className="absolute bottom-12 right-0 w-64 rounded-2xl bg-black/90 border border-white/10 backdrop-blur-2xl p-3 shadow-2xl">
                    <div className="text-[11px] uppercase tracking-widest text-white/45 font-black px-2 mb-2">Quality</div>
                    {directSources.map((src, i) => <button key={src.id} onClick={() => { switchQuality(i); setShowSettings(false); }} className={`w-full text-left px-3 py-2 rounded-xl text-sm font-semibold ${i === activeQuality ? 'bg-brand-500 text-white' : 'hover:bg-white/10 text-white/75'}`}>{src.quality}</button>)}
                    <div className="h-px bg-white/10 my-2" />
                    <div className="text-[11px] uppercase tracking-widest text-white/45 font-black px-2 mb-2">Speed</div>
                    {[0.75, 1, 1.25, 1.5, 2].map(rate => <button key={rate} onClick={() => setSpeed(rate)} className={`w-full text-left px-3 py-2 rounded-xl text-sm font-semibold ${speed === rate ? 'bg-white/15 text-white' : 'hover:bg-white/10 text-white/75'}`}><Gauge size={14} className="inline mr-2" />{rate}x</button>)}
                  </motion.div>}
                </AnimatePresence>
              </div>
              <button aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'} onClick={toggleFullscreen} className="player-btn">{fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}</button>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-white/45 sm:hidden">
            <span>{formatClock(current)}</span><span>{formatClock(duration)}</span>
          </div>
        </div>
      </div>
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

  const entries = sortSourceEntries(stream.sources).map(([key, source], index) => ({ key, source, label: PLAYER_NAMES[index] || `Player ${index + 1}` }));
  const currentOption = entries[Math.min(activePlayer, Math.max(entries.length - 1, 0))];
  const archiveSource = stream.sources.archive || stream.sources.archiveSmall;
  const archiveId = stream.archiveId || archiveSource?.url.split('/details/')[1]?.split('/')[0];
  const relatedStreams = allStreams.filter(s => s.videoId !== id).slice(0, 4);

  const handleAddBookmark = () => { const timeStr = prompt('Enter timestamp to bookmark (e.g., 01:23:45):'); if (!timeStr) return; const newBms = [...bookmarks, { time: Date.now(), note: `Bookmark at ${timeStr}` }]; setBookmarks(newBms); localStorage.setItem(`bookmarks_${id}`, JSON.stringify(newBms)); };
  const removeBookmark = (index: number) => { const newBms = bookmarks.filter((_, i) => i !== index); setBookmarks(newBms); localStorage.setItem(`bookmarks_${id}`, JSON.stringify(newBms)); };
  const handleShare = async () => { const shareUrl = window.location.href; try { await navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { prompt('Copy this link:', shareUrl); } };
  const shortcuts = [
    { key: 'Space / K', desc: 'Play or pause', hint: 'Control video playback' },
    { key: '← / →', desc: 'Seek 10 seconds', hint: 'Jump backward or forward' },
    { key: 'M', desc: 'Mute audio', hint: 'Toggle sound' },
    { key: 'F', desc: 'Fullscreen', hint: 'Enter cinema mode' },
    { key: 'S', desc: 'Switch player', hint: 'Cycle D3xture / Heart / Jatt / Helicopter' },
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
          <div><h1 className="text-2xl sm:text-3xl font-bold font-display leading-tight mb-3">{stream.title}</h1><div className="flex flex-wrap items-center gap-4 text-sm text-dark-500 dark:text-dark-400 font-medium"><span className="flex items-center gap-1.5"><Clock size={16} /> {stream.date} • {stream.duration}</span>{stream.size && <span className="flex items-center gap-1.5"><HardDrive size={16} /> {stream.size}</span>}</div><div className="flex flex-wrap items-center gap-3 mt-6 pb-6 border-b border-dark-200 dark:border-dark-800"><button onClick={handleAddBookmark} className="btn-secondary flex items-center gap-2"><Bookmark size={18} /> Bookmark</button><button onClick={handleShare} className="btn-secondary flex items-center gap-2">{copied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}{copied ? 'Copied!' : 'Share'}</button><button onClick={() => setShowShortcuts(true)} className="btn-secondary flex items-center gap-2 ml-auto"><Keyboard size={16} /> Shortcuts</button></div></div>
          {relatedStreams.length > 0 && <div><div className="flex items-center justify-between mb-4"><h3 className="text-lg font-bold font-display">More Recordings</h3><Link to="/gallery" className="text-sm text-brand-500 font-medium flex items-center gap-1">View All <ChevronRight size={14} /></Link></div><div className="grid grid-cols-2 md:grid-cols-4 gap-4">{relatedStreams.map(rs => <Link key={rs.videoId} to={`/watch/${rs.videoId}`} state={{ stream: rs }} className="group"><div className="relative aspect-video rounded-xl overflow-hidden bg-dark-200 dark:bg-dark-800 mb-2"><img src={rs.thumbnail} alt={rs.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" onError={(e) => { (e.target as HTMLImageElement).src = `${import.meta.env.BASE_URL}thumbnail.jpg`; }} /></div><h4 className="text-xs font-semibold line-clamp-2 group-hover:text-brand-500 transition-colors">{rs.title}</h4></Link>)}</div></div>}
        </div>
        <div className="space-y-5">
          <div className="glass-panel p-5 rounded-2xl border border-dark-200 dark:border-dark-800"><h3 className="font-bold mb-4 text-base">Player Sources</h3><div className="space-y-2">{entries.map((entry, index) => <button key={entry.key} onClick={() => setActivePlayer(index)} className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${index === activePlayer ? 'bg-brand-50 dark:bg-brand-900/30 border border-brand-200 dark:border-brand-800 text-brand-700 dark:text-brand-300' : 'bg-dark-50 dark:bg-dark-800 hover:bg-dark-100 dark:hover:bg-dark-700 border border-transparent'}`}><span className="font-bold text-sm flex items-center gap-2"><span>{index === 0 ? '▶' : '↻'}</span>{entry.label}</span>{index === activePlayer && <span className="w-2 h-2 rounded-full bg-brand-500" />}</button>)}</div></div>
          <div className="glass-panel p-5 rounded-2xl border border-dark-200 dark:border-dark-800"><h3 className="font-bold mb-4 text-base">My Highlights</h3>{bookmarks.length === 0 ? <p className="text-sm text-dark-400">No bookmarks saved yet. Click Bookmark to save important moments.</p> : <div className="space-y-2">{bookmarks.map((bm, i) => <div key={bm.time} className="p-3 bg-dark-50 dark:bg-dark-800 rounded-xl text-sm border border-dark-200 dark:border-dark-700 flex items-start justify-between gap-2"><div><div className="font-medium text-brand-600 dark:text-brand-400 text-xs">Highlight {i + 1}</div><div className="text-dark-600 dark:text-dark-300">{bm.note}</div></div><button onClick={() => removeBookmark(i)} className="text-dark-400 hover:text-red-500 p-1"><X size={14} /></button></div>)}</div>}</div>
          <div className="glass-panel p-5 rounded-2xl border border-dark-200 dark:border-dark-800"><h3 className="font-bold mb-4 text-base flex items-center gap-2"><MessageSquare size={16} /> Live Chat Replay</h3><ChatReplay chatUrl={stream.chatUrl} archiveId={archiveId} currentTime={playerTime} /></div>
        </div>
      </div>
      <AnimatePresence>{showShortcuts && <motion.div className="fixed inset-0 z-[110] flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><button onClick={() => setShowShortcuts(false)} className="absolute inset-0 bg-black/70 backdrop-blur-md" /><motion.div initial={{ opacity: 0, y: 24, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 24, scale: 0.94 }} className="relative w-full max-w-lg glass-panel rounded-3xl z-[111] shadow-2xl border border-white/20 dark:border-white/10 overflow-hidden"><div className="p-6 border-b border-dark-200 dark:border-dark-800 flex justify-between"><div><div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 text-brand-500 text-xs font-bold mb-3 border border-brand-500/20"><Keyboard size={14} /> Watch Controls</div><h2 className="text-2xl font-bold font-display">Keyboard Shortcuts</h2></div><button onClick={() => setShowShortcuts(false)}><X size={18} /></button></div><div className="p-6 space-y-3">{shortcuts.map(item => <div key={item.key} className="flex items-center justify-between gap-4 p-4 bg-white/70 dark:bg-dark-800/80 rounded-2xl border border-dark-200/80 dark:border-dark-700/80"><div><span className="block text-sm font-semibold">{item.desc}</span><span className="block text-xs text-dark-400 mt-0.5">{item.hint}</span></div><kbd className="min-w-12 text-center px-3 py-2 rounded-xl bg-dark-900 text-white dark:bg-white dark:text-dark-900 text-xs font-mono font-black">{item.key}</kbd></div>)}</div></motion.div></motion.div>}</AnimatePresence>
    </div>
  );
}
