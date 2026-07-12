import { useEffect, useRef, useState } from 'react';
import type { Recording } from '../utils/dataFetcher';
import { fmtRelative } from '../utils/format';

interface P {
  recs: Recording[];
  onOpen: (r: Recording) => void;
}

/**
 * FeaturedStream — Premium hero showcasing the newest recording.
 * Large cinematic preview with gradient overlay, play button, and metadata.
 * Creates a "Netflix hero" feel for the archive.
 */
export function FeaturedStream({ recs, onOpen }: P) {
  const [hover, setHover] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const featured = recs[0]; // newest recording

  if (!featured) return null;

  const handleOpen = () => onOpen(featured);
  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleOpen();
    }
  };

  return (
    <section
      ref={containerRef}
      className="relative rounded-[20px] overflow-hidden mb-8 slide-up cursor-pointer group"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        boxShadow: 'var(--shadow-premium)',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={handleOpen}
      onKeyDown={handleKey}
      role="button"
      tabIndex={0}
      aria-label={`Watch latest: ${featured.title}`}
    >
      {/* Background image with cinematic gradient */}
      <div className="absolute inset-0">
        <img
          src={featured.thumbnail}
          alt=""
          className="w-full h-full object-cover transition-transform duration-[800ms] ease-out group-hover:scale-[1.03]"
          onError={(e: any) => { e.target.src = '/thumbnail.jpg'; }}
        />
        {/* Multi-layer gradient overlay */}
        <div
          className="absolute inset-0"
          style={{
            background: `
              linear-gradient(180deg, 
                rgba(10, 10, 15, 0.3) 0%, 
                rgba(10, 10, 15, 0.5) 40%, 
                rgba(10, 10, 15, 0.95) 100%
              ),
              linear-gradient(90deg, 
                rgba(10, 10, 15, 0.8) 0%, 
                transparent 50%
              )
            `,
          }}
        />
        {/* Red accent glow on hover */}
        <div
          className="absolute inset-0 transition-opacity duration-500"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(198, 40, 40, 0.15) 0%, transparent 70%)',
            opacity: hover ? 1 : 0,
          }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col justify-end min-h-[280px] sm:min-h-[340px] lg:min-h-[400px] p-6 sm:p-8 lg:p-10">
        {/* Badge row */}
        <div className="flex items-center gap-3 mb-4">
          <span
            className="live-badge"
            style={{ background: 'rgba(198, 40, 40, 0.9)' }}
          >
            <span className="text-[9px] font-bold tracking-[.15em]">LATEST</span>
          </span>
          {featured.durationFmt && (
            <span className="frost-badge !text-[10px] font-mono tabular-nums">
              {featured.durationFmt}
            </span>
          )}
          {featured.sizeHuman && (
            <span className="frost-badge !text-[10px]">
              {featured.sizeHuman}
            </span>
          )}
        </div>

        {/* Title */}
        <h2
          className="font-display text-[22px] sm:text-[28px] lg:text-[34px] font-bold leading-[1.1] tracking-[-0.02em] mb-3 max-w-2xl"
          style={{ color: '#fff' }}
        >
          {featured.title}
        </h2>

        {/* Meta row */}
        <div className="flex items-center gap-3 text-[12px] sm:text-[13px] mb-5">
          <span style={{ color: 'rgba(255,255,255,0.7)' }}>
            {fmtRelative(featured.recordedAt || featured.date)}
          </span>
          <span style={{ color: 'rgba(255,255,255,0.3)' }}>•</span>
          <span style={{ color: 'rgba(255,255,255,0.7)' }}>
            {featured.resolution || '1080p'}
          </span>
          <span style={{ color: 'rgba(255,255,255,0.3)' }}>•</span>
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>
            The Muslim Lantern
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3">
          {/* Primary play button */}
          <button
            className="btn-magnetic inline-flex items-center gap-2.5 px-6 py-3 rounded-xl font-semibold text-[14px] transition-all"
            style={{
              background: 'var(--accent-primary)',
              color: '#fff',
              boxShadow: hover
                ? '0 8px 32px rgba(198, 40, 40, 0.5), 0 0 60px rgba(255, 61, 61, 0.2)'
                : '0 4px 16px rgba(198, 40, 40, 0.3)',
              transform: hover ? 'translateY(-2px) scale(1.02)' : 'none',
            }}
            onClick={(e) => { e.stopPropagation(); handleOpen(); }}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
            Watch Now
          </button>

          {/* Secondary info button */}
          <button
            className="btn-magnetic inline-flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-[14px] transition-all"
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(12px)',
              color: '#fff',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              transform: hover ? 'translateY(-2px)' : 'none',
            }}
            onClick={(e) => { e.stopPropagation(); handleOpen(); }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path strokeLinecap="round" d="M12 16v-4M12 8h.01" />
            </svg>
            More Info
          </button>
        </div>
      </div>

      {/* Bottom gradient fade for text readability */}
      <div
        className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none"
        style={{
          background: 'linear-gradient(to top, rgba(10, 10, 15, 0.95) 0%, transparent 100%)',
        }}
      />

      {/* Decorative corner accent */}
      <div
        className="absolute top-0 right-0 w-32 h-32 pointer-events-none opacity-30"
        style={{
          background: 'radial-gradient(circle at top right, rgba(212, 168, 83, 0.3) 0%, transparent 70%)',
        }}
      />
    </section>
  );
}
