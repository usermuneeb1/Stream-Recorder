import { useState } from 'react';
import type { Recording } from '../utils/dataFetcher';

interface Props {
  rec: Recording;
  onClick: () => void;
}

export function StreamCard({ rec, onClick }: Props) {
  const [imgError, setImgError] = useState(false);

  return (
    <button onClick={onClick} className="group text-left w-full cursor-pointer focus:outline-none">
      {/* Thumbnail */}
      <div className="relative aspect-video rounded-2xl overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
        {!imgError ? (
          <img
            src={rec.thumbnail}
            alt={rec.title}
            loading="lazy"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
            <svg className="w-14 h-14 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
        )}

        {/* Duration */}
        {rec.durationFmt && (
          <span className="absolute bottom-2 right-2 bg-black/85 text-white text-[12px] font-medium px-2 py-0.5 rounded-md backdrop-blur-sm">
            {rec.durationFmt}
          </span>
        )}

        {/* Hover play */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-300 flex items-center justify-center">
          <div className="w-14 h-14 rounded-full bg-black/70 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 scale-75 group-hover:scale-100">
            <svg className="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="mt-3 flex gap-3">
        <img src="/logo-vertical.pn.jpg" alt="" className="w-9 h-9 rounded-full object-cover shrink-0 mt-0.5" />
        <div className="min-w-0">
          <h3 className="text-[15px] font-medium leading-snug line-clamp-2" style={{ color: 'var(--text-primary)' }}>
            {rec.title}
          </h3>
          <p className="text-[13px] mt-1" style={{ color: 'var(--text-secondary)' }}>The Muslim Lantern</p>
          <div className="flex items-center gap-1.5 text-[13px]" style={{ color: 'var(--text-muted)' }}>
            <span>{rec.date}</span>
            <span>•</span>
            <span>{rec.sizeHuman}</span>
          </div>
          {/* Guest chips */}
          {rec.aiChapters && rec.aiChapters.length > 1 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {rec.aiChapters.filter(c => c.label.toLowerCase().includes('joins')).slice(0, 3).map((ch, i) => (
                <span key={i} className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                  {ch.label.replace(' joins', '')}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
