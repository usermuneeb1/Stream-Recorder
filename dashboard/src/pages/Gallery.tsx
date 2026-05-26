import React, { useEffect, useState } from 'react';
import { motion, Variants } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Clock, HardDrive, Play, Search, SlidersHorizontal, AlertTriangle, RefreshCcw } from 'lucide-react';
import { fetchStreams, StreamData } from '../utils/dataFetcher';

export default function Gallery() {
  const [streams, setStreams] = useState<StreamData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  const loadStreams = () => {
    setLoading(true);
    setError(null);
    fetchStreams()
      .then(data => {
        setStreams(data);
        setLoading(false);
      })
      .catch(err => {
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
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return s.title.toLowerCase().includes(q) || s.date.includes(q) || s.videoId.includes(q);
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
      transition: { staggerChildren: 0.08 }
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

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 relative">
      {/* Ambient glow effects */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-0 w-80 h-80 bg-indigo-500/8 rounded-full blur-3xl pointer-events-none" />
      
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 relative z-10"
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <h1 className="text-4xl md:text-5xl font-bold font-display tracking-tight">Recordings Gallery</h1>
          <div className="text-sm text-dark-500 font-medium bg-dark-100 dark:bg-dark-800 px-4 py-2 rounded-xl border border-dark-200 dark:border-dark-700 shadow-sm">
            {filtered.length} {filtered.length === 1 ? 'Video' : 'Videos'}
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-dark-400" />
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title, date, or video ID..."
              className="w-full pl-11 pr-4 py-3 rounded-xl bg-white dark:bg-dark-800 border border-dark-200 dark:border-dark-700 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all text-sm placeholder-dark-400"
            />
          </div>
          <button 
            onClick={() => setSortOrder(sortOrder === 'newest' ? 'oldest' : 'newest')}
            className="flex items-center gap-2 px-5 py-3 rounded-xl bg-white dark:bg-dark-800 border border-dark-200 dark:border-dark-700 hover:border-brand-500/50 transition-all text-sm font-medium whitespace-nowrap"
          >
            <SlidersHorizontal size={16} />
            {sortOrder === 'newest' ? 'Newest First' : 'Oldest First'}
          </button>
        </div>
      </motion.div>

      {/* Error State */}
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

      {/* Loading State */}
      {loading && !error && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="animate-pulse flex flex-col gap-3">
              <div className="w-full aspect-video bg-dark-200 dark:bg-dark-800 rounded-2xl shimmer"></div>
              <div className="h-4 bg-dark-200 dark:bg-dark-800 rounded w-3/4 mt-2"></div>
              <div className="h-3 bg-dark-200 dark:bg-dark-800 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && filtered.length === 0 && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-20 text-center"
        >
          <Search size={48} className="text-dark-300 mb-4" />
          <h3 className="text-xl font-bold mb-2">No recordings found</h3>
          <p className="text-dark-500">
            {searchQuery ? `No results for "${searchQuery}". Try a different search.` : 'No recordings available yet.'}
          </p>
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="btn-secondary mt-4">Clear Search</button>
          )}
        </motion.div>
      )}

      {/* Grid */}
      {!loading && !error && filtered.length > 0 && (
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 relative z-10"
        >
          {filtered.map((stream) => {
            const savedProgress = localStorage.getItem(`progress_${stream.videoId}`);
            const progressPercent = savedProgress ? Math.min(100, Math.max(0, parseFloat(savedProgress))) : 0;

            return (
              <motion.div
                variants={itemVariants}
                key={stream.videoId}
                className="group flex flex-col gap-3"
              >
                <Link to={`/watch/${stream.videoId}`} state={{ stream }} className="relative aspect-video rounded-2xl overflow-hidden bg-dark-900 shadow-lg border border-dark-200 dark:border-dark-800 hover:shadow-2xl hover:shadow-brand-500/10 transition-shadow duration-500">
                  <img 
                    src={stream.thumbnail} 
                    alt={stream.title}
                    onError={(e) => handleImageError(e, stream)}
                    onLoad={(e) => handleImageLoad(e, stream)}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                    <div className="w-14 h-14 rounded-full bg-brand-600/90 text-white flex items-center justify-center shadow-2xl transform scale-50 group-hover:scale-100 transition-all duration-500 ease-out backdrop-blur-md">
                      <Play fill="currentColor" size={28} className="ml-1" />
                    </div>
                  </div>
                  <div className="absolute bottom-3 right-3 bg-black/80 backdrop-blur-md text-white text-xs font-semibold px-2 py-1 rounded-lg border border-white/10 shadow-lg">
                    {stream.duration || 'Unknown'}
                  </div>
                  
                  {/* Source badges */}
                  <div className="absolute top-3 left-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    {Object.keys(stream.sources).slice(0, 3).map(key => (
                      <div key={key} className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.6)]" title={stream.sources[key].label} />
                    ))}
                  </div>
                  
                  {progressPercent > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/50 backdrop-blur-sm">
                      <div className="h-full bg-brand-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]" style={{ width: `${progressPercent}%` }} />
                    </div>
                  )}
                </Link>

                <div className="flex flex-col px-1">
                  <h3 className="font-bold text-lg line-clamp-2 leading-tight group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors duration-300">
                    {stream.title}
                  </h3>
                  <div className="flex items-center gap-4 mt-3 text-sm text-dark-500 dark:text-dark-400 font-medium">
                    <span className="flex items-center gap-1.5 bg-dark-100 dark:bg-dark-800 px-2 py-1 rounded-md"><Clock size={14} className="text-brand-500" /> {stream.date}</span>
                    {stream.size && <span className="flex items-center gap-1.5 bg-dark-100 dark:bg-dark-800 px-2 py-1 rounded-md"><HardDrive size={14} className="text-blue-500" /> {stream.size}</span>}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
