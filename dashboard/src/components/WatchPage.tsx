import { useState, useEffect, useCallback, useRef } from 'react';
import { MediaPlayer, MediaProvider, type MediaPlayerInstance } from '@vidstack/react';
import { defaultLayoutIcons, DefaultVideoLayout } from '@vidstack/react/player/layouts/default';
import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';
import type { Recording } from '../utils/dataFetcher';

interface Props {
  rec: Recording;
  onClose: () => void;
  allRecordings: Recording[];
  onNavigate: (rec: Recording) => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

function getPlaybackSources(rec: Recording): { label: string; url: string }[] {
  const s: { label: string; url: string }[] = [];
  if (rec.githubDirect || rec.githubRelease) s.push({ label: 'Auto', url: (rec.githubDirect || rec.githubRelease)! });
  if (rec.archiveNode) s.push({ label: 'Server 1', url: rec.archiveNode });
  if (rec.archiveDirect && rec.archiveDirect !== rec.archiveNode) s.push({ label: 'Server 2', url: rec.archiveDirect });
  if (rec.r2Link) s.push({ label: 'Server 3', url: rec.r2Link });
  return s;
}

// ONLY Pixeldrain, MEGA, Gofile
function getDownloads(rec: Recording): { label: string; url: string; color: string }[] {
  const d: { label: string; url: string; color: string }[] = [];
  if (rec.megaLink) d.push({ label: 'MEGA', url: rec.megaLink, color: '#D9272E' });
  if (rec.pixeldrainLink) d.push({ label: 'Pixeldrain', url: rec.pixeldrainLink, color: '#6366f1' });
  if (rec.gofileLink) d.push({ label: 'Gofile', url: rec.gofileLink, color: '#3b82f6' });
  return d;
}

function fmtTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export function WatchPage({ rec, onClose, allRecordings, onNavigate, theme, onToggleTheme }: Props) {
  const playerRef = useRef<MediaPlayerInstance>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const sources = getPlaybackSources(rec);
  const downloads = getDownloads(rec);
  const chapters = rec.aiChapters || [];
  const [activeSource, setActiveSource] = useState(0);
  const [activeChapter, setActiveChapter] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const others = allRecordings.filter(r => r.videoId !== rec.videoId).slice(0, 8);

  // Load chat
  useEffect(() => {
    if (!rec.chatUrl) return;
    setChatLoading(true);
    fetch(rec.chatUrl)
      .then(r => { if (!r.ok || (r.headers.get('content-type') || '').includes('html')) throw new Error(); return r.text(); })
      .then(text => {
        try { const arr = JSON.parse(text); if (Array.isArray(arr) && arr.length) { setChatMessages(arr); setShowChat(true); } }
        catch { const lines = text.split('\n').filter(l => l.trim()).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); if (lines.length) { setChatMessages(lines); setShowChat(true); } }
      })
      .catch(() => {})
      .finally(() => setChatLoading(false));
  }, [rec.chatUrl]);

  // Escape to close
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  // Track current time for chapters + chat sync
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const onTime = () => {
      const t = player.currentTime || 0;
      setCurrentTime(t);
      if (chapters.length) {
        for (let i = chapters.length - 1; i >= 0; i--) {
          if (t >= chapters[i].time) { setActiveChapter(i); break; }
        }
      }
    };
    player.addEventListener('time-update', onTime);
    return () => player.removeEventListener('time-update', onTime);
  }, [chapters]);

  // Auto-scroll chat to current time
  useEffect(() => {
    if (!showChat || !chatMessages.length || !chatContainerRef.current) return;
    const container = chatContainerRef.current;
    const children = container.children;
    for (let i = children.length - 1; i >= 0; i--) {
      const el = children[i] as HTMLElement;
      const t = parseFloat(el.dataset.time || '0');
      if (t <= currentTime) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        break;
      }
    }
  }, [currentTime, showChat, chatMessages]);

  const seekTo = useCallback((sec: number) => {
    const p = playerRef.current;
    if (p) { p.currentTime = sec; p.play().catch(() => {}); }
  }, []);

  const playUrl = sources[activeSource]?.url || '';

  return (
    <div style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', minHeight: '100vh' }}>
      {/* ── Top Bar ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 sm:px-6 lg:px-8 h-14 border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}>
        <button onClick={onClose} className="flex items-center gap-2 text-sm font-medium group">
          <svg className="w-5 h-5 group-hover:-translate-x-1 transition-transform" style={{ color: 'var(--text-secondary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          <img src="/logo-vertical.pn.jpg" alt="" className="w-7 h-7 rounded-full object-cover" />
          <span className="hidden sm:inline" style={{ color: 'var(--text-secondary)' }}>Archive</span>
        </button>
        <div className="flex items-center gap-2">
          <button onClick={onToggleTheme} className="p-2.5 rounded-full transition-all hover:scale-110" style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }} title="Toggle theme">
            {theme === 'dark' ? <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><circle cx="12" cy="12" r="5" strokeWidth={2}/><path strokeLinecap="round" strokeWidth={2} d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
            : <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>}
          </button>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row">
        {/* ── Left Column ────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          {/* Player — edge-to-edge on mobile, padded on desktop */}
          <div className="xl:p-6 xl:pb-0">
            {playUrl ? (
              <MediaPlayer key={playUrl} ref={playerRef} src={playUrl} viewType="video" streamType="on-demand" crossOrigin="" playsInline autoPlay className="w-full aspect-video xl:rounded-2xl overflow-hidden bg-black shadow-2xl">
                <MediaProvider />
                <DefaultVideoLayout icons={defaultLayoutIcons} />
              </MediaPlayer>
            ) : (
              <div className="w-full aspect-video xl:rounded-2xl flex items-center justify-center" style={{ background: '#000' }}>
                <p style={{ color: '#666' }}>No playback source available</p>
              </div>
            )}
          </div>

          {/* Info Section */}
          <div className="px-4 sm:px-6 xl:px-6 pt-5 pb-8 space-y-6">
            {/* Title */}
            <div>
              <h1 className="text-[22px] sm:text-[26px] font-bold leading-tight tracking-tight">{rec.title}</h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3">
                <div className="flex items-center gap-2">
                  <img src="/logo-vertical.pn.jpg" alt="" className="w-10 h-10 rounded-full object-cover" />
                  <div>
                    <p className="text-[15px] font-semibold">The Muslim Lantern</p>
                    <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>{rec.date} · {rec.durationFmt} · {rec.sizeHuman}{rec.resolution?.includes('1080') ? ' · 1080p' : ''}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Source Switcher */}
            {sources.length > 1 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[12px] font-bold uppercase tracking-widest mr-1" style={{ color: 'var(--text-muted)' }}>Playback:</span>
                {sources.map((s, i) => (
                  <button key={i} onClick={() => setActiveSource(i)} className="text-[13px] px-4 py-2 rounded-full font-semibold transition-all" style={{ background: i === activeSource ? 'var(--accent)' : 'var(--bg-tertiary)', color: i === activeSource ? '#fff' : 'var(--text-secondary)' }}>
                    {s.label}
                  </button>
                ))}
              </div>
            )}

            {/* Downloads — ONLY MEGA, Pixeldrain, Gofile */}
            {downloads.length > 0 && (
              <div>
                <h3 className="text-[13px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>Download</h3>
                <div className="flex flex-wrap gap-3">
                  {downloads.map((dl, i) => (
                    <a key={i} href={dl.url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-2.5 px-5 py-3 rounded-xl text-[14px] font-semibold text-white transition-all hover:scale-[1.03] hover:shadow-lg active:scale-[0.98]"
                      style={{ background: dl.color }}>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                      {dl.label}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Chapters */}
            {chapters.length > 0 && (
              <div>
                <h3 className="text-[13px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>
                  Chapters · {chapters.length}
                </h3>
                <div className="rounded-2xl overflow-hidden border" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
                  {chapters.map((ch, i) => {
                    const isActive = i === activeChapter;
                    const isGuest = ch.label.toLowerCase().includes('joins');
                    return (
                      <button key={i} onClick={() => seekTo(ch.time)}
                        className="w-full flex items-center gap-4 px-5 py-3.5 text-left transition-all border-b last:border-b-0 group cursor-pointer"
                        style={{ background: isActive ? 'var(--bg-tertiary)' : 'transparent', borderColor: 'var(--border)' }}>
                        {/* Timestamp */}
                        <span className="text-[14px] font-mono w-[70px] shrink-0 tabular-nums font-bold transition-colors" style={{ color: isActive ? 'var(--accent)' : 'var(--text-muted)' }}>
                          {fmtTime(ch.time)}
                        </span>
                        {/* Guest icon */}
                        {isGuest && <span className="text-[16px]">👤</span>}
                        {/* Label */}
                        <span className="text-[15px] font-medium flex-1" style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                          {ch.label}
                        </span>
                        {/* Active indicator */}
                        {isActive && (
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--accent)' }} />
                            <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--accent)' }}>Playing</span>
                          </span>
                        )}
                        {/* Hover arrow */}
                        {!isActive && (
                          <svg className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--text-muted)' }} fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Live Chat Replay */}
            {showChat && chatMessages.length > 0 && (
              <div>
                <h3 className="text-[13px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>
                  Live Chat Replay · {chatMessages.length} messages
                </h3>
                <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
                  <div ref={chatContainerRef} className="max-h-96 overflow-y-auto p-4 space-y-2.5">
                    {chatMessages.map((msg, i) => {
                      const msgTime = msg.time_in_seconds || msg.timestamp || 0;
                      const isVisible = msgTime <= currentTime + 5;
                      const author = msg.author?.name || msg.author || 'Viewer';
                      const text = msg.message || msg.text || msg.body || '';
                      if (!text) return null;
                      return (
                        <div key={i} data-time={msgTime}
                          className="flex gap-2.5 text-[13px] transition-opacity duration-300"
                          style={{ opacity: isVisible ? 1 : 0.25 }}>
                          <span className="font-mono text-[11px] w-12 shrink-0 tabular-nums pt-0.5" style={{ color: 'var(--text-muted)' }}>
                            {fmtTime(msgTime)}
                          </span>
                          <div>
                            <span className="font-semibold mr-1.5" style={{ color: 'var(--accent)' }}>{author}</span>
                            <span style={{ color: 'var(--text-secondary)' }}>{text}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Right Sidebar ──────────────────────────────────────────── */}
        {others.length > 0 && (
          <div className="xl:w-[420px] shrink-0 border-l px-4 sm:px-6 xl:px-5 pb-10 pt-4 xl:pt-6" style={{ borderColor: 'var(--border)' }}>
            <h3 className="text-[13px] font-bold uppercase tracking-widest mb-5" style={{ color: 'var(--text-muted)' }}>More Streams</h3>
            <div className="space-y-5">
              {others.map(o => (
                <button key={o.videoId} onClick={() => { onNavigate(o); window.scrollTo(0, 0); }} className="flex gap-3.5 w-full text-left group">
                  <div className="w-[168px] shrink-0 aspect-video rounded-xl overflow-hidden" style={{ background: 'var(--bg-tertiary)' }}>
                    <img src={o.thumbnail} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  </div>
                  <div className="min-w-0 pt-0.5 flex-1">
                    <p className="text-[14px] font-semibold line-clamp-2 leading-snug group-hover:underline decoration-1 underline-offset-2" style={{ color: 'var(--text-primary)' }}>{o.title}</p>
                    <p className="text-[12px] mt-1.5" style={{ color: 'var(--text-muted)' }}>The Muslim Lantern</p>
                    <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{o.date} · {o.durationFmt}</p>
                    {o.aiChapters && o.aiChapters.filter(c => c.label.toLowerCase().includes('joins')).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {o.aiChapters.filter(c => c.label.toLowerCase().includes('joins')).slice(0, 2).map((c, i) => (
                          <span key={i} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
                            {c.label.replace(' joins', '')}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
