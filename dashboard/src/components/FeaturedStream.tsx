import { useState } from 'react';
import type { Recording } from '../utils/dataFetcher';

interface P {
  recs: Recording[];
  onOpen: (r: Recording) => void;
}

export function FeaturedStream({ recs, onOpen }: P) {
  const [hover, setHover] = useState(false);
  const featured = recs[0];

  if (!featured) return null;

  return (
    <section
      className="relative rounded-2xl overflow-hidden mb-12 cursor-pointer group"
      style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-gold)',
        boxShadow: hover ? 'var(--shadow-elevated)' : 'var(--shadow-card)',
        transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        transform: hover ? 'translateY(-4px)' : 'translateY(0)',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => onOpen(featured)}
      role="button"
      tabIndex={0}
    >
      {/* Background image with cinematic overlay */}
      <div className="relative aspect-[21/9] overflow-hidden">
        <img
          src={featured.thumbnail}
          alt=""
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          style={{ filter: 'brightness(0.7)' }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(180deg, rgba(10, 10, 15, 0.3) 0%, rgba(10, 10, 15, 0.85) 70%, rgba(10, 10, 15, 0.95) 100%)',
          }}
        />
        {/* Gold accent glow */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background: 'radial-gradient(ellipse at top, rgba(212, 175, 55, 0.2) 0%, transparent 60%)',
          }}
        />
      </div>

      {/* Content overlay */}
      <div className="absolute inset-0 flex flex-col justify-end p-6 sm:p-8 lg:p-12">
        {/* Premium label */}
        <div className="flex items-center gap-3 mb-4">
          <span
            className="text-xs font-semibold tracking-widest uppercase px-3 py-1 rounded"
            style={{
              background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.2) 0%, rgba(212, 175, 55, 0.1) 100%)',
              border: '1px solid var(--border-gold)',
              color: 'var(--gold-light)',
            }}
          >
            Featured
          </span>
          {featured.durationFmt && (
            <span className="font-mono text-sm" style={{ color: 'var(--text-secondary)' }}>
              {featured.durationFmt}
            </span>
          )}
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {featured.sizeHuman}
          </span>
        </div>

        {/* Title */}
        <h2
          className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight mb-4 max-w-3xl"
          style={{ color: 'var(--text-primary)' }}
        >
          {featured.title}
        </h2>

        {/* Meta */}
        <div className="flex items-center gap-4 text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
          <span>{featured.date}</span>
          <span style={{ color: 'var(--text-muted)' }}>•</span>
          <span>{featured.resolution || 'HD'}</span>
        </div>

        {/* Action button */}
        <button
          className="btn-premium group-hover:scale-105 transition-transform"
          style={{ width: 'fit-content' }}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
          Watch Now
        </button>
      </div>
    </section>
  );
}
