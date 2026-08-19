// The Screening Room — cinematic watch page.
//
// Playback is YouTube-first (GHOST embeds the original stream through the
// Vidstack YouTube provider — always available for every recording), with
// direct MP4 mirrors as failover (R3AL → B3ING → STORM → BUNNY). "Auto"
// plays the first healthy source and fails over live on error, with
// background HEAD probes showing per-mirror latency. AI chapters are
// synthesized into a WebVTT track so the scrubber shows chapter marks,
// and a chapter rail below seeks between them. Position, speed and
// theatre mode persist across visits.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MediaPlayer, MediaProvider, Track, type MediaPlayerInstance } from '@vidstack/react';
import ChatReplay from './ChatReplay';
import {
  DefaultVideoLayout,
  defaultLayoutIcons,
} from '@vidstack/react/player/layouts/default';
import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';

import type { Ep, Guest } from '../types';
import { fetchGuests } from '../lib/fetcher';
import { nextUp as pickNext } from '../lib/enrich';
import { copyText, fmtDate, fmtTime, isHD, resShort, shareLinks } from '../lib/format';
import {
  clearPosition, getRate, getTheatre, loadPosition,
  pushHistory, savePosition, setRate as persistRate, setTheatre as persistTheatre,
} from '../lib/storage';

interface Props {
  rec: Ep;
  recs: Ep[];
  onClose: () => void;
  onOpen: (ep: Ep) => void;
  toast: (msg: string) => void;
}

interface Mirror {
  label: string;
  note: string;
  url: string;
  kind: 'youtube' | 'mp4';
}

declare global { interface Window { __mlaContinueResume?: string } }

function buildMirrors(rec: Ep): Mirror[] {
  // Every recording's videoId IS its YouTube id (the pipeline records the
  // original stream), so the YouTube provider is always available even when
  // the file mirrors are still uploading.
  const ytId =
    rec.youtubeId ||
    (rec.youtubeUnlisted?.match(/(?:v=|\/)([\w-]{11})/)?.[1] ?? '') ||
    (/^[\w-]{11}$/.test(rec.videoId) ? rec.videoId : '');
  const out: Mirror[] = [];
  if (ytId) {
    out.push({
      label: 'GHOST', note: 'YouTube original',
      url: `youtube/${ytId}`,
      kind: 'youtube',
    });
  }
  if (rec.archiveNode) out.push({ label: 'R3AL', note: 'Archive.org node', url: rec.archiveNode, kind: 'mp4' });
  const gh = rec.githubDirect || rec.githubRelease;
  if (gh) out.push({ label: 'B3ING', note: 'GitHub release', url: gh, kind: 'mp4' });
  if (rec.cfStream) out.push({ label: 'STORM', note: 'Telegram stream', url: rec.cfStream, kind: 'mp4' });
  if (rec.archiveDirect && rec.archiveDirect !== rec.archiveNode) {
    out.push({ label: 'BUNNY', note: 'Archive.org direct', url: rec.archiveDirect, kind: 'mp4' });
  }
  return out;
}

function chaptersToVtt(chapters: { time: number; label: string }[], duration: number): string {
  const end = (i: number) => (i + 1 < chapters.length ? chapters[i + 1].time - 0.001 : Math.max(duration || chapters[i].time + 600, chapters[i].time + 600));
  const stamp = (s: number) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.000`;
  };
  return 'WEBVTT\n\n' + chapters.map((c, i) =>
    `Chapter ${i + 1}\n${stamp(Math.max(0, c.time))} --> ${stamp(Math.max(c.time + 1, end(i)))}\n${c.label}\n`
  ).join('\n');
}

export default function WatchPage({ rec, recs, onClose, onOpen, toast }: Props) {
  const mirrors = useMemo(() => buildMirrors(rec), [rec]);

  const [srcIdx, setSrcIdx] = useState(0);              // 0 = Auto
  const [failed, setFailed] = useState<Set<number>>(new Set());
  const [health, setHealth] = useState<Record<number, number>>({});
  const [playing, setPlaying] = useState(false);
  const [litOnce, setLitOnce] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(rec.durationSec || 0);
  const [theatre, setTheatre] = useState(getTheatre());
  const [showHelp, setShowHelp] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [soundOff, setSoundOff] = useState(true);      // we start muted (autoplay-safe)
  const [soundNudged, setSoundNudged] = useState(false);
  const [veil, setVeil] = useState(true);               // single-loader veil (fades out)
  const [seekVeil, setSeekVeil] = useState(false);      // one soft beat while a seek buffers
  const [countdown, setCountdown] = useState<number | null>(null);
  const [resumeAsk, setResumeAsk] = useState<number | null>(null);
  const [tick, setTick] = useState(0);                  // rerun side effects on rec change
  const [guests, setGuests] = useState<Guest[]>([]);

  const player = useRef<MediaPlayerInstance | null>(null);
  const next = pickNext(recs, rec.videoId);

  const sorted = useMemo(() => [...recs].sort((a, b) => b.date.localeCompare(a.date)), [recs]);
  const idxInSorted = sorted.findIndex(r => r.videoId === rec.videoId);
  const newer = idxInSorted > 0 ? sorted[idxInSorted - 1] : undefined;
  const older = idxInSorted >= 0 && idxInSorted < sorted.length - 1 ? sorted[idxInSorted + 1] : undefined;

  /* Active mirror resolution */
  const activeIdx = useMemo(() => {
    if (srcIdx !== 0) return srcIdx;
    const firstGood = mirrors.findIndex((_, i) => !failed.has(i));
    return firstGood === -1 ? 0 : firstGood;
  }, [srcIdx, failed, mirrors]);
  const active = mirrors[activeIdx];

  const chapterVtt = useMemo(() => {
    if (!rec.chapters || rec.chapters.length < 2) return '';
    return URL.createObjectURL(new Blob([chaptersToVtt(rec.chapters, duration || rec.durationSec)], { type: 'text/vtt' }));
  }, [rec.chapters, rec.videoId, duration, rec.durationSec]);
  useEffect(() => () => { if (chapterVtt) URL.revokeObjectURL(chapterVtt); }, [chapterVtt]);

  const thumbVtt = useMemo(() => {
    const m = rec.storyboard?.vtt?.match(/\/([^/]+)\.vtt(?:\?|$)/);
    return m ? `/api/vtt/${m[1]}` : '';
  }, [rec.storyboard]);

  const activeChapter = useMemo(() => {
    if (!rec.chapters?.length) return -1;
    let cur = 0;
    for (let i = 0; i < rec.chapters.length; i++) if (time >= rec.chapters[i].time) cur = i;
    return cur;
  }, [rec.chapters, time]);

  /* ── Guests (join/leave) ──────────────────────────────────────────── */
  useEffect(() => {
    let live = true;
    setGuests([]);
    fetchGuests(rec.videoId).then(g => { if (live) setGuests(g); });
    return () => { live = false; };
  }, [rec.videoId]);

  const activeGuest = useMemo(() => {
    return guests.find(g => time >= g.join && time <= g.leave) ?? null;
  }, [guests, time]);

  /* ── Reset per recording ─────────────────────────────────────────── */
  useEffect(() => {
    setSrcIdx(0); setFailed(new Set()); setHealth({});
    setPlaying(false); setLitOnce(false); setElapsed(0); setTime(0);
    setDuration(rec.durationSec || 0);
    setCountdown(null); setShareOpen(false); setShowHelp(false);
    setSoundOff(true); setSoundNudged(false); setVeil(true); setSeekVeil(false);
    pushHistory(rec.videoId);
    setTick(t => t + 1);
  }, [rec.videoId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Veil unmounts a beat after real frames flow (not the first play event —
     the embed can fire "playing" while its own spinner is still up). */
  const framesFlowing = litOnce && time > 0.25;
  useEffect(() => {
    if (!framesFlowing) return;
    const t = setTimeout(() => setVeil(false), 550);
    return () => clearTimeout(t);
  }, [framesFlowing]);

  /* ── Resume handling ─────────────────────────────────────────────── */
  useEffect(() => {
    const tParam = parseFloat(new URLSearchParams(window.location.hash.split('?')[1] || '').get('t') || '');
    const saved = loadPosition(rec.videoId);
    const fromContinue = window.__mlaContinueResume === rec.videoId;
    window.__mlaContinueResume = undefined;

    if (Number.isFinite(tParam) && tParam > 0) {
      const seek = () => { if (player.current) player.current.currentTime = tParam; };
      const iv = setInterval(() => { if (player.current?.state.canPlay) { seek(); clearInterval(iv); } }, 300);
      setTimeout(() => clearInterval(iv), 15000);
    } else if (fromContinue && saved && saved.t > 30) {
      const seek = () => { if (player.current) player.current.currentTime = saved.t; };
      const iv = setInterval(() => { if (player.current?.state.canPlay) { seek(); clearInterval(iv); toast(`Resumed at ${fmtTime(saved.t)}`); } }, 300);
      setTimeout(() => clearInterval(iv), 15000);
    } else if (saved && saved.t > 30 && saved.t < saved.d - 30) {
      setResumeAsk(saved.t);
    }
  }, [rec.videoId, toast]);

  /* ── Health probes ───────────────────────────────────────────────── */
  useEffect(() => {
    const ctrl = new AbortController();
    mirrors.forEach((m, i) => {
      const t0 = performance.now();
      if (m.kind === 'youtube') {
        // Probe the YouTube thumbnail — works from any origin, no API needed.
        const id = m.url.split('/')[1];
        fetch(`https://i.ytimg.com/vi/${id}/default.jpg`, { method: 'HEAD', mode: 'no-cors', signal: ctrl.signal })
          .then(() => setHealth(h => ({ ...h, [i]: performance.now() - t0 })))
          .catch(() => setHealth(h => ({ ...h, [i]: -1 })));
      } else {
        fetch(m.url, { method: 'HEAD', mode: 'no-cors', signal: ctrl.signal })
          .then(() => setHealth(h => ({ ...h, [i]: performance.now() - t0 })))
          .catch(() => setHealth(h => ({ ...h, [i]: -1 })));
      }
    });
    return () => ctrl.abort();
  }, [mirrors, tick]);

  /* ── Loading-overlay elapsed timer ───────────────────────────────── */
  useEffect(() => {
    if (litOnce) return;
    const iv = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(iv);
  }, [litOnce]);

  /* ── Position autosave (every 5 s) ───────────────────────────────── */
  useEffect(() => {
    const iv = setInterval(() => {
      const p = player.current;
      if (p && p.currentTime > 5 && p.duration > 0) savePosition(rec.videoId, p.currentTime, p.duration);
    }, 5000);
    return () => {
      clearInterval(iv);
      const p = player.current;
      if (p && p.currentTime > 5 && p.duration > 0) savePosition(rec.videoId, p.currentTime, p.duration);
    };
  }, [rec.videoId]);

  /* ── Next-up countdown ───────────────────────────────────────────── */
  useEffect(() => {
    if (countdown == null) return;
    if (countdown <= 0) {
      if (next) { onOpen(next); return; }
      setCountdown(null);
      return;
    }
    const t = setTimeout(() => setCountdown(c => (c == null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [countdown, next, onOpen]);

  /* ── Mirror selection + failover ─────────────────────────────────── */
  const selectMirror = useCallback((i: number) => {
    setSrcIdx(i);
    setFailed(f => { const n = new Set(f); n.delete(i); return n; });
    setLitOnce(false); setElapsed(0); setPlaying(false);
  }, []);

  const onPlayerError = useCallback(() => {
    setFailed(f => {
      const n = new Set(f); n.add(activeIdx);
      const nextIdx = mirrors.findIndex((_, i) => !n.has(i));
      if (nextIdx !== -1) {
        toast(`${mirrors[activeIdx]?.label ?? 'Mirror'} failed — switching to ${mirrors[nextIdx].label}`);
        setSrcIdx(nextIdx);
        setLitOnce(false); setElapsed(0);
      } else {
        toast('All mirrors failed — try a download instead');
      }
      return n;
    });
  }, [activeIdx, mirrors, toast]);

  /* ── Global keyboard ─────────────────────────────────────────────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement | null)?.isContentEditable) return;

      if (/^[0-5]$/.test(e.key)) {
        const i = parseInt(e.key);
        if (i <= mirrors.length) { selectMirror(i); toast(i === 0 ? 'Mirror: Auto' : `Mirror: ${mirrors[i - 1]?.label}`); }
      } else if (e.key === 't' || e.key === 'T') {
        setTheatre(v => { persistTheatre(!v); return !v; });
      } else if (e.key === '?') {
        setShowHelp(v => !v);
      } else if (e.key === 'Escape') {
        if (shareOpen) setShareOpen(false);
        else if (showHelp) setShowHelp(false);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mirrors.length, selectMirror, toast, shareOpen, showHelp, onClose]);

  /* ── Player helpers ──────────────────────────────────────────────── */
  const onCanPlay = useCallback(() => {
    const p = player.current;
    if (!p) return;
    try { p.playbackRate = getRate(); } catch { /* not ready */ }
    // mp4 mirrors: pin to the best quality ≤1080p
    const qs = p.qualities;
    if (qs && qs.length && active?.kind === 'mp4') {
      const best = [...qs].filter(q => !q.height || q.height <= 1080).sort((a, b) => (b.height || 0) - (a.height || 0))[0];
      if (best) { try { best.selected = true; } catch { /* list locked */ } }
    }
  }, [active?.kind]);

  const onPlaying = useCallback(async () => {
    setPlaying(true); setLitOnce(true); setSeekVeil(false);
    // If the listener unmuted through the player's own controls, follow suit.
    const p = player.current;
    if (p && !p.muted) setSoundOff(false);
  }, []);

  const soundOn = () => {
    const p = player.current;
    if (p) p.muted = false;
    setSoundOff(false);
    setSoundNudged(true);
  };

  const seekTo = (t: number) => {
    const p = player.current;
    if (p) { p.currentTime = t; if (!p.state.playing) void p.play(); }
  };

  const shareUrl = (withTime: boolean) =>
    `${window.location.origin}/#/watch/${encodeURIComponent(rec.videoId)}${withTime && time > 5 ? `?t=${Math.floor(time)}` : ''}`;

  // Permanent mirrors first, so a viewer always lands on a link that can't
  // expire (Archive.org, GitHub, MEGA). Temp hosts (Pixeldrain ~60d, Gofile
  // ~10d) are listed last and labeled "temporary" so a dead link is expected
  // there, never the default.
  const vault = [
    { label: 'Archive.org', href: rec.archiveLink, color: '#e50914', perm: true },
    { label: 'GitHub', href: rec.githubDirect || rec.githubRelease, color: '#9aa0a6', perm: true },
    { label: 'MEGA', href: rec.megaLink, color: '#d92753', perm: true },
    { label: 'Pixeldrain', href: rec.pixeldrainLink, color: '#4f9ee8', perm: false },
    { label: 'Gofile', href: rec.gofileLink, color: '#3ba97c', perm: false },
  ].filter(v => v.href);

  const R = 26, CIRC = 2 * Math.PI * R;

  // With the YouTube provider in the cascade every recording has at least
  // one source; this guard only catches a malformed record.
  if (!mirrors.length) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4">
        <p className="display text-xl">This recording can't be played</p>
        <p className="text-[13px]" style={{ color: 'var(--mist)' }}>No video source was found in the archive index.</p>
        <button className="btn btn-flame" onClick={onClose}>← Back to the archive</button>
      </div>
    );
  }

  return (
    <div className={`min-h-dvh ${theatre ? 'theatre' : ''}`}>
      {/* Sticky chrome */}
      <div className="sticky top-0 z-40 safe-bottom-0" style={{ background: 'var(--glass-strong)', backdropFilter: 'blur(22px) saturate(150%)', WebkitBackdropFilter: 'blur(22px) saturate(150%)', borderBottom: '1px solid var(--line)' }}>
        <div className="flex items-center gap-2 px-4 md:px-6 h-14">
          <button className="btn-icon" title="Back to archive (Esc)" aria-label="Back to archive" onClick={onClose}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 5-7 7 7 7" /></svg>
          </button>
          <a href="#/" className="flex items-center gap-2.5 mr-1 group" aria-label="The Lantern Archive — home">
            <img
              src="/logo.png"
              alt="The Muslim Lantern"
              className="h-7 md:h-8 w-auto transition-transform duration-300 group-hover:scale-105"
              draggable={false}
            />
          </a>

          <div className="flex-1 min-w-0 text-center">
            <span className="mono text-[10px] tracking-[0.18em] uppercase" style={{ color: 'var(--shade)' }}>
              {fmtDate(rec.date)}{rec.durationFmt ? ` · ${rec.durationFmt}` : ''}
            </span>
          </div>

          {newer && (
            <button className="btn-icon" title={`Newer: ${newer.title}`} aria-label="Newer recording" onClick={() => onOpen(newer)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 15 6-6 6 6" /></svg>
            </button>
          )}
          {older && (
            <button className="btn-icon" title={`Older: ${older.title}`} aria-label="Older recording" onClick={() => onOpen(older)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
            </button>
          )}
          <button className="btn-icon" title="Shortcuts (?)" aria-label="Keyboard shortcuts" onClick={() => setShowHelp(v => !v)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.4 2.3c-.8.3-1.4 1-1.4 1.9v.3M11.5 17h.01" /></svg>
          </button>
          <button
            className="btn-icon hidden xl:inline-flex"
            title="Theatre mode (T)"
            aria-label="Theatre mode"
            aria-pressed={theatre}
            onClick={() => setTheatre(v => { persistTheatre(!v); return !v; })}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="5" width="18" height="14" rx="2" />{theatre ? <path d="M8 5v14M16 5v14" /> : null}
            </svg>
          </button>
        </div>
      </div>

      {/* Stage */}
      <div className="relative">
        <div className={`mx-auto grid gap-8 px-0 md:px-6 xl:px-8 py-6 ${theatre ? 'max-w-none' : 'max-w-[1500px]'}`}
          style={{ gridTemplateColumns: theatre ? '1fr' : undefined }}>

          {/* Main column */}
          <div className={`min-w-0 ${theatre ? '' : 'xl:col-span-2 xl:grid xl:grid-cols-[1fr_340px] xl:gap-8'}`}>
            <div className="min-w-0">
              {/* Player + ambient */}
              <div className={`relative ${theatre ? '' : 'md:px-0 px-0'}`}>
                <div className={`ambient-bleed ${playing ? 'lit' : ''}`} style={{ backgroundImage: `url(${rec.thumbnail})` }} />
                <div className={`player-frame relative ${active?.kind === 'youtube' ? 'src-youtube' : ''}`}>
                  <MediaPlayer
                    key={active?.url}
                    ref={player}
                    title={rec.title}
                    src={active!.url}
                    poster={rec.thumbnail}
                    autoPlay
                    muted={soundOff}
                    playsInline
                    viewType="video"
                    streamType="on-demand"
                    onCanPlay={onCanPlay}
                    onPlaying={onPlaying}
                    onPause={() => { setPlaying(false); setSeekVeil(false); }}
                    onSeeking={() => setSeekVeil(true)}
                    onSeeked={() => { setTimeout(() => setSeekVeil(false), 220); }}
                    onError={onPlayerError}
                    onEnded={() => { setPlaying(false); clearPosition(rec.videoId); if (next) setCountdown(12); }}
                    onTimeUpdate={(d: any) => {
                      setTime(d?.currentTime ?? 0);
                      if (d?.duration) setDuration(d.duration);
                    }}
                    onRateChange={(d: any) => { const r = d?.rate; if (typeof r === 'number' && r > 0) persistRate(r); }}
                  >
                    {chapterVtt && <Track kind="chapters" src={chapterVtt} default label="Chapters" />}
                    <MediaProvider />
                    <DefaultVideoLayout icons={defaultLayoutIcons} thumbnails={thumbVtt || undefined} />
                  </MediaPlayer>

                  {/* The one loader — an opaque veil with a single rotating
                      ring. Covers both the player's spinner and the embed's
                      native one until real frames roll, then fades. */}
                  {veil && (
                    <div className="load-veil" style={{ opacity: framesFlowing ? 0 : 1 }} aria-hidden="true">
                      <img src={rec.thumbnail} alt="" draggable={false}
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      <span className="tint" />
                      {elapsed < 8 && (
                        <span className="load-ring"><i /></span>
                      )}
                    </div>
                  )}

                  {/* Seek beat — while the reel finds the new timestamp, a
                      backdrop-blur layer smears the embed's native seek
                      spinner and shows our one ring instead. */}
                  {seekVeil && framesFlowing && (
                    <div className="seek-veil" aria-hidden="true">
                      <span className="load-ring"><i /></span>
                    </div>
                  )}

                  {/* Sound nudge — playing muted, one tap restores audio */}
                  {playing && soundOff && !soundNudged && (
                    <button className="sound-chip" onClick={soundOn}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H3v6h3l5 4V5z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></svg>
                      Tap for sound
                    </button>
                  )}

                  {/* Guest name — shows on-screen while a guest is on air */}
                  {activeGuest && playing && (
                    <div className="guest-chip" aria-live="polite">
                      <span className="guest-dot" />
                      <span className="guest-label">Guest</span>
                      <span className="guest-name">{activeGuest.name}</span>
                    </div>
                  )}

                  {/* One loader only: the player's own rotating buffer circle.
                      If the browser holds autoplay for a gesture, offer it. */}
                  {!litOnce && elapsed >= 8 && (
                    <div className="absolute inset-0 z-30 flex flex-col items-center justify-end gap-3 pb-24 pointer-events-none">
                      <button className="btn btn-flame !py-3 !px-7 pointer-events-auto"
                        onClick={() => { const p = player.current; if (p) { void p.play().catch(() => {}); soundOn(); } }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
                        Start playback
                      </button>
                      {elapsed >= 25 && (
                        <div className="flex gap-2 flex-wrap justify-center px-6">
                          {mirrors.map((m, i) => i !== activeIdx && !failed.has(i) ? (
                            <button key={m.label} className="btn btn-ghost !py-2 !px-4 !text-[11px] pointer-events-auto" onClick={() => selectMirror(i)}>
                              Switch to {m.label}
                            </button>
                          ) : null)}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Resume banner */}
                  {resumeAsk != null && !playing && (
                    <div className="absolute inset-x-4 bottom-4 z-30 rounded-xl px-5 py-4 flex items-center gap-4 flex-wrap"
                      style={{ background: 'var(--glass-strong)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid var(--line-flame)' }}>
                      <span className="text-[13px] font-semibold">Continue from {fmtTime(resumeAsk)}?</span>
                      <div className="flex gap-2 ml-auto">
                        <button className="btn btn-ghost !py-2 !px-4 !text-[12px]" onClick={() => { clearPosition(rec.videoId); setResumeAsk(null); }}>
                          Start over
                        </button>
                        <button className="btn btn-flame !py-2 !px-4 !text-[12px]" onClick={() => { seekTo(resumeAsk); setResumeAsk(null); }}>
                          Resume
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Next up countdown */}
                  {countdown != null && next && (
                    <div className="absolute inset-0 z-40 flex items-center justify-center"
                      style={{ background: 'var(--glass-strong)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}>
                      <div className="flex flex-col items-center gap-5 px-6 text-center">
                        <span className="eyebrow">Next episode</span>
                        <img src={next.thumbnail} alt="" className="w-64 aspect-video object-cover rounded-lg"
                          style={{ border: '1px solid var(--line-flame)', boxShadow: 'var(--shadow-lift)' }}
                          onError={e => { (e.target as HTMLImageElement).src = '/thumbnail.jpg'; }} />
                        <div>
                          <div className="display text-lg font-medium line-clamp-1 max-w-sm mx-auto">{next.title}</div>
                          <div className="mono text-[10.5px] mt-1" style={{ color: 'var(--shade)' }}>{fmtDate(next.date)}{next.durationFmt ? ` · ${next.durationFmt}` : ''}</div>
                        </div>
                        <div className="flex items-center gap-5">
                          <div className="relative w-[64px] h-[64px]">
                            <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90">
                              <circle cx="32" cy="32" r={R} fill="none" stroke="var(--flame-12)" strokeWidth="3" />
                              <circle cx="32" cy="32" r={R} fill="none" stroke="var(--flame-1)" strokeWidth="3" strokeLinecap="round"
                                strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - countdown / 12)} style={{ transition: 'stroke-dashoffset 1s linear' }} />
                            </svg>
                            <span className="absolute inset-0 flex items-center justify-center mono text-[15px] font-bold text-flame">{countdown}</span>
                          </div>
                          <button className="btn btn-flame !py-2.5 !px-5 !text-[12.5px]" onClick={() => onOpen(next)}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
                            Play now
                          </button>
                          <button className="btn btn-ghost !py-2.5 !px-5 !text-[12.5px]" onClick={() => setCountdown(null)}>Cancel</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Title block */}
              <div className={`mt-8 ${theatre ? 'px-6 max-w-5xl mx-auto' : ''}`}>
                <div className="flex items-center gap-3 mb-3 flex-wrap">
                  <span className="eyebrow">{rec.fromYouTube ? 'From the channel' : 'From the archive'}</span>
                  <span className="shelf-tick !w-3" />
                  <span className="mono text-[10.5px] tracking-[0.18em] uppercase" style={{ color: 'var(--mist)' }}>{fmtDate(rec.date)}</span>
                  {isHD(rec.resolution) && <span className="chip chip-hd">{resShort(rec.resolution)}</span>}
                  {rec.durationFmt && <span className="chip">{rec.durationFmt}</span>}
                  {rec.sizeHuman && <span className="chip">{rec.sizeHuman}</span>}
                  {rec.viewCount ? <span className="chip">{rec.viewCount.toLocaleString()} views</span> : null}
                  {rec.chatUrl && (
                    <a className="chip transition-colors hover:!text-[var(--flame-1)]"
                      href={rec.chatUrl} target="_blank" rel="noopener noreferrer"
                      style={{ textDecoration: 'none' }}>
                      live chat ↗
                    </a>
                  )}
                </div>
                <h1 className="display text-[clamp(24px,3.4vw,40px)] leading-[1.02] text-balance mb-5">{rec.title}</h1>

                {rec.topics && rec.topics.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-6 -mt-3">
                    {rec.topics.map(t => <span key={t} className="topic-chip topic-chip-lg">{t}</span>)}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 flex-wrap mb-8">
                  <button
                    className="btn btn-ghost !py-2 !px-4 !text-[12px] relative"
                    onClick={() => copyText(shareUrl(true)).then(ok => ok && toast(`Timestamp link copied (${fmtTime(time)})`))}
                    title="Copy link with current timestamp"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></svg>
                    Copy @ {fmtTime(time)}
                  </button>
                  <button className="btn btn-ghost !py-2 !px-4 !text-[12px]"
                    onClick={() => copyText(shareUrl(false)).then(ok => ok && toast('Link copied'))}>
                    Copy link
                  </button>
                  <div className="relative">
                    <button className="btn btn-ghost !py-2 !px-4 !text-[12px]" onClick={e => { e.stopPropagation(); setShareOpen(v => !v); }}>
                      Share ▾
                    </button>
                    {shareOpen && (
                      <div className="absolute top-full mt-2 left-0 z-30 rounded-lg overflow-hidden min-w-[160px]"
                        style={{ background: 'var(--glass-strong)', border: '1px solid var(--line)', backdropFilter: 'blur(20px)' }}>
                        {Object.entries(shareLinks(shareUrl(false), rec.title)).map(([k, url]) => (
                          <a key={k} href={url} target="_blank" rel="noopener noreferrer"
                            className="block px-4 py-2.5 text-[12px] font-semibold capitalize transition-colors hover:bg-[var(--flame-08)]"
                            style={{ color: 'var(--mist)' }}>
                            {k === 'x' ? 'X (Twitter)' : k}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex-1" />
                  <span className="mono text-[10px]" style={{ color: 'var(--shade)' }}>
                    mirrors <span className="kbd">0</span>–<span className="kbd">{Math.min(5, mirrors.length)}</span> · theatre <span className="kbd">T</span>
                  </span>
                </div>

                {/* Chapter rail */}
                {rec.chapters && rec.chapters.length > 0 && (
                  <div className="mb-8">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="shelf-tick" />
                      <span className="eyebrow">Chapters</span>
                      <span className="mono text-[10px]" style={{ color: 'var(--shade)' }}>{rec.chapters.length} marked</span>
                    </div>
                    <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
                      {rec.chapters.map((c, i) => (
                        <button
                          key={i}
                          className={`chapter-card ${i === activeChapter ? 'active' : ''}`}
                          onClick={() => seekTo(Math.max(0, c.time))}
                        >
                          <div className="mono idx text-[10px] mb-1.5" style={{ color: 'var(--shade)' }}>
                            {String(i + 1).padStart(2, '0')} · {fmtTime(c.time)}
                          </div>
                          <div className="text-[12.5px] font-semibold line-clamp-2 leading-snug" style={{ color: i === activeChapter ? 'var(--ivory)' : 'var(--mist)' }}>
                            {c.label}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Guests — join/leave timeline */}
                {guests.length > 0 && (
                  <div className="mb-8">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="shelf-tick" />
                      <span className="eyebrow">Guests</span>
                      <span className="mono text-[10px]" style={{ color: 'var(--shade)' }}>{guests.length} appearance{guests.length === 1 ? '' : 's'}</span>
                    </div>
                    <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
                      {guests.map((g, i) => {
                        const onAir = !!activeGuest && activeGuest.name === g.name;
                        return (
                          <button
                            key={`${g.name}-${i}`}
                            className={`chapter-card ${onAir ? 'active' : ''}`}
                            onClick={() => seekTo(Math.max(0, g.join))}
                          >
                            <div className="mono idx text-[10px] mb-1.5" style={{ color: 'var(--shade)' }}>
                              {fmtTime(g.join)} → {fmtTime(g.leave)}
                            </div>
                            <div className="text-[12.5px] font-semibold line-clamp-1 leading-snug" style={{ color: onAir ? 'var(--ivory)' : 'var(--mist)' }}>
                              🎙️ {g.name}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <ChatReplay videoId={rec.videoId} time={time} playing={playing} />

                <div className="mono text-[10px] text-center py-8" style={{ color: 'var(--shade)' }}>
                  Lantern Archive · recorded autonomously · crafted with <span className="text-flame">♥</span> by Muneeb Ahmad
                </div>
              </div>
            </div>

            {/* Side rail (desktop, non-theatre) */}
            <aside className="hidden xl:flex flex-col gap-6" aria-label="Playback panels">
              {/* Mirrors */}
              <div className="rounded-xl p-4" style={{ background: 'var(--ink-1)', border: '1px solid var(--line)' }}>
                <div className="flex items-center gap-2.5 mb-3">
                  <span className="eyebrow">Mirrors</span>
                  <span className="mono text-[9.5px]" style={{ color: 'var(--shade)' }}>auto-failover</span>
                </div>
                <button
                  className="w-full flex items-center gap-2.5 px-3 h-10 rounded-lg mb-1.5 text-[12.5px] font-bold transition-colors"
                  style={{ background: srcIdx === 0 ? 'var(--flame-08)' : 'transparent', border: `1px solid ${srcIdx === 0 ? 'var(--line-flame)' : 'transparent'}`, color: 'var(--ivory)' }}
                  onClick={() => selectMirror(0)}
                >
                  ⚡ Auto
                  <span className="mono ml-auto text-[10px]" style={{ color: 'var(--shade)' }}>{active?.label}</span>
                </button>
                {mirrors.map((m, i) => {
                  const ms = health[i];
                  const dead = failed.has(i) || ms === -1;
                  const state = dead ? 'dead' : ms == null ? 'slow' : ms < 300 ? 'fast' : ms < 1200 ? 'ok' : 'slow';
                  return (
                    <button
                      key={m.label}
                      className="w-full flex items-center gap-2.5 px-3 h-10 rounded-lg text-[12.5px] font-semibold transition-colors"
                      style={{
                        background: srcIdx === i + 1 ? 'var(--flame-08)' : 'transparent',
                        opacity: dead ? 0.5 : 1,
                        textDecoration: dead ? 'line-through' : 'none',
                        color: 'var(--mist)',
                      }}
                      onClick={() => selectMirror(i + 1)}
                    >
                      <span className={`dot-health ${state}`} />
                      <span style={{ color: 'var(--ivory)' }}>{m.label}</span>
                      <span className="text-[10.5px]" style={{ color: 'var(--shade)' }}>{m.note}</span>
                      <span className="mono ml-auto text-[10px]" style={{ color: 'var(--shade)' }}>
                        {dead ? 'down' : ms == null ? '…' : `${Math.round(ms)}ms`}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Vault */}
              <div className="rounded-xl p-4" style={{ background: 'var(--ink-1)', border: '1px solid var(--line)' }}>
                <div className="eyebrow mb-3">The vault</div>
                <div className="flex flex-col gap-1.5">
                  {vault.map(v => (
                    <a key={v.label} href={v.href} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2.5 px-3 h-10 rounded-lg text-[12.5px] font-semibold transition-all hover:translate-x-1"
                      style={{ background: 'var(--ink-2)', color: 'var(--ivory)' }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: v.color, boxShadow: `0 0 8px ${v.color}` }} />
                      {v.label}
                      <span className="mono text-[9px] uppercase tracking-wide" style={{ color: v.perm ? 'var(--flame-2)' : 'var(--shade)' }}>
                        {v.perm ? 'permanent' : 'temporary'}
                      </span>
                      <svg className="ml-auto" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--shade)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M9 7h8v8" /></svg>
                    </a>
                  ))}
                </div>
                <div className="mono text-[9.5px] mt-3 leading-relaxed" style={{ color: 'var(--shade)' }}>
                  Permanent mirrors never expire. Temporary ones auto-refresh before they lapse.
                </div>
              </div>

              {/* Up next + more */}
              {next && (
                <div className="rounded-xl p-4" style={{ background: 'var(--ink-1)', border: '1px solid var(--line)' }}>
                  <div className="eyebrow mb-3">Up next</div>
                  <button className="w-full flex gap-3 text-left group" onClick={() => onOpen(next)}>
                    <span className="relative w-28 aspect-video rounded overflow-hidden flex-none">
                      <img src={next.thumbnail} alt="" loading="lazy" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        onError={e => { (e.target as HTMLImageElement).src = '/thumbnail.jpg'; }} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[12.5px] font-bold line-clamp-2" style={{ color: 'var(--ivory)' }}>{next.title}</span>
                      <span className="mono block text-[10px] mt-1" style={{ color: 'var(--shade)' }}>{fmtDate(next.date)}{next.durationFmt ? ` · ${next.durationFmt}` : ''}</span>
                    </span>
                  </button>
                  <div className="divider !mx-0 !my-4" />
                  <div className="flex flex-col gap-2.5">
                    {sorted.filter(r => r.videoId !== rec.videoId && r.videoId !== next.videoId).slice(0, 4).map(r => (
                      <button key={r.videoId} className="flex gap-2.5 text-left group" onClick={() => onOpen(r)}>
                        <span className="w-16 aspect-video rounded overflow-hidden flex-none">
                          <img src={r.thumbnail} alt="" loading="lazy" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                            onError={e => { (e.target as HTMLImageElement).src = '/thumbnail.jpg'; }} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[11.5px] font-semibold line-clamp-1" style={{ color: 'var(--mist)' }}>{r.title}</span>
                          <span className="mono block text-[9.5px]" style={{ color: 'var(--shade)' }}>{fmtDate(r.date)}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </aside>
          </div>
        </div>
      </div>

      {/* Share dropdown-away click layer */}
      {shareOpen && <div className="fixed inset-0 z-20" onClick={() => setShareOpen(false)} />}

      {/* Help modal */}
      {showHelp && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-6" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
          <div className="absolute inset-0" style={{ background: 'var(--overlay)' }} onClick={() => setShowHelp(false)} />
          <div className="modal-card relative w-[min(420px,94vw)] p-6">
            <div className="eyebrow mb-4">Shortcuts</div>
            <div className="flex flex-col gap-2.5 text-[12.5px]" style={{ color: 'var(--mist)' }}>
              {[
                ['Space / K', 'Play · pause'],
                ['← / →', 'Seek ±10s'],
                ['↑ / ↓', 'Volume'],
                ['M', 'Mute'],
                ['F', 'Fullscreen'],
                ['I', 'Picture-in-picture'],
                ['0–5', 'Switch mirror (0 = auto)'],
                ['T', 'Theatre mode'],
                ['?', 'This panel'],
                ['Esc', 'Close panel / exit'],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between">
                  <span>{v}</span>
                  <span className="kbd">{k}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
