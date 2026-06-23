import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { MediaPlayer, MediaProvider, type MediaPlayerInstance } from '@vidstack/react';
import { defaultLayoutIcons, DefaultVideoLayout } from '@vidstack/react/player/layouts/default';
import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';
import { TranscriptViewer } from './TranscriptViewer';
import type { Recording } from '../utils/dataFetcher';
import { fmtTime, fmtRelative, copyText, shareLinks } from '../utils/format';
import { savePosition, loadPosition, pushHistory } from '../utils/history';

interface P {
  rec: Recording;
  onClose: () => void;
  all: Recording[];
  onNav: (r: Recording) => void;
  theme: string;
  onTheme: () => void;
  onToast: (m: string) => void;
}

interface Source { label: string; url: string; tone: string }

// GHOST is our YouTube unlisted re-upload played inside Vidstack's
// custom-UI player. The src "youtube/<id>" tells Vidstack to render
// through YouTube's official embed under the hood, but ALL the controls,
// keyboard shortcuts, chapters and theming are still our own — the
// player chrome you see is Vidstack's, not YouTube's.
function ghostId(r: Recording): string {
  return r.youtubeId || (r.youtubeUnlisted.match(/(?:youtu\.be\/|v=)([\w-]{11})/) || [])[1] || '';
}
function ghostSrc(r: Recording): string {
  const id = ghostId(r);
  return id ? `youtube/${id}` : '';
}

function getSources(r: Recording): Source[] {
  const out: Source[] = [];
  const ghost = ghostSrc(r);
  if (ghost)                                              out.push({ label: 'GHOST',  url: ghost,            tone: 'red'    });
  if (r.archiveNode)                                      out.push({ label: 'R3AL',   url: r.archiveNode,    tone: 'gold'   });
  if (r.githubDirect || r.githubRelease)                  out.push({ label: 'B3ING',  url: (r.githubDirect || r.githubRelease), tone: 'sky' });
  if (r.cfStream)                                         out.push({ label: 'STORM',  url: r.cfStream,       tone: 'violet' });
  if (r.archiveDirect && r.archiveDirect !== r.archiveNode) out.push({ label: 'BUNNY',  url: r.archiveDirect,  tone: 'emerald' });
  return out;
}

interface Dl { label: string; url: string; bg: string }
function getDownloads(r: Recording): Dl[] {
  const d: Dl[] = [];
  if (r.megaLink)        d.push({ label: 'MEGA',       url: r.megaLink,        bg: '#d9272e' });
  if (r.pixeldrainLink)  d.push({ label: 'Pixeldrain', url: r.pixeldrainLink,  bg: '#7c3aed' });
  if (r.gofileLink)      d.push({ label: 'Gofile',     url: r.gofileLink,      bg: '#2563eb' });
  if (r.githubDirect || r.githubRelease) d.push({ label: 'Direct', url: (r.githubDirect || r.githubRelease), bg: '#0a8a4f' });
  return d;
}

export function WatchPage({ rec, onClose, all, onNav, theme, onTheme, onToast }: P) {
  const playerRef = useRef<MediaPlayerInstance>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  const sources = useMemo(() => getSources(rec), [rec]);
  const downloads = useMemo(() => getDownloads(rec), [rec]);
  const chapters = rec.aiChapters || [];

  const [si, setSi] = useState(0);
  const [autoUrl, setAutoUrl] = useState('');
  const [ci, setCi] = useState(0);
  const [t, setT] = useState(0);
  const [ready, setReady] = useState(false);
  const [chat, setChat] = useState<any[]>([]);
  const [hasChat, setHasChat] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [theater, setTheater] = useState(false);
  const [pinnedChat, setPinnedChat] = useState(true);
  const [sourceHealth, setSourceHealth] = useState<Record<number, number>>({}); // ms
  const played = useRef(false);

  const others = all.filter(x => x.videoId !== rec.videoId).slice(0, 6);

  // ── Reset on recording change ───────────────────────────────────────────
  useEffect(() => {
    setSi(0); setCi(0); setT(0); setReady(false); setAutoUrl(''); setSourceHealth({});
    setChat([]); setHasChat(false); played.current = false;
    if (!rec.chatUrl) return;
    fetch(rec.chatUrl).then(r => { if (!r.ok) throw 0; return r.text(); })
      .then(tx => {
        try {
          const arr = JSON.parse(tx);
          if (Array.isArray(arr) && arr.length) { setChat(arr); setHasChat(true); }
        } catch {
          const lines = tx.split('\n').map(x => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean);
          if (lines.length) { setChat(lines); setHasChat(true); }
        }
      }).catch(() => {});
  }, [rec.videoId, rec.chatUrl]);

  // ── Auto source: pick GHOST if available (always reachable, no rate limits);
  //    otherwise race HEAD requests across the .mp4 mirrors and pick the fastest.
  useEffect(() => {
    if (si !== 0 || sources.length === 0) return;
    // If GHOST is the first source, just use it — it's always reachable through
    // YouTube and doesn't suffer from CDN node failures.
    if (sources[0].url.startsWith('youtube/')) {
      setAutoUrl(sources[0].url);
      setSourceHealth({ 0: 0 }); // mark GHOST as instant
      return;
    }
    const ctrl = new AbortController();
    const health: Record<number, number> = {};
    let winner = '';
    let bestTime = Infinity;
    Promise.allSettled(sources.map(async (s, idx) => {
      if (s.url.startsWith('youtube/')) return; // skip GHOST in HEAD race
      const start = performance.now();
      try {
        await fetch(s.url, { method: 'HEAD', mode: 'no-cors', signal: ctrl.signal });
        const dt = performance.now() - start;
        health[idx] = dt;
        if (dt < bestTime) { bestTime = dt; winner = s.url; }
      } catch { health[idx] = -1; }
      setSourceHealth({ ...health });
    }));
    const timer = setTimeout(() => {
      ctrl.abort();
      setAutoUrl(winner || sources[0].url);
    }, 3000);
    return () => { ctrl.abort(); clearTimeout(timer); };
  }, [rec.videoId, sources, si]);

  // ── Esc closes ───────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !shareOpen && !showHelp) onClose();
      if (e.key === 'Escape' && (shareOpen || showHelp)) { setShareOpen(false); setShowHelp(false); }
      if (e.key === '?') { e.preventDefault(); setShowHelp(s => !s); }
      if (e.key === 't' || e.key === 'T') setTheater(t => !t);
      // Chapter jump w/ ←/→ (with Shift)
      if (e.shiftKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft') && chapters.length) {
        e.preventDefault();
        const cur = chapters.findIndex((c, i, a) => t >= c.time && (i === a.length - 1 || t < a[i + 1].time));
        const next = e.key === 'ArrowRight' ? Math.min(chapters.length - 1, cur + 1) : Math.max(0, cur - 1);
        seek(chapters[next].time);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, shareOpen, showHelp, chapters, t]);

  // ── Player events ────────────────────────────────────────────────────────
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    const onTime = () => {
      const ct = p.currentTime || 0;
      setT(ct);
      for (let i = chapters.length - 1; i >= 0; i--) {
        if (ct >= chapters[i].time) { setCi(i); break; }
      }
    };
    const onGo = () => { if (!played.current) { played.current = true; setReady(true); } };
    p.addEventListener('time-update', onTime);
    p.addEventListener('playing', onGo);
    p.addEventListener('can-play', onGo);
    return () => {
      p.removeEventListener('time-update', onTime);
      p.removeEventListener('playing', onGo);
      p.removeEventListener('can-play', onGo);
    };
  }, [chapters, si, autoUrl]);

  // ── Chat sync ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!chatRef.current || !chat.length) return;
    const kids = chatRef.current.children;
    for (let i = kids.length - 1; i >= 0; i--) {
      const el = kids[i] as HTMLElement;
      if (parseFloat(el.dataset.t || '99999') <= t) {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        break;
      }
    }
  }, [Math.floor(t / 3), chat.length]);

  const seek = useCallback((s: number) => {
    const p = playerRef.current;
    if (p) { p.currentTime = s; p.play().catch(() => {}); }
  }, []);

  const copyTimestamp = useCallback(() => {
    const url = `${window.location.origin}/#/watch/${encodeURIComponent(rec.videoId)}?t=${Math.floor(t)}`;
    copyText(url).then(ok => onToast(ok ? `Timestamp copied (${fmtTime(t)})` : 'Copy failed'));
  }, [rec.videoId, t, onToast]);

  const copyShare = useCallback(() => {
    const url = `${window.location.origin}/#/watch/${encodeURIComponent(rec.videoId)}`;
    copyText(url).then(ok => onToast(ok ? 'Link copied!' : 'Copy failed'));
  }, [rec.videoId, onToast]);

  // Honor ?t=NNN from URL OR resume from saved position
  const [resumeShown, setResumeShown] = useState(false);
  const [resumeAt, setResumeAt] = useState<number | null>(null);
  useEffect(() => {
    if (!ready || resumeShown) return;
    const hash = window.location.hash;
    const m = hash.match(/\?t=(\d+)/);
    if (m) { seek(parseInt(m[1])); setResumeShown(true); return; }
    const saved = loadPosition(rec.videoId);
    if (saved && saved.t > 30) { setResumeAt(saved.t); }
    setResumeShown(true);
    pushHistory(rec.videoId);
  }, [ready, seek, rec.videoId, resumeShown]);

  // Persist position every 5 s
  useEffect(() => {
    if (!ready) return;
    const p = playerRef.current;
    if (!p) return;
    const i = setInterval(() => {
      savePosition(rec.videoId, p.currentTime || 0, p.duration || rec.durationSec);
    }, 5000);
    return () => clearInterval(i);
  }, [ready, rec.videoId, rec.durationSec]);

  const url = si === 0 ? (autoUrl || sources[0]?.url || '') : (sources[si - 1]?.url || '');
  const guests = chapters.filter(c => c.label?.toLowerCase().includes('joins')).map(c => c.label.replace(/\s*joins.*/i, '').trim());
  const sl = shareLinks(`${window.location.origin}/#/watch/${encodeURIComponent(rec.videoId)}`, rec.title);

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)', color: 'var(--tx)' }}>
      {/* ───── Top bar ───── */}
      <nav className="sticky top-0 z-40 glass border-b" style={{ borderColor: 'var(--bd)' }}>
        <div className="max-w-[1800px] mx-auto flex items-center justify-between gap-3 px-4 sm:px-6 h-14">
          <button onClick={onClose} className="flex items-center gap-2.5 group ring-focus rounded-md py-1 -ml-1 pr-2" title="Back to all recordings">
            <svg className="w-5 h-5 transition-transform group-hover:-translate-x-0.5" style={{ color: 'var(--tx3)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <img src="/logo.png" alt="" className="h-9 object-contain" />
          </button>
          <div className="flex items-center gap-1">
            <button onClick={() => setShowHelp(true)} className="btn-ghost btn !p-2" title="Keyboard shortcuts (?)" aria-label="Help">
              <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9" />
                <path strokeLinecap="round" d="M9.5 9a2.5 2.5 0 015 0c0 1.5-1.5 2-2.5 3v1" />
                <circle cx="12" cy="17" r=".7" fill="currentColor" />
              </svg>
            </button>
            <button onClick={() => setTheater(t => !t)} className="btn-ghost btn !p-2 hidden sm:inline-flex" title="Theater mode (T)">
              <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="6" width="18" height="12" rx="1.5" />
              </svg>
            </button>
            <button onClick={onTheme} className="btn-ghost btn !p-2" title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
              {theme === 'dark' ? (
                <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="4" />
                  <path strokeLinecap="round" d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                </svg>
              ) : (
                <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* ───── Main area ───── */}
      <div className={`flex flex-col ${theater ? '' : 'xl:flex-row'} max-w-[1800px] mx-auto`}>
        {/* ── Left: player + meta ── */}
        <div className="flex-1 min-w-0">
          <div className="xl:p-4 xl:pb-0 relative">
            <style>{`media-player [data-media-buffering-indicator],media-player [part~="buffering-indicator"]{display:none!important}`}</style>
            {url && (
              <MediaPlayer
                key={url}
                ref={playerRef}
                src={url}
                viewType="video"
                streamType="on-demand"
                playsInline
                autoPlay
                className="w-full aspect-video xl:rounded-xl overflow-hidden bg-black shadow-2xl"
              >
                <MediaProvider />
                <DefaultVideoLayout icons={defaultLayoutIcons} />
              </MediaPlayer>
            )}
            {!ready && (
              <div
                className="absolute inset-0 xl:top-4 xl:left-4 xl:right-4 xl:rounded-xl z-20 flex items-center justify-center"
                style={{ background: '#000' }}
              >
                <div className="flex flex-col items-center">
                  <div className="w-10 h-10 mb-3 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: 'var(--red)' }} />
                  <p className="text-white/60 text-[13px] font-medium tracking-wide">Preparing stream</p>
                  <p className="text-white/30 text-[11px] mt-1">{si === 0 ? 'Auto' : sources[si - 1]?.label || 'Auto'} source</p>
                </div>
              </div>
            )}

            {/* Resume-from-position banner */}
            {ready && resumeAt !== null && (
              <div className="absolute bottom-16 sm:bottom-20 left-4 right-4 xl:left-8 xl:right-8 z-30 flex items-center justify-between gap-3 rounded-xl border glass-strong px-4 py-3 pop-in" style={{ borderColor: 'var(--bd2)', boxShadow: 'var(--shadow-lg)' }}>
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold" style={{ color: 'var(--tx) ' }}>
                    Continue from <span className="font-mono tabular-nums" style={{ color: 'var(--red)' }}>{fmtTime(resumeAt)}</span>?
                  </p>
                  <p className="text-[10.5px] mt-0.5" style={{ color: 'var(--tx3)' }}>You were last watching at this position</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => setResumeAt(null)} className="btn !py-1.5 !text-[11px]">Start over</button>
                  <button onClick={() => { seek(resumeAt); setResumeAt(null); }} className="btn btn-primary !py-1.5 !text-[11px]">Resume</button>
                </div>
              </div>
            )}
          </div>

          {/* ── Title + actions ── */}
          <div className="px-4 sm:px-6 pt-5 pb-3">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h1 className="font-display text-xl sm:text-2xl font-bold leading-tight" style={{ color: 'var(--tx)' }}>
                  {rec.title}
                </h1>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] mt-2.5" style={{ color: 'var(--tx3)' }}>
                  <span title={rec.recordedAt}>{fmtRelative(rec.recordedAt || rec.date)}</span>
                  <span style={{ color: 'var(--tx4)' }}>·</span>
                  <span className="tabular-nums">{rec.durationFmt}</span>
                  <span style={{ color: 'var(--tx4)' }}>·</span>
                  <span>{rec.resolution || '—'}</span>
                  <span style={{ color: 'var(--tx4)' }}>·</span>
                  <span className="tabular-nums">{rec.sizeHuman}</span>
                  {chapters.length > 0 && (<><span style={{ color: 'var(--tx4)' }}>·</span><span>{chapters.length} chapters</span></>)}
                </div>
                {guests.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {guests.map((g, i) => (
                      <span key={i} className="text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: 'var(--red-soft)', color: 'var(--red)' }}>
                        👤 {g}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={copyTimestamp} className="btn !py-1.5" title="Copy link with current timestamp">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="9" /><path strokeLinecap="round" d="M12 7v5l3 3" />
                  </svg>
                  <span className="hidden sm:inline">{fmtTime(t)}</span>
                </button>
                <button onClick={copyShare} className="btn !py-1.5" title="Copy share link">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
                  </svg>
                </button>
                <button onClick={() => setShareOpen(o => !o)} className="btn !py-1.5 relative" title="Share">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" />
                    <path d="M8.2 11l7.6-4.5M8.2 13l7.6 4.5" />
                  </svg>
                  {shareOpen && (
                    <div onClick={e => e.stopPropagation()} className="absolute right-0 top-full mt-2 w-44 rounded-lg border pop-in glass-strong z-30" style={{ borderColor: 'var(--bd2)', boxShadow: 'var(--shadow-lg)' }}>
                      {[
                        ['X (Twitter)', sl.x],
                        ['WhatsApp',    sl.whatsapp],
                        ['Telegram',    sl.telegram],
                        ['Facebook',    sl.facebook],
                        ['Email',       sl.email],
                      ].map(([l, u]) => (
                        <a key={l} href={u} target="_blank" rel="noopener noreferrer"
                          className="block px-3 py-2 text-[12px] font-medium text-left hover:bg-[var(--bg4)] first:rounded-t-lg last:rounded-b-lg"
                          style={{ color: 'var(--tx)' }}>
                          {l}
                        </a>
                      ))}
                    </div>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right: sidebar ── */}
        <aside className={`${theater ? '' : 'xl:w-[400px]'} shrink-0 px-4 sm:px-6 xl:px-4 pb-6 pt-2 xl:pt-4 border-l-0 xl:border-l space-y-3`} style={{ borderColor: 'var(--bd)' }}>

          {/* Sources */}
          {sources.length > 0 && (
            <Panel title="Playback" hint={`${sources.length} servers`}>
              <div className="grid grid-cols-2 gap-1.5 mb-1.5">
                <SourceBtn
                  active={si === 0}
                  onClick={() => setSi(0)}
                  label="Auto"
                  tone="emerald"
                  ms={autoUrl ? Math.min(...Object.values(sourceHealth).filter(v => v > 0)) : undefined}
                  best
                />
                {sources.map((s, i) => (
                  <SourceBtn
                    key={i}
                    active={si === i + 1}
                    onClick={() => setSi(i + 1)}
                    label={s.label}
                    tone={s.tone}
                    ms={sourceHealth[i] > 0 ? sourceHealth[i] : (sourceHealth[i] === -1 ? -1 : undefined)}
                  />
                ))}
              </div>
            </Panel>
          )}

          {/* Downloads */}
          {downloads.length > 0 && (
            <Panel title="Downloads" hint={`${downloads.length} mirrors`}>
              <div className="grid grid-cols-2 gap-1.5">
                {downloads.map((d, i) => (
                  <a
                    key={i}
                    href={d.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-[11.5px] font-bold text-white transition-all hover:brightness-110 active:scale-95"
                    style={{ background: d.bg }}
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    {d.label}
                  </a>
                ))}
              </div>
            </Panel>
          )}

          {/* Chapters */}
          {chapters.length > 0 && (
            <Panel title="Chapters" hint={`${chapters.length}`}>
              <div className="space-y-0.5">
                {chapters.map((c, i) => {
                  const active = i === ci;
                  const isGuest = c.label.toLowerCase().includes('joins');
                  return (
                    <button
                      key={i}
                      onClick={() => seek(c.time)}
                      className="w-full flex items-center gap-3 px-2.5 py-2 rounded-md text-left transition-all group ring-focus"
                      style={{ background: active ? 'var(--bg4)' : 'transparent' }}
                    >
                      <span className="font-mono text-[11px] w-12 shrink-0 tabular-nums font-bold"
                        style={{ color: active ? 'var(--red)' : 'var(--tx3)' }}>
                        {fmtTime(c.time)}
                      </span>
                      {isGuest && <span className="text-[13px]">👤</span>}
                      <span className="text-[12.5px] flex-1 font-medium" style={{ color: active ? 'var(--tx)' : 'var(--tx2)' }}>
                        {c.label}
                      </span>
                      {active
                        ? <span className="relative live-dot w-2 h-2 rounded-full shrink-0" style={{ background: 'var(--red)' }} />
                        : <svg className="w-3 h-3 opacity-0 group-hover:opacity-50 shrink-0 transition-opacity" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>}
                    </button>
                  );
                })}
              </div>
            </Panel>
          )}

          {/* Transcript */}
          {rec.transcriptUrl && (
            <TranscriptViewer url={rec.transcriptUrl} currentTime={t} onSeek={seek} />
          )}

          {/* Chat */}
          {hasChat && chat.length > 0 && (
            <Panel
              title="Live chat"
              hint={`${chat.length} messages`}
              right={
                <button onClick={() => setPinnedChat(p => !p)} className="text-[10px] font-bold uppercase tracking-wider hover:text-[var(--red)]" style={{ color: 'var(--tx3)' }}>
                  {pinnedChat ? 'Auto-scroll on' : 'Auto-scroll off'}
                </button>
              }
            >
              <div ref={chatRef} className="max-h-72 overflow-y-auto space-y-0.5 pr-1">
                {chat.map((m: any, i: number) => {
                  const mt = m.time_in_seconds || m.timestamp || 0;
                  const vis = mt <= t + 2;
                  const who = m.author?.name || m.author || '';
                  const txt = m.message || m.text || m.body || '';
                  if (!txt) return null;
                  return (
                    <div
                      key={i}
                      data-t={mt}
                      className="flex gap-2 text-[11px] py-0.5 leading-relaxed transition-opacity"
                      style={{ opacity: vis ? 1 : .14 }}
                    >
                      <button onClick={() => seek(mt)} className="font-mono w-10 shrink-0 tabular-nums hover:underline text-left" style={{ color: 'var(--tx3)' }}>
                        {fmtTime(mt)}
                      </button>
                      <span className="font-bold" style={{ color: 'var(--red)' }}>{who}</span>
                      <span style={{ color: 'var(--tx2)' }}>{txt}</span>
                    </div>
                  );
                })}
              </div>
            </Panel>
          )}

          {/* Up Next */}
          {others.length > 0 && (
            <Panel title="Up next" hint={`${others.length}`}>
              <div className="space-y-1.5">
                {others.map(o => (
                  <button
                    key={o.videoId}
                    onClick={() => { onNav(o); window.scrollTo(0, 0); }}
                    className="flex gap-2.5 w-full text-left rounded-md p-1.5 -mx-1.5 transition-colors hover:bg-[var(--bg3)] group ring-focus"
                  >
                    <div className="w-28 shrink-0 aspect-video rounded-md overflow-hidden" style={{ background: 'var(--bg3)' }}>
                      <img
                        src={o.thumbnail}
                        alt=""
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        onError={(e: any) => { e.target.src = '/thumbnail.jpg'; }}
                      />
                    </div>
                    <div className="min-w-0 pt-0.5">
                      <p className="text-[11.5px] font-semibold line-clamp-2 leading-snug" style={{ color: 'var(--tx)' }}>{o.title}</p>
                      <p className="text-[10px] mt-1" style={{ color: 'var(--tx3)' }}>{o.date} · {o.durationFmt}</p>
                    </div>
                  </button>
                ))}
              </div>
            </Panel>
          )}
        </aside>
      </div>

      {/* ───── Help overlay ───── */}
      {showHelp && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 fade-in" onClick={() => setShowHelp(false)}>
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)' }} />
          <div onClick={e => e.stopPropagation()} className="relative w-full max-w-md rounded-2xl border glass-strong p-6 pop-in" style={{ borderColor: 'var(--bd2)' }}>
            <h2 className="font-display text-lg font-bold mb-4">Keyboard shortcuts</h2>
            <ul className="space-y-2.5 text-[13px]">
              {[
                ['Play / Pause',         'Space'],
                ['Skip ±10 s',           '←  /  →'],
                ['Volume',               '↑  /  ↓'],
                ['Mute',                 'M'],
                ['Fullscreen',           'F'],
                ['Picture-in-Picture',   'I'],
                ['Theater mode',         'T'],
                ['Next / Prev chapter',  'Shift + ←  /  →'],
                ['Close player',         'Esc'],
                ['Show this help',       '?'],
              ].map(([l, k]) => (
                <li key={l} className="flex items-center justify-between">
                  <span style={{ color: 'var(--tx2)' }}>{l}</span>
                  <span className="kbd">{k}</span>
                </li>
              ))}
            </ul>
            <button onClick={() => setShowHelp(false)} className="btn btn-primary mt-5 w-full">Got it</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Reusable sidebar panel ────────────────────────────────────────────────
function Panel({ title, hint, right, children }: { title: string; hint?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: 'var(--bd)', background: 'var(--bg2)' }}>
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-baseline gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[.2em]" style={{ color: 'var(--tx3)' }}>{title}</p>
          {hint && <span className="text-[10px] font-mono" style={{ color: 'var(--tx4)' }}>{hint}</span>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

// ── Source button (with latency dot) ──────────────────────────────────────
const toneMap: Record<string, string> = {
  emerald: 'var(--emerald)',
  red:     'var(--red)',
  gold:    'var(--gold)',
  sky:     'var(--sky)',
  violet:  'var(--violet)',
};

function SourceBtn({ active, onClick, label, tone, ms, best }: {
  active: boolean; onClick: () => void; label: string; tone: string; ms?: number; best?: boolean;
}) {
  const color = toneMap[tone] || 'var(--tx2)';
  const status = ms === undefined ? 'idle' : ms === -1 ? 'fail' : ms < 300 ? 'fast' : ms < 1200 ? 'ok' : 'slow';
  const dotColor = status === 'fail' ? 'var(--red)' : status === 'fast' ? 'var(--emerald)' : status === 'ok' ? 'var(--gold)' : status === 'slow' ? 'var(--tx3)' : 'var(--tx4)';
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center justify-between px-2.5 py-2 rounded-md text-[11.5px] font-bold transition-all ring-focus"
      style={{
        background: active ? color : 'var(--bg3)',
        color: active ? '#fff' : 'var(--tx)',
        border: '1px solid', borderColor: active ? color : 'var(--bd2)',
      }}
    >
      <span className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: active ? '#fff' : dotColor }} />
        {label}
        {best && <span className="text-[8.5px] opacity-70 font-mono">⚡</span>}
      </span>
      {ms !== undefined && ms > 0 && (
        <span className="text-[9px] font-mono opacity-60 tabular-nums">{Math.round(ms)}ms</span>
      )}
    </button>
  );
}
