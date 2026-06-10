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
  Settings,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { StreamData, fetchStreams } from '../utils/dataFetcher';

interface PlayerSource {
  id: string;
  label: string;
  quality: string;
  url: string;
}

interface ChatMessage {
  time: number;
  author: string;
  message: string;
  amount?: string;
  color?: string;
  type?: string;
}

const PLAYER_NAMES = ['D3xture', 'heart', 'jatt', 'helicopter'];

function formatClock(seconds: number) {
  if (!Number.isFinite(seconds)) return '0:00';
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

function pixeldrainDirect(url?: string) {
  const id = (url || '').match(/pixeldrain\.com\/u\/([a-zA-Z0-9_-]+)/)?.[1];
  return id ? `https://pixeldrain.com/api/file/${id}` : '';
}

async function archiveDirectSources(archiveId: string): Promise<PlayerSource[]> {
  const res = await fetch(`https://archive.org/metadata/${archiveId}?t=${Date.now()}`);
  if (!res.ok) throw new Error(`Archive metadata HTTP ${res.status}`);
  const data = await res.json();
  const files = Array.isArray(data.files) ? data.files : [];
  const playable = files
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
    });

  return playable.slice(0, 3).map((file: { name: string; size?: string }, index: number) => {
    const encodedName = file.name.split('/').map(encodeURIComponent).join('/');
    const lower = file.name.toLowerCase();
    const quality = lower.includes('compressed') ? 'Compact' : index === 0 ? 'Best' : `Alt ${index}`;
    return {
      id: `archive-${index}`,
      label: PLAYER_NAMES[index] || `Player ${index + 1}`,
      quality,
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

  const source = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as any)?.messages)
      ? (payload as any).messages
      : Array.isArray((payload as any)?.replayChatItemAction?.actions)
        ? (payload as any).replayChatItemAction.actions
        : [];

  return source.map(normalize).filter(Boolean).sort((a: ChatMessage, b: ChatMessage) => a.time - b.time) as ChatMessage[];
}

async function fetchChatMessages(chatUrl?: string, archiveId?: string): Promise<ChatMessage[]> {
  const candidates = [chatUrl, archiveId ? `https://archive.org/download/${archiveId}/chat.json` : ''].filter(Boolean) as string[];
  for (const url of candidates) {
    try {
      const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`);
      if (!res.ok) continue;
      const text = await res.text();
      try {
        return parseChatPayload(JSON.parse(text));
      } catch {
        const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
        const parsed = lines.map(line => {
          try { return JSON.parse(line); } catch { return null; }
        }).filter(Boolean);
        return parseChatPayload(parsed);
      }
    } catch {
      // try next candidate
    }
  }
  return [];
}

function PremiumVideoPlayer({ stream, archiveId, onTime }: { stream: StreamData; archiveId?: string; onTime: (time: number) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [sources, setSources] = useState<PlayerSource[]>([]);
  const [active, setActive] = useState(0);
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
    async function resolveSources() {
      setLoading(true);
      setError('');
      try {
        const resolved: PlayerSource[] = [];
        if (archiveId) resolved.push(...await archiveDirectSources(archiveId));
        const pixel = pixeldrainDirect(stream.sources.pixel?.url);
        if (pixel) resolved.push({ id: 'pixel', label: PLAYER_NAMES[resolved.length] || `Player ${resolved.length + 1}`, quality: 'Fast', url: pixel });
        const unique = resolved.filter((src, index, arr) => arr.findIndex(item => item.url === src.url) === index).slice(0, 4)
          .map((src, index) => ({ ...src, label: PLAYER_NAMES[index] || `Player ${index + 1}` }));
        if (!cancelled) {
          if (unique.length === 0) throw new Error('No clean playable source found');
          setSources(unique);
          setActive(0);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not prepare player');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    resolveSources();
    return () => { cancelled = true; };
  }, [archiveId, stream.sources.pixel?.url]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
    video.muted = muted;
    video.playbackRate = speed;
  }, [volume, muted, speed, sources, active]);

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

  const switchSource = (index: number) => {
    const video = videoRef.current;
    const previousTime = video?.currentTime || 0;
    const wasPlaying = video ? !video.paused : false;
    setActive(index);
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
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'm':
          setMuted(prev => !prev);
          break;
        case 'f':
          toggleFullscreen();
          break;
        case 'arrowright':
          if (video) video.currentTime += 10;
          break;
        case 'arrowleft':
          if (video) video.currentTime -= 10;
          break;
        case 's':
          if (sources.length > 1) switchSource((active + 1) % sources.length);
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [active, sources.length]);

  if (loading) {
    return <div className="w-full h-full flex flex-col items-center justify-center bg-black text-white"><div className="w-12 h-12 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mb-4" /><p className="text-sm text-white/70">Preparing premium player…</p></div>;
  }

  if (error || sources.length === 0) {
    return <div className="w-full h-full flex flex-col items-center justify-center bg-black text-center p-6 text-white"><AlertTriangle size={34} className="text-brand-400 mb-4" /><h3 className="text-xl font-bold mb-2">Playback unavailable</h3><p className="text-white/60 max-w-md text-sm">The clean public player could not be prepared right now.</p></div>;
  }

  const progress = duration ? (current / duration) * 100 : 0;

  return (
    <div ref={wrapRef} className="relative w-full h-full bg-black text-white group overflow-hidden">
      <video
        ref={videoRef}
        key={sources[active]?.url}
        src={sources[active]?.url}
        poster={archiveId ? `https://archive.org/services/img/${archiveId}` : stream.thumbnail}
        className="w-full h-full object-contain bg-black"
        playsInline
        preload="metadata"
        controlsList="nodownload noplaybackrate"
        onClick={togglePlay}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => { setCurrent(e.currentTarget.currentTime); onTime(e.currentTarget.currentTime); }}
      />

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/35 opacity-100" />
      <img src={`${import.meta.env.BASE_URL}logo-vertical.pn.jpg`} alt="" className="absolute top-4 left-4 h-12 w-12 rounded-full object-cover opacity-85 shadow-2xl ring-1 ring-white/20" />
      <div className="absolute top-5 right-5 rounded-full bg-black/45 px-3 py-1 text-xs font-bold backdrop-blur-md border border-white/10">{sources[active]?.label}</div>

      <button onClick={togglePlay} className="absolute inset-0 m-auto h-20 w-20 rounded-full bg-white/12 backdrop-blur-xl border border-white/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-2xl">
        {playing ? <Pause size={34} fill="currentColor" /> : <Play size={38} fill="currentColor" className="ml-1" />}
      </button>

      <div className="absolute left-0 right-0 bottom-0 p-4 md:p-5 space-y-3">
        <input type="range" min="0" max="100" value={progress || 0} onChange={(e) => seekTo(Number(e.target.value))} className="premium-video-range w-full" />
        <div className="flex items-center gap-3">
          <button onClick={togglePlay} className="player-btn">{playing ? <Pause size={18} /> : <Play size={18} />}</button>
          <button onClick={() => { const video = videoRef.current; if (video) video.currentTime -= 10; }} className="player-btn"><RotateCcw size={17} /></button>
          <div className="text-xs font-mono text-white/80 min-w-[96px]">{formatClock(current)} / {formatClock(duration)}</div>
          <button onClick={() => setMuted(prev => !prev)} className="player-btn">{muted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
          <input type="range" min="0" max="1" step="0.01" value={muted ? 0 : volume} onChange={(e) => { setVolume(Number(e.target.value)); setMuted(false); }} className="premium-volume-range w-20 hidden sm:block" />
          <div className="ml-auto flex items-center gap-2">
            {sources.length > 1 && (
              <div className="hidden md:flex items-center gap-1 rounded-full bg-black/35 p-1 border border-white/10 backdrop-blur-md">
                {sources.map((src, i) => (
                  <button key={src.id} onClick={() => switchSource(i)} className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${i === active ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/25' : 'text-white/70 hover:text-white hover:bg-white/10'}`}>{src.label}</button>
                ))}
              </div>
            )}
            <div className="relative">
              <button onClick={() => setShowSettings(prev => !prev)} className="player-btn"><Settings size={18} /></button>
              <AnimatePresence>
                {showSettings && (
                  <motion.div initial={{ opacity: 0, y: 8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.96 }} className="absolute bottom-12 right-0 w-56 rounded-2xl bg-black/85 border border-white/10 backdrop-blur-xl p-3 shadow-2xl">
                    <div className="text-[11px] uppercase tracking-widest text-white/45 font-black px-2 mb-2">Player</div>
                    {sources.map((src, i) => <button key={src.id} onClick={() => { switchSource(i); setShowSettings(false); }} className={`w-full text-left px-3 py-2 rounded-xl text-sm ${i === active ? 'bg-brand-500 text-white' : 'hover:bg-white/10 text-white/75'}`}>{src.label} <span className="text-xs opacity-60">{src.quality}</span></button>)}
                    <div className="h-px bg-white/10 my-2" />
                    {[0.75, 1, 1.25, 1.5, 2].map(rate => <button key={rate} onClick={() => setSpeed(rate)} className={`w-full text-left px-3 py-2 rounded-xl text-sm ${speed === rate ? 'bg-white/15 text-white' : 'hover:bg-white/10 text-white/75'}`}><Gauge size={14} className="inline mr-2" />{rate}x speed</button>)}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <button onClick={toggleFullscreen} className="player-btn">{fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}</button>
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
    fetchChatMessages(chatUrl, archiveId).then(items => {
      if (!cancelled) setMessages(items);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [chatUrl, archiveId]);

  const visible = useMemo(() => {
    if (!messages.length) return [];
    return messages.filter(msg => msg.time <= currentTime + 2).slice(-80);
  }, [messages, currentTime]);

  if (loading) {
    return <div className="h-56 flex items-center justify-center text-dark-400 text-sm">Loading chat replay…</div>;
  }

  if (!messages.length) {
    return (
      <div className="h-56 flex flex-col items-center justify-center border-2 border-dashed border-dark-200 dark:border-dark-700 rounded-xl text-dark-400 text-center p-4">
        <MessageSquare size={20} className="mb-2 opacity-50" />
        <p className="text-xs font-medium">Chat replay unavailable</p>
        <p className="text-[10px] mt-1 opacity-70">Chat data may not have been captured for this recording.</p>
      </div>
    );
  }

  return (
    <div className="h-[420px] overflow-y-auto pr-1 space-y-2 chat-replay-scroll">
      {visible.map((msg, index) => {
        const paid = Boolean(msg.amount) || /paid|super/i.test(msg.type || '');
        return (
          <div key={`${msg.time}-${index}`} className={`rounded-2xl p-3 border ${paid ? 'bg-amber-500/15 border-amber-500/30' : 'bg-dark-50 dark:bg-dark-800/70 border-dark-200 dark:border-dark-700'}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono text-dark-400">{formatClock(msg.time)}</span>
              <span className={`text-xs font-bold ${paid ? 'text-amber-600 dark:text-amber-300' : 'text-brand-600 dark:text-brand-300'}`}>{msg.author}</span>
              {paid && <span className="ml-auto rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-black text-white">{msg.amount || 'Super Chat'}</span>}
            </div>
            <p className="text-sm text-dark-700 dark:text-dark-100 leading-relaxed break-words">{msg.message}</p>
          </div>
        );
      })}
    </div>
  );
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

  useEffect(() => {
    if (!id) return;
    try {
      const saved = localStorage.getItem(`bookmarks_${id}`);
      if (saved) setBookmarks(JSON.parse(saved));
    } catch {}
  }, [id]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === '?') {
        e.preventDefault();
        setShowShortcuts(prev => !prev);
      }
      if (e.key === 'Escape') setShowShortcuts(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (!showShortcuts) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [showShortcuts]);

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="max-w-md">
          <div className="w-24 h-24 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-6">
            <AlertTriangle size={44} className="text-red-500" />
          </div>
          <h2 className="text-3xl font-bold font-display mb-3">Video Not Found</h2>
          <p className="text-dark-500 mb-8">The recording with ID <code className="px-2 py-0.5 bg-dark-100 dark:bg-dark-800 rounded text-sm font-mono">{id}</code> doesn't exist in the archive.</p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => navigate(-1)} className="btn-secondary flex items-center gap-2"><ArrowLeft size={16} /> Go Back</button>
            <button onClick={() => navigate('/gallery')} className="btn-primary">Browse Gallery</button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!stream) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-dark-500 text-sm font-medium animate-pulse">Loading recording...</p>
        </div>
      </div>
    );
  }

  const archiveSource = stream.sources.archive || stream.sources.archiveSmall;
  const archiveId = stream.archiveId || archiveSource?.url.split('/details/')[1]?.split('/')[0];
  const relatedStreams = allStreams.filter(s => s.videoId !== id).slice(0, 4);

  const handleAddBookmark = () => {
    const timeStr = prompt('Enter timestamp to bookmark (e.g., 01:23:45):');
    if (!timeStr) return;
    const newBms = [...bookmarks, { time: Date.now(), note: `Bookmark at ${timeStr}` }];
    setBookmarks(newBms);
    localStorage.setItem(`bookmarks_${id}`, JSON.stringify(newBms));
  };

  const removeBookmark = (index: number) => {
    const newBms = bookmarks.filter((_, i) => i !== index);
    setBookmarks(newBms);
    localStorage.setItem(`bookmarks_${id}`, JSON.stringify(newBms));
  };

  const handleShare = async () => {
    const shareUrl = window.location.href;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt('Copy this link:', shareUrl);
    }
  };

  const shortcuts = [
    { key: 'Space / K', desc: 'Play or pause', hint: 'Control video playback' },
    { key: '← / →', desc: 'Seek 10 seconds', hint: 'Jump backward or forward' },
    { key: 'M', desc: 'Mute audio', hint: 'Toggle sound' },
    { key: 'F', desc: 'Fullscreen', hint: 'Enter cinema mode' },
    { key: 'S', desc: 'Switch player', hint: 'Cycle D3xture / heart / jatt / helicopter when available' },
    { key: '?', desc: 'Shortcuts', hint: 'Show this panel' },
  ];

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6">
      <motion.button initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} onClick={() => navigate(-1)} className="flex items-center gap-2 text-dark-500 hover:text-brand-500 mb-4 transition-colors font-medium group">
        <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" /> Back to Gallery
      </motion.button>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-6">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10">
            <PremiumVideoPlayer stream={stream} archiveId={archiveId} onTime={setPlayerTime} />
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <h1 className="text-2xl sm:text-3xl font-bold font-display leading-tight mb-3">{stream.title}</h1>
            <div className="flex flex-wrap items-center gap-4 text-sm text-dark-500 dark:text-dark-400 font-medium">
              <span className="flex items-center gap-1.5"><Clock size={16} /> {stream.date} • {stream.duration}</span>
              {stream.size && <span className="flex items-center gap-1.5"><HardDrive size={16} /> {stream.size}</span>}
            </div>

            <div className="flex flex-wrap items-center gap-3 mt-6 pb-6 border-b border-dark-200 dark:border-dark-800">
              <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={handleAddBookmark} className="btn-secondary flex items-center gap-2"><Bookmark size={18} /> Bookmark</motion.button>
              <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={handleShare} className="btn-secondary flex items-center gap-2">
                {copied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}{copied ? 'Copied!' : 'Share'}
              </motion.button>
              <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={() => setShowShortcuts(true)} className="btn-secondary flex items-center gap-2 ml-auto"><Keyboard size={16} /> <span className="hidden sm:block">Shortcuts</span></motion.button>
            </div>
          </motion.div>

          {relatedStreams.length > 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold font-display">More Recordings</h3>
                <Link to="/gallery" className="text-sm text-brand-500 hover:text-brand-400 font-medium flex items-center gap-1">View All <ChevronRight size={14} /></Link>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {relatedStreams.map(rs => (
                  <Link key={rs.videoId} to={`/watch/${rs.videoId}`} state={{ stream: rs }} className="group">
                    <div className="relative aspect-video rounded-xl overflow-hidden bg-dark-200 dark:bg-dark-800 mb-2 border border-dark-200 dark:border-dark-800">
                      <img src={rs.thumbnail} alt={rs.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).src = `${import.meta.env.BASE_URL}thumbnail.jpg`; }} />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center"><Play size={24} fill="white" className="text-white opacity-0 group-hover:opacity-100 transition-opacity" /></div>
                      <div className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-md">{rs.duration || '?'}</div>
                    </div>
                    <h4 className="text-xs font-semibold line-clamp-2 group-hover:text-brand-500 transition-colors">{rs.title}</h4>
                  </Link>
                ))}
              </div>
            </motion.div>
          )}
        </div>

        <div className="space-y-5">
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="glass-panel p-5 rounded-2xl border border-dark-200 dark:border-dark-800">
            <h3 className="font-bold mb-4 text-base">My Highlights</h3>
            {bookmarks.length === 0 ? <p className="text-sm text-dark-400">No bookmarks saved yet. Click Bookmark to save important moments.</p> : (
              <div className="space-y-2">
                <AnimatePresence>
                  {bookmarks.map((bm, i) => (
                    <motion.div key={bm.time} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="p-3 bg-dark-50 dark:bg-dark-800 rounded-xl text-sm border border-dark-200 dark:border-dark-700 flex items-start justify-between gap-2">
                      <div><div className="font-medium text-brand-600 dark:text-brand-400 text-xs">Highlight {i + 1}</div><div className="text-dark-600 dark:text-dark-300">{bm.note}</div></div>
                      <button onClick={() => removeBookmark(i)} className="text-dark-400 hover:text-red-500 p-1 flex-shrink-0 transition-colors"><X size={14} /></button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </motion.div>

          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }} className="glass-panel p-5 rounded-2xl border border-dark-200 dark:border-dark-800">
            <h3 className="font-bold mb-4 text-base flex items-center gap-2"><MessageSquare size={16} /> Live Chat Replay</h3>
            <ChatReplay chatUrl={stream.chatUrl} archiveId={archiveId} currentTime={playerTime} />
          </motion.div>
        </div>
      </div>

      <AnimatePresence>
        {showShortcuts && (
          <motion.div className="fixed inset-0 z-[110] flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <button type="button" aria-label="Close keyboard shortcuts" onClick={() => setShowShortcuts(false)} className="absolute inset-0 bg-black/70 backdrop-blur-md" />
            <motion.div role="dialog" aria-modal="true" initial={{ opacity: 0, y: 24, scale: 0.94, filter: 'blur(8px)' }} animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }} exit={{ opacity: 0, y: 24, scale: 0.94, filter: 'blur(8px)' }} transition={{ type: 'spring', stiffness: 380, damping: 30 }} className="relative w-full max-w-lg glass-panel rounded-3xl z-[111] shadow-2xl border border-white/20 dark:border-white/10 overflow-hidden">
              <div className="relative p-6 border-b border-dark-200/70 dark:border-dark-800/80 flex items-start justify-between gap-4"><div><div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 text-brand-500 text-xs font-bold mb-3 border border-brand-500/20"><Keyboard size={14} /> Watch Controls</div><h2 className="text-2xl font-bold font-display">Keyboard Shortcuts</h2><p className="text-sm text-dark-500 dark:text-dark-400 mt-1">Premium player controls.</p></div><button onClick={() => setShowShortcuts(false)} className="p-2 hover:bg-dark-100 dark:hover:bg-dark-800 rounded-full transition-colors"><X size={18} /></button></div>
              <div className="relative p-6 space-y-3">{shortcuts.map((shortcut, i) => <motion.div key={shortcut.key} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.06 * i }} className="flex items-center justify-between gap-4 p-4 bg-white/70 dark:bg-dark-800/80 rounded-2xl border border-dark-200/80 dark:border-dark-700/80"><div className="min-w-0"><span className="block text-sm font-semibold text-dark-800 dark:text-dark-100">{shortcut.desc}</span><span className="block text-xs text-dark-400 mt-0.5">{shortcut.hint}</span></div><kbd className="min-w-12 text-center px-3 py-2 rounded-xl bg-dark-900 text-white dark:bg-white dark:text-dark-900 text-xs font-mono font-black shadow-lg shadow-black/10 border border-white/10">{shortcut.key}</kbd></motion.div>)}</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
