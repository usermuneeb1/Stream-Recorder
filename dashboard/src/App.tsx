import { useState, useEffect, useCallback } from 'react';
import { fetchRecordings, fetchStats, type Recording, type Stats } from './utils/dataFetcher';
import { Header } from './components/Header';
import { StreamCard } from './components/StreamCard';
import { WatchModal } from './components/WatchModal';
import { Footer } from './components/Footer';
import { StatsBar } from './components/StatsBar';

export default function App() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [stats, setStats] = useState<Stats>({ totalStreams: 0, totalHours: 0, totalGb: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeVideo, setActiveVideo] = useState<Recording | null>(null);

  useEffect(() => {
    Promise.all([fetchRecordings(), fetchStats()]).then(([recs, st]) => {
      setRecordings(recs);
      setStats({ ...st, totalStreams: recs.length || st.totalStreams });
      setLoading(false);
    });
  }, []);

  // Handle hash-based routing for direct watch links
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash;
      const watchMatch = hash.match(/^#\/watch\/(.+)$/);
      if (watchMatch && recordings.length) {
        const id = decodeURIComponent(watchMatch[1]);
        const rec = recordings.find(r => r.videoId === id);
        if (rec) setActiveVideo(rec);
      }
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, [recordings]);

  const openWatch = useCallback((rec: Recording) => {
    setActiveVideo(rec);
    window.location.hash = `/watch/${rec.videoId}`;
  }, []);

  const closeWatch = useCallback(() => {
    setActiveVideo(null);
    window.location.hash = '';
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

  return (
    <div className="min-h-screen bg-[#0f0f0f] flex flex-col">
      <Header search={search} onSearch={setSearch} />
      <StatsBar stats={stats} loading={loading} />

      {/* ── Stream Grid ──────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-[1400px] mx-auto w-full px-4 sm:px-6 pb-12">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="space-y-3">
                <div className="skeleton w-full aspect-video rounded-xl" />
                <div className="skeleton h-4 w-3/4 rounded" />
                <div className="skeleton h-3 w-1/2 rounded" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-[#717171]">
            <svg className="w-16 h-16 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <p className="text-lg">No streams found{search ? ` for "${search}"` : ''}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-8 mt-6">
            {filtered.map(rec => (
              <StreamCard key={rec.videoId} rec={rec} onClick={() => openWatch(rec)} />
            ))}
          </div>
        )}
      </main>

      <Footer />

      {/* ── Watch Modal ──────────────────────────────────────────────────── */}
      {activeVideo && (
        <WatchModal rec={activeVideo} onClose={closeWatch} allRecordings={filtered} onNavigate={openWatch} />
      )}
    </div>
  );
}
