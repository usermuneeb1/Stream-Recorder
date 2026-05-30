import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate, useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Bookmark, Share2, ArrowLeft, ExternalLink, HardDrive, Clock, X, MessageSquare, AlertTriangle, Copy, Check, Keyboard, ChevronRight, Play } from 'lucide-react';
import { StreamData, fetchStreams } from '../utils/dataFetcher';

export default function Watch() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [stream, setStream] = useState<StreamData | null>(location.state?.stream || null);
  const [notFound, setNotFound] = useState(false);
  const [allStreams, setAllStreams] = useState<StreamData[]>([]);

  const [activeSource, setActiveSource] = useState<string>('pixel');
  const [showDownloads, setShowDownloads] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [bookmarks, setBookmarks] = useState<{time: number, note: string}[]>([]);
  const [copied, setCopied] = useState(false);
  const [sourceTransition, setSourceTransition] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    fetchStreams().then(data => {
      setAllStreams(data);
      if (!stream) {
        const found = data.find(s => s.videoId === id);
        if (found) {
          setStream(found);
          const srcKeys = Object.keys(found.sources);
          if (srcKeys.length > 0) {
            if (found.sources.pixel) setActiveSource('pixel');
            else if (found.sources.mega) setActiveSource('mega');
            else if (found.sources.archive) setActiveSource('archive');
            else setActiveSource(srcKeys[0]);
          }
        } else {
          setNotFound(true);
        }
      } else {
        const srcKeys = Object.keys(stream.sources);
        if (srcKeys.length > 0 && !stream.sources[activeSource]) {
          if (stream.sources.pixel) setActiveSource('pixel');
          else if (stream.sources.mega) setActiveSource('mega');
          else if (stream.sources.archive) setActiveSource('archive');
          else setActiveSource(srcKeys[0]);
        }
      }
    });
  }, [id]);

  // Load Bookmarks
  useEffect(() => {
    if (id) {
      try {
        const saved = localStorage.getItem(`bookmarks_${id}`);
        if (saved) setBookmarks(JSON.parse(saved));
      } catch (e) {}
    }
  }, [id]);

  // ── Keyboard Shortcuts ─────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key.toLowerCase()) {
        case 'd':
          e.preventDefault();
          setShowDownloads(prev => !prev);
          break;
        case 's':
          e.preventDefault();
          if (stream) {
            const keys = Object.keys(stream.sources);
            const idx = keys.indexOf(activeSource);
            const next = keys[(idx + 1) % keys.length];
            switchSource(next);
          }
          break;
        case '?':
          e.preventDefault();
          setShowShortcuts(prev => !prev);
          break;
        case 'escape':
          setShowDownloads(false);
          setShowShortcuts(false);
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [stream, activeSource]);

  const switchSource = (key: string) => {
    if (key === activeSource) return;
    setSourceTransition(true);
    setTimeout(() => {
      setActiveSource(key);
      setTimeout(() => setSourceTransition(false), 100);
    }, 200);
  };

  // Not Found
  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="max-w-md">
          <div className="w-24 h-24 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-6">
            <AlertTriangle size={44} className="text-red-500" />
          </div>
          <h2 className="text-3xl font-bold font-display mb-3">Video Not Found</h2>
          <p className="text-dark-500 mb-8">
            The recording with ID <code className="px-2 py-0.5 bg-dark-100 dark:bg-dark-800 rounded text-sm font-mono">{id}</code> doesn't exist in the archive.
          </p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => navigate(-1)} className="btn-secondary flex items-center gap-2"><ArrowLeft size={16} /> Go Back</button>
            <button onClick={() => navigate('/gallery')} className="btn-primary">Browse Gallery</button>
          </div>
        </motion.div>
      </div>
    );
  }

  // Loading
  if (!stream) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-dark-500 text-sm font-medium animate-pulse">Loading recording...</p>
        </div>
      </div>
    );
  }

  const sources = Object.entries(stream.sources);
  const currentSource = stream.sources[activeSource];

  const handleAddBookmark = () => {
    const timeStr = prompt("Enter timestamp to bookmark (e.g., 01:23:45):");
    if (timeStr) {
      const newBms = [...bookmarks, { time: Date.now(), note: `Bookmark at ${timeStr}` }];
      setBookmarks(newBms);
      localStorage.setItem(`bookmarks_${id}`, JSON.stringify(newBms));
    }
  };

  const removeBookmark = (index: number) => {
    const newBms = bookmarks.filter((_, i) => i !== index);
    setBookmarks(newBms);
    localStorage.setItem(`bookmarks_${id}`, JSON.stringify(newBms));
  };

  const handleShare = async () => {
    const shareUrl = window.location.href;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt('Copy this link:', shareUrl);
    }
  };

  const generateEmbedUrl = (source: any) => {
    if (source.type === 'pixeldrain') {
      const pId = source.url.split('/').pop();
      return `https://pixeldrain.com/api/file/${pId}?embed`;
    }
    if (source.type === 'mega') return source.url.replace('/file/', '/embed/');
    if (source.type === 'archive') {
      const aId = source.url.split('/details/')[1]?.split('/')[0];
      return `https://archive.org/embed/${aId}`;
    }
    if (source.type === 'odysee') return source.url.replace('odysee.com/', 'odysee.com/$/embed/');
    if (source.type === 'rumble') return source.url.replace('/v', '/embed/v');
    return source.url;
  };

  const isUnembeddable = currentSource?.type === 'gofile';

  // Related streams (exclude current, take 4)
  const relatedStreams = allStreams.filter(s => s.videoId !== id).slice(0, 4);

  const sourceIcons: Record<string, string> = {
    archive: '🏛️', mega: '🔴', pixel: '🟣', gofile: '📁',
    archiveSmall: '📱', odysee: '🪐', rumble: '🟢'
  };

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6">
      {/* Back Button */}
      <motion.button
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-dark-500 hover:text-brand-500 mb-4 transition-colors font-medium group"
      >
        <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" /> Back to Gallery
      </motion.button>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-6">
          {/* ── Player ─────────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10"
          >
            {/* Cinema vignette */}
            <div className="absolute inset-0 pointer-events-none z-10 shadow-[inset_0_0_100px_rgba(0,0,0,0.3)]" />

            <AnimatePresence mode="wait">
              <motion.div
                key={activeSource}
                initial={{ opacity: 0 }}
                animate={{ opacity: sourceTransition ? 0 : 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="w-full h-full"
              >
                {currentSource ? (
                  isUnembeddable ? (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-dark-900 to-dark-800 text-center p-6">
                      <motion.div
                        animate={{ scale: [1, 1.05, 1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="w-20 h-20 rounded-full bg-brand-500/10 flex items-center justify-center mb-6"
                      >
                        <ExternalLink size={36} className="text-brand-500" />
                      </motion.div>
                      <h3 className="text-xl font-bold mb-2">Embedded Playback Unavailable</h3>
                      <p className="text-dark-400 mb-6 max-w-md">This provider doesn't support website embedding.</p>
                      <a href={currentSource.url} target="_blank" rel="noreferrer" className="btn-primary flex items-center gap-2">
                        <ExternalLink size={18} /> Open in {currentSource.label.replace(/[^\w\s.]/g, '').trim()}
                      </a>
                    </div>
                  ) : (
                    <iframe
                      ref={iframeRef}
                      src={generateEmbedUrl(currentSource)}
                      className="w-full h-full border-0"
                      allowFullScreen
                    />
                  )
                ) : (
                  <div className="flex items-center justify-center h-full text-dark-400">No embeddable source available</div>
                )}
              </motion.div>
            </AnimatePresence>
          </motion.div>

          {/* ── Details ─────────────────────────────────────────────── */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <h1 className="text-2xl sm:text-3xl font-bold font-display leading-tight mb-3">{stream.title}</h1>
            <div className="flex flex-wrap items-center gap-4 text-sm text-dark-500 dark:text-dark-400 font-medium">
              <span className="flex items-center gap-1.5"><Clock size={16} /> {stream.date} • {stream.duration}</span>
              {stream.size && <span className="flex items-center gap-1.5"><HardDrive size={16} /> {stream.size}</span>}
            </div>

            <div className="flex flex-wrap items-center gap-3 mt-6 pb-6 border-b border-dark-200 dark:border-dark-800">
              <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={handleAddBookmark} className="btn-secondary flex items-center gap-2">
                <Bookmark size={18} /> Bookmark
              </motion.button>
              <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={handleShare} className="btn-secondary flex items-center gap-2">
                {copied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
                {copied ? 'Copied!' : 'Share'}
              </motion.button>
              <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={() => setShowDownloads(true)} className="btn-primary flex items-center gap-2">
                <Download size={18} /> Download
              </motion.button>
              <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={() => setShowShortcuts(true)} className="btn-secondary flex items-center gap-2 ml-auto">
                <Keyboard size={16} /> <span className="hidden sm:block">Shortcuts</span>
              </motion.button>
            </div>
          </motion.div>

          {/* ── Related Videos ──────────────────────────────────────── */}
          {relatedStreams.length > 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold font-display">More Recordings</h3>
                <Link to="/gallery" className="text-sm text-brand-500 hover:text-brand-400 font-medium flex items-center gap-1">
                  View All <ChevronRight size={14} />
                </Link>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {relatedStreams.map(rs => (
                  <Link
                    key={rs.videoId}
                    to={`/watch/${rs.videoId}`}
                    state={{ stream: rs }}
                    className="group"
                  >
                    <div className="relative aspect-video rounded-xl overflow-hidden bg-dark-900 mb-2 border border-dark-200 dark:border-dark-800">
                      <img src={rs.thumbnail} alt={rs.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" loading="lazy" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                        <Play size={24} fill="white" className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <div className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-md">
                        {rs.duration || '?'}
                      </div>
                    </div>
                    <h4 className="text-xs font-semibold line-clamp-2 group-hover:text-brand-500 transition-colors">{rs.title}</h4>
                  </Link>
                ))}
              </div>
            </motion.div>
          )}
        </div>

        {/* ── Sidebar ──────────────────────────────────────────────── */}
        <div className="space-y-5">
          {/* Source Switcher */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="glass-panel p-5 rounded-2xl border border-dark-200 dark:border-dark-800">
            <h3 className="font-bold mb-4 text-base flex items-center gap-2">
              Playback Source
              <span className="text-xs text-dark-400 font-normal ml-auto">Press S</span>
            </h3>
            <div className="space-y-2">
              {sources.map(([key, source]) => (
                <motion.button
                  key={key}
                  whileHover={{ x: 3 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => switchSource(key)}
                  className={`w-full flex items-center justify-between p-3 rounded-xl transition-all duration-300 ${
                    activeSource === key
                      ? 'bg-brand-50 dark:bg-brand-900/30 border border-brand-200 dark:border-brand-800 text-brand-700 dark:text-brand-300 shadow-sm'
                      : 'bg-dark-50 dark:bg-dark-800 border border-transparent hover:border-dark-200 dark:hover:border-dark-700'
                  }`}
                >
                  <span className="font-medium text-sm flex items-center gap-2">
                    <span>{sourceIcons[key] || '🔗'}</span>
                    {source.label.replace(/[^\w\s.]/g, '').trim()}
                  </span>
                  {activeSource === key && (
                    <motion.div
                      layoutId="activeSourceDot"
                      className="w-2 h-2 rounded-full bg-brand-500"
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    />
                  )}
                </motion.button>
              ))}
            </div>
          </motion.div>

          {/* Bookmarks */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }} className="glass-panel p-5 rounded-2xl border border-dark-200 dark:border-dark-800">
            <h3 className="font-bold mb-4 text-base">My Highlights</h3>
            {bookmarks.length === 0 ? (
              <p className="text-sm text-dark-400">No bookmarks saved yet. Click "Bookmark" to save important moments.</p>
            ) : (
              <div className="space-y-2">
                <AnimatePresence>
                  {bookmarks.map((bm, i) => (
                    <motion.div
                      key={bm.time}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="p-3 bg-dark-50 dark:bg-dark-800 rounded-xl text-sm border border-dark-200 dark:border-dark-700 flex items-start justify-between gap-2"
                    >
                      <div>
                        <div className="font-medium text-brand-600 dark:text-brand-400 text-xs">Highlight {i + 1}</div>
                        <div className="text-dark-600 dark:text-dark-300">{bm.note}</div>
                      </div>
                      <button onClick={() => removeBookmark(i)} className="text-dark-400 hover:text-red-500 p-1 flex-shrink-0 transition-colors">
                        <X size={14} />
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </motion.div>

          {/* Live Chat Replay */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="glass-panel p-5 rounded-2xl border border-dark-200 dark:border-dark-800">
            <h3 className="font-bold mb-4 text-base flex items-center gap-2">
              <MessageSquare size={16} /> Live Chat Replay
            </h3>
            <div className="h-40 flex flex-col items-center justify-center border-2 border-dashed border-dark-200 dark:border-dark-700 rounded-xl text-dark-400 text-center p-4">
              <MessageSquare size={20} className="mb-2 opacity-50" />
              <p className="text-xs font-medium">Chat replay unavailable</p>
              <p className="text-[10px] mt-1 opacity-70">Chat data must be saved during recording.</p>
            </div>
          </motion.div>
        </div>
      </div>

      {/* ═══ DOWNLOAD MODAL ═══════════════════════════════════════════ */}
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
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed left-1/2 bottom-0 sm:bottom-auto sm:top-1/2 -translate-x-1/2 sm:-translate-y-1/2 w-full max-w-lg glass-panel p-6 rounded-t-3xl sm:rounded-3xl z-50 shadow-2xl border border-dark-200 dark:border-dark-800"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold font-display">Download Hub</h2>
                <button onClick={() => setShowDownloads(false)} className="p-2 hover:bg-dark-100 dark:hover:bg-dark-800 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>
              <div className="space-y-3">
                {sources.map(([key, source], i) => (
                  <motion.a
                    key={key}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08 }}
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-4 bg-dark-50 dark:bg-dark-800 rounded-2xl hover:bg-dark-100 dark:hover:bg-dark-700 transition-all group border border-transparent hover:border-dark-200 dark:hover:border-dark-600"
                  >
                    <div className="flex flex-col">
                      <span className="font-semibold">{source.label}</span>
                      <span className="text-xs text-dark-400 font-medium">Direct File Access</span>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-brand-100 dark:bg-brand-900/50 text-brand-600 dark:text-brand-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <ExternalLink size={18} />
                    </div>
                  </motion.a>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ═══ KEYBOARD SHORTCUTS MODAL ═════════════════════════════════ */}
      <AnimatePresence>
        {showShortcuts && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowShortcuts(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md glass-panel p-6 rounded-3xl z-50 shadow-2xl border border-dark-200 dark:border-dark-800"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold font-display flex items-center gap-2"><Keyboard size={20} /> Keyboard Shortcuts</h2>
                <button onClick={() => setShowShortcuts(false)} className="p-2 hover:bg-dark-100 dark:hover:bg-dark-800 rounded-full transition-colors">
                  <X size={18} />
                </button>
              </div>
              <div className="space-y-3">
                {[
                  { key: 'S', desc: 'Cycle playback source' },
                  { key: 'D', desc: 'Toggle download modal' },
                  { key: '?', desc: 'Toggle shortcuts panel' },
                  { key: 'Esc', desc: 'Close modals' },
                ].map(s => (
                  <div key={s.key} className="flex items-center justify-between p-3 bg-dark-50 dark:bg-dark-800 rounded-xl">
                    <span className="text-sm text-dark-600 dark:text-dark-300">{s.desc}</span>
                    <kbd className="px-3 py-1 rounded-lg bg-dark-200 dark:bg-dark-700 text-xs font-mono font-bold">{s.key}</kbd>
                  </div>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
