import{useState}from'react';
import type{Recording}from'../utils/dataFetcher';
export function StreamCard({rec,onClick,delay=0}:{rec:Recording;onClick:()=>void;delay?:number}){
  const[err,setErr]=useState(false);
  const guests=rec.aiChapters.filter(c=>c.label.toLowerCase().includes('joins'));
  return(
    <button onClick={onClick} className="text-left w-full group focus:outline-none fade-up" style={{animationDelay:`${delay}ms`}}>
      <div className="relative aspect-video rounded-xl overflow-hidden ring-1 ring-[var(--bd2)] group-hover:ring-[var(--red)]/50 transition-all duration-300" style={{background:'var(--bg2)'}}>
        {!err?<img src={rec.thumbnail} alt="" loading="lazy" onError={()=>setErr(true)} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"/>
        :<div className="w-full h-full flex items-center justify-center opacity-20" style={{color:'var(--tx3)'}}><svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg></div>}
        {rec.durationFmt&&<span className="absolute bottom-2 right-2 bg-black/80 text-white text-[10px] font-bold px-1.5 py-px rounded">{rec.durationFmt}</span>}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
          <div className="w-12 h-12 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100 transition-all" style={{background:'var(--red)'}}><svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
        </div>
      </div>
      <div className="mt-2.5">
        <h3 className="text-[13px] font-semibold leading-snug line-clamp-2" style={{color:'var(--tx)'}}>{rec.title}</h3>
        <p className="text-[11px] mt-1" style={{color:'var(--tx3)'}}>{rec.date} · {rec.sizeHuman}</p>
        {guests.length>0&&<div className="flex flex-wrap gap-1 mt-1.5">{guests.slice(0,3).map((g,i)=><span key={i} className="text-[9px] px-1.5 py-px rounded-full font-bold" style={{background:'var(--rg)',color:'var(--red)'}}>{g.label.replace(' joins','')}</span>)}</div>}
      </div>
    </button>
  );
}
