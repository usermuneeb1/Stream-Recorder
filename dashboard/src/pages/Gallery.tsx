import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
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

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold font-display">Recordings Gallery</h1>
        <div className="text-sm text-dark-500 font-medium bg-dark-100 dark:bg-dark-800 px-3 py-1 rounded-full">
          {streams.length} Videos
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="animate-pulse flex flex-col gap-3">
              <div className="w-full aspect-video bg-dark-200 dark:bg-dark-800 rounded-xl"></div>
              <div className="h-4 bg-dark-200 dark:bg-dark-800 rounded w-3/4"></div>
              <div className="h-3 bg-dark-200 dark:bg-dark-800 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {streams.map((stream, i) => {
            // Check for saved progress
            const savedProgress = localStorage.getItem(`progress_${stream.videoId}`);
            const progressPercent = savedProgress ? Math.min(100, Math.max(0, parseFloat(savedProgress))) : 0;

            return (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.05, 0.5) }}
                key={stream.videoId}
                className="group flex flex-col gap-3"
              >
                <Link to={`/watch/${stream.videoId}`} state={{ stream }} className="relative aspect-video rounded-xl overflow-hidden bg-dark-900 shadow-md">
                  <img 
                    src={stream.thumbnail} 
                    alt={stream.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                    <div className="w-12 h-12 rounded-full bg-brand-600/90 text-white flex items-center justify-center shadow-lg transform scale-75 group-hover:scale-100 transition-all duration-300">
                      <Play fill="currentColor" size={24} className="ml-1" />
                    </div>
                  </div>
                  <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs font-medium px-1.5 py-0.5 rounded">
                    {stream.duration || 'Unknown'}
                  </div>
                  
                  {/* Progress Bar */}
                  {progressPercent > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/30">
                      <div className="h-full bg-brand-600" style={{ width: `${progressPercent}%` }} />
                    </div>
                  )}
                </Link>

                <div className="flex flex-col">
                  <h3 className="font-semibold text-base line-clamp-2 leading-tight group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                    {stream.title}
                  </h3>
                  <div className="flex items-center gap-3 mt-2 text-xs text-dark-500 dark:text-dark-400">
                    <span className="flex items-center gap-1"><Clock size={14} /> {stream.date}</span>
                    {stream.size && <span className="flex items-center gap-1"><HardDrive size={14} /> {stream.size}</span>}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
