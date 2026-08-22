// Shorts — the channel's vertical cuts in a snap-scroll cinema.
// Each short fills the viewport, plays muted on entry, pauses on exit.
// Custom chrome only: tap to pause, sound toggle, hairline progress.
// The YouTube watermark corner carries our own brand mark instead.

import { useEffect, useRef, useState } from 'react';
import { MediaPlayer, MediaProvider, type MediaPlayerInstance } from '@vidstack/react';
import '@vidstack/react/player/styles/default/theme.css';

import type { Ep } from '../types';
import { copyText, fmtDate } from '../lib/format';

interface Props {
  shorts: Ep[];
}

export default function ShortsPage({ shorts }: Props) {
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  /* Keyboard: arrows jump between shorts, M toggles sound. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const next = Math.min(shorts.length - 1, Math.max(0, active + (e.key === 'ArrowDown' ? 1 : -1)));
        document.getElementById(`short-${next}`)?.scrollIntoView({ behavior: 'smooth' });
      } else if (e.key === 'm' || e.key === 'M') {
        setMuted(v => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, shorts.length]);

  const toggleLike = (id: string) =>
    setLiked(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  if (!shorts.length) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 pt-16">
        <p className="display text-2xl">No shorts yet</p>
        <p className="text-[13px]" style={{ color: 'var(--mist)' }}>
          The channel hasn't posted any shorts — check back soon.
        </p>
        <a href="#/" className="btn btn-flame mt-2">← Back home</a>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="shorts-scroll h-dvh overflow-y-auto snap-y snap-mandatory scroll-smooth"
      aria-label="Shorts"
    >
      {shorts.map((s, i) => (
        <ShortCard
          key={s.videoId}
          short={s}
          index={i}
          playing={i === active && !paused}
          muted={muted}
          liked={liked.has(s.videoId)}
          onActive={() => { if (i !== active) { setActive(i); setPaused(false); } }}
          onToggleLike={() => toggleLike(s.videoId)}
          onTogglePause={() => setPaused(v => !v)}
          onToggleMute={() => setMuted(v => !v)}
        />
      ))}
    </div>
  );
}

/* ── One short ─────────────────────────────────────────────────────────── */

interface CardProps {
  short: Ep;
  index: number;
  playing: boolean;
  muted: boolean;
  liked: boolean;
  onActive: () => void;
  onToggleLike: () => void;
  onTogglePause: () => void;
  onToggleMute: () => void;
}

function ShortCard({ short, index, playing, muted, liked, onActive, onToggleLike, onTogglePause, onToggleMute }: CardProps) {
  const player = useRef<MediaPlayerInstance | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [flowing, setFlowing] = useState(false);   // real frames arriving
  const [flash, setFlash] = useState(false);       // play/pause heartbeat icon

  /* Visibility → active + play. */
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const obs = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting && e.intersectionRatio > 0.6) onActive();
    }, { threshold: [0.61] });
    obs.observe(el);
    return () => obs.disconnect();
  }, [onActive]);

  /* Drive the player from the page state — retry once the reel is ready,
     since play() before the provider loads is silently dropped. */
  useEffect(() => {
    const p = player.current;
    if (!p) return;
    p.muted = muted;
    if (playing && ready) void p.play().catch(() => { /* still warming up */ });
    else if (!playing) p.pause();
  }, [playing, muted, ready]);

  const togglePlay = () => {
    onTogglePause();
    setFlash(true);
    setTimeout(() => setFlash(false), 480);
  };

  const share = () =>
    copyText(`${window.location.origin}/#/shorts`).then(() => { /* silent */ });

  const views = short.viewCount ? short.viewCount.toLocaleString() : '';

  return (
    <section
      id={`short-${index}`}
      ref={wrap}
      className="short-slide snap-start relative h-dvh w-full flex items-center justify-center overflow-hidden"
      aria-label={short.title}
    >
      {/* Ambient bleed from the thumbnail */}
      <div className="short-ambient" style={{ backgroundImage: `url(${short.thumbnail})` }} aria-hidden="true" />

      {/* The frame */}
      <div className="short-frame relative">
        <MediaPlayer
          ref={player}
          className="short-media"
          title={short.title}
          src={`youtube/${short.videoId}`}
          viewType="video"
          streamType="on-demand"
          loop
          playsInline
          autoPlay={playing}
          muted={muted}
          crossOrigin
          onCanPlay={() => setReady(true)}
          onTimeUpdate={(d: any) => {
            const t = d?.currentTime ?? 0;
            if (t > 0.05) setFlowing(true);
            setProgress(t && d?.duration ? t / d.duration : 0);
          }}
        >
          <MediaProvider />
        </MediaPlayer>

        {/* Poster stays until real frames flow — it covers the embed's
            native loading spinner, so only the video itself appears. */}
        {!flowing && (
          <img src={short.thumbnail} alt="" className="short-poster" aria-hidden="true" draggable={false} />
        )}

        {/* Tap surface */}
        <button
          className="absolute inset-0 z-[5] cursor-pointer"
          aria-label={playing ? `Pause ${short.title}` : `Play ${short.title}`}
          onClick={togglePlay}
          onDoubleClick={onToggleMute}
        />

        {/* Play/pause heartbeat */}
        <span className="short-flash" style={{ opacity: flash ? 1 : 0 }} aria-hidden="true">
          {playing
            ? <svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z" /></svg>
            : <svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>}
        </span>

        {/* Paused veil */}
        {!playing && (
          <div className="short-veil" aria-hidden="true">
            <svg width="54" height="54" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
          </div>
        )}

        {/* Sound toggle */}
        <button
          className="short-sound"
          onClick={onToggleMute}
          title={muted ? 'Sound on (M)' : 'Mute (M)'}
          aria-label={muted ? 'Turn sound on' : 'Mute'}
        >
          {muted ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H3v6h3l5 4V5z" /><path d="m22 9-6 6M16 9l6 6" /></svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H3v6h3l5 4V5z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></svg>
          )}
        </button>

        {/* Hairline progress */}
        <div className="short-progress" aria-hidden="true"><div style={{ transform: `scaleX(${progress})` }} /></div>

        {/* Info + rail */}
        <div className="short-info">
          <div className="eyebrow mb-1.5">The Muslim Lantern</div>
          <div className="text-[14px] font-bold leading-snug line-clamp-2 text-balance">{short.title}</div>
          <div className="mono text-[10px] mt-2 flex gap-3" style={{ color: 'rgba(255,255,255,.75)' }}>
            <span>{fmtDate(short.date)}</span>
            {views && <span>{views} views</span>}
          </div>
        </div>

        <div className="short-rail">
          <button className={liked ? 'on' : ''} onClick={onToggleLike} aria-label={liked ? 'Unlike' : 'Like'} title="Like">
            <svg width="21" height="21" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M12 21C7 16.5 3 13.2 3 9.1 3 6.3 5.2 4 8 4c1.6 0 3.1.8 4 2 0.9-1.2 2.4-2 4-2 2.8 0 5 2.3 5 5.1 0 4.1-4 7.4-9 11.9z" transform="scale(0.92) translate(1,1)" /></svg>
            <span className="mono text-[9px]">{liked ? '1' : ''}</span>
          </button>
          <button onClick={() => void share()} aria-label="Copy link" title="Copy link">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></svg>
            <span className="mono text-[9px]">share</span>
          </button>
          <a
            href={`https://www.youtube.com/watch?v=${short.videoId}`}
            target="_blank" rel="noopener noreferrer"
            aria-label="Watch on YouTube" title="Watch on YouTube"
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><path d="M15 3h6v6M10 14 21 3" /></svg>
            <span className="mono text-[9px]">source</span>
          </a>
        </div>

        {/* Bottom hint (first short only) */}
        {index === 0 && (
          <div className="short-hint" aria-hidden="true">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M6 13l6 6 6-6" /></svg>
            scroll
          </div>
        )}
      </div>
    </section>
  );
}
