import { useState } from 'react';
import type { Recording } from '../utils/dataFetcher';

interface P {
  rec: Recording;
  onClick: () => void;
  delay?: number;
  view: 'grid' | 'list';
  onToast?: (msg: string) => void;
  featured?: boolean;
}

export function StreamCard({ rec, onClick, delay = 0, view, onToast, featured }: P) {
  const [hover, setHover] = useState(false);

  const copyLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `${window.location.origin}/#/watch/${rec.videoId}`;
    navigator.clipboard.writeText(url);
    onToast?.('Link copied to clipboard');
  };

  if (view === 'list') {
    return (
      <div
        className="card-premium flex gap-4 p-4 cursor-pointer group"
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{ animationDelay: `${delay}ms` }}
      >
        {/* Thumbnail */}
        <div className="relative w-48 sm:w-64 flex-shrink-0 aspect-video rounded-lg overflow-hidden">
          <img
            src={rec.thumbnail}
            alt=""
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
            style={{ background: 'rgba(10, 10, 15, 0.7)' }}
          >
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ background: 'var(--accent-red)', boxShadow: 'var(--shadow-gold)' }}
            >
              <svg className="w-5 h-5 ml-0.5" viewBox="0 0 24 24" fill="white">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
          {rec.durationFmt && (
            <div
              className="absolute bottom-2 right-2 font-mono text-xs px-2 py-1 rounded"
              style={{ background: 'rgba(10, 10, 15, 0.9)', color: 'var(--text-primary)' }}
            >
              {rec.durationFmt}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col justify-between">
          <div>
            <h3
              className="font-display text-lg font-semibold mb-2 line-clamp-2 group-hover:text-gold transition-colors"
              style={{ color: 'var(--text-primary)' }}
            >
              {rec.title}
            </h3>
            <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <span>{rec.date}</span>
              <span style={{ color: 'var(--text-muted)' }}>•</span>
              <span>{rec.sizeHuman}</span>
              <span style={{ color: 'var(--text-muted)' }}>•</span>
              <span>{rec.resolution || 'HD'}</span>
            </div>
          </div>
          <button
            onClick={copyLink}
            className="flex items-center gap-2 text-sm mt-3 opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ color: 'var(--gold-primary)' }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Copy link
          </button>
        </div>
      </div>
    );
  }

  // Grid view
  return (
    <div
      className="card-premium cursor-pointer group overflow-hidden"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video overflow-hidden">
        <img
          src={rec.thumbnail}
          alt=""
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
          style={{ background: 'rgba(10, 10, 15, 0.7)' }}
        >
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center transition-transform group-hover:scale-110"
            style={{ background: 'var(--accent-red)', boxShadow: 'var(--shadow-gold)' }}
          >
            <svg className="w-6 h-6 ml-0.5" viewBox="0 0 24 24" fill="white">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>

        {/* Badges */}
        <div className="absolute top-3 left-3 flex gap-2">
          {featured && (
            <span
              className="text-xs font-semibold tracking-wider uppercase px-2 py-1 rounded"
              style={{
                background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.9) 0%, rgba(212, 175, 55, 0.7) 100%)',
                color: 'var(--bg-primary)',
              }}
            >
              Featured
            </span>
          )}
          {rec.resolution && /1080|1440|2160|4k/i.test(rec.resolution) && (
            <span
              className="font-mono text-xs px-2 py-1 rounded"
              style={{ background: 'rgba(10, 10, 15, 0.9)', color: 'var(--text-primary)' }}
            >
              HD
            </span>
          )}
        </div>

        {rec.durationFmt && (
          <div
            className="absolute bottom-3 right-3 font-mono text-xs px-2 py-1 rounded"
            style={{ background: 'rgba(10, 10, 15, 0.9)', color: 'var(--text-primary)' }}
          >
            {rec.durationFmt}
          </div>
        )}

        {/* Copy button */}
        <button
          onClick={copyLink}
          className="absolute top-3 right-3 w-8 h-8 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-gold)' }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--gold-primary)' }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="p-4">
        <h3
          className="font-display text-base font-semibold mb-2 line-clamp-2 group-hover:text-gold transition-colors"
          style={{ color: 'var(--text-primary)' }}
        >
          {rec.title}
        </h3>
        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <span>{rec.date}</span>
          <span style={{ color: 'var(--text-muted)' }}>•</span>
          <span>{rec.sizeHuman}</span>
        </div>
      </div>
    </div>
  );
}
