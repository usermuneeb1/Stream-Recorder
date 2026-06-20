import { useState, useEffect, useCallback } from 'react';
import { fetchRecordings, type Recording } from './utils/dataFetcher';
import { Header } from './components/Header';
import { StreamCard } from './components/StreamCard';
import { WatchPage } from './components/WatchPage';
import { Footer } from './components/Footer';

export default function App() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeVideo, setActiveVideo] = useState<Recording | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    (typeof window !== 'undefined' && localStorage.getItem('theme') as 'dark' | 'light') || 'dark'
  );

  useEffect(() => { document.documentElement.className = theme === 'light' ? 'light' : ''; localStorage.setItem('theme', theme); }, [theme]);
  useEffect(() => { fetchRecordings().then(r => { setRecordings(r); setLoading(false); }); }, []);

  useEffect(() => {
    const handle = () => {
      const m = window.location.hash.match(/^#\/watch\/(.+)$/);
      if (m && recordings.length) { const r = recordings.find(x => x.videoId === decodeURIComponent(m[1])); if (r) { setActiveVideo(r); return; } }
      if (!window.location.hash || window.location.hash === '#' || window.location.hash === '#/') setActiveVideo(null);
    };
    handle();
    window.addEventListener('hashchange', handle);
    return () => window.removeEventListener('hashchange', handle);
  }, [recordings]);

  const open = useCallback((r: Recording) => { setActiveVideo(r); window.location.hash = `/watch/${r.videoId}`; window.scrollTo(0, 0); }, []);
  const close = useCallback(() => { setActiveVideo(null); window.location.hash = ''; }, []);
  const toggle = useCallback(() => setTheme(t => t === 'dark' ? 'light' : 'dark'), []);

  const filtered = recordings.filter(r => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return r.title.toLowerCase().includes(q) || r.date.includes(q) || r.aiChapters?.some(c => c.label.toLowerCase().includes(q));
  });

  if (activeVideo) return <WatchPage rec={activeVideo} onClose={close} all={filtered} onNav={open} theme={theme} onTheme={toggle} />;

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }} className="flex flex-col">
      <Header search={search} onSearch={setSearch} theme={theme} onTheme={toggle} />
      <main className="flex-1 w-full max-w-[1600px] mx-auto px-4 sm:px-8 lg:px-12 pb-16 pt-8">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => <div key={i}><div className="skeleton aspect-video w-full" /><div className="skeleton h-5 w-3/4 mt-4" /><div className="skeleton h-4 w-1/2 mt-2" /></div>)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-32 opacity-40">
            <svg className="w-16 h-16 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <p className="text-lg">No streams found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-10">
            {filtered.map((r, i) => <StreamCard key={r.videoId} rec={r} onClick={() => open(r)} delay={i * 60} />)}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
