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

// ── Playback sources (generic labels — no service names exposed) ──────────
function getPlaybackSources(rec: Recording): { label: string; url: string }[] {
  const s: { label: string; url: string }[] = [];
  if (rec.githubDirect || rec.githubRelease)
    s.push({ label: 'Primary', url: (rec.githubDirect || rec.githubRelease)! });
  if (rec.archiveNode)
    s.push({ label: 'Mirror 1', url: rec.archiveNode });
  if (rec.archiveDirect && rec.archiveDirect !== rec.archiveNode)
    s.push({ label: 'Mirror 2', url: rec.archiveDirect });
  if (rec.r2Link)
    s.push({ label: 'CDN', url: rec.r2Link });
  return s;
}

// ── Download links (generic labels) ──────────────────────────────────────
function getDownloads(rec: Recording): { label: string; url: string; icon: string }[] {
  const d: { label: string; url: string; icon: string }[] = [];
  if (rec.githubRelease) d.push({ label: 'Direct Download', url: rec.githubRelease, icon: '⚡' });
  if (rec.archiveLink) d.push({ label: 'Permanent Link', url: rec.archiveLink, icon: '🏛️' });
  if (rec.megaLink) d.push({ label: 'Mirror A', url: rec.megaLink, icon: '📦' });
  if (rec.pixeldrainLink) d.push({ label: 'Mirror B', url: rec.pixeldrainLink, icon: '📥' });
  if (rec.gofileLink) d.push({ label: 'Mirror C', url: rec.gofileLink, icon: '📁' });
  if (rec.gdriveLink) d.push({ label: 'Mirror D', url: rec.gdriveLink, icon: '☁️' });
  if (rec.telegramLink) d.push({ label: 'Mirror E', url: rec.telegramLink, icon: '📱' });
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
  const sources = getPlaybackSources(rec);
  const downloads = getDownloads(rec);
  const chapters = rec.aiChapters || [];
  const [activeSource, setActiveSource] = useState(0);
  const [activeChapter, setActiveChapter] = useState(0);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const others = allRecordings.filter(r => r.videoId !== rec.videoId).slice(0, 8);

  // Load chat replay
  useEffect(() => {
    if (!rec.chatUrl) return;
    setChatLoading(true);
    fetch(rec.chatUrl)
      .then(r => {
        const ct = r.headers.get('content-type') || '';
        if (ct.includes('html') || !r.ok) throw new Error('Not JSON');
        return r.text();
      })
      .then(text => {
        // Support both JSON array and JSONL
        try {
          const arr = JSON.parse(text);
          if (Array.isArray(arr) && arr.length > 0) setChatMessages(arr);
        } catch {
          const lines = text.split('\n').filter(l => l.trim());
          const msgs = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
          if (msgs.length > 0) setChatMessages(msgs);
        }
      })
      .catch(() => {})
      .finally(() => setChatLoading(false));
  }, [rec.chatUrl]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Track active chapter by time
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !chapters.length) return;
    const onTime = () => {
      const t = player.currentTime || 0;
      for (let i = chapters.length - 1; i >= 0; i--) {
        if (t >= chapters[i].time) { setActiveChapter(i); break; }
      }
    };
    player.addEventListener('time-update', onTime);
    return () => player.removeEventListener('time-update', onTime);
  }, [chapters]);

  const seekTo = useCallback((sec: number) => {
    const p = playerRef.current;
    if (p) { p.currentTime = sec; p.play().catch(() => {}); }
  }, []);

  const switchSource = useCallback((idx: number) => {
    setActiveSource(idx);
  }, []);

  const playUrl = sources[activeSource]?.url || '';

  return (
    <div style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      {/* ── Top Bar ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 sm:px-6 h-14 border-b" style={{ borderColor: 'var(--border)' }}>
        <button onClick={onClose} className="flex items-center gap-2 text-sm font-medium transition-colors hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Back to Archive
        </button>
        <div className="flex items-center gap-2">
          <button onClick={onToggleTheme} className="p-2 rounded-full transition-colors" style={{ color: 'var(--text-muted)' }}>
            {theme === 'dark' ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
            )}
          </button>
          <a href={rec.videoUrl} target="_blank" rel="noopener noreferrer" className="text-[13px] px-3 py-1.5 rounded-full transition-colors" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
            YouTube ↗
          </a>
        </div>
      </div>

      {/* ── Main Content ──────────────────────────────────────────────── */}
      <div className="flex flex-col xl:flex-row max-w-[1800px] mx-auto">

        {/* ── Left: Player + Info ──────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          {/* Player — FULL WIDTH */}
          <div className="w-full">
            {playUrl ? (
              <MediaPlayer
                key={playUrl}
                ref={playerRef}
                src={playUrl}
                viewType="video"
                streamType="on-demand"
                crossOrigin=""
                playsInline
                autoPlay
                className="w-full aspect-video bg-black"
              >
                <MediaProvider />
                <DefaultVideoLayout icons={defaultLayoutIcons} />
              </MediaPlayer>
            ) : (
              <div className="w-full aspect-video flex items-center justify-center" style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
                <p className="text-lg">No playback source available</p>
              </div>
            )}
          </div>

          {/* Title + Meta */}
          <div className="px-4 sm:px-6 py-4">
            <h1 className="text-xl sm:text-2xl font-semibold leading-snug">{rec.title}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[14px]" style={{ color: 'var(--text-secondary)' }}>
              <span>{rec.date}</span>
              <span style={{ color: 'var(--text-muted)' }}>•</span>
              <span>{rec.durationFmt}</span>
              <span style={{ color: 'var(--text-muted)' }}>•</span>
              <span>{rec.sizeHuman}</span>
              {rec.resolution && (
                <>
                  <span style={{ color: 'var(--text-muted)' }}>•</span>
                  <span className="font-semibold" style={{ color: 'var(--accent)' }}>{rec.resolution.includes('1080') ? '1080p HD' : rec.resolution}</span>
                </>
              )}
            </div>

            {/* ── Playback Source Switcher ─────────────────────────────── */}
            {sources.length > 1 && (
              <div className="mt-4 flex items-center gap-2 flex-wrap">
                <span className="text-[12px] font-semibold uppercase tracking-wider mr-1" style={{ color: 'var(--text-muted)' }}>Source:</span>
                {sources.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => switchSource(i)}
                    className={`text-[13px] px-3 py-1.5 rounded-full font-medium transition-all ${
                      i === activeSource ? 'text-white' : ''
                    }`}
                    style={{
                      background: i === activeSource ? 'var(--accent)' : 'var(--bg-secondary)',
                      color: i === activeSource ? '#fff' : 'var(--text-secondary)',
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}

            {/* ── Downloads ───────────────────────────────────────────── */}
            <div className="mt-5">
              <h3 className="text-[13px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Download</h3>
              <div className="flex flex-wrap gap-2">
                {downloads.map((dl, i) => (
                  <a
                    key={i}
                    href={dl.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-medium transition-all hover:scale-[1.02]"
                    style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                  >
                    <span>{dl.icon}</span> {dl.label}
                  </a>
                ))}
              </div>
            </div>

            {/* ── Chapters ────────────────────────────────────────────── */}
            {chapters.length > 0 && (
              <div className="mt-6">
                <h3 className="text-[13px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Chapters</h3>
                <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                  {chapters.map((ch, i) => (
                    <button
                      key={i}
                      onClick={() => seekTo(ch.time)}
                      className="w-full flex items-center gap-4 px-4 py-3 text-left transition-all border-b last:border-b-0"
                      style={{
                        background: i === activeChapter ? 'var(--bg-tertiary)' : 'transparent',
                        borderColor: 'var(--border)',
                      }}
                    >
                      <span className="text-[13px] font-mono w-16 shrink-0 tabular-nums font-semibold" style={{ color: 'var(--accent)' }}>
                        {fmtTime(ch.time)}
                      </span>
                      <span className="text-[14px] font-medium" style={{ color: i === activeChapter ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                        {ch.label}
                      </span>
                      {i === activeChapter && (
                        <span className="ml-auto text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--accent)' }}>Now</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Live Chat Replay ────────────────────────────────────── */}
            {rec.chatUrl && (
              <div className="mt-6">
                <h3 className="text-[13px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Live Chat Replay</h3>
                <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
                  {chatLoading ? (
                    <div className="p-6 text-center" style={{ color: 'var(--text-muted)' }}>Loading chat...</div>
                  ) : chatMessages.length > 0 ? (
                    <div className="max-h-80 overflow-y-auto p-3 space-y-2">
                      {chatMessages.slice(0, 200).map((msg, i) => (
                        <div key={i} className="flex gap-2 text-[13px]">
                          <span className="font-semibold shrink-0" style={{ color: 'var(--accent)' }}>
                            {msg.author?.name || msg.author || 'User'}
                          </span>
                          <span style={{ color: 'var(--text-secondary)' }}>
                            {msg.message || msg.text || msg.body || ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-6 text-center text-[13px]" style={{ color: 'var(--text-muted)' }}>
                      No chat messages available for this stream
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Right Sidebar: More Streams ─────────────────────────────── */}
        {others.length > 0 && (
          <div className="xl:w-[400px] shrink-0 px-4 sm:px-6 xl:pl-0 xl:pr-6 pb-10 xl:pt-4">
            <h3 className="text-[13px] font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--text-muted)' }}>
              More Streams
            </h3>
            <div className="space-y-4">
              {others.map(o => (
                <button key={o.videoId} onClick={() => onNavigate(o)} className="flex gap-3 w-full text-left group">
                  <div className="w-44 shrink-0 aspect-video rounded-xl overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
                    <img
                      src={o.thumbnail}
                      alt={o.title}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-[14px] font-medium line-clamp-2 leading-snug" style={{ color: 'var(--text-primary)' }}>{o.title}</p>
                    <p className="text-[12px] mt-1.5" style={{ color: 'var(--text-muted)' }}>The Muslim Lantern</p>
                    <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{o.date} • {o.durationFmt}</p>
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
