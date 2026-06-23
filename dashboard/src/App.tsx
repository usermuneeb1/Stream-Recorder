import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchRecordings, type Recording } from './utils/dataFetcher';
import { initAnalytics, track } from './utils/analytics';
import { Header } from './components/Header';
import { SlimHero } from './components/SlimHero';
import { ContinueWatching } from './components/ContinueWatching';
import { FilterBar, type SortKey, type FilterKey } from './components/FilterBar';
import { StreamCard } from './components/StreamCard';
import { WatchPage } from './components/WatchPage';
import { NotFoundPage } from './components/NotFoundPage';
import { Footer } from './components/Footer';
import { BottomStats } from './components/BottomStats';
import { Toast } from './components/Toast';
import { CommandPalette } from './components/CommandPalette';

type Route =
  | { kind: 'home' }
  | { kind: 'watch'; rec: Recording }
  | { kind: 'watch-pending'; id: string }   // FIX #27 — waiting for data to resolve a deep link
  | { kind: 'notfound' };

// FIX #27 — derive the initial route from the URL synchronously so a hard-refresh
// on /#/watch/<id> doesn't render the home page for ~500ms while data loads.
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
  // FIX #25 — debounced copy of `q` used by the heavy filter+sort useMemo.
  // The input UI updates instantly (controlled by `q`); the expensive
  // recomputation runs ~150ms after the user stops typing.
  const [qDebounced, setQDebounced] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setQDebounced(q), 150);
    return () => clearTimeout(id);
  }, [q]);
  const [route, setRoute] = useState<Route>(initialRoute);
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    typeof window !== 'undefined' ? ((localStorage.getItem('t') as 'dark' | 'light') || 'dark') : 'dark',
  );
  const [sort, setSort] = useState<SortKey>(() => (localStorage.getItem('sort') as SortKey) || 'newest');
  const [filter, setFilter] = useState<FilterKey>(() => {
    // Migration: chapters/guests filters were removed; reset to 'all' so
    // users who had them selected don't end up seeing zero recordings.
    const stored = localStorage.getItem('filter') as string | null;
    return stored === 'all' || stored === 'hd' ? (stored as FilterKey) : 'all';
  });
  const [view, setView] = useState<'grid' | 'list'>(() => (localStorage.getItem('view') as 'grid' | 'list') || 'grid');
  const [toast, setToast] = useState('');
  const [cmdOpen, setCmdOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 600);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Theme persistence
  useEffect(() => {
    document.documentElement.className = theme === 'light' ? 'light' : '';
    localStorage.setItem('t', theme);
  }, [theme]);
  useEffect(() => { localStorage.setItem('sort', sort); }, [sort]);
  useEffect(() => { localStorage.setItem('filter', filter); }, [filter]);
  useEffect(() => { localStorage.setItem('view', view); }, [view]);

  // Analytics
  useEffect(() => { initAnalytics(); }, []);

  // FEATURE: First-visit hint nudges the user to the ⌘K command palette.
  // Shown exactly once per browser (localStorage flag).
  useEffect(() => {
    const FLAG = 'mla_seen_cmdk_hint_v1';
    if (localStorage.getItem(FLAG)) return;
    const id = window.setTimeout(() => {
      setToast('💡 Tip — press ⌘K (or Ctrl+K) for the command palette');
      localStorage.setItem(FLAG, '1');
    }, 4000);
    return () => clearTimeout(id);
  }, []);

  // Load data
  useEffect(() => {
    fetchRecordings().then(r => { setRecs(r); setLoading(false); });
  }, []);

  // Route handling
  useEffect(() => {
    const sync = () => {
      const h = window.location.hash || '';
      const m = h.match(/^#\/watch\/([^?]+)/);
      if (m) {
        const id = decodeURIComponent(m[1]);
        if (!recs.length) {
          // FIX #27 — show pending screen instead of flashing home while we wait
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

  // Global ⌘K / Ctrl+K
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
    window.location.hash = `/watch/${encodeURIComponent(r.videoId)}`;
    window.scrollTo(0, 0);
    track('watch', { id: r.videoId });
  }, []);

  const goHome = useCallback(() => { window.location.hash = ''; }, []);
  const toggleTheme = useCallback(() => setTheme(t => t === 'dark' ? 'light' : 'dark'), []);

  // Apply search + filter + sort (debounced query — see FIX #25)
  const filtered = useMemo(() => {
    let xs = recs;
    if (qDebounced.trim()) {
      const s = qDebounced.toLowerCase();
      xs = xs.filter(r =>
        r.title.toLowerCase().includes(s)
        || r.date.includes(s));
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

  // ── Render by route ─────────────────────────────────────────────────────
  if (route.kind === 'notfound') {
    return <NotFoundPage onHome={goHome} />;
  }
  if (route.kind === 'watch-pending') {
    // FIX #27 — black holding screen so deep-link refresh doesn't flash home.
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#000' }}>
        <div className="flex flex-col items-center">
          <div className="w-10 h-10 mb-3 rounded-full border-2 border-transparent animate-spin"
               style={{ borderTopColor: 'var(--red)' }} />
          <p className="text-white/60 text-[13px] font-medium tracking-wide">Loading recording</p>
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

  // ── Home ────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: 'var(--bg)' }} className="min-h-screen flex flex-col">
      {loading && <div className="top-bar" />}
      <Header
        q={q}
        setQ={setQ}
        theme={theme}
        toggleTheme={toggleTheme}
        onOpenCmd={() => setCmdOpen(true)}
        recordingsCount={recs.length}
      />

      <main className="flex-1 max-w-[1400px] w-full mx-auto px-4 sm:px-6 lg:px-10 pt-6 sm:pt-8 pb-12">
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
          <div className="flex flex-col items-center py-24 opacity-60 text-center px-6">
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
              <StreamCard key={r.videoId} rec={r} onClick={() => open(r)} delay={i * 30} view="list" onToast={setToast} featured={i === 0 && sort === 'newest' && !qDebounced.trim() && filter === 'all'} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-8">
            {filtered.map((r, i) => (
              <StreamCard key={r.videoId} rec={r} onClick={() => open(r)} delay={i * 40} view="grid" onToast={setToast} featured={i === 0 && sort === 'newest' && !qDebounced.trim() && filter === 'all'} />
            ))}
          </div>
        )}

        {/* Bottom-of-home archive stats (sits inside <main> so it follows
            the same max-width / padding as the recordings grid) */}
        {!loading && recs.length > 0 && (
          <BottomStats recs={recs} />
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
      {scrolled && (
        <button
          className="fab pop-in"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Back to top"
          title="Back to top"
        >
          <svg className="w-5 h-5 m-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
          </svg>
        </button>
      )}
    </div>
  );
}
