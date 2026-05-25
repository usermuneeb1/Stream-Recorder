import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Command, Home, LayoutGrid, Terminal, Video, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fetchStreams } from '../utils/dataFetcher';

export const CommandPalette: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [streams, setStreams] = useState<any[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchStreams().then(setStreams);
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery('');
    }
  }, [isOpen]);

  const filteredStreams = query 
    ? streams.filter(s => s.title.toLowerCase().includes(query.toLowerCase()) || s.video_id.includes(query))
    : [];

  const handleNavigate = (path: string) => {
    navigate(path);
    setIsOpen(false);
  };

  return (
    <>
      {/* Keyboard Shortcut Hint for Desktop */}
      <div className="fixed bottom-6 right-6 hidden md:flex items-center gap-2 px-4 py-2 glass-panel rounded-full text-xs text-dark-500 z-40 border border-dark-200 dark:border-dark-800 shadow-xl cursor-pointer hover:bg-dark-100 dark:hover:bg-dark-800 transition-colors" onClick={() => setIsOpen(true)}>
        <Search size={14} />
        <span>Search</span>
        <div className="flex gap-1 ml-2">
          <kbd className="px-1.5 py-0.5 bg-dark-200 dark:bg-dark-700 rounded text-dark-900 dark:text-dark-50 font-mono">⌘</kbd>
          <kbd className="px-1.5 py-0.5 bg-dark-200 dark:bg-dark-700 rounded text-dark-900 dark:text-dark-50 font-mono">K</kbd>
        </div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
              onClick={() => setIsOpen(false)}
            />
            
            <div className="fixed inset-0 z-[101] flex items-start justify-center pt-24 px-4 pointer-events-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -20 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="w-full max-w-2xl bg-white dark:bg-dark-900 rounded-2xl shadow-2xl overflow-hidden border border-dark-200 dark:border-dark-800 pointer-events-auto"
              >
                <div className="flex items-center px-4 py-4 border-b border-dark-200 dark:border-dark-800">
                  <Search className="text-dark-400 mr-3" size={20} />
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search streams or navigate..."
                    className="flex-1 bg-transparent border-none outline-none text-lg text-dark-900 dark:text-dark-50 placeholder-dark-400"
                  />
                  <div className="flex items-center gap-1 text-xs text-dark-400">
                    <kbd className="px-1.5 py-0.5 bg-dark-100 dark:bg-dark-800 rounded">ESC</kbd>
                    <span>to close</span>
                  </div>
                </div>

                <div className="max-h-[60vh] overflow-y-auto p-2">
                  {!query && (
                    <div className="mb-4">
                      <div className="px-3 py-2 text-xs font-semibold text-dark-400 uppercase tracking-wider">Navigation</div>
                      <button onClick={() => handleNavigate('/')} className="w-full text-left flex items-center px-3 py-3 rounded-xl hover:bg-dark-50 dark:hover:bg-dark-800 group transition-colors">
                        <Home size={18} className="text-dark-400 group-hover:text-brand-500 mr-3" />
                        <span className="flex-1 text-sm font-medium">Home Dashboard</span>
                      </button>
                      <button onClick={() => handleNavigate('/gallery')} className="w-full text-left flex items-center px-3 py-3 rounded-xl hover:bg-dark-50 dark:hover:bg-dark-800 group transition-colors">
                        <LayoutGrid size={18} className="text-dark-400 group-hover:text-purple-500 mr-3" />
                        <span className="flex-1 text-sm font-medium">Video Gallery</span>
                      </button>
                      <button onClick={() => handleNavigate('/command-center')} className="w-full text-left flex items-center px-3 py-3 rounded-xl hover:bg-dark-50 dark:hover:bg-dark-800 group transition-colors">
                        <Terminal size={18} className="text-dark-400 group-hover:text-green-500 mr-3" />
                        <span className="flex-1 text-sm font-medium">Command Center</span>
                      </button>
                    </div>
                  )}

                  {(query || filteredStreams.length > 0) && (
                    <div>
                      <div className="px-3 py-2 text-xs font-semibold text-dark-400 uppercase tracking-wider">
                        {filteredStreams.length > 0 ? 'Streams' : 'No Results'}
                      </div>
                      {filteredStreams.map(stream => (
                        <button 
                          key={stream.video_id}
                          onClick={() => handleNavigate(`/watch/${stream.video_id}`)} 
                          className="w-full text-left flex items-center px-3 py-3 rounded-xl hover:bg-dark-50 dark:hover:bg-dark-800 group transition-colors"
                        >
                          <Video size={18} className="text-brand-500 mr-3 flex-shrink-0" />
                          <div className="flex-1 truncate pr-4">
                            <span className="text-sm font-medium block truncate">{stream.title}</span>
                            <span className="text-xs text-dark-400 block truncate">{stream.duration} • {stream.date}</span>
                          </div>
                          <ExternalLink size={14} className="text-dark-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
