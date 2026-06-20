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

// VIDEO PLAYBACK: Archive.org nodes serve video/mp4 with range support.
// GitHub Releases redirect with content-disposition:attachment (breaks streaming).
// So Archive FIRST, GitHub as last resort.
function getPlaybackSources(rec: Recording): { label: string; url: string }[] {
  const s: { label: string; url: string }[] = [];
  if (rec.archiveNode) s.push({ label: 'Auto', url: rec.archiveNode });
  if (rec.archiveDirect && rec.archiveDirect !== rec.archiveNode) s.push({ label: 'Server 2', url: rec.archiveDirect });
  if (rec.r2Link) s.push({ label: 'CDN', url: rec.r2Link });
  // GitHub as fallback only (may not stream inline)
  if (!s.length && (rec.githubDirect || rec.githubRelease)) s.push({ label: 'Auto', url: (rec.githubDirect || rec.githubRelease)! });
  return s;
}

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
  const chatRef = useRef<HTMLDivElement>(null);
  const sources = getPlaybackSources(rec);
  const downloads = getDownloads(rec);
  const chapters = rec.aiChapters || [];
  const [activeSource, setActiveSource] = useState(0);
  const [activeChapter, setActiveChapter] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [showChat, setShowChat] = useState(false);
  const others = allRecordings.filter(r => r.videoId !== rec.videoId).slice(0, 8);

  // Load chat replay
  useEffect(() => {
    setChatMessages([]);
    setShowChat(false);
    if (!rec.chatUrl) return;
    fetch(rec.chatUrl)
      .then(r => { if (!r.ok || (r.headers.get('content-type') || '').includes('html')) throw new Error(); return r.text(); })
      .then(text => {
        let msgs: any[] = [];
        try { const arr = JSON.parse(text); if (Array.isArray(arr)) msgs = arr; } catch {
          msgs = text.split('\n').filter(l => l.trim()).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
        }
        if (msgs.length > 0) { setChatMessages(msgs); setShowChat(true); }
      })
      .catch(() => {});
  }, [rec.chatUrl]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  // Time tracking for chapters + chat
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const onTime = () => {
      const t = player.currentTime || 0;
      setCurrentTime(t);
      for (let i = chapters.length - 1; i >= 0; i--) {
        if (t >= chapters[i].time) { setActiveChapter(i); break; }
      }
    };
    player.addEventListener('time-update', onTime);
    return () => player.removeEventListener('time-update', onTime);
  }, [chapters]);

  // Chat auto-scroll
  useEffect(() => {
    if (!chatRef.current || !chatMessages.length) return;
    const el = chatRef.current;
    const children = Array.from(el.children);
    for (let i = children.length - 1; i >= 0; i--) {
      const t = parseFloat((children[i] as HTMLElement).dataset.time || '99999');
      if (t <= currentTime) { children[i].scrollIntoView({ block: 'nearest', behavior: 'smooth' }); break; }
    }
  }, [Math.floor(currentTime / 3)]); // update every 3s

  const seekTo = useCallback((sec: number) => {
    const p = playerRef.current;
    if (p) { p.currentTime = sec; p.play().catch(() => {}); }
  }, []);

  const playUrl = sources[activeSource]?.url || '';

  return (
    <div style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', minHeight: '100vh' }}>
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 sm:px-6 lg:px-8 h-14 border-b" style={{ borderColor: 'var(--border)' }}>
        <button onClick={onClose} className="flex items-center gap-2.5 group">
          <svg className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          <img src="/logo.png" alt="" className="h-7 hidden sm:block object-contain" />
          <img src="/logo-vertical.pn.jpg" alt="" className="w-7 h-7 rounded-full sm:hidden object-cover" />
        </button>
        <div className="flex items-center gap-2">
          <button onClick={onToggleTheme} className="p-2 rounded-full" style={{ color: 'var(--text-muted)' }}>
            {theme === 'dark' ? <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><circle cx="12" cy="12" r="5" strokeWidth={2}/><path strokeLinecap="round" strokeWidth={2} d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
            : <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>}
          </button>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row max-w-[1920px] mx-auto">
        {/* Left */}
        <div className="flex-1 min-w-0">
          {/* Player */}
          <div className="xl:p-5 xl:pb-0">
            {playUrl ? (
              <MediaPlayer key={playUrl} ref={playerRef} src={playUrl} viewType="video" streamType="on-demand" crossOrigin="" playsInline autoPlay
                className="w-full aspect-video xl:rounded-2xl overflow-hidden bg-black ring-1 ring-white/5">
                <MediaProvider />
                <DefaultVideoLayout icons={defaultLayoutIcons} />
              </MediaPlayer>
            ) : (
              <div className="w-full aspect-video xl:rounded-2xl flex items-center justify-center bg-black" style={{ color: '#555' }}>
                <div className="text-center"><p className="text-lg mb-2">Video loading...</p><p className="text-sm">Try switching playback source below</p></div>
              </div>
            )}
          </div>

          <div className="px-4 sm:px-6 xl:px-5 pt-5 pb-10 space-y-7">
            {/* Title + channel */}
            <div>
              <h1 className="text-[20px] sm:text-[24px] font-bold leading-tight">{rec.title}</h1>
              <div className="flex items-center gap-3 mt-3">
                <img src="/logo-vertical.pn.jpg" alt="" className="w-11 h-11 rounded-full object-cover ring-2" style={{ ringColor: 'var(--border)' }} />
                <div>
                  <p className="text-[15px] font-semibold">The Muslim Lantern</p>
                  <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>{rec.date} · {rec.durationFmt} · {rec.sizeHuman}{rec.resolution?.includes('1080') ? ' · 1080p HD' : ''}</p>
                </div>
              </div>
            </div>

            {/* Source switcher */}
            {sources.length > 1 && (
              <div className="flex items-center gap-2 flex-wrap p-4 rounded-2xl" style={{ background: 'var(--bg-secondary)' }}>
                <span className="text-[12px] font-bold uppercase tracking-widest mr-2" style={{ color: 'var(--text-muted)' }}>Playback:</span>
                {sources.map((s, i) => (
                  <button key={i} onClick={() => setActiveSource(i)} className="text-[13px] px-4 py-2 rounded-full font-semibold transition-all"
                    style={{ background: i === activeSource ? 'var(--accent)' : 'var(--bg-tertiary)', color: i === activeSource ? '#fff' : 'var(--text-secondary)' }}>
                    {s.label}
                  </button>
                ))}
              </div>
            )}

            {/* Downloads */}
            {downloads.length > 0 && (
              <div className="p-5 rounded-2xl" style={{ background: 'var(--bg-secondary)' }}>
                <h3 className="text-[13px] font-bold uppercase tracking-widest mb-4" style={{ color: 'var(--text-muted)' }}>Download</h3>
                <div className="flex flex-wrap gap-3">
                  {downloads.map((dl, i) => (
                    <a key={i} href={dl.url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-2.5 px-6 py-3 rounded-xl text-[14px] font-bold text-white transition-all hover:scale-[1.03] hover:shadow-lg active:scale-[0.97] shadow-md"
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
              <div className="p-5 rounded-2xl" style={{ background: 'var(--bg-secondary)' }}>
                <h3 className="text-[13px] font-bold uppercase tracking-widest mb-4" style={{ color: 'var(--text-muted)' }}>
                  Chapters · {chapters.length}
                </h3>
                <div className="space-y-1">
                  {chapters.map((ch, i) => {
                    const active = i === activeChapter;
                    const guest = ch.label.toLowerCase().includes('joins');
                    return (
                      <button key={i} onClick={() => seekTo(ch.time)}
                        className="w-full flex items-center gap-4 px-4 py-3 rounded-xl text-left transition-all group cursor-pointer"
                        style={{ background: active ? 'var(--bg-tertiary)' : 'transparent' }}>
                        <span className="text-[14px] font-mono w-[72px] shrink-0 tabular-nums font-bold" style={{ color: active ? 'var(--accent)' : 'var(--text-muted)' }}>
                          {fmtTime(ch.time)}
                        </span>
                        {guest && <span className="text-base">👤</span>}
                        <span className="text-[15px] font-medium flex-1" style={{ color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                          {ch.label}
                        </span>
                        {active ? (
                          <span className="flex items-center gap-1.5 shrink-0">
                            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--accent)' }} />
                            <span className="text-[11px] font-bold uppercase" style={{ color: 'var(--accent)' }}>Now</span>
                          </span>
                        ) : (
                          <svg className="w-4 h-4 opacity-0 group-hover:opacity-60 transition-opacity shrink-0" style={{ color: 'var(--text-muted)' }} fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Live Chat Replay */}
            {showChat && chatMessages.length > 0 && (
              <div className="p-5 rounded-2xl" style={{ background: 'var(--bg-secondary)' }}>
                <h3 className="text-[13px] font-bold uppercase tracking-widest mb-4" style={{ color: 'var(--text-muted)' }}>
                  💬 Live Chat Replay · {chatMessages.length} messages
                </h3>
                <div ref={chatRef} className="max-h-[400px] overflow-y-auto space-y-2 pr-2 scroll-smooth">
                  {chatMessages.map((msg, i) => {
                    const t = msg.time_in_seconds || msg.timestamp || 0;
                    const visible = t <= currentTime + 3;
                    const author = msg.author?.name || msg.author || 'Viewer';
                    const text = msg.message || msg.text || msg.body || '';
                    if (!text) return null;
                    return (
                      <div key={i} data-time={t} className="flex gap-2.5 py-1 transition-opacity duration-500 text-[13px]"
                        style={{ opacity: visible ? 1 : 0.15 }}>
                        <button onClick={() => seekTo(t)} className="font-mono text-[11px] w-14 shrink-0 tabular-nums pt-0.5 hover:underline cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                          {fmtTime(t)}
                        </button>
                        <div>
                          <span className="font-bold mr-1.5" style={{ color: 'var(--accent)' }}>{author}</span>
                          <span style={{ color: 'var(--text-secondary)' }}>{text}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar */}
        {others.length > 0 && (
          <div className="xl:w-[400px] shrink-0 border-l px-4 sm:px-6 xl:px-5 pb-10 pt-4 xl:pt-5" style={{ borderColor: 'var(--border)' }}>
            <h3 className="text-[13px] font-bold uppercase tracking-widest mb-5" style={{ color: 'var(--text-muted)' }}>Up Next</h3>
            <div className="space-y-4">
              {others.map(o => (
                <button key={o.videoId} onClick={() => { onNavigate(o); window.scrollTo(0, 0); }} className="flex gap-3 w-full text-left group rounded-xl p-2 -mx-2 transition-colors" style={{ background: 'transparent' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-secondary)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <div className="w-[168px] shrink-0 aspect-video rounded-xl overflow-hidden" style={{ background: 'var(--bg-tertiary)' }}>
                    <img src={o.thumbnail} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={e => { (e.target as HTMLImageElement).src = '/thumbnail.jpg'; }} />
                  </div>
                  <div className="min-w-0 pt-0.5 flex-1">
                    <p className="text-[14px] font-semibold line-clamp-2 leading-snug" style={{ color: 'var(--text-primary)' }}>{o.title}</p>
                    <p className="text-[12px] mt-1.5" style={{ color: 'var(--text-muted)' }}>The Muslim Lantern</p>
                    <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{o.date} · {o.durationFmt}</p>
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
