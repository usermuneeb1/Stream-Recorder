import { useEffect, useRef, useState } from 'react';
import type { Recording } from '../utils/dataFetcher';
import { fmtDate, fmtRelative, copyText } from '../utils/format';
import { loadPosition } from '../utils/history';
import { useTilt } from '../hooks/useTilt';

interface P {
  rec: Recording;
  onClick: () => void;
  delay?: number;
  view: 'grid' | 'list';
  onToast?: (m: string) => void;
  featured?: boolean;
}

// Netflix-style sprite-preview hook.
//
// FIXED LAYOUT BUG: the sprite sheet was being rendered at native pixel size
// (120×68 tiles in a 1200-wide sheet), which is much smaller than the card
// area (~300px wide). The unscaled sheet got TILED across the card, showing
// many tiles at once like a wallpaper. The fix uses percentage-based
// background-size so a single tile fills the entire card area exactly.
//
// Math: background-size = (cols * 100%) horizontally and (rows * 100%)
// vertically. background-position is then a percentage too — to show the
// tile at column C of N: position-x = C / (N - 1) * 100%. (Not C/N — the
// extra -1 is a CSS background-position quirk: it represents how far to
// slide the larger image LEFT so the target tile aligns with the card.)
function useSpritePreview(rec: Recording, hover: boolean) {
  const sb = rec.storyboard;
  const [tile, setTile] = useState(0);
  const id = useRef<number | null>(null);
  const PREVIEW_TILES = 6;
  useEffect(() => {
    if (!sb || !hover) {
      if (id.current) { clearInterval(id.current); id.current = null; }
      setTile(0); return;
    }
    setTile(0);
    id.current = window.setInterval(() => setTile(t => (t + 1) % PREVIEW_TILES), 900);
    return () => { if (id.current) { clearInterval(id.current); id.current = null; } };
  }, [hover, sb]);
  if (!sb) return null;
  const total = Math.max(1, sb.n_frames || ((sb.cols || 1) * (sb.rows || 1)));
  // For short videos with fewer than PREVIEW_TILES total frames, just cycle
  // through what we have instead of computing duplicates.
  const previewCount = Math.min(PREVIEW_TILES, total);
  const step = total / previewCount;
  const idx = Math.min(total - 1, Math.floor(tile % previewCount * step));
  const cols = Math.max(1, sb.cols || 1);
  const rows = Math.max(1, sb.rows || Math.ceil(total / cols));
  const col = idx % cols;
  const row = Math.floor(idx / cols);
  return {
    backgroundImage: `url(${sb.url})`,
    // Position uses the standard CSS percentage formula. If only 1 col or
    // row, division-by-zero → use 0 to avoid NaN.
    backgroundPositionX: cols > 1 ? `${(col / (cols - 1)) * 100}%` : '0%',
    backgroundPositionY: rows > 1 ? `${(row / (rows - 1)) * 100}%` : '0%',
    // Scale the sheet so ONE tile fills the entire container (the card).
    backgroundSize: `${cols * 100}% ${rows * 100}%`,
    backgroundRepeat: 'no-repeat',
  };
}

export function StreamCard({ rec, onClick, delay = 0, view, onToast, featured }: P) {
  const [err, setErr] = useState(false);
  const [hover, setHover] = useState(false);
  const isHD = /1080|1440|2160|4k/i.test(rec.resolution);
  const sprite = useSpritePreview(rec, hover);
  const saved = loadPosition(rec.videoId);
  const pct = saved && saved.d > 0 ? Math.min(100, Math.max(0, (saved.t / saved.d) * 100)) : 0;
  const watched = pct >= 95;
  const hasGhost = !!rec.youtubeId;

  const copy = (e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation(); e.preventDefault();
    const url = `${window.location.origin}/#/watch/${encodeURIComponent(rec.videoId)}`;
    copyText(url).then(ok => onToast?.(ok ? 'Link copied!' : 'Copy failed'));
  };
  const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } };

  if (view === 'list') {
    return (
      <div
        role="button" tabIndex={0}
        onClick={onClick} onKeyDown={onKey}
        onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        className="card-surface reveal-on-scroll w-full flex items-stretch gap-4 sm:gap-5 p-3 group cursor-pointer ring-focus"
        data-stagger={(delay / 60) % 7}
      >
        <div className="relative w-48 sm:w-60 shrink-0 aspect-video rounded-[10px] overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
          {!err
            ? <img src={rec.thumbnail} alt="" loading="lazy" onError={() => setErr(true)} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.04]" />
            : <FallbackArt />}
          {sprite && (
            <div className="absolute inset-0 transition-opacity duration-300 pointer-events-none sprite-preview" style={{ ...sprite, backgroundRepeat: 'no-repeat', opacity: hover ? 1 : 0 }} aria-hidden="true" />
          )}
          <Badges featured={featured} isHD={isHD} duration={rec.durationFmt} hasGhost={hasGhost} />
          {pct > 0 && !watched && <ProgressBar pct={pct} />}
          {watched && <WatchedBadge />}
        </div>
        <div className="flex-1 min-w-0 flex flex-col py-1.5">
          <h3 className="font-display text-[15px] sm:text-[16px] font-semibold leading-tight line-clamp-2 mb-2" style={{ color: 'var(--text-primary)' }}>
            {rec.title}
          </h3>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px]" style={{ color: 'var(--text-secondary)' }}>
            <span>{fmtDate(rec.date)}</span>
            <Dot />
            <span className="tabular-nums">{rec.sizeHuman}</span>
            <Dot />
            <span>{rec.resolution || '—'}</span>
          </div>
        </div>
        <div className="flex items-center pr-2">
          <button
            type="button"
            onClick={copy}
            onPointerDown={e => e.stopPropagation()}
            className="btn-ghost btn !p-2 opacity-0 group-hover:opacity-100 transition-opacity ring-focus"
            title="Copy share link" aria-label="Copy link"
          >
            <CopyIcon />
          </button>
        </div>
      </div>
    );
  }

  // ─── GRID CARD ───────────────────────────────────────────────────────
  const tilt = useTilt(4);
  return (
    <div
      ref={tilt.ref}
      role="button" tabIndex={0}
      onClick={onClick} onKeyDown={onKey}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => { setHover(false); tilt.onMouseLeave(); }}
      onMouseMove={tilt.onMouseMove}
      className="card-surface card-tilt reveal-on-scroll group cursor-pointer ring-focus overflow-hidden"
      data-stagger={(delay / 60) % 7}
      style={{ transition: 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.35s, box-shadow 0.35s, background 0.35s' }}
    >
      <div className="relative aspect-video overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
        {!err
          ? <img src={rec.thumbnail} alt="" loading="lazy" onError={() => setErr(true)} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.05]" />
          : <FallbackArt />}
        {sprite && (
          <div className="absolute inset-0 transition-opacity duration-300 pointer-events-none sprite-preview" style={{ ...sprite, backgroundRepeat: 'no-repeat', opacity: hover ? 1 : 0 }} aria-hidden="true" />
        )}
        {/* Vignette on hover for premium feel */}
        <div className="absolute inset-0 transition-opacity duration-400 pointer-events-none" style={{ background: 'var(--gradient-card-hover)', opacity: hover ? 1 : 0 }} />

        <Badges featured={featured} isHD={isHD} duration={rec.durationFmt} hasGhost={hasGhost} />
        {pct > 0 && !watched && <ProgressBar pct={pct} />}
        {watched && <WatchedBadge />}

        {/* Copy link quick action */}
        <button
          type="button"
          onClick={copy}
          onPointerDown={e => e.stopPropagation()}
          className="absolute top-2.5 right-2.5 p-1.5 rounded-md glass opacity-0 group-hover:opacity-100 transition-all hover:!bg-[var(--accent-primary)] hover:!text-white z-10"
          style={{ color: 'var(--text-primary)' }}
          title="Copy share link" aria-label="Copy link"
        >
          <CopyIcon w="3.5" />
        </button>

        {/* Center play overlay (premium circle + glow) */}
        <div className="absolute inset-0 flex items-center justify-center transition-all duration-400 pointer-events-none" style={{ background: hover ? 'rgba(0, 0, 0, 0.30)' : 'transparent' }}>
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center transition-all duration-400"
            style={{
              background: 'rgba(198, 40, 40, 0.95)',
              opacity: hover ? 1 : 0,
              transform: hover ? 'scale(1)' : 'scale(0.85)',
              boxShadow: '0 8px 32px rgba(198, 40, 40, 0.6)',
            }}
          >
            <svg className="w-6 h-6 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          </div>
        </div>
      </div>

      {/* Card body */}
      <div className="px-3.5 sm:px-4 pt-3 pb-3.5">
        <h3 className="font-display text-[14.5px] sm:text-[15px] font-semibold leading-snug line-clamp-2 mb-2" style={{ color: 'var(--text-primary)' }}>
          {rec.title}
        </h3>
        <div className="flex flex-wrap items-center gap-x-2 text-[11.5px]" style={{ color: 'var(--text-secondary)' }}>
          <span>{fmtRelative(rec.recordedAt || rec.date)}</span>
          <Dot />
          <span className="tabular-nums">{rec.sizeHuman}</span>
        </div>
      </div>
    </div>
  );
}

function Badges({ featured, isHD, duration }: { featured?: boolean; isHD: boolean; duration?: string; hasGhost?: boolean }) {
  // Max 2 badges total — top-left ONE status (NEWEST > HD, mutually exclusive)
  // + bottom-right duration. Per round-2 spec to reduce visual chaos.
  // Hosting-mirror indicator removed entirely.
  return (
    <>
      <div className="absolute top-2.5 left-2.5 z-10">
        {featured ? (
          <span className="frost-badge !text-[9.5px] inline-flex items-center gap-1" style={{ background: 'rgba(255, 107, 53, 0.92)', color: '#fff', borderColor: 'rgba(255, 200, 150, 0.30)' }}>
            <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8 5.8 21.3l2.4-7.4L2 9.4h7.6L12 2z" /></svg>
            NEWEST
          </span>
        ) : isHD ? (
          <span className="frost-badge !text-[9.5px]" style={{ background: 'rgba(0, 0, 0, 0.78)', color: '#fff' }}>HD</span>
        ) : null}
      </div>
      {duration && (
        <span className="frost-badge absolute bottom-2.5 right-2.5 tabular-nums z-10 !font-mono" style={{ background: 'rgba(10, 10, 15, 0.85)' }}>
          {duration}
        </span>
      )}
    </>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="absolute bottom-0 left-0 right-0 h-[3px] z-20" style={{ background: 'rgba(255, 255, 255, 0.18)' }}>
      <div className="h-full" style={{ width: `${pct}%`, background: 'var(--accent-glow)', boxShadow: '0 0 8px rgba(255, 61, 61, 0.6)' }} />
    </div>
  );
}

function WatchedBadge() {
  return (
    <span className="absolute bottom-2.5 left-2.5 frost-badge !text-[9px] inline-flex items-center gap-1 z-10" style={{ background: 'rgba(0, 0, 0, 0.85)' }}>
      <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5"><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
      Watched
    </span>
  );
}

function FallbackArt() {
  return (
    <div className="w-full h-full flex items-center justify-center opacity-25" style={{ color: 'var(--text-muted)' }}>
      <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    </div>
  );
}

function Dot() { return <span style={{ color: 'var(--text-muted)' }}>·</span>; }
function CopyIcon({ w = '4' }: { w?: string }) {
  // Use COMPLETE literal class strings — Tailwind's JIT scanner can't see
  // classes assembled from variables (e.g. `w-${w}`), so a dynamic build
  // would silently omit `w-3.5`/`h-3.5` from the CSS and the icon would
  // render unsized. Selecting between full literals guarantees both are
  // always generated.
  const size = w === '3.5' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  return (
    <svg className={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
    </svg>
  );
}
