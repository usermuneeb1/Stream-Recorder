import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Bookmark, ArrowLeft, HardDrive, Clock, X, MessageSquare, AlertTriangle, Copy, Check, Keyboard, ChevronRight, Play } from 'lucide-react';
import { StreamData, fetchStreams } from '../utils/dataFetcher';


function ArchiveVideoPlayer({ archiveId, title }: { archiveId: string; title: string }) {
  const [videoSrc, setVideoSrc] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadArchiveFile() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`https://archive.org/metadata/${archiveId}?t=${Date.now()}`);
        if (!res.ok) throw new Error(`Archive metadata HTTP ${res.status}`);
        const data = await res.json();
        const files = Array.isArray(data.files) ? data.files : [];
        const candidates = files
          .filter((file: { name?: string; format?: string; size?: string }) => {
            const name = file.name || '';
            const format = (file.format || '').toLowerCase();
            return /\.(mp4|m4v|webm|mkv)$/i.test(name)
              && !name.includes('_thumb')
              && !name.includes('_ia_thumb')
              && !format.includes('thumbnail');
          })
          .sort((a: { name?: string; format?: string; size?: string }, b: { name?: string; format?: string; size?: string }) => {
            const score = (file: { name?: string; format?: string; size?: string }) => {
              const name = (file.name || '').toLowerCase();
              const format = (file.format || '').toLowerCase();
              let value = 0;
              if (name.endsWith('.mp4')) value += 100;
              if (format.includes('mpeg4') || format.includes('h.264')) value += 50;
              if (!name.includes('compressed')) value += 20;
              value += Math.min(Number(file.size || 0) / 1_000_000_000, 20);
              return value;
            };
            return score(b) - score(a);
          });

        const selected = candidates[0];
        if (!selected?.name) throw new Error('No playable public video file found');
        const encodedName = selected.name.split('/').map(encodeURIComponent).join('/');
        if (!cancelled) setVideoSrc(`https://archive.org/download/${archiveId}/${encodedName}`);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load public player');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadArchiveFile();
    return () => { cancelled = true; };
  }, [archiveId]);

  if (loading) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-dark-950 to-black text-white">
        <div className="w-12 h-12 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm text-white/70 font-medium">Preparing public player…</p>
      </div>
    );
  }

  if (error || !videoSrc) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-dark-950 to-black text-center p-6 text-white">
        <AlertTriangle size={34} className="text-brand-400 mb-4" />
        <h3 className="text-xl font-bold mb-2">Public playback unavailable</h3>
        <p className="text-white/60 max-w-md text-sm">This recording is archived, but a clean public player could not be prepared right now.</p>
      </div>
    );
  }

  return (
    <video
      className="w-full h-full bg-black object-contain"
      src={videoSrc}
      poster={`https://archive.org/services/img/${archiveId}`}
      title={title}
      controls
      playsInline
      preload="metadata"
      controlsList="nodownload noplaybackrate"
    />
  );
}

export default function Watch() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [stream, setStream] = useState<StreamData | null>(location.state?.stream || null);
  const [notFound, setNotFound] = useState(false);
  const [allStreams, setAllStreams] = useState<StreamData[]>([]);

  const [showShortcuts, setShowShortcuts] = useState(false);
  const [bookmarks, setBookmarks] = useState<{time: number, note: string}[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchStreams().then(data => {
      setAllStreams(data);
      if (!stream) {
        const found = data.find(s => s.videoId === id);
        if (found) {
          setStream(found);
        } else {
          setNotFound(true);
        }
      }
    });
  }, [id, stream]);

  // Load Bookmarks
  useEffect(() => {
    if (id) {
      try {
        const saved = localStorage.getItem(`bookmarks_${id}`);
        if (saved) setBookmarks(JSON.parse(saved));
      } catch {}
    }
  }, [id]);

  // ── Keyboard Shortcuts ─────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key.toLowerCase()) {
        case 'd':
          // Direct cloud download links are intentionally not exposed on the public site.
          break;
        case '?':
          e.preventDefault();
          setShowShortcuts(prev => !prev);
          break;
        case 'escape':
          setShowShortcuts(false);
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (!showShortcuts) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [showShortcuts]);

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

  const archiveSource = stream.sources.archive || stream.sources.archiveSmall;
  const archiveId = stream.archiveId || archiveSource?.url.split('/details/')[1]?.split('/')[0];

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


  // Related streams (exclude current, take 4)
  const relatedStreams = allStreams.filter(s => s.videoId !== id).slice(0, 4);


  const shortcutItems = [
    { key: '?', desc: 'Toggle shortcuts panel', hint: 'Show or hide this help overlay' },
    { key: 'Esc', desc: 'Close overlays', hint: 'Dismiss shortcuts and panels' },
  ];

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
                key={archiveId || stream.videoId}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="w-full h-full"
              >
                {archiveId ? (
                  <ArchiveVideoPlayer archiveId={archiveId} title={stream.title} />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-dark-950 to-black text-center p-6 text-white">
                    <AlertTriangle size={34} className="text-brand-400 mb-4" />
                    <h3 className="text-xl font-bold mb-2">Public playback unavailable</h3>
                    <p className="text-white/60 max-w-md text-sm">This recording is still being prepared for clean public playback.</p>
                  </div>
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
                    <div className="relative aspect-video rounded-xl overflow-hidden bg-dark-200 dark:bg-dark-800 mb-2 border border-dark-200 dark:border-dark-800">
                      <img
                        src={rs.thumbnail}
                        alt={rs.title}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                        loading="lazy"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          if (rs.archiveId && !target.src.includes('archive.org')) {
                            target.src = `https://archive.org/services/img/${rs.archiveId}`;
                          } else if (!target.src.includes('thumbnail.jpg')) {
                            target.src = `${import.meta.env.BASE_URL}thumbnail.jpg`;
                          }
                        }}
                        onLoad={(e) => {
                          const target = e.target as HTMLImageElement;
                          if (target.src.includes('ytimg.com') && target.naturalWidth <= 120) {
                            if (rs.archiveId) {
                              target.src = `https://archive.org/services/img/${rs.archiveId}`;
                            } else {
                              target.src = `${import.meta.env.BASE_URL}thumbnail.jpg`;
                            }
                          }
                        }}
                      />
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

      {/* ═══ KEYBOARD SHORTCUTS MODAL ═════════════════════════════════ */}
      <AnimatePresence>
        {showShortcuts && (
          <motion.div
            className="fixed inset-0 z-[110] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button
              type="button"
              aria-label="Close keyboard shortcuts"
              onClick={() => setShowShortcuts(false)}
              className="absolute inset-0 bg-black/70 backdrop-blur-md"
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="keyboard-shortcuts-title"
              initial={{ opacity: 0, y: 24, scale: 0.94, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: 24, scale: 0.94, filter: 'blur(8px)' }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              className="relative w-full max-w-lg glass-panel rounded-3xl z-[111] shadow-2xl border border-white/20 dark:border-white/10 overflow-hidden"
            >
              <div className="absolute -top-24 -right-24 w-56 h-56 bg-brand-500/20 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-24 -left-24 w-56 h-56 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
              <div className="relative p-6 border-b border-dark-200/70 dark:border-dark-800/80">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 text-brand-500 text-xs font-bold mb-3 border border-brand-500/20">
                      <Keyboard size={14} /> Watch Controls
                    </div>
                    <h2 id="keyboard-shortcuts-title" className="text-2xl font-bold font-display">Keyboard Shortcuts</h2>
                    <p className="text-sm text-dark-500 dark:text-dark-400 mt-1">Fast controls for playback options and overlays.</p>
                  </div>
                  <button onClick={() => setShowShortcuts(false)} className="p-2 hover:bg-dark-100 dark:hover:bg-dark-800 rounded-full transition-colors">
                    <X size={18} />
                  </button>
                </div>
              </div>
              <div className="relative p-6 space-y-3">
                {shortcutItems.map((shortcut, i) => (
                  <motion.div
                    key={shortcut.key}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.06 * i }}
                    className="flex items-center justify-between gap-4 p-4 bg-white/70 dark:bg-dark-800/80 rounded-2xl border border-dark-200/80 dark:border-dark-700/80"
                  >
                    <div className="min-w-0">
                      <span className="block text-sm font-semibold text-dark-800 dark:text-dark-100">{shortcut.desc}</span>
                      <span className="block text-xs text-dark-400 mt-0.5">{shortcut.hint}</span>
                    </div>
                    <kbd className="min-w-12 text-center px-3 py-2 rounded-xl bg-dark-900 text-white dark:bg-white dark:text-dark-900 text-xs font-mono font-black shadow-lg shadow-black/10 border border-white/10">
                      {shortcut.key}
                    </kbd>
                  </motion.div>
                ))}
                <div className="pt-2 text-center text-[11px] text-dark-400">
                  Tip: shortcuts are ignored while typing inside input fields.
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
