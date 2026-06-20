import type { Recording } from '../utils/dataFetcher';

export function Hero({ latest, onPlay, total, loading }: { latest?: Recording; onPlay: (r: Recording) => void; total: number; loading: boolean }) {
  if (loading) return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-10 pt-10 pb-12">
      <div className="skel w-full h-[320px] rounded-3xl" />
    </div>
  );

  return (
    <section className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-10 pt-8 pb-12">
      {/* Hero banner */}
      <div className="relative rounded-3xl overflow-hidden" style={{ background: 'var(--bg2)' }}>
        {/* Background — latest thumbnail blurred */}
        {latest && (
          <div className="absolute inset-0">
            <img src={latest.thumbnail} alt="" className="w-full h-full object-cover scale-110 blur-xl opacity-30" />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, var(--bg) 0%, transparent 50%, var(--bg) 100%)' }} />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, var(--bg) 0%, transparent 60%)' }} />
          </div>
        )}

        <div className="relative flex flex-col md:flex-row items-center gap-6 md:gap-10 p-6 sm:p-8 md:p-10">
          {/* Left — Latest thumbnail */}
          {latest && (
            <button onClick={() => onPlay(latest)} className="shrink-0 group cursor-pointer">
              <div className="relative w-[280px] sm:w-[340px] aspect-video rounded-2xl overflow-hidden ring-1 ring-white/10 shadow-2xl group-hover:ring-red-500/50 transition-all duration-300">
                <img src={latest.thumbnail} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-all flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center shadow-2xl scale-90 group-hover:scale-100 transition-transform" style={{ background: 'var(--red)' }}>
                    <svg className="w-7 h-7 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                  </div>
                </div>
                <span className="absolute bottom-2 right-2 bg-black/80 text-white text-[11px] font-bold px-2 py-0.5 rounded-md">{latest.durationFmt}</span>
              </div>
            </button>
          )}

          {/* Right — info */}
          <div className="flex-1 text-center md:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest mb-4" style={{ background: 'var(--red-g)', color: 'var(--red)' }}>
              <span className="w-2 h-2 rounded-full pulse-dot" style={{ background: 'var(--red)' }} />
              Latest Recording
            </div>
            {latest && (
              <>
                <h2 className="text-xl sm:text-2xl font-bold leading-tight mb-2">{latest.title}</h2>
                <p className="text-[14px] mb-6" style={{ color: 'var(--tx2)' }}>{latest.date} · {latest.durationFmt} · {latest.sizeHuman}</p>
                <button onClick={() => onPlay(latest)}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-[14px] font-bold text-white transition-all hover:brightness-110 active:scale-95 shadow-lg"
                  style={{ background: 'var(--red)' }}>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                  Watch Now
                </button>
              </>
            )}

            {/* Stats row */}
            <div className="flex items-center justify-center md:justify-start gap-8 mt-8">
              {[
                { n: total, l: 'Streams' },
                { n: Math.round(recs_hours()), l: 'Hours' },
                { n: '1080p', l: 'Quality' },
              ].map(s => (
                <div key={s.l} className="text-center">
                  <p className="text-xl font-black tabular-nums" style={{ color: 'var(--tx)' }}>{s.n}</p>
                  <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--tx3)' }}>{s.l}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// Will be replaced with real data
function recs_hours() { return 12; }
