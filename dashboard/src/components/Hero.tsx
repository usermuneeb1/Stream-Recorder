// The Billboard — the archive's signature. A letterboxed cinematic frame:
// the featured video PLAYS as an ambient muted trailer (Netflix-style)
// over the Ken Burns artwork, between two film bars that part on load,
// with parallax exit as you scroll into the shelves.

import { useEffect, useRef, useState } from 'react';
import type { Ep, StreamPrediction } from '../types';
import { fmtDate, isHD, resShort } from '../lib/format';
import { positionOf } from '../lib/storage';

interface Props {
  recs: Ep[];                    // newest first, hero takes the first 4
  live: boolean;
  prediction: StreamPrediction | null;
  listedIds: Set<string>;
  onOpen: (ep: Ep) => void;
  onDetails: (ep: Ep) => void;
  onToggleList: (id: string) => void;
}

const HOLD_MS = 9000;

export default function Hero({ recs, live, prediction, listedIds, onOpen, onDetails, onToggleList }: Props) {
  const slides = recs.slice(0, 4);
  const [idx, setIdx] = useState(0);
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const [trailerOn, setTrailerOn] = useState(false);   // frames actually flowing → fade in
  const [trailerDead, setTrailerDead] = useState(false); // mirror errored → art only
  const [trailerDwell, setTrailerDwell] = useState(false); // startup beat elapsed → mount video
  const hoverRef = useRef(false);
  const rafRef = useRef(0);
  const startRef = useRef(performance.now());

  // Per-frame values live in the DOM, not in state: the slide-progress fill
  // and the scroll-parallax are written by rAF directly to nodes, so the
  // whole Hero never re-renders at 60fps.
  const fillRef = useRef<HTMLDivElement | null>(null);
  const artImgRef = useRef<HTMLImageElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const progressRef = useRef(0);   // slide progress lives here, not in state

  // New slide → new trailer: drop the fade-in state so it lights up fresh.
  const currentId = slides[Math.min(idx, slides.length - 1)]?.videoId;
  useEffect(() => {
    setTrailerOn(false);
    setTrailerDead(false);
  }, [currentId]);

  /* Slide rotation — rAF-driven progress, pauses on hover. */
  useEffect(() => {
    if (slides.length <= 1) return;
    startRef.current = performance.now();

    const loop = (now: number) => {
      if (!hoverRef.current) {
        const p = Math.min(1, (now - startRef.current) / HOLD_MS);
        progressRef.current = p;
        if (fillRef.current) fillRef.current.style.width = `${p * 100}%`;
        if (p >= 1) {
          startRef.current = now;
          progressRef.current = 0;
          if (fillRef.current) fillRef.current.style.width = '0%';
          setIdx(i => (i + 1) % slides.length);
        }
      } else {
        startRef.current = now - progressRef.current * HOLD_MS;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [slides.length]);

  /* Parallax on scroll — direct style writes, coalesced per frame.
     Re-runs per slide because the art/content nodes are keyed and remount. */
  useEffect(() => {
    const img = artImgRef.current;
    const content = contentRef.current;
    if (!img || !content) return;
    let raf = 0;
    const apply = () => {
      const y = window.scrollY;
      img.style.transform = `translateY(${y * 0.12}px) scale(1.05)`;
      content.style.opacity = String(Math.max(0, 1 - y / 420));
      content.style.transform = `translateY(${y * 0.18}px)`;
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
    };
  }, [currentId]);

  // Ambient trailers only for users who allow motion — and never for
  // Data-Saver / 2G visitors. The page's own time-to-first-frame comes
  // first; ambient megabytes are a luxury, not the product.
  const reduceMotion = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const conn = typeof navigator !== 'undefined'
    ? (navigator as { connection?: { saveData?: boolean; effectiveType?: string } }).connection
    : undefined;
  const dataSaver = !!conn?.saveData || /(^|\b)2g\b/.test(conn?.effectiveType || '');
  const trailerAllowed = !reduceMotion && !dataSaver;

  /* Startup dwell — art + UI paint immediately; the trailer mounts only
     after a quiet beat so video bytes never compete with the front door's
     first render. Resets per slide alongside its fresh mirror. */
  useEffect(() => {
    setTrailerDwell(false);
    if (!trailerAllowed) return;
    const t = setTimeout(() => setTrailerDwell(true), 2500);
    return () => clearTimeout(t);
  }, [currentId, trailerAllowed]);

  if (!slides.length) return null;
  const ep = slides[Math.min(idx, slides.length - 1)];
  // Ambient trailer source — PERMANENT mirrors only, in failover order.
  // The old YouTube iframe showed "This video is unavailable" on the front
  // door the day a VOD got privated. Archive.org nodes and GitHub releases
  // never expire, so the billboard always has something to play.
  const trailerSrc = !trailerDead
    ? (ep.archiveNode || ep.archiveDirect || ep.githubDirect || ep.githubRelease || '')
    : '';
  const pos = positionOf(ep.videoId);
  const resumePct = pos && pos.d ? Math.min(100, (pos.t / pos.d) * 100) : 0;
  const listed = listedIds.has(ep.videoId);

  const jump = (i: number) => {
    setIdx(i);
    progressRef.current = 0;
    if (fillRef.current) fillRef.current.style.width = '0%';
    startRef.current = performance.now();
  };

  const nextWindow = prediction && prediction.peakDays.length
    ? `Next likely: ${prediction.peakDays.slice(0, 2).join(' / ')} evening PKT`
    : '';

  return (
    <section
      className="hero"
      onMouseEnter={() => { hoverRef.current = true; }}
      onMouseLeave={() => { hoverRef.current = false; }}
      aria-label="Featured recordings"
    >
      {/* Art with parallax + Ken Burns (also the trailer's poster) */}
      <div className="hero-art" key={ep.videoId}>
        <img
          ref={artImgRef}
          src={broken[ep.videoId] ? '/thumbnail.jpg' : ep.thumbnail}
          alt=""
          draggable={false}
          fetchPriority="high"
          decoding="async"
          onError={() => setBroken(b => ({ ...b, [ep.videoId]: true }))}
        />
      </div>

      {/* Ambient trailer — the video itself, muted, chromeless, on loop,
          streamed from a PERMANENT mirror after the startup dwell. `poster`
          guarantees this layer is never black and never an error panel:
          worst case it's just the art. */}
      {!trailerAllowed ? null : !trailerDwell ? null : !trailerSrc ? null : (
        <div
          key={ep.videoId + '-trailer'}
          className="hero-art"
          aria-hidden="true"
          style={{ opacity: trailerOn ? 1 : 0, transition: 'opacity 1.4s var(--ease)', pointerEvents: 'none', animation: 'none' }}
        >
          <video
            src={trailerSrc}
            poster={broken[ep.videoId] ? undefined : ep.thumbnail}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            disablePictureInPicture
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            onPlaying={() => setTrailerOn(true)}
            onError={() => { setTrailerOn(false); setTrailerDead(true); }}
          />
        </div>
      )}
      <div className="hero-shade" />

      {/* Letterbox bars — the cinema frame */}
      <div className="hero-bar top" />
      <div className="hero-bar bottom" />

      {/* Content lockup */}
      <div
        ref={contentRef}
        className="hero-content left-[4vw] right-[4vw] bottom-[13vh] max-w-3xl"
        key={ep.videoId + '-c'}
      >
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <span className="eyebrow">The Lantern Archive</span>
          <span className="w-1 h-1 rounded-full" style={{ background: 'var(--flame-3)' }} />
          <span className="mono text-[10.5px] tracking-[0.22em] uppercase" style={{ color: 'var(--mist)' }}>
            {fmtDate(ep.date)}
          </span>
          {live && (
            <span className="pill-live !py-1 !px-2.5 !text-[9px]"><span className="dot" />LIVE NOW</span>
          )}
        </div>

        <h1 className="title-hero text-balance line-clamp-3 mb-4">{ep.title}</h1>

        <div className="mono text-[11px] flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-5" style={{ color: 'var(--mist)' }}>
          <span style={{ color: 'var(--jade)' }}>{ep.matchPct}% match</span>
          {isHD(ep.resolution) && <span className="chip chip-hd">{resShort(ep.resolution)}</span>}
          {ep.durationFmt && <span>{ep.durationFmt}</span>}
          {ep.sizeHuman && <span>{ep.sizeHuman}</span>}
          {ep.viewCount ? <span>{ep.viewCount.toLocaleString()} views</span> : null}
          {prediction && <span className="hidden lg:inline" style={{ color: 'var(--shade)' }}>· {nextWindow}</span>}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button className="btn btn-flame" onClick={() => onOpen(ep)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
            {resumePct > 1 ? 'Resume' : 'Play'}
          </button>
          <button className="btn btn-ghost" onClick={() => onDetails(ep)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
            More info
          </button>
          <button
            className="btn-icon"
            style={{ width: 46, height: 46, border: '1px solid var(--line)', background: 'var(--glass)' }}
            title={listed ? 'Remove from My List' : 'Add to My List'}
            aria-label={listed ? 'Remove from My List' : 'Add to My List'}
            onClick={() => onToggleList(ep.videoId)}
          >
            {listed
              ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12.5 9.5 18 20 6.5" /></svg>
              : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>}
          </button>
        </div>

        {resumePct > 1 && (
          <div className="mt-5 max-w-sm">
            <div className="card-progress !h-[3px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,.18)' }}>
              <div className="fill" style={{ width: `${resumePct}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Slide fuses */}
      {slides.length > 1 && (
        <div className="absolute z-[5] bottom-[calc(13vh-46px)] right-[4vw] hidden md:flex items-center gap-2">
          {slides.map((s, i) => (
            <button
              key={s.videoId}
              className="hero-fuse"
              style={{ width: i === idx ? 44 : 20 }}
              onClick={() => jump(i)}
              aria-label={`Show recording ${i + 1}`}
            >
              {i === idx && <div ref={fillRef} className="fill" />}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
