import { useState } from 'react';
import type { Recording } from '../utils/dataFetcher';

export function StreamCard({ rec, onClick, delay = 0 }: { rec: Recording; onClick: () => void; delay?: number }) {
  const [err, setErr] = useState(false);
  const guests = (rec.aiChapters || []).filter(c => c.label.toLowerCase().includes('joins'));

  return (
    <button onClick={onClick} className="text-left w-full group focus:outline-none fade-up" style={{ animationDelay: `${delay}ms` }}>
      {/* Thumbnail */}
      <div className="relative aspect-video rounded-2xl overflow-hidden ring-1 transition-all duration-300 group-hover:ring-2 shadow-lg group-hover:shadow-xl"
        style={{ background: 'var(--bg2)', '--tw-ring-color': 'var(--bd2)' } as any}
        onMouseEnter={e => (e.currentTarget.style as any)['--tw-ring-color'] = 'var(--red)'}
        onMouseLeave={e => (e.currentTarget.style as any)['--tw-ring-color'] = 'var(--bd2)'}>
        {!err ? (
          <img src={rec.thumbnail} alt="" loading="lazy" onError={() => setErr(true)}
            className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06]" />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ color: 'var(--tx3)' }}>
            <svg className="w-12 h-12 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
          </div>
        )}
        {rec.durationFmt && <span className="absolute bottom-2.5 right-2.5 bg-black/80 backdrop-blur text-white text-[11px] font-bold px-2 py-0.5 rounded-md">{rec.durationFmt}</span>}
        {rec.resolution?.includes('1080') && <span className="absolute top-2.5 left-2.5 text-[9px] font-black px-1.5 py-0.5 rounded text-white" style={{ background: 'var(--red)' }}>HD</span>}
        {/* Play overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center">
          <div className="w-14 h-14 rounded-full flex items-center justify-center scale-75 group-hover:scale-100 transition-transform duration-300 shadow-2xl" style={{ background: 'var(--red)' }}>
            <svg className="w-6 h-6 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          </div>
        </div>
      </div>
      {/* Meta */}
      <div className="mt-3.5">
        <h3 className="text-[14px] font-semibold leading-snug line-clamp-2" style={{ color: 'var(--tx)' }}>{rec.title}</h3>
        <p className="text-[12px] mt-1.5 font-medium" style={{ color: 'var(--tx3)' }}>{rec.date} · {rec.sizeHuman}</p>
        {guests.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {guests.slice(0, 3).map((g, i) => (
              <span key={i} className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: 'var(--red-g)', color: 'var(--red)' }}>
                {g.label.replace(' joins', '')}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}
