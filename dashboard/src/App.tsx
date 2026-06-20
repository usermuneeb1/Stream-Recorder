import { useState, useEffect, useCallback } from 'react';
import { fetchRecordings, type Recording } from './utils/dataFetcher';
import { Header } from './components/Header';
import { Hero } from './components/Hero';
import { StreamCard } from './components/StreamCard';
import { WatchPage } from './components/WatchPage';
import { Footer } from './components/Footer';

export default function App() {
  const [recs, setRecs] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [active, setActive] = useState<Recording | null>(null);
  const [theme, setTheme] = useState<'dark'|'light'>(() =>
    (typeof window !== 'undefined' && localStorage.getItem('t') as any) || 'dark'
  );

  useEffect(() => { document.documentElement.className = theme === 'light' ? 'light' : ''; localStorage.setItem('t', theme); }, [theme]);
  useEffect(() => { fetchRecordings().then(r => { setRecs(r); setLoading(false); }); }, []);

  useEffect(() => {
    const h = () => {
      const m = window.location.hash.match(/^#\/watch\/(.+)$/);
      if (m && recs.length) { const r = recs.find(x => x.videoId === decodeURIComponent(m[1])); if (r) { setActive(r); return; } }
      if (!window.location.hash || window.location.hash === '#') setActive(null);
    };
    h(); window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, [recs]);

  const open = useCallback((r: Recording) => { setActive(r); window.location.hash = `/watch/${r.videoId}`; window.scrollTo(0, 0); }, []);
  const close = useCallback(() => { setActive(null); window.location.hash = ''; }, []);
  const toggle = useCallback(() => setTheme(t => t === 'dark' ? 'light' : 'dark'), []);

  const filtered = recs.filter(r => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return r.title.toLowerCase().includes(s) || r.date.includes(s) || r.aiChapters?.some(c => c.label.toLowerCase().includes(s));
  });

  if (active) return <WatchPage rec={active} onClose={close} all={filtered} onNav={open} theme={theme} onTheme={toggle} />;

  return (
    <div style={{ background: 'var(--bg)' }} className="min-h-screen flex flex-col">
      <Header q={q} setQ={setQ} theme={theme} toggle={toggle} />
      <Hero latest={recs[0]} onPlay={open} total={recs.length} loading={loading} />

      <main className="flex-1 max-w-[1400px] w-full mx-auto px-4 sm:px-6 lg:px-10 pb-20">
        {/* Section title */}
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-[20px] font-bold tracking-tight" style={{ color: 'var(--tx)' }}>
            All Recordings
          </h2>
          <span className="text-[13px] font-semibold px-3 py-1 rounded-full" style={{ background: 'var(--red-g)', color: 'var(--red)' }}>
            {filtered.length} streams
          </span>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => <div key={i}><div className="skel aspect-video w-full" /><div className="skel h-5 w-3/4 mt-4" /><div className="skel h-4 w-1/2 mt-2" /></div>)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-24 opacity-30">
            <svg className="w-16 h-16 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <p className="text-lg font-medium">No streams found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-10">
            {filtered.map((r, i) => <StreamCard key={r.videoId} rec={r} onClick={() => open(r)} delay={i * 80} />)}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
