import React, { useEffect, useState, useCallback, useRef } from 'react';
import { motion, Variants, useMotionValue, useSpring, useTransform, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Clock, HardDrive, Play, Search, SlidersHorizontal, AlertTriangle, RefreshCcw, LayoutGrid, List, X, Edit3 } from 'lucide-react';
import { fetchStreams, StreamData } from '../utils/dataFetcher';
import { AdminEditor, applyAdminOverrides } from '../components/AdminEditor';
import { useAuth } from '../contexts/AuthContext';

// ─── 3D Tilt Card Wrapper ────────────────────────────────────────
function TiltCard({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [6, -6]), { stiffness: 300, damping: 30 });
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-6, 6]), { stiffness: 300, damping: 30 });

  const handleMouse = useCallback((e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    x.set((e.clientX - rect.left) / rect.width - 0.5);
    y.set((e.clientY - rect.top) / rect.height - 0.5);
    // Set inner glow position
    el.style.setProperty('--glow-x', `${e.clientX - rect.left}px`);
    el.style.setProperty('--glow-y', `${e.clientY - rect.top}px`);
  }, [x, y]);

  const handleLeave = useCallback(() => {
    x.set(0);
    y.set(0);
  }, [x, y]);

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouse}
      onMouseLeave={handleLeave}
      style={{ rotateX, rotateY, transformPerspective: 800 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ─── Filter Chips ────────────────────────────────────────────────
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'long', label: 'Long (2h+)' },
  { key: 'short', label: 'Short (<1h)' },
  { key: 'archive', label: 'Has Archive' },
  { key: 'mega', label: 'Has MEGA' },
  { key: 'pixel', label: 'Has Pixeldrain' },
  { key: 'gofile', label: 'Has Gofile' },
] as const;

type FilterKey = typeof FILTERS[number]['key'];

export default function Gallery() {
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const [streams, setStreams] = useState<StreamData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  const [searchFocused, setSearchFocused] = useState(false);
  const [editingStream, setEditingStream] = useState<StreamData | null>(null);

  const loadStreams = () => {
    setLoading(true);
    setError(null);
    fetchStreams()
      .then(data => {
        setStreams(applyAdminOverrides(data));
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load recordings. Please check your connection and try again.');
        setLoading(false);
      });
  };

  useEffect(() => {
    loadStreams();
  }, []);

  // Filter and sort
  const filtered = streams
    .filter(s => {
      // Search filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!s.title.toLowerCase().includes(q) && !s.date.includes(q) && !s.videoId.includes(q)) return false;
      }
      // Category filter
      if (activeFilter === 'long') {
        const hMatch = s.duration?.match(/(\d+)h/);
        if (!hMatch || parseInt(hMatch[1]) < 2) return false;
      }
      if (activeFilter === 'short') {
        const hMatch = s.duration?.match(/(\d+)h/);
        if (hMatch && parseInt(hMatch[1]) >= 1) return false;
      }
      if (activeFilter === 'archive') {
        if (!s.sources.archive) return false;
      }
      if (activeFilter === 'mega') {
        if (!s.sources.mega) return false;
      }
      if (activeFilter === 'pixel') {
        if (!s.sources.pixel) return false;
      }
      if (activeFilter === 'gofile') {
        if (!s.sources.gofile) return false;
      }
      return true;
    })
    .sort((a, b) => {
      return sortOrder === 'newest'
        ? (b.date || '').localeCompare(a.date || '')
        : (a.date || '').localeCompare(b.date || '');
    });

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.06 }
    }
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 30, scale: 0.95 },
    show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>, stream: StreamData) => {
    const target = e.target as HTMLImageElement;
    if (stream.archiveId && !target.src.includes('archive.org')) {
      target.src = `https://archive.org/services/img/${stream.archiveId}`;
    } else if (!target.src.includes('thumbnail.jpg')) {
      target.src = `${import.meta.env.BASE_URL}thumbnail.jpg`;
    }
  };

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>, stream: StreamData) => {
    const target = e.target as HTMLImageElement;
    if (target.src.includes('ytimg.com') && target.naturalWidth <= 120) {
      handleImageError(e, stream);
    }
  };

  const sourceColors: Record<string, string> = {
    archive: 'bg-blue-500',
    mega: 'bg-red-500',
    pixel: 'bg-purple-500',
    gofile: 'bg-green-500',
    archiveSmall: 'bg-blue-400',
    odysee: 'bg-teal-500',
    rumble: 'bg-emerald-500',
  };

  const galleryContent = (
    <div className="max-w-7xl mx-auto px-4 py-8 relative">
      {/* Ambient glow effects */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-0 w-80 h-80 bg-indigo-500/8 rounded-full blur-3xl pointer-events-none" />

      {/* ── Header ─────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 relative z-10 overflow-hidden rounded-[2rem] border border-white/70 dark:border-white/10 bg-white/75 dark:bg-dark-900/55 p-6 md:p-8 shadow-2xl shadow-dark-900/5 dark:shadow-black/25 backdrop-blur-xl"
      >
        <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-brand-500/10 blur-3xl" />
        <div className="absolute -left-24 bottom-0 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-brand-500/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.22em] text-brand-500 border border-brand-500/20 mb-3">
              Archive Library
            </div>
            <h1 className="text-4xl md:text-5xl font-black font-display tracking-tight">
              Recordings <span className="text-gradient-animated">Gallery</span>
            </h1>
            <p className="text-dark-500 dark:text-dark-400 mt-2 text-sm md:text-base max-w-2xl">Browse preserved streams, debates, and lectures in a clean long-form viewing library.</p>
          </div>
          <motion.div
            key={filtered.length}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-sm text-dark-600 dark:text-dark-300 font-bold bg-white/80 dark:bg-dark-800/80 px-5 py-2.5 rounded-full border border-dark-200/80 dark:border-dark-700 shadow-sm"
          >
            {filtered.length} {filtered.length === 1 ? 'Recording' : 'Recordings'}
          </motion.div>
        </div>

        {/* ── Search & Controls ─────────────────────────────────────── */}
        <div className="relative flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <motion.div
              animate={{ flex: searchFocused ? 2 : 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="relative flex-1"
            >
              <Search size={18} className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors duration-300 ${searchFocused ? 'text-brand-500' : 'text-dark-400'}`} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                placeholder="Search by title, date, or video ID..."
                className={`w-full pl-11 pr-10 py-3 rounded-2xl bg-white/85 dark:bg-dark-800/85 border transition-all backdrop-blur-xl duration-300 text-sm placeholder-dark-400 focus:outline-none ${
                  searchFocused
                    ? 'border-brand-500/50 ring-2 ring-brand-500/20 shadow-lg shadow-brand-500/5'
                    : 'border-dark-200 dark:border-dark-700'
                }`}
              />
              <AnimatePresence>
                {searchQuery && (
                  <motion.button
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-dark-100 dark:hover:bg-dark-700 text-dark-400 hover:text-dark-600"
                  >
                    <X size={16} />
                  </motion.button>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Sort & View Toggle */}
            <div className="flex gap-2">
              <button
                onClick={() => setSortOrder(sortOrder === 'newest' ? 'oldest' : 'newest')}
                className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-white/85 dark:bg-dark-800/85 border border-dark-200 dark:border-dark-700 backdrop-blur-xl hover:border-brand-500/30 transition-all text-sm font-medium whitespace-nowrap"
              >
                <SlidersHorizontal size={16} />
                {sortOrder === 'newest' ? 'Newest' : 'Oldest'}
              </button>

              <div className="flex rounded-2xl overflow-hidden border border-dark-200 dark:border-dark-700">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-3 transition-colors ${viewMode === 'grid' ? 'bg-brand-500 text-white' : 'bg-white/85 dark:bg-dark-800/85 hover:bg-dark-100 dark:hover:bg-dark-700'}`}
                >
                  <LayoutGrid size={16} />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-3 transition-colors ${viewMode === 'list' ? 'bg-brand-500 text-white' : 'bg-white/85 dark:bg-dark-800/85 hover:bg-dark-100 dark:hover:bg-dark-700'}`}
                >
                  <List size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* Filter Chips */}
          <div className="flex flex-wrap gap-2">
            {FILTERS.map(f => (
              <motion.button
                key={f.key}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setActiveFilter(f.key)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-300 ${
                  activeFilter === f.key
                    ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/25'
                    : 'bg-dark-100 dark:bg-dark-800 text-dark-500 dark:text-dark-400 hover:bg-dark-200 dark:hover:bg-dark-700 border border-dark-200 dark:border-dark-700'
                }`}
              >
                {f.label}
              </motion.button>
            ))}
          </div>
        </div>
      </motion.div>

      {/* ── Error State ────────────────────────────────────────────── */}
      {error && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center justify-center py-20 text-center"
        >
          <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-6">
            <AlertTriangle size={36} className="text-red-500" />
          </div>
          <h3 className="text-xl font-bold mb-2">Something went wrong</h3>
          <p className="text-dark-500 mb-6 max-w-md">{error}</p>
          <button onClick={loadStreams} className="btn-primary flex items-center gap-2">
            <RefreshCcw size={16} /> Try Again
          </button>
        </motion.div>
      )}

      {/* ── Loading State ──────────────────────────────────────────── */}
      {loading && !error && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="animate-pulse flex flex-col gap-3">
              <div className="w-full aspect-video bg-dark-200 dark:bg-dark-800 rounded-2xl shimmer" />
              <div className="h-4 bg-dark-200 dark:bg-dark-800 rounded w-3/4 mt-2" />
              <div className="h-3 bg-dark-200 dark:bg-dark-800 rounded w-1/2" />
            </div>
          ))}
        </div>
      )}

      {/* ── Empty State ────────────────────────────────────────────── */}
      {!loading && !error && filtered.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-20 text-center"
        >
          <div className="w-20 h-20 rounded-full bg-dark-100 dark:bg-dark-800 flex items-center justify-center mb-6">
            <Search size={32} className="text-dark-300" />
          </div>
          <h3 className="text-xl font-bold mb-2">No recordings found</h3>
          <p className="text-dark-500">
            {searchQuery ? `No results for "${searchQuery}". Try a different search.` : 'No recordings available yet.'}
          </p>
          {(searchQuery || activeFilter !== 'all') && (
            <button
              onClick={() => { setSearchQuery(''); setActiveFilter('all'); }}
              className="btn-secondary mt-4"
            >
              Clear Filters
            </button>
          )}
        </motion.div>
      )}

      {/* ═══ GRID VIEW ═══════════════════════════════════════════════ */}
      {!loading && !error && filtered.length > 0 && viewMode === 'grid' && (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 md:gap-8 relative z-10"
        >
          {filtered.map((stream) => {
            const savedProgress = localStorage.getItem(`progress_${stream.videoId}`);
            const progressPercent = savedProgress ? Math.min(100, Math.max(0, parseFloat(savedProgress))) : 0;

            return (
              <motion.div variants={itemVariants} key={stream.videoId}>
                <TiltCard className="group flex flex-col gap-3">
                  <Link
                    to={`/watch/${stream.videoId}`}
                    state={{ stream }}
                    className="premium-link-card relative aspect-video rounded-2xl overflow-hidden bg-dark-900 shadow-xl shadow-dark-900/5 dark:shadow-black/25 border border-white/70 dark:border-dark-800 hover:border-brand-500/30 hover:shadow-2xl hover:shadow-brand-500/15 transition-all duration-500"
                  >
                    <div className="absolute inset-0 z-[1] bg-[radial-gradient(circle_at_var(--glow-x,50%)_var(--glow-y,50%),rgba(239,68,68,0.20),transparent_34%)] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <img
                      src={stream.thumbnail}
                      alt={stream.title}
                      onError={(e) => handleImageError(e, stream)}
                      onLoad={(e) => handleImageLoad(e, stream)}
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.15]"
                    />

                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                      <motion.div
                        initial={false}
                        whileHover={{ scale: 1.1 }}
                        className="w-14 h-14 rounded-full bg-brand-600/90 text-white flex items-center justify-center shadow-2xl transform scale-50 group-hover:scale-100 transition-all duration-500 ease-out backdrop-blur-md"
                      >
                        <Play fill="currentColor" size={28} className="ml-1" />
                      </motion.div>
                    </div>

                    {/* Duration badge */}
                    <div className="absolute bottom-3 right-3 bg-black/80 backdrop-blur-md text-white text-xs font-semibold px-2.5 py-1 rounded-lg border border-white/10 shadow-lg">
                      {stream.duration || 'Unknown'}
                    </div>

                    {/* Source availability dots (minimal, non-technical) */}
                    <div className="absolute top-3 left-3 z-20 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-300">
                      {Object.entries(stream.sources).slice(0, 4).map(([key, src]) => (
                        <div
                          key={key}
                          className={`h-2.5 w-2.5 rounded-full shadow-lg ring-2 ring-white/30 ${sourceColors[key] || 'bg-gray-500'}`}
                          title={src.label}
                        />
                      ))}
                    </div>

                    {/* Progress bar */}
                    {progressPercent > 0 && (
                      <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/50 backdrop-blur-sm">
                        <div
                          className="h-full bg-gradient-to-r from-brand-500 via-orange-500 to-yellow-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                    )}
                  </Link>

                  <div className="flex flex-col px-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-black text-[15px] leading-snug line-clamp-2 group-hover:text-brand-500 dark:group-hover:text-brand-400 transition-colors duration-300">
                        {stream.title}
                      </h3>
                      {isAdmin && (
                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditingStream(stream); }}
                          className="flex-shrink-0 p-1.5 rounded-lg hover:bg-brand-50 dark:hover:bg-brand-900/30 text-dark-400 hover:text-brand-500 transition-colors opacity-0 group-hover:opacity-100"
                          title="Edit details"
                        >
                          <Edit3 size={14} />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-2.5 text-xs text-dark-500 dark:text-dark-400 font-medium">
                      <span className="flex items-center gap-1.5 bg-dark-100 dark:bg-dark-800 px-2 py-1 rounded-md">
                        <Clock size={12} className="text-brand-500" /> {stream.date}
                      </span>
                      {stream.size && (
                        <span className="flex items-center gap-1.5 bg-dark-100 dark:bg-dark-800 px-2 py-1 rounded-md">
                          <HardDrive size={12} className="text-blue-500" /> {stream.size}
                        </span>
                      )}
                    </div>
                  </div>
                </TiltCard>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* ═══ LIST VIEW ═══════════════════════════════════════════════ */}
      {!loading && !error && filtered.length > 0 && viewMode === 'list' && (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="space-y-3 relative z-10"
        >
          {filtered.map((stream) => {
            const savedProgress = localStorage.getItem(`progress_${stream.videoId}`);
            const progressPercent = savedProgress ? Math.min(100, Math.max(0, parseFloat(savedProgress))) : 0;

            return (
              <motion.div variants={itemVariants} key={stream.videoId}>
                <Link
                  to={`/watch/${stream.videoId}`}
                  state={{ stream }}
                  className="flex gap-4 p-3 rounded-2xl glass-panel border border-dark-200 dark:border-dark-800 hover:border-brand-500/30 hover:shadow-lg hover:shadow-brand-500/5 transition-all duration-300 group"
                >
                  {/* Thumbnail */}
                  <div className="relative w-40 md:w-48 flex-shrink-0 aspect-video rounded-xl overflow-hidden bg-dark-900">
                    <img
                      src={stream.thumbnail}
                      alt={stream.title}
                      onError={(e) => handleImageError(e, stream)}
                      onLoad={(e) => handleImageLoad(e, stream)}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-md">
                      {stream.duration || '?'}
                    </div>
                    {progressPercent > 0 && (
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50">
                        <div className="h-full bg-gradient-to-r from-brand-500 to-orange-500" style={{ width: `${progressPercent}%` }} />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 py-1">
                    <h3 className="font-bold text-base truncate group-hover:text-brand-500 transition-colors">{stream.title}</h3>
                    <div className="flex items-center gap-4 mt-2 text-xs text-dark-500 dark:text-dark-400 font-medium">
                      <span className="flex items-center gap-1"><Clock size={12} /> {stream.date}</span>
                      {stream.size && <span className="flex items-center gap-1"><HardDrive size={12} /> {stream.size}</span>}
                    </div>
                    {/* Source badges */}
                    <div className="flex gap-1.5 mt-3">
                      {Object.entries(stream.sources).map(([key, src]) => (
                        <span
                          key={key}
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold text-white ${sourceColors[key] || 'bg-gray-500'}`}
                        >
                          {src.label.replace(/[^\w\s.]/g, '').trim()}
                        </span>
                      ))}
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );

  return (
    <>
      {galleryContent}

      {/* Admin Editor Modal */}
      {editingStream && (
        <AdminEditor
          stream={editingStream}
          isOpen={!!editingStream}
          onClose={() => setEditingStream(null)}
          onSave={(updated) => {
            setStreams(prev => prev.map(s => s.videoId === updated.videoId ? updated : s));
          }}
        />
      )}
    </>
  );
}
