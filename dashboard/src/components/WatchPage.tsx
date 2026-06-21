import{useState,useEffect,useCallback,useRef}from'react';
import{MediaPlayer,MediaProvider,type MediaPlayerInstance}from'@vidstack/react';
import{defaultLayoutIcons,DefaultVideoLayout}from'@vidstack/react/player/layouts/default';
import'@vidstack/react/player/styles/default/theme.css';
import'@vidstack/react/player/styles/default/layouts/video.css';
import type{Recording}from'../utils/dataFetcher';
interface P{rec:Recording;onClose:()=>void;all:Recording[];onNav:(r:Recording)=>void;theme:string;onTheme:()=>void}

// Auto = fastest source. Speed test: archive_node > github > archive_direct
// But archive_node has no CORS for Vidstack crossOrigin (removed, so OK now)
// GitHub sends octet-stream but Vidstack plays it without crossOrigin
function getSrc(r:Recording){
  const s:{l:string;u:string}[]=[];
  // Auto = pick the fastest available
  if(r.archiveNode) s.push({l:'Auto',u:r.archiveNode});
  else if(r.githubDirect||r.githubRelease) s.push({l:'Auto',u:(r.githubDirect||r.githubRelease)});
  else if(r.archiveDirect) s.push({l:'Auto',u:r.archiveDirect});
  // R3AL = GitHub CDN
  if(r.githubDirect||r.githubRelease) s.push({l:'R3AL',u:(r.githubDirect||r.githubRelease)});
  // B3ING = Archive /download/
  if(r.archiveDirect) s.push({l:'B3ING',u:r.archiveDirect});
  // JAGUAR = Telegram
  if(r.telegramLink) s.push({l:'JAGUAR',u:r.telegramLink});
  // Dedup — remove if Auto URL matches R3AL or B3ING
  const auto=s[0]?.u;
  return s.filter((x,i)=>i===0||x.u!==auto);
}
function getDL(r:Recording){const d:{l:string;u:string;c:string}[]=[];if(r.megaLink)d.push({l:'MEGA',u:r.megaLink,c:'#c62828'});if(r.pixeldrainLink)d.push({l:'Pixeldrain',u:r.pixeldrainLink,c:'#7c3aed'});if(r.gofileLink)d.push({l:'Gofile',u:r.gofileLink,c:'#2563eb'});return d;}
function ft(s:number){const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sc=Math.floor(s%60);return h>0?`${h}:${String(m).padStart(2,'0')}:${String(sc).padStart(2,'0')}`:`${m}:${String(sc).padStart(2,'0')}`;}

export function WatchPage({rec,onClose,all,onNav,theme,onTheme}:P){
  const pr=useRef<MediaPlayerInstance>(null);const chatR=useRef<HTMLDivElement>(null);
  const src=getSrc(rec),dl=getDL(rec),ch=rec.aiChapters||[];
  const[si,setSi]=useState(0);const[ci,setCi]=useState(0);const[t,setT]=useState(0);
  const[chat,setChat]=useState<any[]>([]);const[hasChat,setHasChat]=useState(false);
  const[ready,setReady]=useState(false);const played=useRef(false);
  const others=all.filter(x=>x.videoId!==rec.videoId).slice(0,6);
  useEffect(()=>{setSi(0);setCi(0);setT(0);setReady(false);played.current=false;setChat([]);setHasChat(false);if(!rec.chatUrl)return;fetch(rec.chatUrl).then(r=>{if(!r.ok)throw 0;return r.text();}).then(tx=>{try{const a=JSON.parse(tx);if(Array.isArray(a)&&a.length){setChat(a);setHasChat(true);}}catch{const l=tx.split('\n').map((x:string)=>{try{return JSON.parse(x);}catch{return null;}}).filter(Boolean);if(l.length){setChat(l);setHasChat(true);}}}).catch(()=>{});},[rec.videoId,rec.chatUrl]);
  useEffect(()=>{const h=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',h);return()=>window.removeEventListener('keydown',h);},[onClose]);
  useEffect(()=>{const p=pr.current;if(!p)return;const onTime=()=>{const ct=p.currentTime||0;setT(ct);for(let i=ch.length-1;i>=0;i--){if(ct>=ch[i].time){setCi(i);break;}}};const onGo=()=>{if(!played.current){played.current=true;setReady(true);}};p.addEventListener('time-update',onTime);p.addEventListener('playing',onGo);p.addEventListener('can-play',onGo);return()=>{p.removeEventListener('time-update',onTime);p.removeEventListener('playing',onGo);p.removeEventListener('can-play',onGo);};},[ch,si]);
  useEffect(()=>{if(!chatR.current||!chat.length)return;const kids=chatR.current.children;for(let i=kids.length-1;i>=0;i--){if(parseFloat((kids[i] as HTMLElement).dataset.t||'99999')<=t){kids[i].scrollIntoView({block:'nearest',behavior:'smooth'});break;}}},[Math.floor(t/3)]);
  const seek=useCallback((s:number)=>{const p=pr.current;if(p){p.currentTime=s;p.play().catch(()=>{});}},[]);
  const url=src[si]?.u||'';
  return(
    <div className="min-h-screen" style={{background:'var(--bg)',color:'var(--tx)'}}>
      <nav className="flex items-center justify-between px-4 sm:px-6 h-14 border-b" style={{borderColor:'var(--bd)'}}>
        <button onClick={onClose} className="flex items-center gap-2.5 group"><svg className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" style={{color:'var(--tx3)'}} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg><img src="/logo.png" alt="" className="h-10 object-contain"/></button>
        <button onClick={onTheme} className="p-2 rounded-lg" style={{color:'var(--tx3)'}}>{theme==='dark'?<svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><circle cx="12" cy="12" r="5" strokeWidth={2}/><path strokeLinecap="round" strokeWidth={2} d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>:<svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>}</button>
      </nav>
      <div className="flex flex-col xl:flex-row max-w-[1800px] mx-auto">
        <div className="flex-1 min-w-0">
          <div className="xl:p-4 xl:pb-0 relative">
            <style>{`media-player [data-media-buffering-indicator],media-player [part~="buffering-indicator"]{display:none!important}`}</style>
            {url&&<MediaPlayer key={url} ref={pr} src={url} viewType="video" streamType="on-demand" playsInline autoPlay className="w-full aspect-video xl:rounded-xl overflow-hidden bg-black shadow-2xl"><MediaProvider/><DefaultVideoLayout icons={defaultLayoutIcons}/></MediaPlayer>}
            {!ready&&(<div className="absolute inset-0 xl:top-4 xl:left-4 xl:right-4 xl:rounded-xl z-20 flex items-center justify-center" style={{background:'#000'}}><div className="flex flex-col items-center"><div className="w-10 h-10 mb-3 rounded-full border-2 border-transparent border-t-[#c62828] animate-spin"/><p className="text-white/60 text-[13px] font-medium tracking-wide">Preparing Stream</p></div></div>)}
          </div>
          <div className="px-4 sm:px-5 xl:px-4 pt-4 pb-6 space-y-3">
            <div><h1 className="text-base sm:text-lg font-bold leading-snug">{rec.title}</h1><p className="text-[11px] mt-1" style={{color:'var(--tx3)'}}>{rec.date} · {rec.durationFmt} · {rec.sizeHuman}{rec.resolution?.includes('1080')?' · 1080p':''}</p></div>
            {src.length>1&&<div className="flex items-center gap-1.5 flex-wrap py-2.5 px-3 rounded-lg" style={{background:'var(--bg2)'}}><span className="text-[8px] font-bold uppercase tracking-[.2em] mr-1" style={{color:'var(--tx3)'}}>Source</span>{src.map((s,i)=><button key={i} onClick={()=>setSi(i)} className="text-[10px] px-2.5 py-1 rounded-md font-bold transition-all" style={{background:i===si?'var(--red)':'var(--bg4)',color:i===si?'#fff':'var(--tx2)'}}>{s.l}</button>)}</div>}
            {dl.length>0&&<div className="py-2.5 px-3 rounded-lg" style={{background:'var(--bg2)'}}><p className="text-[8px] font-bold uppercase tracking-[.2em] mb-2" style={{color:'var(--tx3)'}}>Download</p><div className="flex flex-wrap gap-1.5">{dl.map((d,i)=><a key={i} href={d.u} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold text-white hover:brightness-110 active:scale-95 transition-all" style={{background:d.c}}><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>{d.l}</a>)}</div></div>}
            {ch.length>0&&<div className="py-3 px-3 rounded-lg" style={{background:'var(--bg2)'}}><p className="text-[8px] font-bold uppercase tracking-[.2em] mb-3" style={{color:'var(--tx3)'}}>Chapters · {ch.length}</p><div className="space-y-px">{ch.map((c,i)=>{const a=i===ci,g=c.label.toLowerCase().includes('joins');return<button key={i} onClick={()=>seek(c.time)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all group" style={{background:a?'var(--bg4)':'transparent'}}><span className="font-mono text-[11px] w-14 shrink-0 tabular-nums font-bold" style={{color:a?'var(--red)':'var(--tx3)'}}>{ft(c.time)}</span>{g&&<span className="text-[12px]">👤</span>}<span className="text-[12px] flex-1 font-medium" style={{color:a?'var(--tx)':'var(--tx2)'}}>{c.label}</span>{a&&<span className="w-2 h-2 rounded-full pd shrink-0" style={{background:'var(--red)'}}/>}{!a&&<svg className="w-3 h-3 opacity-0 group-hover:opacity-40 shrink-0 transition-opacity" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>}</button>;})}</div></div>}
            {hasChat&&chat.length>0&&<div className="py-2.5 px-3 rounded-lg" style={{background:'var(--bg2)'}}><p className="text-[8px] font-bold uppercase tracking-[.2em] mb-2" style={{color:'var(--tx3)'}}>💬 Chat · {chat.length}</p><div ref={chatR} className="max-h-48 overflow-y-auto space-y-px pr-1">{chat.map((m:any,i:number)=>{const mt=m.time_in_seconds||m.timestamp||0;const vis=mt<=t+2;const who=m.author?.name||m.author||'';const txt=m.message||m.text||m.body||'';if(!txt)return null;return<div key={i} data-t={mt} className="flex gap-1.5 text-[10px] py-px transition-opacity" style={{opacity:vis?1:.08}}><button onClick={()=>seek(mt)} className="font-mono w-9 shrink-0 tabular-nums hover:underline" style={{color:'var(--tx3)'}}>{ft(mt)}</button><span className="font-bold" style={{color:'var(--red)'}}>{who}</span><span style={{color:'var(--tx2)'}}>{txt}</span></div>;})}</div></div>}
          </div>
        </div>
        {others.length>0&&<div className="xl:w-[340px] shrink-0 border-l px-3 pb-6 pt-4" style={{borderColor:'var(--bd)'}}><p className="text-[8px] font-bold uppercase tracking-[.2em] mb-3" style={{color:'var(--tx3)'}}>Up Next</p><div className="space-y-2">{others.map(o=><button key={o.videoId} onClick={()=>{onNav(o);window.scrollTo(0,0);}} className="flex gap-2 w-full text-left rounded-lg p-1.5 -mx-1.5 transition-colors hover:bg-[var(--bg2)] group"><div className="w-32 shrink-0 aspect-video rounded-lg overflow-hidden" style={{background:'var(--bg3)'}}><img src={o.thumbnail} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform" onError={(e:any)=>{e.target.src='/thumbnail.jpg';}}/></div><div className="min-w-0 pt-0.5"><p className="text-[10px] font-semibold line-clamp-2 leading-snug">{o.title}</p><p className="text-[9px] mt-0.5" style={{color:'var(--tx3)'}}>{o.date} · {o.durationFmt}</p></div></button>)}</div></div>}
      </div>
    </div>
  );
}
