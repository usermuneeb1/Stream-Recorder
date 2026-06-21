import { useState, useEffect, useCallback } from 'react';
import { fetchRecordings, type Recording } from './utils/dataFetcher';
import { Header } from './components/Header';
import { StreamCard } from './components/StreamCard';
import { WatchPage } from './components/WatchPage';
import { Footer } from './components/Footer';

export default function App() {
  const [recs, setRecs] = useState<Recording[]>([]);
  const [ld, setLd] = useState(true);
  const [q, setQ] = useState('');
  const [av, setAv] = useState<Recording | null>(null);
  const [th, setTh] = useState<'dark'|'light'>(() => (typeof window!=='undefined'&&localStorage.getItem('t') as any)||'dark');

  useEffect(() => { document.documentElement.className = th==='light'?'light':''; localStorage.setItem('t', th); }, [th]);
  useEffect(() => { fetchRecordings().then(r => { setRecs(r); setLd(false); }); }, []);
  useEffect(() => {
    const h = () => {
      const m = window.location.hash.match(/^#\/watch\/(.+)$/);
      if (m&&recs.length) { const r = recs.find(x => x.videoId===decodeURIComponent(m[1])); if(r){setAv(r);return;} }
      if (!window.location.hash||window.location.hash==='#') setAv(null);
    };
    h(); window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h);
  }, [recs]);

  const open = useCallback((r: Recording) => { setAv(r); window.location.hash=`/watch/${r.videoId}`; window.scrollTo(0,0); }, []);
  const close = useCallback(() => { setAv(null); window.location.hash=''; }, []);
  const tog = useCallback(() => setTh(t => t==='dark'?'light':'dark'), []);
  const fl = recs.filter(r => { if(!q.trim()) return true; const s=q.toLowerCase(); return r.title.toLowerCase().includes(s)||r.date.includes(s)||r.aiChapters?.some(c=>c.label.toLowerCase().includes(s)); });

  if (av) return <WatchPage rec={av} onClose={close} all={fl} onNav={open} theme={th} onTheme={tog} />;

  return (
    <div style={{background:'var(--bg)'}} className="min-h-screen flex flex-col">
      <Header q={q} setQ={setQ} theme={th} toggle={tog} />
      <main className="flex-1 max-w-[1400px] w-full mx-auto px-4 sm:px-6 lg:px-10 pt-8 pb-20">
        {ld?(
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">{[...Array(6)].map((_,i)=><div key={i}><div className="skel aspect-video w-full"/><div className="skel h-5 w-3/4 mt-4"/><div className="skel h-4 w-1/2 mt-2"/></div>)}</div>
        ):fl.length===0?(
          <div className="flex flex-col items-center py-24 opacity-30"><p className="text-lg">No streams found</p></div>
        ):(
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-8">
            {fl.map((r,i)=><StreamCard key={r.videoId} rec={r} onClick={()=>open(r)} delay={i*60}/>)}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
