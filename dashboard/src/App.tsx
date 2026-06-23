import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchRecordings, type Recording } from './utils/dataFetcher';
import { Header } from './components/Header';
import { StatsBar } from './components/StatsBar';
import { FilterBar, type SortKey, type FilterKey } from './components/FilterBar';
import { StreamCard } from './components/StreamCard';
import { WatchPage } from './components/WatchPage';
import { Footer } from './components/Footer';
import { Toast } from './components/Toast';
import { CommandPalette } from './components/CommandPalette';

export default function App() {
  const [recs, setRecs] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [active, setActive] = useState<Recording | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') return 'dark';
    return (localStorage.getItem('t') as 'dark' | 'light') || 'dark';
  });
  const [sort, setSort] = useState<SortKey>(() => (localStorage.getItem('sort') as SortKey) || 'newest');
  const [filter, setFilter] = useState<FilterKey>(() => (localStorage.getItem('filter') as FilterKey) || 'all');
  const [view, setView] = useState<'grid' | 'list'>(() => (localStorage.getItem('view') as 'grid' | 'list') || 'grid');
  const [toast, setToast] = useState('');
  const [cmdOpen, setCmdOpen] = useState(false);

  // Theme persistence
  useEffect(() => {
    document.documentElement.className = theme === 'light' ? 'light' : '';
    localStorage.setItem('t', theme);
  }, [theme]);

  useEffect(() => { localStorage.setItem('sort', sort); }, [sort]);
  useEffect(() => { localStorage.setItem('filter', filter); }, [filter]);
  useEffect(() => { localStorage.setItem('view', view); }, [view]);

  // Load
  useEffect(() => {
    fetchRecordings().then(r => { setRecs(r); setLoading(false); });
  }, []);

  // Route handling (#/watch/<videoId>[?t=N])
  useEffect(() => {
    const h = () => {
      const m = window.location.hash.match(/^#\/watch\/([^?]+)/);
      if (m && recs.length) {
        const id = decodeURIComponent(m[1]);
        const r = recs.find(x => x.videoId === id);
        if (r) { setActive(r); return; }
      }
      if (!window.location.hash || window.location.hash === '#') setActive(null);
    };
    h();
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, [recs]);

  // Global Cmd/Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen(o => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const open = useCallback((r: Recording) => {
    setActive(r);
    window.location.hash = `/watch/${encodeURIComponent(r.videoId)}`;
    window.scrollTo(0, 0);
  }, []);

  const close = useCallback(() => { setActive(null); window.location.hash = ''; }, []);
  const toggleTheme = useCallback(() => setTheme(t => t === 'dark' ? 'light' : 'dark'), []);

  // Apply search + filter + sort
  const filtered = useMemo(() => {
    let xs = recs;
    if (q.trim()) {
      const s = q.toLowerCase();
      xs = xs.filter(r =>
        r.title.toLowerCase().includes(s)
        || r.date.includes(s)
        || (r.aiChapters || []).some(c => c.label.toLowerCase().includes(s)));
    }
    if (filter === 'chapters') xs = xs.filter(r => r.aiChapters?.length > 0);
    if (filter === 'guests')   xs = xs.filter(r => (r.aiChapters || []).some(c => c.label.toLowerCase().includes('joins')));
    if (filter === 'hd')       xs = xs.filter(r => /1080|1440|2160|4k/i.test(r.resolution));
    xs = [...xs];
    switch (sort) {
      case 'oldest':   xs.sort((a, b) => a.date.localeCompare(b.date)); break;
      case 'longest':  xs.sort((a, b) => b.durationSec - a.durationSec); break;
      case 'shortest': xs.sort((a, b) => a.durationSec - b.durationSec); break;
      case 'largest':  xs.sort((a, b) => b.sizeGb - a.sizeGb); break;
      default:         xs.sort((a, b) => b.date.localeCompare(a.date)); break;
    }
    return xs;
  }, [recs, q, filter, sort]);

  if (active) {
    return (
      <>
        <WatchPage
          rec={active}
          onClose={close}
          all={filtered.length ? filtered : recs}
          onNav={open}
          theme={theme}
          onTheme={toggleTheme}
          onToast={setToast}
        />
        <Toast msg={toast} onDone={() => setToast('')} />
      </>
    );
  }

  return (
    <div style={{ background: 'var(--bg)' }} className="min-h-screen flex flex-col">
      <Header
        q={q}
        setQ={setQ}
        theme={theme}
        toggleTheme={toggleTheme}
        onOpenCmd={() => setCmdOpen(true)}
        recordingsCount={recs.length}
      />

      <main className="flex-1 max-w-[1400px] w-full mx-auto px-4 sm:px-6 lg:px-10 pt-6 sm:pt-8 pb-12">
        <StatsBar recs={recs} />
        <FilterBar
          sort={sort}
          setSort={setSort}
          filter={filter}
          setFilter={setFilter}
          view={view}
          setView={setView}
          total={recs.length}
          shown={filtered.length}
        />

        {loading ? (
          <div className={view === 'list'
              ? 'space-y-3'
              : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-8'}>
            {[...Array(6)].map((_, i) => (
              <div key={i}>
                <div className="skel aspect-video w-full" />
                <div className="skel h-4 w-3/4 mt-3" />
                <div className="skel h-3 w-1/2 mt-2" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-24 opacity-50 text-center px-6">
            <svg className="w-12 h-12 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <p className="font-display text-lg font-semibold mb-1">Nothing matches</p>
            <p className="text-sm" style={{ color: 'var(--tx3)' }}>
              {q ? `No recordings for "${q}"` : 'No recordings match this filter'}
            </p>
            <button onClick={() => { setQ(''); setFilter('all'); }} className="btn mt-4">Clear filters</button>
          </div>
        ) : view === 'list' ? (
          <div className="space-y-3">
            {filtered.map((r, i) => (
              <StreamCard key={r.videoId} rec={r} onClick={() => open(r)} delay={i * 30} view="list" onToast={setToast} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-8">
            {filtered.map((r, i) => (
              <StreamCard key={r.videoId} rec={r} onClick={() => open(r)} delay={i * 40} view="grid" onToast={setToast} />
            ))}
          </div>
        )}
      </main>

      <Footer />

      <CommandPalette
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        recs={recs}
        onOpenRec={open}
        toggleTheme={toggleTheme}
      />
      <Toast msg={toast} onDone={() => setToast('')} />
    </div>
  );
}
