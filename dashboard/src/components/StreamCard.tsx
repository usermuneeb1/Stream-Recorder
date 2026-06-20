import { useState } from 'react';
import type { Recording } from '../utils/dataFetcher';

interface Props {
  rec: Recording;
  onClick: () => void;
}

export function StreamCard({ rec, onClick }: Props) {
  const [imgError, setImgError] = useState(false);
  const guests = rec.aiChapters?.filter(c => c.label.toLowerCase().includes('joins')) || [];

  return (
    <button onClick={onClick} className="group text-left w-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 rounded-2xl">
      {/* Thumbnail */}
      <div className="relative aspect-video rounded-2xl overflow-hidden shadow-lg group-hover:shadow-2xl transition-shadow duration-300" style={{ background: 'var(--bg-secondary)' }}>
        {!imgError ? (
          <img src={rec.thumbnail} alt={rec.title} loading="lazy" onError={() => setImgError(true)}
            className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-500 ease-out" />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--bg-tertiary)' }}>
            <svg className="w-16 h-16 opacity-20" style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
        )}

        {/* Duration badge */}
        {rec.durationFmt && (
          <span className="absolute bottom-2.5 right-2.5 bg-black/85 text-white text-[12px] font-semibold px-2 py-1 rounded-lg backdrop-blur-sm">
            {rec.durationFmt}
          </span>
        )}

        {/* HD badge */}
        {rec.resolution?.includes('1080') && (
          <span className="absolute top-2.5 right-2.5 text-white text-[10px] font-black px-1.5 py-0.5 rounded" style={{ background: 'var(--accent)' }}>
            HD
          </span>
        )}

        {/* Hover play overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center shadow-xl scale-75 group-hover:scale-100 transition-transform duration-300">
            <svg className="w-7 h-7 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="mt-4 flex gap-3">
        <img src="/logo-vertical.pn.jpg" alt="" className="w-10 h-10 rounded-full object-cover shrink-0 mt-0.5 ring-2 ring-transparent group-hover:ring-red-500/30 transition-all" />
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold leading-snug line-clamp-2" style={{ color: 'var(--text-primary)' }}>
            {rec.title}
          </h3>
          <p className="text-[13px] mt-1" style={{ color: 'var(--text-secondary)' }}>The Muslim Lantern</p>
          <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
            {rec.date} · {rec.sizeHuman}
          </p>
          {guests.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {guests.slice(0, 3).map((ch, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                  <span className="text-[9px]">👤</span> {ch.label.replace(' joins', '')}
                </span>
              ))}
              {guests.length > 3 && (
                <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
                  +{guests.length - 3} more
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
