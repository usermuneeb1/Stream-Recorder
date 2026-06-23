import { useState } from 'react';
import type { Recording } from '../utils/dataFetcher';
import { fmtDate, fmtRelative, copyText } from '../utils/format';

interface P {
  rec: Recording;
  onClick: () => void;
  delay?: number;
  view: 'grid' | 'list';
  onToast?: (m: string) => void;
}

export function StreamCard({ rec, onClick, delay = 0, view, onToast }: P) {
  const [err, setErr] = useState(false);
  const [hover, setHover] = useState(false);
  const isHD = /1080|1440|2160|4k/i.test(rec.resolution);

  const copy = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `${window.location.origin}/#/watch/${encodeURIComponent(rec.videoId)}`;
    copyText(url).then(ok => onToast?.(ok ? 'Link copied!' : 'Copy failed'));
  };

  if (view === 'list') {
    return (
      <button
        onClick={onClick}
        className="w-full flex items-stretch gap-4 sm:gap-5 p-3 rounded-xl border text-left fade-up group transition-all hover:border-[var(--bd3)] hover:bg-[var(--bg2)] ring-focus"
        style={{ animationDelay: `${delay}ms`, borderColor: 'var(--bd)' }}
      >
        <div className="relative w-48 sm:w-56 shrink-0 aspect-video rounded-lg overflow-hidden" style={{ background: 'var(--bg3)' }}>
          {!err
            ? <img src={rec.thumbnail} alt="" loading="lazy" onError={() => setErr(true)} className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center opacity-30">📺</div>}
          {rec.durationFmt && (
            <span className="absolute bottom-1.5 right-1.5 bg-black/85 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
              {rec.durationFmt}
            </span>
          )}
          {isHD && (
            <span className="absolute top-1.5 left-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--red)', color: '#fff' }}>HD</span>
          )}
        </div>
        <div className="flex-1 min-w-0 flex flex-col py-1">
          <h3 className="font-display text-[15px] sm:text-base font-semibold leading-tight line-clamp-2 mb-1.5" style={{ color: 'var(--tx)' }}>
            {rec.title}
          </h3>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]" style={{ color: 'var(--tx3)' }}>
            <span>{fmtDate(rec.date)}</span>
            <span style={{ color: 'var(--tx4)' }}>·</span>
            <span className="tabular-nums">{rec.sizeHuman}</span>
            <span style={{ color: 'var(--tx4)' }}>·</span>
            <span>{rec.resolution || '—'}</span>
          </div>
        </div>
        <div className="flex items-center pr-2">
          <button onClick={copy} className="btn-ghost btn !p-2 opacity-0 group-hover:opacity-100 transition-opacity" title="Copy link">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
            </svg>
          </button>
        </div>
      </button>
    );
  }

  // ── Grid card ─────────────────────────────────────────────────────────
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="text-left w-full group focus:outline-none fade-up ring-focus rounded-xl"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div
        className="relative aspect-video rounded-xl overflow-hidden ring-1 transition-all duration-300 group-hover:ring-[var(--red)]/50"
        style={{ background: 'var(--bg2)', boxShadow: hover ? 'var(--shadow-lg)' : 'none', '--tw-ring-color': 'var(--bd2)' } as any}
      >
        {!err
          ? <img
              src={rec.thumbnail}
              alt=""
              loading="lazy"
              onError={() => setErr(true)}
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
            />
          : <div className="w-full h-full flex items-center justify-center opacity-25" style={{ color: 'var(--tx3)' }}>
              <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>}

        {/* HD badge */}
        {isHD && (
          <div className="absolute top-2.5 left-2.5">
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--red)', color: '#fff' }}>HD</span>
          </div>
        )}

        {/* Duration badge */}
        {rec.durationFmt && (
          <span className="absolute bottom-2 right-2 bg-black/85 text-white text-[10px] font-bold px-1.5 py-0.5 rounded tabular-nums">
            {rec.durationFmt}
          </span>
        )}

        {/* Copy-link quick action */}
        <button
          onClick={copy}
          className="absolute top-2.5 right-2.5 p-1.5 rounded-md glass opacity-0 group-hover:opacity-100 transition-opacity hover:!bg-[var(--red)] hover:!text-white"
          style={{ color: 'var(--tx)' }}
          title="Copy share link"
          aria-label="Copy link"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
          </svg>
        </button>

        {/* Play overlay */}
        <div className="absolute inset-0 flex items-center justify-center transition-all bg-black/0 group-hover:bg-black/40">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center scale-75 opacity-0 group-hover:scale-100 group-hover:opacity-100 transition-all duration-300 glow-red"
            style={{ background: 'var(--red)' }}
          >
            <svg className="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      </div>

      <div className="mt-3">
        <h3 className="font-display text-[14px] font-semibold leading-snug line-clamp-2 group-hover:text-[var(--red)] transition-colors" style={{ color: 'var(--tx)' }}>
          {rec.title}
        </h3>
        <p className="text-[11px] mt-1.5 tabular-nums" style={{ color: 'var(--tx3)' }}>
          <span title={rec.recordedAt}>{fmtRelative(rec.recordedAt || rec.date)}</span>
          <span className="mx-1.5" style={{ color: 'var(--tx4)' }}>·</span>
          <span>{rec.sizeHuman}</span>
        </p>
      </div>
    </button>
  );
}
