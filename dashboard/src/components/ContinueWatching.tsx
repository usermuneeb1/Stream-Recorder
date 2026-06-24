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
    <section className="mb-10 fade-up" key={tick}>
      <div className="flex items-center gap-3 mb-4">
        <span className="relative inline-block w-2 h-2 pulse-ring rounded-full" style={{ background: 'var(--accent-glow)' }} />
        <h2 className="font-display text-[19px] font-bold" style={{ color: 'var(--text-primary)' }}>
          Continue watching
        </h2>
        <span className="text-[11px] font-mono tabular-nums" style={{ color: 'var(--text-muted)' }}>
          {items.length}
        </span>
      </div>
      <div className="flex gap-4 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-3 snap-x" style={{ scrollbarWidth: 'none' }}>
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
              role="button" tabIndex={0}
              onClick={open}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}
              className="group shrink-0 w-[260px] sm:w-[300px] text-left snap-start ring-focus card-surface cursor-pointer"
            >
              <div className="relative aspect-video overflow-hidden rounded-t-[16px]" style={{ background: 'var(--bg-elevated)' }}>
                <img
                  src={rec.thumbnail} alt="" loading="lazy"
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.05]"
                  onError={(e: any) => { e.target.src = '/thumbnail.jpg'; }}
                />
                {/* Progress bar with glow */}
                <div className="absolute bottom-0 left-0 right-0 h-[3px]" style={{ background: 'rgba(255, 255, 255, 0.18)' }}>
                  <div className="h-full" style={{ width: `${pct}%`, background: 'var(--accent-glow)', boxShadow: '0 0 8px rgba(255, 61, 61, 0.65)' }} />
                </div>
                {/* X button (always visible on mobile) */}
                <button
                  type="button"
                  onPointerDown={e => e.stopPropagation()}
                  onMouseDown={e => e.stopPropagation()}
                  onTouchStart={e => e.stopPropagation()}
                  onClick={remove}
                  className="absolute top-2 right-2 z-20 w-7 h-7 flex items-center justify-center rounded-md bg-black/75 sm:opacity-0 sm:group-hover:opacity-100 transition-all hover:!bg-[var(--accent-primary)]"
                  style={{ color: '#fff' }}
                  title="Remove from list" aria-label="Remove from continue-watching"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" d="M6 6l12 12M6 18L18 6" />
                  </svg>
                </button>
                {/* Centered play overlay */}
                <div className="absolute inset-0 flex items-center justify-center transition-all bg-black/0 group-hover:bg-black/35 pointer-events-none">
                  <div className="w-12 h-12 rounded-full opacity-0 group-hover:opacity-100 transition-all" style={{ background: 'var(--accent-primary)', boxShadow: '0 8px 28px rgba(198, 40, 40, 0.55)' }}>
                    <svg className="w-full h-full p-3 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                  </div>
                </div>
              </div>
              <div className="px-3.5 py-3">
                <p className="text-[13px] font-semibold line-clamp-2 leading-snug mb-1.5" style={{ color: 'var(--text-primary)' }}>{rec.title}</p>
                <div className="flex items-center justify-between">
                  <p className="text-[10.5px] font-medium" style={{ color: 'var(--text-muted)' }}>{Math.round(pct)}% watched</p>
                  <p className="text-[10.5px] font-mono tabular-nums" style={{ color: 'var(--text-muted)' }}>{rec.durationFmt}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
