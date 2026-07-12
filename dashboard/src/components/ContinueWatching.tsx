import { useEffect, useState } from 'react';
import type { Recording } from '../utils/dataFetcher';
import { getHistory, loadPosition, clearPosition, removeFromHistory } from '../utils/history';

interface P { recs: Recording[]; onOpen: (r: Recording) => void }

export function ContinueWatching({ recs, onOpen }: P) {
  const [tick, setTick] = useState(0);
  useEffect(() => { setTick(t => t + 1); }, []);
  const ids = getHistory();
  const items = ids
    .map(id => {
      const rec = recs.find(r => r.videoId === id);
      const pos = loadPosition(id);
      return rec && pos ? { rec, pos } : null;
    })
    .filter((x): x is { rec: Recording; pos: { t: number; d: number } } => !!x)
    .slice(0, 8);
  if (!items.length) return null;

  return (
    <section className="mb-12 slide-up" key={tick}>
      <div className="flex items-center gap-3 mb-4">
        <span
          className="relative inline-block w-2 h-2 rounded-full"
          style={{ background: 'var(--gold-primary)', boxShadow: 'var(--shadow-gold)' }}
        >
          <span
            className="absolute inset-0 rounded-full"
            style={{ background: 'var(--gold-primary)', animation: 'pulse-gold 2s ease-in-out infinite' }}
          />
        </span>
        <h2 className="font-display text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Continue Watching
        </h2>
        <span className="font-mono text-sm" style={{ color: 'var(--text-muted)' }}>
          {items.length}
        </span>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-3 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x" style={{ scrollbarWidth: 'none' }}>
        {items.map(({ rec, pos }) => {
          const pct = Math.min(100, Math.max(0, (pos.t / pos.d) * 100));
          const open = () => { (window as any).__mlaContinueResume = rec.videoId; onOpen(rec); };
          const remove = (e: React.SyntheticEvent) => {
            e.stopPropagation(); e.preventDefault();
            clearPosition(rec.videoId); removeFromHistory(rec.videoId); setTick(t => t + 1);
          };
          return (
            <div
              key={rec.videoId}
              role="button"
              tabIndex={0}
              onClick={open}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}
              className="group shrink-0 w-[260px] sm:w-[300px] cursor-pointer card-premium"
            >
              <div className="relative aspect-video overflow-hidden rounded-t-lg" style={{ background: 'var(--bg-elevated)' }}>
                <img
                  src={rec.thumbnail} alt="" loading="lazy"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  onError={(e: any) => { e.target.src = '/thumbnail.jpg'; }}
                />
                {/* Progress bar */}
                <div className="absolute bottom-0 left-0 right-0 h-1" style={{ background: 'rgba(255, 255, 255, 0.2)' }}>
                  <div
                    className="h-full"
                    style={{
                      width: `${pct}%`,
                      background: 'var(--gradient-gold)',
                      boxShadow: 'var(--shadow-gold)',
                    }}
                  />
                </div>
                {/* Remove button */}
                <button
                  type="button"
                  onClick={remove}
                  className="absolute top-2 right-2 w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background: 'rgba(10, 10, 15, 0.9)', border: '1px solid var(--border-gold)' }}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="var(--gold-primary)" strokeWidth="2.5">
                    <path strokeLinecap="round" d="M6 6l12 12M6 18L18 6" />
                  </svg>
                </button>
                {/* Play overlay */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'rgba(10, 10, 15, 0.7)' }}>
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center"
                    style={{ background: 'var(--accent-red)', boxShadow: 'var(--shadow-gold)' }}
                  >
                    <svg className="w-5 h-5 ml-0.5" viewBox="0 0 24 24" fill="white">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </div>
              </div>
              <div className="p-3">
                <p className="font-display text-sm font-semibold line-clamp-2 mb-2" style={{ color: 'var(--text-primary)' }}>
                  {rec.title}
                </p>
                <div className="flex items-center justify-between text-xs">
                  <span style={{ color: 'var(--gold-primary)' }}>{Math.round(pct)}% watched</span>
                  <span className="font-mono" style={{ color: 'var(--text-muted)' }}>{rec.durationFmt}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
