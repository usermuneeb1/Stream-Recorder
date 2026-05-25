import React, { useEffect, useState } from 'react';
import { motion, Variants } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Clock, HardDrive, Play } from 'lucide-react';
import { fetchStreams, StreamData } from '../utils/dataFetcher';

export default function Gallery() {
  const [streams, setStreams] = useState<StreamData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStreams().then(data => {
      setStreams(data);
      setLoading(false);
    });
  }, []);

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
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
      // Use the standard Muslim Lantern Q&A thumbnail as the ultimate fallback
      target.src = '/thumbnail.jpg';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 relative">
      <div className="absolute top-0 right-0 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />
      
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-12 flex items-center justify-between relative z-10"
      >
        <h1 className="text-4xl md:text-5xl font-bold font-display tracking-tight">Recordings Gallery</h1>
        <div className="text-sm text-dark-500 font-medium bg-dark-100 dark:bg-dark-800 px-4 py-2 rounded-xl border border-dark-200 dark:border-dark-700 shadow-sm">
          {streams.length} Videos
        </div>
      </motion.div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="animate-pulse flex flex-col gap-3">
              <div className="w-full aspect-video bg-dark-200 dark:bg-dark-800 rounded-2xl"></div>
              <div className="h-4 bg-dark-200 dark:bg-dark-800 rounded w-3/4 mt-2"></div>
              <div className="h-3 bg-dark-200 dark:bg-dark-800 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      ) : (
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 relative z-10"
        >
          {streams.map((stream) => {
            // Check for saved progress
            const savedProgress = localStorage.getItem(`progress_${stream.videoId}`);
            const progressPercent = savedProgress ? Math.min(100, Math.max(0, parseFloat(savedProgress))) : 0;

            return (
              <motion.div
                variants={itemVariants}
                key={stream.videoId}
                className="group flex flex-col gap-3"
              >
                <Link to={`/watch/${stream.videoId}`} state={{ stream }} className="relative aspect-video rounded-2xl overflow-hidden bg-dark-900 shadow-lg border border-dark-200 dark:border-dark-800">
                  <img 
                    src={stream.thumbnail} 
                    alt={stream.title}
                    onError={(e) => handleImageError(e, stream)}
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
                  
                  {/* Progress Bar */}
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
