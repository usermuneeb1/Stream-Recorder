import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { MediaPlayer, MediaProvider, type MediaPlayerInstance } from '@vidstack/react';
import { defaultLayoutIcons, DefaultVideoLayout } from '@vidstack/react/player/layouts/default';
import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';
import type { Recording } from '../utils/dataFetcher';
import { fmtTime, fmtRelative, copyText, shareLinks } from '../utils/format';
import { savePosition, loadPosition, pushHistory } from '../utils/history';
import { Comments } from './Comments';

interface P {
  rec: Recording;
  onClose: () => void;
  all: Recording[];
  onNav: (r: Recording) => void;
  theme: string;
  onTheme: () => void;
  onToast: (m: string) => void;
}

interface Source { label: string; url: string; tone: string; kind: 'youtube' | 'mp4' }

// GHOST is our YouTube unlisted re-upload played in our own Vidstack player.
// Defensive: handles records where youtubeUnlisted is undefined / null (some
// older entries lack the field entirely; safe-default everything).
function ghostId(r: Recording): string {
  if (r.youtubeId) return r.youtubeId;
  const u = r.youtubeUnlisted || '';
  const m = u.match(/(?:youtu\.be\/|v=)([\w-]{11})/);
  return (m && m[1]) || '';
}

function getSources(r: Recording): Source[] {
  const out: Source[] = [];
  // ORDER MATTERS — the first eligible source is Auto's instant default.
  // GHOST (YouTube unlisted re-upload) now goes FIRST because:
  //   • YouTube's CDN is the fastest video CDN on earth (Google edge nodes
  //     in every metro), so time-to-first-frame beats Archive.org by 2-3x.
  //   • Adaptive bitrate streaming — Vidstack negotiates a quality that
  //     fits the user's bandwidth, so it never buffers mid-playback.
  //   • The ghost-host workflow now runs automatically after every
  //     recording, so GHOST is reliably available on all videos.
  // The mp4 mirrors remain as fallbacks (manual selection or auto-failover).
  const gid = ghostId(r);
  // GHOST URL — YouTube IFrame embed parameters:
  //   • vq=hd1080         — initial-quality hint (best-effort, ignored if BW too low)
  //   • rel=0             — no 'related videos' overlay at end of playback
  //   • modestbranding=1  — hide most YouTube branding from player chrome
  //   • enablejsapi=1     — CRITICAL: allows postMessage commands so our
  //                         setPlaybackQuality('hd1080') retry loop works
  //   • playsinline=1     — iOS Safari doesn't go fullscreen on play
  if (gid)                                                  out.push({ label: 'GHOST', url: `https://www.youtube.com/watch?v=${gid}&vq=hd1080&rel=0&modestbranding=1&enablejsapi=1&playsinline=1`, tone: 'red', kind: 'youtube' });
  if (r.archiveNode)                                        out.push({ label: 'R3AL',  url: r.archiveNode,                        tone: 'gold',    kind: 'mp4'    });
  if (r.githubDirect || r.githubRelease)                    out.push({ label: 'B3ING', url: (r.githubDirect || r.githubRelease), tone: 'sky',     kind: 'mp4'    });
  if (r.cfStream)                                           out.push({ label: 'STORM', url: r.cfStream,                           tone: 'violet',  kind: 'mp4'    });
  if (r.archiveDirect && r.archiveDirect !== r.archiveNode) out.push({ label: 'BUNNY', url: r.archiveDirect,                      tone: 'emerald', kind: 'mp4'    });
  return out;
}

interface Dl { label: string; url: string; bg: string }
function getDownloads(r: Recording): Dl[] {
  const d: Dl[] = [];
  if (r.megaLink)        d.push({ label: 'MEGA',       url: r.megaLink,       bg: '#d9272e' });
  if (r.pixeldrainLink)  d.push({ label: 'Pixeldrain', url: r.pixeldrainLink, bg: '#7c3aed' });
  if (r.gofileLink)      d.push({ label: 'Gofile',     url: r.gofileLink,     bg: '#2563eb' });
  if (r.githubDirect || r.githubRelease) d.push({ label: 'Direct', url: (r.githubDirect || r.githubRelease), bg: '#0a8a4f' });
  return d;
}

export function WatchPage({ rec, onClose, all, onNav, theme, onTheme, onToast }: P) {
  const playerRef = useRef<MediaPlayerInstance>(null);

  const sources = useMemo(() => getSources(rec), [rec]);
  const downloads = useMemo(() => getDownloads(rec), [rec]);

  // Trickplay scrub-preview VTT URL, routed through our /api/vtt proxy so
  // CORS + content-type are correct (Archive.org doesn't serve text/vtt).
  // Returns undefined when there's no storyboard yet — Vidstack hides the
  // hover preview entirely in that case (no broken UI).
  const trickplayVtt = useMemo(() => {
    const raw = rec.storyboard?.vtt;
    if (!raw) return undefined;
    const m = raw.match(/\/([^/]+)\.vtt(?:\?|$)/);
    return m ? `/api/vtt/${m[1]}` : undefined;
  }, [rec.storyboard]);

  const [si, setSi] = useState(0);            // 0 = Auto, 1..N = sources[i-1]
  const [autoIdx, setAutoIdx] = useState(0);  // resolved index when in Auto
  const [t, setT] = useState(0);
  const [ready, setReady] = useState(false);
  // Separate flag: true only when the YouTube iframe is actually rendering
  // video frames (not just initialising). Used to mask YouTube's branding
  // logo flash that happens during the first ~1-2s of iframe init.
  const [ghostReady, setGhostReady] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [sourceHealth, setSourceHealth] = useState<Record<number, number>>({});
  const [errorFallbackIdx, setErrorFallbackIdx] = useState<Set<number>>(new Set());
  const played = useRef(false);

  const others = all.filter(x => x.videoId !== rec.videoId).slice(0, 6);

  // ── Reset on recording change ────────────────────────────────────────────
  useEffect(() => {
    setSi(0); setAutoIdx(0); setT(0); setReady(false); setGhostReady(false);
    setSourceHealth({}); setErrorFallbackIdx(new Set());
    played.current = false;
  }, [rec.videoId]);

  // ── Auto picker: INSTANT default + background health probes ──────────────
  // Strategy:
  //   1. Pick the first non-failed source IMMEDIATELY (zero delay). This is
  //      the order from getSources() — R3AL > B3ING > STORM > BUNNY > GHOST,
  //      which puts the most reliable mirror first.
  //   2. Run cheap probes in the background JUST for the latency badges in
  //      the sidebar (informational). Do NOT re-pick based on probe times —
  //      they're unreliable (CORS, edge caches, geo-routing), and switching
  //      mid-load creates a worse experience than just sticking with R3AL.
  //   3. If Vidstack actually raises an error event, errorFallbackIdx is
  //      updated and the player switches to the next available source. That
  //      is the only signal we trust for "this source is really broken".
  useEffect(() => {
    if (si !== 0 || sources.length === 0) return;

    // Instant pick: first non-failed source. No 3-second wait, no flicker.
    const firstGood = sources.findIndex((_, idx) => !errorFallbackIdx.has(idx));
    setAutoIdx(firstGood >= 0 ? firstGood : 0);

    // Background probes for the latency badges in the sidebar (advisory only).
    const ctrl = new AbortController();
    const health: Record<number, number> = {};
    Promise.allSettled(sources.map(async (s, idx) => {
      if (errorFallbackIdx.has(idx)) { health[idx] = -1; return; }
      const start = performance.now();
      let ok = false;
      try {
        if (s.kind === 'youtube') {
          const id = s.url.match(/v=([\w-]{11})/)?.[1] || '';
          if (id) {
            const r = await fetch(`/api/yt/${id}`, { method: 'HEAD', redirect: 'manual', signal: ctrl.signal });
            ok = r.status === 302 || r.status === 200;
          }
        } else {
          await fetch(s.url, { method: 'HEAD', mode: 'no-cors', signal: ctrl.signal });
          ok = true;
        }
      } catch { ok = false; }
      const dt = ok ? (performance.now() - start) : -1;
      health[idx] = dt;
      setSourceHealth(prev => ({ ...prev, [idx]: dt }));
    }));
    return () => { ctrl.abort(); };
  }, [rec.videoId, sources, si, errorFallbackIdx]);

  // ── Esc closes / shortcuts ───────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore shortcuts while user is typing in a form field (comments etc).
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || (t && t.isContentEditable)) return;

      if (e.key === 'Escape' && !shareOpen && !showHelp) onClose();
      if (e.key === 'Escape' && (shareOpen || showHelp)) { setShareOpen(false); setShowHelp(false); }
      if (e.key === '?') { e.preventDefault(); setShowHelp(s => !s); }

      // FEATURE: 0/1/2/3/4/5 to switch source.
      // 0 = Auto, 1..N = sources[i-1]. Plays nicely with the existing UI.
      if (/^[0-5]$/.test(e.key)) {
        const n = parseInt(e.key, 10);
        if (n === 0) {
          setSi(0);
          onToast('Source: Auto');
        } else if (n <= sources.length) {
          setSi(n);
          played.current = false; setReady(false); setGhostReady(false);
          onToast(`Source: ${sources[n - 1].label}`);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, shareOpen, showHelp, sources, onToast]);

  // ── Player events ────────────────────────────────────────────────────────
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    const onTime = () => setT(p.currentTime || 0);
    // FIX (preparing-stream too slow): mark ready as SOON as the player has
    // *any* signal that loading is making progress, not only when it can fully
    // play. `loaded-metadata` fires within ~100-500ms (just headers + moov);
    // `loaded-data` fires when the first frame is decoded. Either is enough
    // to swap our black "Preparing stream" overlay for the real player UI,
    // which itself shows Vidstack's native loading spinner (much nicer).
    const onGo = () => {
      if (!played.current) { played.current = true; setReady(true); }
      // AUTOPLAY FALLBACK: browsers refuse autoPlay when no recent user
      // gesture exists. Try .play() now (we DO have a gesture if user
      // clicked a card / source button to reach this moment). If the
      // promise rejects, fall back to muted autoplay — that one is always
      // allowed — then immediately unmute so audio plays once the user
      // touches the player.
      try {
        const pr = p.play();
        if (pr && typeof (pr as any).catch === 'function') {
          (pr as Promise<void>).catch(() => {
            try {
              p.muted = true;
              const pr2 = p.play();
              if (pr2 && typeof (pr2 as any).catch === 'function') {
                (pr2 as Promise<void>).catch(() => {});
              }
              // Unmute on the first user interaction.
              const unmute = () => {
                p.muted = false;
                window.removeEventListener('pointerdown', unmute);
                window.removeEventListener('keydown', unmute);
              };
              window.addEventListener('pointerdown', unmute, { once: true });
              window.addEventListener('keydown', unmute, { once: true });
            } catch { /* noop */ }
          });
        }
      } catch { /* noop */ }
    };
    // The ghost-mask CSS only un-hides the YouTube iframe AFTER actual
    // video frames are playing. Hooked to 'playing' (fires once stream
    // is decoding) — by then the YouTube logo / play button overlay
    // has been replaced by the real video frames.
    const onActualPlay = () => { setGhostReady(true); };
    const onErr = () => {
      // FIX #2 — previously read `errorFallbackIdx` from a stale closure
      // and could pick the same dead source again. Now we compute the next
      // candidate inside the functional setState, using the just-built Set.
      const failedIdx = si === 0 ? autoIdx : si - 1;
      if (failedIdx < 0 || failedIdx >= sources.length) return;

      setErrorFallbackIdx(prev => {
        if (prev.has(failedIdx)) return prev;
        const next = new Set(prev); next.add(failedIdx);

        let pick = -1;
        for (let i = 0; i < sources.length; i++) {
          if (i !== failedIdx && !next.has(i)) { pick = i; break; }
        }

        if (pick !== -1) {
          onToast(`${sources[failedIdx].label} failed — switching to ${sources[pick].label}`);
          // Defer so React commits the new Set before src changes.
          queueMicrotask(() => {
            if (si === 0) setAutoIdx(pick);
            else setSi(pick + 1);
            played.current = false;
            setReady(false);
          });
        } else {
          onToast(`All ${sources.length} sources failed for this recording`);
        }
        return next;
      });
    };
    p.addEventListener('time-update', onTime);
    p.addEventListener('loaded-metadata', onGo);    // ~100-500ms after src set
    p.addEventListener('loaded-data', onGo);        // first frame decoded
    p.addEventListener('playing', onGo);            // actual playback started
    p.addEventListener('playing', onActualPlay);    // ghost-mask reveal
    p.addEventListener('can-play', onGo);           // fully buffered enough
    p.addEventListener('error', onErr);
    // Hard timeout: if NOTHING fired in 800ms, drop the black overlay anyway.
    // The player's native buffering spinner then takes over with real-time
    // feedback so the user always sees forward progress. Was 4s — that was
    // way too patient; on most networks the metadata event fires under 500ms
    // anyway, and on slow networks we'd rather show the player UI early so
    // the user knows something IS happening.
    const forceShow = window.setTimeout(() => {
      if (!played.current) { played.current = true; setReady(true); }
    }, 800);
    return () => {
      p.removeEventListener('time-update', onTime);
      p.removeEventListener('loaded-metadata', onGo);
      p.removeEventListener('loaded-data', onGo);
      p.removeEventListener('playing', onGo);
      p.removeEventListener('playing', onActualPlay);
      p.removeEventListener('can-play', onGo);
      p.removeEventListener('error', onErr);
      clearTimeout(forceShow);
    };
  }, [si, autoIdx, sources, errorFallbackIdx, onToast]);

  const seek = useCallback((s: number) => {
    const p = playerRef.current;
    if (p) { p.currentTime = s; p.play().catch(() => {}); }
  }, []);

  // FEATURE: persist playback speed across videos (Netflix/YouTube-style).
  // Read from localStorage once the player is ready; write back whenever
  // the user changes it via Vidstack's settings menu.
  useEffect(() => {
    if (!ready) return;
    const p = playerRef.current;
    if (!p) return;
    try {
      const saved = parseFloat(localStorage.getItem('mla_pb_rate_v1') || '1');
      if (saved && saved >= 0.25 && saved <= 4 && Math.abs((p.playbackRate || 1) - saved) > 0.01) {
        p.playbackRate = saved;
      }
    } catch { /* ignore */ }
    const onRate = () => {
      try { localStorage.setItem('mla_pb_rate_v1', String(p.playbackRate || 1)); } catch { /* quota */ }
    };
    p.addEventListener('rate-change', onRate);

    // For HLS / DASH (rare): pick the highest rung via Vidstack's qualities API.
    const onQualities = () => {
      try {
        const qs = (p as any).qualities?.toArray?.() || [];
        if (qs.length > 0) {
          qs.sort((a: any, b: any) => (b.height || 0) - (a.height || 0));
          if (qs[0] && !qs[0].selected) qs[0].selected = true;
        }
      } catch { /* noop */ }
    };
    p.addEventListener('qualities-change', onQualities);
    onQualities();

    // For YouTube (GHOST): force HD via postMessage to the iframe.
    // Tries hd1080 → hd720 → large; YouTube silently ignores any rung
    // it can't deliver, so this always lands on the best available.
    const forceYTQuality = () => {
      const iframe = (p as any).provider?.iframe as HTMLIFrameElement | undefined
        || document.querySelector('media-player iframe[src*="youtube"]') as HTMLIFrameElement | null;
      if (!iframe?.contentWindow) return;
      const target = iframe.contentWindow;
      for (const q of ['hd1080', 'hd720', 'large']) {
        try {
          target.postMessage(JSON.stringify({
            event: 'command', func: 'setPlaybackQuality', args: [q],
          }), '*');
        } catch { /* noop */ }
      }
    };
    let attempts = 0;
    const ytQualityInterval = window.setInterval(() => {
      if (attempts++ > 10) { clearInterval(ytQualityInterval); return; }
      forceYTQuality();
    }, 1000);
    forceYTQuality();

    return () => {
      p.removeEventListener('rate-change', onRate);
      p.removeEventListener('qualities-change', onQualities);
      clearInterval(ytQualityInterval);
    };
  }, [ready, rec.videoId]);

  // ── Resume from URL ?t= or saved position ────────────────────────────────
  const [resumeShown, setResumeShown] = useState(false);
  const [resumeAt, setResumeAt] = useState<number | null>(null);
  useEffect(() => {
    if (!ready || resumeShown) return;
    const hash = window.location.hash;
    const m = hash.match(/\?t=(\d+)/);
    if (m) { seek(parseInt(m[1])); setResumeShown(true); return; }
    const saved = loadPosition(rec.videoId);
    // FIX #26 — if user clicked "Continue watching", auto-resume silently.
    const cameFromContinue = (window as any).__mlaContinueResume === rec.videoId;
    if (cameFromContinue) { (window as any).__mlaContinueResume = null; }
    if (saved && saved.t > 30) {
      if (cameFromContinue) {
        seek(saved.t);
        onToast(`Resumed at ${Math.floor(saved.t / 60)}:${String(Math.floor(saved.t) % 60).padStart(2, '0')}`);
      } else {
        setResumeAt(saved.t);
      }
    }
    setResumeShown(true);
    pushHistory(rec.videoId);
  }, [ready, seek, rec.videoId, resumeShown, onToast]);

  // ── Persist position every 5s ────────────────────────────────────────────
  useEffect(() => {
    if (!ready) return;
    const p = playerRef.current;
    if (!p) return;
    const i = setInterval(() => {
      savePosition(rec.videoId, p.currentTime || 0, p.duration || rec.durationSec);
    }, 5000);
    return () => clearInterval(i);
  }, [ready, rec.videoId, rec.durationSec]);

  const copyTimestamp = useCallback(() => {
    const url = `${window.location.origin}/#/watch/${encodeURIComponent(rec.videoId)}?t=${Math.floor(t)}`;
    copyText(url).then(ok => onToast(ok ? `Timestamp copied (${fmtTime(t)})` : 'Copy failed'));
  }, [rec.videoId, t, onToast]);

  const copyShare = useCallback(() => {
    const url = `${window.location.origin}/#/watch/${encodeURIComponent(rec.videoId)}`;
    copyText(url).then(ok => onToast(ok ? 'Link copied!' : 'Copy failed'));
  }, [rec.videoId, onToast]);

  const activeIdx = si === 0 ? autoIdx : si - 1;
  const activeSrc = sources[activeIdx];
  const sl = shareLinks(`${window.location.origin}/#/watch/${encodeURIComponent(rec.videoId)}`, rec.title);

  // FEATURE: Theatre mode (premium). Hides the sidebar so the player gets
  // the full width — for users who want a more cinematic experience.
  // Toggled with 'T' key or the button in the top-right of the player.
  // Persists across navigation in localStorage.
  const [theatre, setTheatre] = useState(() => localStorage.getItem('mla_theatre_v1') === '1');
  useEffect(() => { localStorage.setItem('mla_theatre_v1', theatre ? '1' : '0'); }, [theatre]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (e.key === 't' || e.key === 'T') { setTheatre(v => !v); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)', color: 'var(--tx)' }}>
      {/* ───── Top bar ───── */}
      <nav className="sticky top-0 z-40 glass border-b" style={{ borderColor: 'var(--bd)' }}>
        <div className="max-w-[1800px] mx-auto flex items-center justify-between gap-3 px-4 sm:px-6 h-[60px] sm:h-[68px]">
          <button onClick={onClose} className="flex items-center gap-2.5 group ring-focus rounded-md py-1 -ml-1 pr-2" title="Back to all recordings">
            <svg className="w-5 h-5 transition-transform group-hover:-translate-x-0.5" style={{ color: 'var(--tx3)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <img src="/logo.png" alt="" className="h-12 sm:h-14 object-contain" />
          </button>
          <div className="flex items-center gap-1">
            <button onClick={() => setShowHelp(true)} className="btn-ghost btn !p-2" title="Keyboard shortcuts (?)">
              <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9" />
                <path strokeLinecap="round" d="M9.5 9a2.5 2.5 0 015 0c0 1.5-1.5 2-2.5 3v1" />
                <circle cx="12" cy="17" r=".7" fill="currentColor" />
              </svg>
            </button>
            {/* FEATURE: Theatre-mode toggle. Premium cinematic view. */}
            <button
              onClick={() => setTheatre(v => !v)}
              className="btn-ghost btn !p-2 hidden xl:inline-flex"
              title={theatre ? 'Exit theatre mode (T)' : 'Theatre mode (T)'}
              aria-pressed={theatre}
            >
              {theatre ? (
                <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4M9 9H4m11 0V4m0 5h5M9 15v5m0-5H4m11 0v5m0-5h5" />
                </svg>
              ) : (
                <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4h4M16 4h4v4M4 16v4h4M16 20h4v-4" />
                </svg>
              )}
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
      <div className="flex flex-col xl:flex-row max-w-[1800px] mx-auto">
        {/* ── Left: player + meta + comments ── */}
        <div className="flex-1 min-w-0">
          <div className="xl:p-4 xl:pb-0 relative">
            {/* (Vidstack's native buffering indicator is allowed to show now —
                gives the user real-time feedback while the video buffers,
                instead of a static "Preparing stream" overlay.) */}
            {activeSrc?.url && (
              <MediaPlayer
                key={activeSrc.url}
                ref={playerRef}
                src={activeSrc.url}
                viewType="video"
                streamType="on-demand"
                playsInline
                autoPlay
                // Start buffering the actual video bytes IMMEDIATELY on mount
                // instead of waiting for play(). Cuts time-to-first-frame
                // roughly in half on most CDNs.
                load="visible"
                // Poster = our own thumbnail. Hides the YouTube "Play" splash
                // logo flash on GHOST while the iframe is initialising —
                // looks identical to every other source (own brand, no
                // YouTube watermark / channel art / video-title bar).
                poster={rec.thumbnail}
                className={`w-full aspect-video xl:rounded-xl overflow-hidden bg-black shadow-2xl ${activeSrc.kind === 'youtube' ? 'ghost-mask' : ''} ${ghostReady ? 'ghost-ready' : ''}`}
              >
                <MediaProvider />
                {/* TRICKPLAY SCRUB PREVIEWS — Vidstack reads the WebVTT
                    cues file (which contains 1 cue every 30s pointing at
                    coordinates in the sprite-sheet image) and renders the
                    exact frame the user is hovering on the seek bar.

                    We route through /api/vtt/<id> instead of using the raw
                    Archive.org URL because Archive.org serves the .vtt with
                    content-type: text/plain AND no CORS headers, which
                    blocks Vidstack's cross-origin fetch. The Vercel Edge
                    proxy rewrites the content-type to text/vtt, adds CORS,
                    and caches the response for a week at the edge. */}
                <DefaultVideoLayout
                  icons={defaultLayoutIcons}
                  thumbnails={trickplayVtt}
                />
              </MediaPlayer>
            )}
            {/* Loading overlay logic:
                  • For GHOST (YouTube): show until ghostReady (= iframe is
                    actually playing video frames). YouTube's iframe is fully
                    hidden underneath via .ghost-mask CSS, so we only ever
                    see ONE loader — ours. No more double-spinner.
                  • For mp4 sources: show until 'ready' (= loaded-metadata
                    or loaded-data fired). Vidstack's native buffering
                    spinner then takes over for any further mid-playback
                    buffering. */}
            {((activeSrc?.kind === 'youtube' && !ghostReady) || (activeSrc?.kind !== 'youtube' && !ready)) && (
              <div className="absolute inset-0 xl:top-4 xl:left-4 xl:right-4 xl:rounded-xl z-20 flex items-center justify-center" style={{ background: '#000' }}>
                <div className="flex flex-col items-center">
                  <div className="w-10 h-10 mb-3 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: 'var(--red)' }} />
                  <p className="text-white/60 text-[13px] font-medium tracking-wide">Loading</p>
                  <p className="text-white/30 text-[11px] mt-1">{activeSrc?.label || 'Auto'} · 1080p</p>
                </div>
              </div>
            )}

            {/* Resume banner */}
            {ready && resumeAt !== null && (
              <div className="absolute bottom-16 sm:bottom-20 left-4 right-4 xl:left-8 xl:right-8 z-30 flex items-center justify-between gap-3 rounded-xl border glass-strong px-4 py-3 pop-in" style={{ borderColor: 'var(--bd2)', boxShadow: 'var(--shadow-lg)' }}>
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold" style={{ color: 'var(--tx)' }}>
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
          <div className="px-4 sm:px-6 pt-6 pb-3">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h1 className="font-display text-[22px] sm:text-[26px] font-bold leading-tight tracking-[-0.01em]" style={{ color: 'var(--text-primary)' }}>
                  {rec.title}
                </h1>
                {/* Meta as premium pills (frosted background, subtle border) */}
                <div className="flex flex-wrap items-center gap-2 mt-3.5">
                  <span className="pill" title={rec.recordedAt}>{fmtRelative(rec.recordedAt || rec.date)}</span>
                  <span className="pill tabular-nums font-mono">{rec.durationFmt}</span>
                  <span className="pill">{rec.resolution || '—'}</span>
                  <span className="pill tabular-nums font-mono">{rec.sizeHuman}</span>
                </div>
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
                        <a key={l} href={u} target="_blank" rel="noopener noreferrer" className="block px-3 py-2 text-[12px] font-medium text-left hover:bg-[var(--bg4)] first:rounded-t-lg last:rounded-b-lg" style={{ color: 'var(--tx)' }}>
                          {l}
                        </a>
                      ))}
                    </div>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* ── Comments (on the left column, below the player) ── */}
          <Comments videoId={rec.videoId} onToast={onToast} />

          {/* Per-page credit line (mirrors the global footer credit so the
              user sees attribution even on long watch pages where the
              footer is far below the fold) */}
          <div className="mt-10 mb-2 px-4 sm:px-6 pt-5 pb-1 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11.5px]" style={{ borderTop: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
            <p className="tabular-nums">
              © {new Date().getFullYear()} <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>Muneeb Ahmad</span> · All rights reserved.
            </p>
            <p className="flex items-center gap-1.5">
              Made with
              <svg className="w-3.5 h-3.5 inline animate-pulse" style={{ color: 'var(--accent-glow)', filter: 'drop-shadow(0 0 4px rgba(255, 61, 61, 0.5))' }} viewBox="0 0 24 24" fill="currentColor" aria-label="love">
                <path d="M12 21s-7-4.5-9.5-9C.5 8 3 4 7 4c2 0 3.5 1 5 3 1.5-2 3-3 5-3 4 0 6.5 4 4.5 8C19 16.5 12 21 12 21z" />
              </svg>
              by <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>Muneeb Ahmad</span>
            </p>
          </div>
        </div>

        {/* ── Right sidebar ── */}
        <aside className={`${theatre ? 'xl:hidden' : 'xl:w-[400px]'} shrink-0 px-4 sm:px-6 xl:px-4 pb-6 pt-2 xl:pt-4 border-l-0 xl:border-l space-y-3`} style={{ borderColor: 'var(--bd)' }}>

          {/* Premium PLAYBACK sources — unified list, health dots */}
          {sources.length > 0 && (
            <Panel title="Playback" hint={`${sources.length} servers`}>
              <SourceRow
                active={si === 0}
                onClick={() => setSi(0)}
                label="Auto"
                // Same as above — don't show ms when auto resolved to GHOST.
                ms={si === 0 && sources[autoIdx]?.kind !== 'youtube' ? sourceHealth[autoIdx] : undefined}
                primary
              />
              {sources.map((s, i) => (
                <SourceRow
                  key={i}
                  active={si === i + 1}
                  onClick={() => {
                    setSi(i + 1);
                    played.current = false; setReady(false); setGhostReady(false);
                    setErrorFallbackIdx(prev => {
                      if (!prev.has(i)) return prev;
                      const next = new Set(prev); next.delete(i); return next;
                    });
                  }}
                  label={s.label}
                  // GHOST is YouTube via our own /api/yt proxy — the latency
                  // here measures OUR server, not YouTube's CDN. Hide it.
                  ms={s.kind === 'youtube' ? undefined : sourceHealth[i]}
                  failed={errorFallbackIdx.has(i)}
                />
              ))}
            </Panel>
          )}

          {/* Premium DOWNLOADS — unified list, accent only as indicator */}
          {downloads.length > 0 && (
            <Panel title="Downloads" hint={`${downloads.length} mirrors`}>
              {downloads.map((d, i) => (
                <a
                  key={i}
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-[10px] transition-all hover:translate-y-[-1px] ring-focus"
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-accent)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 14px rgba(0,0,0,0.25)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-subtle)'; (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}
                >
                  <span className="w-1 h-6 rounded-full" style={{ background: d.bg }} />
                  <svg className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span className="flex-1 text-[12.5px] font-semibold" style={{ color: 'var(--text-primary)' }}>{d.label}</span>
                  <span className="text-[10.5px] font-mono opacity-70" style={{ color: 'var(--text-muted)' }}>↓</span>
                </a>
              ))}
            </Panel>
          )}

          {/* Premium UP NEXT — wider thumbs, cleaner type */}
          {others.length > 0 && (
            <Panel title="Up next" hint={`${others.length}`}>
              {others.map(o => (
                <button
                  key={o.videoId}
                  onClick={() => { onNav(o); window.scrollTo(0, 0); }}
                  className="flex gap-3 w-full text-left rounded-[12px] p-2 transition-all hover:bg-[var(--bg-elevated)] group ring-focus"
                  style={{ marginBottom: '4px' }}
                >
                  <div className="w-[120px] shrink-0 aspect-video rounded-[8px] overflow-hidden relative" style={{ background: 'var(--bg-elevated)' }}>
                    <img src={o.thumbnail} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-500"
                      onError={(e: any) => { e.target.src = '/thumbnail.jpg'; }} />
                    {o.durationFmt && (
                      <span className="absolute bottom-1 right-1 frost-badge !text-[9px] !px-1.5 !py-0.5 tabular-nums">{o.durationFmt}</span>
                    )}
                  </div>
                  <div className="min-w-0 pt-0.5 flex-1">
                    <p className="text-[12.5px] font-semibold line-clamp-2 leading-snug" style={{ color: 'var(--text-primary)' }}>{o.title}</p>
                    <p className="text-[10.5px] mt-1" style={{ color: 'var(--text-muted)' }}>{o.date}</p>
                  </div>
                </button>
              ))}
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
                ['Play / Pause',       'Space'],
                ['Skip ±10 s',         '←  /  →'],
                ['Volume',             '↑  /  ↓'],
                ['Mute',               'M'],
                ['Fullscreen',         'F'],
                ['Picture-in-Picture', 'I'],
                ['Switch source',      '0–5'],
                ['Theatre mode',       'T'],
                ['Close player',       'Esc'],
                ['Show this help',     '?'],
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

// Premium sidebar panel — refined heading + soft surface
function Panel({ title, hint, right, children }: { title: string; hint?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-[14px] border p-3.5" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-surface)' }}>
      <div className="flex items-center justify-between mb-3 px-0.5">
        <div className="flex items-center gap-2">
          <span className="w-1 h-3 rounded-full" style={{ background: 'var(--accent-primary)' }} />
          <p className="text-[10.5px] font-bold uppercase tracking-[.2em]" style={{ color: 'var(--text-secondary)' }}>{title}</p>
          {hint && <span className="text-[10px] font-mono opacity-60" style={{ color: 'var(--text-muted)' }}>{hint}</span>}
        </div>
        {right}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

// Premium source row — unified design, only colored DOT indicates health.
// We deliberately DO NOT expose the underlying host name (Archive.org / YouTube /
// GitHub / etc) — the user only sees the brand label (R3AL, GHOST, etc) so the
// archive's hosting infrastructure is not advertised in the UI.
function SourceRow({ active, onClick, label, ms, primary, failed }: {
  active: boolean;
  onClick: () => void;
  label: string;
  ms?: number;
  primary?: boolean;
  failed?: boolean;
}) {
  const probeFailed = ms === -1;
  const status =
    failed ? 'fail'
    : ms === undefined ? 'idle'
    : probeFailed ? 'slow'
    : ms < 300 ? 'fast'
    : ms < 1200 ? 'ok'
    : 'slow';
  const dotColor =
    status === 'fail' ? 'var(--accent-glow)'
    : status === 'fast' ? '#10b981'
    : status === 'ok'   ? 'var(--accent-gold)'
    : status === 'slow' ? 'var(--text-muted)'
    : 'var(--text-muted)';
  return (
    <button
      onClick={onClick}
      title={failed ? 'This source failed during playback — click to retry' : undefined}
      className="w-full flex items-center justify-between px-3 py-2.5 rounded-[10px] transition-all ring-focus cursor-pointer hover:translate-y-[-1px]"
      style={{
        background: active ? 'rgba(198, 40, 40, 0.12)' : 'var(--bg-elevated)',
        border: `1px solid ${active ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
        opacity: failed ? .60 : 1,
        textDecoration: failed ? 'line-through' : 'none',
        boxShadow: active ? '0 4px 14px -4px rgba(198, 40, 40, 0.35)' : 'none',
      }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-accent)'; }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-subtle)'; }}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="relative w-2 h-2 rounded-full shrink-0" style={{ background: dotColor, boxShadow: `0 0 6px ${dotColor}` }} />
        <div className="text-[13px] font-bold flex items-center gap-1.5" style={{ color: active ? '#fff' : 'var(--text-primary)' }}>
          {label}
          {primary && <span className="text-[9px] opacity-70 font-mono">⚡</span>}
        </div>
      </div>
      {ms !== undefined && ms > 0 && (
        <span className="text-[10px] font-mono opacity-65 tabular-nums shrink-0" style={{ color: active ? '#fff' : 'var(--text-muted)' }}>{Math.round(ms)}ms</span>
      )}
    </button>
  );
}
