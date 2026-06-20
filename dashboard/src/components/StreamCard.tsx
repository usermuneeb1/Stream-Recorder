import { useState } from 'react';
import type { Recording } from '../utils/dataFetcher';

export function StreamCard({ rec, onClick, delay = 0 }: { rec: Recording; onClick: () => void; delay?: number }) {
  const [err, setErr] = useState(false);
  const guests = (rec.aiChapters || []).filter(c => c.label.toLowerCase().includes('joins'));

  return (
    <button onClick={onClick} className="text-left w-full group focus:outline-none fade-in" style={{ animationDelay: `${delay}ms` }}>
      <div className="relative aspect-video rounded-2xl overflow-hidden ring-1 transition-all duration-300 group-hover:ring-2" style={{ background: 'var(--bg-card)', ringColor: 'var(--border)', '--tw-ring-hover-color': 'var(--red)' } as any}>
        {!err ? (
          <img src={rec.thumbnail} alt="" loading="lazy" onError={() => setErr(true)}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.05]" />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
            <svg className="w-12 h-12 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
          </div>
        )}
        {rec.durationFmt && <span className="absolute bottom-2 right-2 bg-black/80 backdrop-blur-sm text-white text-[11px] font-bold px-2 py-0.5 rounded-md">{rec.durationFmt}</span>}
        {rec.resolution?.includes('1080') && <span className="absolute top-2 left-2 text-[9px] font-black px-1.5 py-0.5 rounded text-white" style={{ background: 'var(--red)' }}>HD</span>}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center">
          <div className="w-14 h-14 rounded-full flex items-center justify-center scale-75 group-hover:scale-100 transition-transform duration-300" style={{ background: 'var(--red)' }}>
            <svg className="w-6 h-6 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          </div>
        </div>
      </div>
      <div className="mt-3">
        <h3 className="text-[15px] font-semibold leading-snug line-clamp-2" style={{ color: 'var(--text)' }}>{rec.title}</h3>
        <p className="text-[13px] mt-1" style={{ color: 'var(--text-muted)' }}>{rec.date} · {rec.sizeHuman}</p>
        {guests.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {guests.slice(0, 3).map((g, i) => (
              <span key={i} className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'var(--red-glow)', color: 'var(--red)' }}>
                {g.label.replace(' joins', '')}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}
