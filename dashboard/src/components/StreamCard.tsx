import { useState } from 'react';
import type { Recording } from '../utils/dataFetcher';

interface Props {
  rec: Recording;
  onClick: () => void;
}

export function StreamCard({ rec, onClick }: Props) {
  const [imgError, setImgError] = useState(false);
  const isLatest = rec === rec; // Can mark latest via prop if needed

  return (
    <button
      onClick={onClick}
      className="group text-left w-full cursor-pointer focus:outline-none"
    >
      {/* Thumbnail */}
      <div className="relative aspect-video rounded-xl overflow-hidden bg-[#181818]">
        {!imgError ? (
          <img
            src={rec.thumbnail}
            alt={rec.title}
            loading="lazy"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-[#181818] text-[#555]">
            <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
        )}

        {/* Duration badge */}
        {rec.durationFmt && (
          <span className="absolute bottom-2 right-2 bg-black/80 text-white text-[11px] font-medium px-1.5 py-0.5 rounded">
            {rec.durationFmt}
          </span>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-red-600/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity scale-90 group-hover:scale-100">
            <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="mt-3 px-0.5">
        <h3 className="text-[14px] font-medium text-white leading-snug line-clamp-2 group-hover:text-white/90">
          {rec.title}
        </h3>
        <div className="flex items-center gap-2 mt-1.5 text-[12px] text-[#aaa]">
          <span>{rec.date}</span>
          <span className="text-[#555]">•</span>
          <span>{rec.sizeHuman}</span>
        </div>
        {/* Chapters preview */}
        {rec.aiChapters && rec.aiChapters.length > 1 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {rec.aiChapters.slice(1, 4).map((ch, i) => (
              <span key={i} className="text-[10px] bg-[#272727] text-[#aaa] px-1.5 py-0.5 rounded">
                {ch.label.replace(' joins', '')}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}
