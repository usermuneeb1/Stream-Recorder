import { useState, useEffect, useCallback, useRef } from 'react';
import type { Recording } from '../utils/dataFetcher';

interface Props { rec: Recording; onClose: () => void; all: Recording[]; onNav: (r: Recording) => void; theme: 'dark' | 'light'; onTheme: () => void; }

// Use archive_direct (/download/ URL) — it has CORS headers (access-control-allow-origin: *)
// archive_node does NOT have CORS headers — fails with crossOrigin
function getSources(r: Recording): { label: string; url: string }[] {
  const s: { label: string; url: string }[] = [];
  if (r.archiveDirect) s.push({ label: 'Auto', url: r.archiveDirect });
  if (r.archiveNode) s.push({ label: 'Server 2', url: r.archiveNode });
  if (r.githubDirect || r.githubRelease) s.push({ label: 'Server 3', url: (r.githubDirect || r.githubRelease)! });
  if (!s.length && r.archiveLink) s.push({ label: 'Auto', url: r.archiveLink.replace('/details/', '/download/') + '/' });
  return s;
}

function getDownloads(r: Recording): { label: string; url: string; bg: string }[] {
  const d: { label: string; url: string; bg: string }[] = [];
  if (r.megaLink) d.push({ label: 'MEGA', url: r.megaLink, bg: '#D9272E' });
  if (r.pixeldrainLink) d.push({ label: 'Pixeldrain', url: r.pixeldrainLink, bg: '#6366f1' });
  if (r.gofileLink) d.push({ label: 'Gofile', url: r.gofileLink, bg: '#2563eb' });
  return d;
}

function fmt(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export function WatchPage({ rec, onClose, all, onNav, theme, onTheme }: Props) {
  const vidRef = useRef<HTMLVideoElement>(null);
  const chatBox = useRef<HTMLDivElement>(null);
  const sources = getSources(rec);
  const downloads = getDownloads(rec);
  const chapters = rec.aiChapters || [];
  const [srcIdx, setSrcIdx] = useState(0);
  const [curChapter, setCurChapter] = useState(0);
  const [time, setTime] = useState(0);
  const [chat, setChat] = useState<any[]>([]);
  const [hasChat, setHasChat] = useState(false);
  const others = all.filter(x => x.videoId !== rec.videoId).slice(0, 8);

  // Load chat
  useEffect(() => {
    setChat([]); setHasChat(false);
    if (!rec.chatUrl) return;
    fetch(rec.chatUrl).then(r => { if (!r.ok) throw 0; return r.text(); })
      .then(t => { try { const a = JSON.parse(t); if (Array.isArray(a) && a.length) { setChat(a); setHasChat(true); } } catch { const l = t.split('\n').map(x => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean); if (l.length) { setChat(l); setHasChat(true); } } })
      .catch(() => {});
  }, [rec.chatUrl]);

  // Escape
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);

  // Time update
  useEffect(() => {
    const v = vidRef.current; if (!v) return;
    const h = () => {
      const t = v.currentTime || 0; setTime(t);
      for (let i = chapters.length - 1; i >= 0; i--) { if (t >= chapters[i].time) { setCurChapter(i); break; } }
    };
    v.addEventListener('timeupdate', h);
    return () => v.removeEventListener('timeupdate', h);
  }, [chapters, srcIdx]);

  // Chat scroll
  useEffect(() => {
    if (!chatBox.current || !chat.length) return;
    const kids = chatBox.current.children;
    for (let i = kids.length - 1; i >= 0; i--) {
      if (parseFloat((kids[i] as HTMLElement).dataset.t || '99999') <= time) { kids[i].scrollIntoView({ block: 'nearest', behavior: 'smooth' }); break; }
    }
  }, [Math.floor(time / 2)]);

  const seek = useCallback((s: number) => { const v = vidRef.current; if (v) { v.currentTime = s; v.play().catch(() => {}); } }, []);
  const playUrl = sources[srcIdx]?.url || '';

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      {/* Nav */}
      <nav className="flex items-center justify-between px-4 sm:px-6 h-14 border-b" style={{ borderColor: 'var(--border)' }}>
        <button onClick={onClose} className="flex items-center gap-2 group">
          <svg className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          <img src="/logo.png" alt="" className="h-6 object-contain hidden sm:block" />
          <img src="/logo-vertical.pn.jpg" alt="" className="w-7 h-7 rounded-full sm:hidden" />
        </button>
        <button onClick={onTheme} className="p-2 rounded-lg" style={{ color: 'var(--text-muted)' }}>
          {theme === 'dark' ? <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><circle cx="12" cy="12" r="5" strokeWidth={2}/><path strokeLinecap="round" strokeWidth={2} d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
          : <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>}
        </button>
      </nav>

      <div className="flex flex-col xl:flex-row max-w-[1800px] mx-auto">
        {/* Main */}
        <div className="flex-1 min-w-0">
          {/* NATIVE VIDEO — no crossOrigin, no CORS issues */}
          <div className="bg-black xl:m-5 xl:mb-0 xl:rounded-2xl overflow-hidden">
            <video ref={vidRef} key={playUrl} src={playUrl} controls autoPlay playsInline preload="auto"
              poster={rec.thumbnail}
              className="w-full aspect-video bg-black"
              style={{ maxHeight: 'calc(100vh - 200px)' }} />
          </div>

          <div className="px-4 sm:px-6 xl:px-5 pt-5 pb-10 space-y-5">
            {/* Title */}
            <div>
              <h1 className="text-lg sm:text-xl font-bold leading-snug">{rec.title}</h1>
              <p className="text-[13px] mt-2" style={{ color: 'var(--text-muted)' }}>
                {rec.date} · {rec.durationFmt} · {rec.sizeHuman}{rec.resolution?.includes('1080') ? ' · 1080p' : ''}
              </p>
            </div>

            {/* Source switcher */}
            {sources.length > 1 && (
              <div className="flex items-center gap-2 flex-wrap rounded-xl p-4" style={{ background: 'var(--bg-card)' }}>
                <span className="text-[11px] font-bold uppercase tracking-widest mr-1" style={{ color: 'var(--text-muted)' }}>Source:</span>
                {sources.map((s, i) => (
                  <button key={i} onClick={() => setSrcIdx(i)} className="text-[13px] px-3.5 py-1.5 rounded-lg font-semibold transition-all"
                    style={{ background: i === srcIdx ? 'var(--red)' : 'var(--bg-elevated)', color: i === srcIdx ? '#fff' : 'var(--text-secondary)' }}>
                    {s.label}
                  </button>
                ))}
              </div>
            )}

            {/* Downloads */}
            {downloads.length > 0 && (
              <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)' }}>
                <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>Download</p>
                <div className="flex flex-wrap gap-3">
                  {downloads.map((d, i) => (
                    <a key={i} href={d.url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13px] font-bold text-white transition-all hover:brightness-110 active:scale-[.97]"
                      style={{ background: d.bg }}>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                      {d.label}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Chapters */}
            {chapters.length > 0 && (
              <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)' }}>
                <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>Chapters</p>
                <div className="space-y-0.5">
                  {chapters.map((c, i) => {
                    const active = i === curChapter;
                    const guest = c.label.toLowerCase().includes('joins');
                    return (
                      <button key={i} onClick={() => seek(c.time)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all group"
                        style={{ background: active ? 'var(--bg-elevated)' : 'transparent' }}>
                        <span className="font-mono text-[13px] w-16 shrink-0 tabular-nums font-bold" style={{ color: active ? 'var(--red)' : 'var(--text-muted)' }}>{fmt(c.time)}</span>
                        {guest && <span>👤</span>}
                        <span className="text-[14px] flex-1 font-medium" style={{ color: active ? 'var(--text)' : 'var(--text-secondary)' }}>{c.label}</span>
                        {active && <span className="w-2 h-2 rounded-full animate-pulse shrink-0" style={{ background: 'var(--red)' }} />}
                        {!active && <svg className="w-3.5 h-3.5 opacity-0 group-hover:opacity-50 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Chat Replay */}
            {hasChat && chat.length > 0 && (
              <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)' }}>
                <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>💬 Live Chat · {chat.length}</p>
                <div ref={chatBox} className="max-h-80 overflow-y-auto space-y-1.5 pr-1">
                  {chat.map((m, i) => {
                    const t = m.time_in_seconds || m.timestamp || 0;
                    const vis = t <= time + 2;
                    const who = m.author?.name || m.author || 'Viewer';
                    const txt = m.message || m.text || m.body || '';
                    if (!txt) return null;
                    return (
                      <div key={i} data-t={t} className="flex gap-2 text-[12px] transition-opacity" style={{ opacity: vis ? 1 : 0.12 }}>
                        <button onClick={() => seek(t)} className="font-mono w-12 shrink-0 tabular-nums hover:underline" style={{ color: 'var(--text-muted)' }}>{fmt(t)}</button>
                        <span className="font-bold" style={{ color: 'var(--red)' }}>{who}</span>
                        <span style={{ color: 'var(--text-secondary)' }}>{txt}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        {others.length > 0 && (
          <div className="xl:w-[380px] shrink-0 border-l px-4 sm:px-6 xl:px-4 pb-10 pt-5" style={{ borderColor: 'var(--border)' }}>
            <p className="text-[11px] font-bold uppercase tracking-widest mb-4" style={{ color: 'var(--text-muted)' }}>Up Next</p>
            <div className="space-y-3">
              {others.map(o => (
                <button key={o.videoId} onClick={() => { onNav(o); window.scrollTo(0, 0); }}
                  className="flex gap-3 w-full text-left rounded-xl p-2 -mx-2 transition-colors group"
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <div className="w-40 shrink-0 aspect-video rounded-lg overflow-hidden" style={{ background: 'var(--bg-card)' }}>
                    <img src={o.thumbnail} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform" onError={e => { (e.target as HTMLImageElement).src = '/thumbnail.jpg'; }} />
                  </div>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-[13px] font-semibold line-clamp-2 leading-snug">{o.title}</p>
                    <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>{o.date} · {o.durationFmt}</p>
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
