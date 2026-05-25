import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Bookmark, Share2, ArrowLeft, ExternalLink, HardDrive, Clock, X, MessageSquare } from 'lucide-react';
import { StreamData, fetchStreams } from '../utils/dataFetcher';

export default function Watch() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [stream, setStream] = useState<StreamData | null>(location.state?.stream || null);
  
  const [activeSource, setActiveSource] = useState<string>('pixel'); // default to pixeldrain if available
  const [showDownloads, setShowDownloads] = useState(false);
  const [bookmarks, setBookmarks] = useState<{time: number, note: string}[]>([]);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!stream) {
      fetchStreams().then(data => {
        const found = data.find(s => s.videoId === id);
        if (found) {
          setStream(found);
          // Set initial active source based on availability
          const srcKeys = Object.keys(found.sources);
          if (srcKeys.length > 0) {
            if (found.sources.pixel) setActiveSource('pixel');
            else if (found.sources.mega) setActiveSource('mega');
            else setActiveSource(srcKeys[0]);
          }
        }
      });
    } else {
      const srcKeys = Object.keys(stream.sources);
      if (srcKeys.length > 0 && !stream.sources[activeSource]) {
        if (stream.sources.pixel) setActiveSource('pixel');
        else if (stream.sources.mega) setActiveSource('mega');
        else setActiveSource(srcKeys[0]);
      }
    }
  }, [id, stream]);

  // Load Bookmarks
  useEffect(() => {
    if (id) {
      try {
        const saved = localStorage.getItem(`bookmarks_${id}`);
        if (saved) setBookmarks(JSON.parse(saved));
      } catch (e) {}
    }
  }, [id]);

  if (!stream) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const sources = Object.entries(stream.sources);
  const currentSource = stream.sources[activeSource];

  const handleAddBookmark = () => {
    // In a real embed we can't easily get the current time without postMessage API, 
    // but for UX we can prompt the user to enter the timestamp they want to save, 
    // or just mock it for the demo
    const timeStr = prompt("Enter timestamp to bookmark (e.g., 01:23:45):");
    if (timeStr) {
      const newBms = [...bookmarks, { time: Date.now(), note: `Bookmark at ${timeStr}` }];
      setBookmarks(newBms);
      localStorage.setItem(`bookmarks_${id}`, JSON.stringify(newBms));
    }
  };

  const generateEmbedUrl = (source: any) => {
    if (source.type === 'pixeldrain') {
      const pId = source.url.split('/').pop();
      return `https://pixeldrain.com/api/file/${pId}?embed`;
    }
    if (source.type === 'mega') {
      return source.url.replace('/file/', '/embed/');
    }
    if (source.type === 'archive') {
      const aId = source.url.split('/details/')[1]?.split('/')[0];
      return `https://archive.org/embed/${aId}`;
    }
    if (source.type === 'youtube') {
      const yId = source.url.split('v=')[1]?.split('&')[0] || source.url.split('/').pop();
      return `https://www.youtube-nocookie.com/embed/${yId}`;
    }
    if (source.type === 'odysee') {
      // Odysee embeds use /$/embed/
      return source.url.replace('odysee.com/', 'odysee.com/$/embed/');
    }
    if (source.type === 'peertube') {
      // PeerTube embeds use /videos/embed/ instead of /w/
      return source.url.replace('/w/', '/videos/embed/');
    }
    if (source.type === 'rumble') {
      // Rumble embeds use /embed/v
      return source.url.replace('/v', '/embed/v');
    }
    return source.url;
  };

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6">
      <button 
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-dark-500 hover:text-brand-600 mb-4 transition-colors font-medium"
      >
        <ArrowLeft size={18} /> Back to Gallery
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-6">
          {/* Player Container */}
          <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10">
            {currentSource ? (
              <iframe
                ref={iframeRef}
                src={generateEmbedUrl(currentSource)}
                className="w-full h-full border-0"
                allowFullScreen
              />
            ) : (
              <div className="flex items-center justify-center h-full text-dark-400">
                No embeddable source available
              </div>
            )}
          </div>

          {/* Details */}
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold font-display leading-tight mb-3">
              {stream.title}
            </h1>
            <div className="flex flex-wrap items-center gap-4 text-sm text-dark-500 dark:text-dark-400 font-medium">
              <span className="flex items-center gap-1.5"><Clock size={16} /> {stream.date} • {stream.duration}</span>
              {stream.size && <span className="flex items-center gap-1.5"><HardDrive size={16} /> {stream.size}</span>}
            </div>
            
            <div className="flex flex-wrap items-center gap-3 mt-6 pb-6 border-b border-dark-200 dark:border-dark-800">
              <button 
                onClick={handleAddBookmark}
                className="btn-secondary"
              >
                <Bookmark size={18} /> Add Bookmark
              </button>
              <button 
                onClick={() => setShowDownloads(true)}
                className="btn-primary"
              >
                <Download size={18} /> Download Options
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Source Switcher */}
          <div className="glass-panel p-5 rounded-2xl">
            <h3 className="font-bold mb-4 text-lg">Playback Source</h3>
            <div className="space-y-2">
              {sources.map(([key, source]) => (
                <button
                  key={key}
                  onClick={() => setActiveSource(key)}
                  className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${
                    activeSource === key 
                      ? 'bg-brand-50 dark:bg-brand-900/30 border border-brand-200 dark:border-brand-800 text-brand-700 dark:text-brand-300 shadow-sm'
                      : 'bg-dark-50 dark:bg-dark-800 border border-transparent hover:border-dark-200 dark:hover:border-dark-700'
                  }`}
                >
                  <span className="font-medium">{source.label}</span>
                  {activeSource === key && <div className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />}
                </button>
              ))}
            </div>
          </div>

          {/* Bookmarks */}
          <div className="glass-panel p-5 rounded-2xl">
            <h3 className="font-bold mb-4 text-lg">My Highlights</h3>
            {bookmarks.length === 0 ? (
              <p className="text-sm text-dark-400">No bookmarks saved yet. Click "Add Bookmark" to save important moments.</p>
            ) : (
              <div className="space-y-3">
                {bookmarks.map((bm, i) => (
                  <div key={i} className="p-3 bg-dark-50 dark:bg-dark-800 rounded-xl text-sm border border-dark-200 dark:border-dark-700">
                    <div className="font-medium text-brand-600 dark:text-brand-400 mb-1">Highlight {i + 1}</div>
                    <div className="text-dark-600 dark:text-dark-300">{bm.note}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Live Chat Placeholder */}
          <div className="glass-panel p-5 rounded-2xl">
            <h3 className="font-bold mb-4 text-lg flex items-center gap-2">
              <MessageSquare size={18} /> Live Chat
            </h3>
            <div className="h-48 flex items-center justify-center border-2 border-dashed border-dark-200 dark:border-dark-700 rounded-xl text-dark-400">
              Chat coming soon
            </div>
          </div>
        </div>
      </div>

      {/* Download Hub Modal */}
      <AnimatePresence>
        {showDownloads && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDownloads(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg glass-panel p-6 rounded-3xl z-50 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold font-display">Download Hub</h2>
                <button 
                  onClick={() => setShowDownloads(false)}
                  className="p-2 hover:bg-dark-100 dark:hover:bg-dark-800 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                {sources.map(([key, source]) => (
                  <a
                    key={key}
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-4 bg-dark-50 dark:bg-dark-800 rounded-2xl hover:bg-dark-100 dark:hover:bg-dark-700 transition-colors group border border-transparent hover:border-dark-200 dark:hover:border-dark-600"
                  >
                    <div className="flex flex-col">
                      <span className="font-semibold text-lg">{source.label}</span>
                      <span className="text-sm text-dark-500 font-medium">Direct File Access</span>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-brand-100 dark:bg-brand-900/50 text-brand-600 dark:text-brand-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <ExternalLink size={18} />
                    </div>
                  </a>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
