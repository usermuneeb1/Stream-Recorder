import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchRecordings, type Recording } from './utils/dataFetcher';
import { initAnalytics, track } from './utils/analytics';
import { Header } from './components/Header';
import { FeaturedStream } from './components/FeaturedStream';
import { SlimHero } from './components/SlimHero';
import { ContinueWatching } from './components/ContinueWatching';
import { FilterBar, type SortKey, type FilterKey } from './components/FilterBar';
import { StreamCard } from './components/StreamCard';
import { WatchPage } from './components/WatchPage';
import { NotFoundPage } from './components/NotFoundPage';
import { Footer } from './components/Footer';
import { Toast } from './components/Toast';
import { CommandPalette } from './components/CommandPalette';

type Route =
  | { kind: 'home' }
  | { kind: 'watch'; rec: Recording }
  | { kind: 'watch-pending'; id: string }
  | { kind: 'notfound' };

function initialRoute(): Route {
  if (typeof window === 'undefined') return { kind: 'home' };
  const m = (window.location.hash || '').match(/^#\/watch\/([^?]+)/);
  if (m) return { kind: 'watch-pending', id: decodeURIComponent(m[1]) };
  return { kind: 'home' };
}

export default function App() {
  const [recs, setRecs] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setQDebounced(q), 150);
    return () => clearTimeout(id);
  }, [q]);
  const [route, setRoute] = useState<Route>(initialRoute);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [sort, setSort] = useState<SortKey>('newest');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [toast, setToast] = useState('');
  const [cmdOpen, setCmdOpen] = useState(false);

  useEffect(() => {
    initAnalytics();
    fetchRecordings().then(r => { setRecs(r); setLoading(false); });
  }, []);

  useEffect(() => {
    const sync = () => {
      const h = window.location.hash || '';
      const m = h.match(/^#\/watch\/([^?]+)/);
      if (m) {
        const id = decodeURIComponent(m[1]);
        if (!recs.length) {
          setRoute({ kind: 'watch-pending', id });
          return;
        }
        const r = recs.find(x => x.videoId === id);
        setRoute(r ? { kind: 'watch', rec: r } : { kind: 'notfound' });
        return;
      }
      setRoute({ kind: 'home' });
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [recs]);

  const open = useCallback((r: Recording) => {
    window.location.hash = `/watch/${encodeURIComponent(r.videoId)}`;
    window.scrollTo(0, 0);
    track('watch', { id: r.videoId });
  }, []);

  const goHome = useCallback(() => { window.location.hash = ''; }, []);
  const toggleTheme = useCallback(() => setTheme(t => t === 'dark' ? 'light' : 'dark'), []);

  const filtered = useMemo(() => {
    let xs = recs;
    if (qDebounced.trim()) {
      const s = qDebounced.toLowerCase();
      xs = xs.filter(r => r.title.toLowerCase().includes(s) || r.date.includes(s));
    }
    if (filter === 'hd') xs = xs.filter(r => /1080|1440|2160|4k/i.test(r.resolution));
    xs = [...xs];
    switch (sort) {
      case 'oldest':   xs.sort((a, b) => a.date.localeCompare(b.date)); break;
      case 'longest':  xs.sort((a, b) => b.durationSec - a.durationSec); break;
      case 'shortest': xs.sort((a, b) => a.durationSec - b.durationSec); break;
      case 'largest':  xs.sort((a, b) => b.sizeGb - a.sizeGb); break;
      default:         xs.sort((a, b) => b.date.localeCompare(a.date)); break;
    }
    return xs;
  }, [recs, qDebounced, filter, sort]);

  if (route.kind === 'notfound') {
    return <NotFoundPage onHome={goHome} />;
  }
  if (route.kind === 'watch-pending') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <div className="flex flex-col items-center">
          <img src="/logo-vertical.pn.jpg" alt="" className="w-16 h-16 rounded-xl mb-4 animate-pulse" />
          <p className="font-display text-lg" style={{ color: 'var(--gold-primary)' }}>Loading Recording</p>
        </div>
      </div>
    );
  }
  if (route.kind === 'watch') {
    return (
      <>
        <WatchPage
          rec={route.rec}
          onClose={goHome}
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
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-primary)' }}>
      {loading && <div className="fixed top-0 left-0 right-0 h-1 z-50" style={{ background: 'var(--gradient-gold)', animation: 'shimmer 2s infinite' }} />}
      
      <Header
        q={q}
        setQ={setQ}
        theme={theme}
        toggleTheme={toggleTheme}
        onOpenCmd={() => setCmdOpen(true)}
        recordingsCount={recs.length}
      />

      <main className="flex-1 max-w-[1400px] w-full mx-auto px-4 sm:px-6 lg:px-10 pt-8 pb-12">
        <FeaturedStream recs={recs} onOpen={open} />
        <SlimHero recs={recs} />
        {!q.trim() && filter === 'all' && <ContinueWatching recs={recs} onOpen={open} />}
        
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="card-premium">
                <div className="aspect-video w-full" style={{ background: 'var(--bg-elevated)' }} />
                <div className="p-4 space-y-2">
                  <div className="h-4 rounded" style={{ background: 'var(--bg-elevated)' }} />
                  <div className="h-3 w-2/3 rounded" style={{ background: 'var(--bg-elevated)' }} />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-24 text-center">
            <p className="font-display text-xl mb-2" style={{ color: 'var(--text-secondary)' }}>No recordings found</p>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Try adjusting your search or filters</p>
          </div>
        ) : view === 'list' ? (
          <div className="space-y-4">
            {filtered.map((r, i) => (
              <StreamCard key={r.videoId} rec={r} onClick={() => open(r)} delay={i * 50} view="list" onToast={setToast} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((r, i) => (
              <StreamCard key={r.videoId} rec={r} onClick={() => open(r)} delay={i * 50} view="grid" onToast={setToast} featured={i === 0 && sort === 'newest'} />
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
