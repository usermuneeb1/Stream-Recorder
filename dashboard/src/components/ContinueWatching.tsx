import { useEffect, useState } from 'react';
import type { Recording } from '../utils/dataFetcher';
import { getHistory, loadPosition, clearPosition, removeFromHistory } from '../utils/history';

interface P { recs: Recording[]; onOpen: (r: Recording) => void }

export function ContinueWatching({ recs, onOpen }: P) {
  const [tick, setTick] = useState(0);
  // refresh when component re-mounts (e.g. user returns from a watch page)
  useEffect(() => { setTick(t => t + 1); }, []);

  const ids = getHistory();
  const items = ids
    .map(id => {
      const rec = recs.find(r => r.videoId === id);
      const pos = loadPosition(id);
      return rec && pos ? { rec, pos } : null;
    })
    .filter((x): x is { rec: Recording; pos: { t: number; d: number } } => !!x)
    .slice(0, 6);

  if (!items.length) return null;

  return (
    <section className="mb-10" key={tick}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-[17px] font-bold flex items-center gap-2">
          <svg className="w-4 h-4" style={{ color: 'var(--red)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <circle cx="12" cy="12" r="9" />
            <path strokeLinecap="round" d="M12 7v5l3 2" />
          </svg>
          Continue watching
        </h2>
      </div>
      <div className="flex gap-3 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-2 snap-x">
        {items.map(({ rec, pos }) => {
          const pct = Math.min(100, Math.max(0, (pos.t / pos.d) * 100));
          return (
            <button
              key={rec.videoId}
              // FIX #26 — tag the navigation so WatchPage auto-resumes
              // without flashing the "Continue from X:XX?" banner — the
              // user clicked "Continue watching", they already opted in.
              onClick={() => { (window as any).__mlaContinueResume = rec.videoId; onOpen(rec); }}
              className="group shrink-0 w-[230px] sm:w-[260px] text-left snap-start ring-focus rounded-lg"
            >
              <div className="relative aspect-video rounded-lg overflow-hidden" style={{ background: 'var(--bg3)' }}>
                <img src={rec.thumbnail} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onError={(e: any) => { e.target.src = '/thumbnail.jpg'; }} />
                {/* Resume bar */}
                <div className="absolute bottom-0 left-0 right-0 h-[3px]" style={{ background: 'rgba(255,255,255,.18)' }}>
                  <div className="h-full" style={{ width: `${pct}%`, background: 'var(--red)' }} />
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    // FIX: also remove from history, not just clear the saved
                    // position — otherwise the tile re-appears with 0% progress
                    // because the videoId is still in mla_hist_v1.
                    clearPosition(rec.videoId);
                    removeFromHistory(rec.videoId);
                    setTick(t => t + 1);
                  }}
                  className="absolute top-1.5 right-1.5 p-1 rounded-md glass opacity-0 group-hover:opacity-100 transition-opacity hover:!bg-black/80"
                  style={{ color: '#fff' }}
                  title="Remove from list"
                  aria-label="Remove from continue-watching"
                >
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" d="M6 6l12 12M6 18L18 6" />
                  </svg>
                </button>
                <div className="absolute inset-0 flex items-center justify-center transition-all bg-black/0 group-hover:bg-black/30">
                  <div className="w-10 h-10 rounded-full opacity-0 group-hover:opacity-100 transition-all" style={{ background: 'var(--red)' }}>
                    <svg className="w-full h-full p-2.5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                  </div>
                </div>
              </div>
              <p className="text-[12.5px] font-semibold mt-2 line-clamp-2 leading-snug" style={{ color: 'var(--tx)' }}>{rec.title}</p>
              <p className="text-[10.5px] mt-1" style={{ color: 'var(--tx3)' }}>{Math.round(pct)}% watched</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
