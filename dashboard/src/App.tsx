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
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('theme') as 'dark' | 'light') || 'dark';
    }
    return 'dark';
  });

  useEffect(() => {
    document.documentElement.className = theme === 'light' ? 'light' : '';
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    fetchRecordings().then(recs => {
      setRecordings(recs);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash;
      const watchMatch = hash.match(/^#\/watch\/(.+)$/);
      if (watchMatch && recordings.length) {
        const id = decodeURIComponent(watchMatch[1]);
        const rec = recordings.find(r => r.videoId === id);
        if (rec) { setActiveVideo(rec); return; }
      }
      if (!hash || hash === '#' || hash === '#/') setActiveVideo(null);
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, [recordings]);

  const openWatch = useCallback((rec: Recording) => {
    setActiveVideo(rec);
    window.location.hash = `/watch/${rec.videoId}`;
    window.scrollTo(0, 0);
  }, []);

  const closeWatch = useCallback(() => {
    setActiveVideo(null);
    window.location.hash = '';
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(t => t === 'dark' ? 'light' : 'dark');
  }, []);

  const filtered = recordings.filter(r => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.title.toLowerCase().includes(q) ||
      r.date.includes(q) ||
      r.aiChapters?.some(c => c.label.toLowerCase().includes(q))
    );
  });

  // ── Watch Page (full page, not modal) ──────────────────────────────────
  if (activeVideo) {
    return (
      <div style={{ background: 'var(--bg-primary)', minHeight: '100vh' }}>
        <WatchPage
          rec={activeVideo}
          onClose={closeWatch}
          allRecordings={filtered}
          onNavigate={openWatch}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      </div>
    );
  }

  // ── Home / Gallery ─────────────────────────────────────────────────────
  return (
    <div style={{ background: 'var(--bg-primary)', minHeight: '100vh' }} className="flex flex-col">
      <Header search={search} onSearch={setSearch} theme={theme} onToggleTheme={toggleTheme} />

      <main className="flex-1 w-full max-w-[1800px] mx-auto px-3 sm:px-6 lg:px-10 pb-16 pt-6">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="space-y-3">
                <div className="skeleton w-full aspect-video" />
                <div className="skeleton h-5 w-4/5" />
                <div className="skeleton h-4 w-2/5" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32" style={{ color: 'var(--text-muted)' }}>
            <svg className="w-20 h-20 mb-5 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <p className="text-xl font-medium">No streams found</p>
            {search && <p className="text-sm mt-1 opacity-60">Try a different search term</p>}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-x-5 gap-y-10">
            {filtered.map(rec => (
              <StreamCard key={rec.videoId} rec={rec} onClick={() => openWatch(rec)} />
            ))}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
