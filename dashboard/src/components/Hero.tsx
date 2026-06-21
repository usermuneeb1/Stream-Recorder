import type { Recording } from '../utils/dataFetcher';

export function Hero({ latest, onPlay, total, loading, totalHours }: { latest?: Recording; onPlay: (r: Recording)=>void; total: number; loading: boolean; totalHours: number }) {
  if (loading) return <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-10 pt-8 pb-10"><div className="skel w-full h-[300px] rounded-3xl"/></div>;
  return (
    <section className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-10 pt-8 pb-10">
      <div className="relative rounded-3xl overflow-hidden" style={{background:'var(--bg2)'}}>
        {latest && <div className="absolute inset-0"><img src={latest.thumbnail} alt="" className="w-full h-full object-cover scale-110 blur-2xl opacity-25"/><div className="absolute inset-0" style={{background:'linear-gradient(135deg,var(--bg) 0%,transparent 50%,var(--bg) 100%)'}}/><div className="absolute inset-0" style={{background:'linear-gradient(to top,var(--bg) 0%,transparent 60%)'}}/></div>}
        <div className="relative flex flex-col md:flex-row items-center gap-6 md:gap-10 p-6 sm:p-8 md:p-10">
          {latest && (
            <button onClick={()=>onPlay(latest)} className="shrink-0 group">
              <div className="relative w-[300px] sm:w-[380px] aspect-video rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10 group-hover:ring-red-500/40 transition-all duration-300">
                <img src={latest.thumbnail} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"/>
                <div className="absolute inset-0 bg-black/10 group-hover:bg-black/30 transition-all flex items-center justify-center">
                  <div className="w-[72px] h-[72px] rounded-full flex items-center justify-center shadow-2xl scale-90 group-hover:scale-100 transition-transform" style={{background:'var(--red)'}}>
                    <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                  </div>
                </div>
                <span className="absolute bottom-3 right-3 bg-black/80 backdrop-blur text-white text-xs font-bold px-2.5 py-1 rounded-lg">{latest.durationFmt}</span>
              </div>
            </button>
          )}
          <div className="flex-1 text-center md:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-[.15em] mb-4" style={{background:'var(--rg)',color:'var(--red)'}}>
              <span className="w-2 h-2 rounded-full pulse-dot" style={{background:'var(--red)'}}/> Latest Stream
            </div>
            {latest && <>
              <h2 className="text-xl sm:text-2xl font-bold leading-tight mb-2">{latest.title}</h2>
              <p className="text-sm mb-6" style={{color:'var(--tx2)'}}>{latest.date} · {latest.durationFmt} · {latest.sizeHuman}</p>
              <button onClick={()=>onPlay(latest)} className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-2xl text-sm font-bold text-white shadow-xl transition-all hover:brightness-110 active:scale-95" style={{background:'var(--red)'}}>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>Watch Now
              </button>
            </>}
            <div className="flex items-center justify-center md:justify-start gap-10 mt-8 pt-6 border-t" style={{borderColor:'var(--bd)'}}>
              {[{n:String(total),l:'Streams'},{n:`${Math.round(totalHours)}+`,l:'Hours'},{n:'1080p',l:'Quality'}].map(s=>(
                <div key={s.l} className="text-center"><p className="text-2xl font-black tabular-nums">{s.n}</p><p className="text-[10px] font-bold uppercase tracking-[.15em] mt-0.5" style={{color:'var(--tx3)'}}>{s.l}</p></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
