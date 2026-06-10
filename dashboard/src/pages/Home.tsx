import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion, Variants, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { AnimatedCounter } from '../components/AnimatedCounter';
import { fetchStreams, StreamData } from '../utils/dataFetcher';
import { BookOpenText, Clock3, Film, HardDrive, HeartHandshake, ExternalLink, Play, ChevronRight, Sparkles } from 'lucide-react';
import { YouTubeStats } from '../components/YouTubeStats';
import { SystemHealth } from '../components/SystemHealth';
import { ParticleField } from '../components/ParticleField';
import { ArchiveExperience } from '../components/ArchiveExperience';
import { PremiumHangingLantern } from '../components/PremiumHangingLantern';
import { Link } from 'react-router-dom';

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.12, delayChildren: 0.1 }
  }
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 40, scale: 0.95 },
  show: {
    opacity: 1, y: 0, scale: 1,
    transition: { type: "spring", stiffness: 200, damping: 20 }
  }
};

// 3D tilt effect hook
function useTilt() {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [8, -8]), { stiffness: 300, damping: 30 });
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-8, 8]), { stiffness: 300, damping: 30 });

  const handleMouse = useCallback((e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    x.set((e.clientX - rect.left) / rect.width - 0.5);
    y.set((e.clientY - rect.top) / rect.height - 0.5);
  }, [x, y]);

  const handleLeave = useCallback(() => {
    x.set(0);
    y.set(0);
  }, [x, y]);

  return { ref, rotateX, rotateY, handleMouse, handleLeave };
}

const RAW_URL = 'https://raw.githubusercontent.com/usermuneeb1/Stream-Recorder/main';

interface ArchiveStatsFile {
  total_streams?: number;
  total_hours?: number;
  total_gb?: number;
}

// ── StatCard Component (hooks called at component level, not in .map) ──
function StatCard({ metric, index }: { metric: { label: string; value: number; display?: string; suffix?: string; icon: React.ReactElement<any>; color: string; bg: string }; index: number }) {
  const tilt = useTilt();
  return (
    <motion.div
      variants={itemVariants}
      ref={tilt.ref}
      onMouseMove={tilt.handleMouse}
      onMouseLeave={tilt.handleLeave}
      style={{ rotateX: tilt.rotateX, rotateY: tilt.rotateY, transformPerspective: 1000 }}
      className="glass-panel p-6 md:p-8 rounded-3xl relative overflow-hidden group cursor-default card-hover-glow border border-white/20 dark:border-white/5 transition-shadow duration-500 hover:shadow-xl hover:shadow-brand-500/5"
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${metric.bg} opacity-0 group-hover:opacity-100 transition-opacity duration-700`} />
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-dark-500 dark:text-dark-400 font-medium text-sm md:text-base">{metric.label}</h3>
          <div className={`p-2.5 bg-dark-100 dark:bg-dark-800 rounded-xl ${metric.color} relative`}>
            {React.cloneElement(metric.icon, { size: 20 })}
            <div className="absolute inset-0 animate-orbit opacity-50">
              <div className={`w-1.5 h-1.5 rounded-full ${metric.color.replace('text-', 'bg-')}`} style={{ transform: 'translateX(14px)' }} />
            </div>
          </div>
        </div>
        <div className="text-3xl md:text-4xl lg:text-5xl font-display font-bold text-dark-900 dark:text-white tracking-tight">
          {metric.display ? metric.display : <AnimatedCounter value={metric.value} suffix={metric.suffix} delay={0.3 + (index * 0.1)} />}
        </div>
      </div>
    </motion.div>
  );
}

export default function Home() {
  const [stats, setStats] = useState({ total_streams: 0, total_hours: 0, total_gb: 0 });
  const [recentStreams, setRecentStreams] = useState<StreamData[]>([]);


  useEffect(() => {
    let cancelled = false;

    async function loadDashboardData() {
      const streams = await fetchStreams();
      if (cancelled) return;
      setRecentStreams(streams.slice(0, 4));

      try {
        const res = await fetch(`${RAW_URL}/stats.json?t=${Date.now()}`);
        if (!res.ok) throw new Error(`stats.json HTTP ${res.status}`);
        const repoStats = await res.json() as ArchiveStatsFile;
        if (cancelled) return;

        setStats({
          total_streams: streams.length,
          total_hours: Math.round(repoStats.total_hours ?? 0),
          total_gb: Math.round((repoStats.total_gb ?? 0) * 10) / 10,
        });
        return;
      } catch {
        // Fallback for local/offline previews: derive approximate totals from stream cards.
      }

      let hours = 0;
      let gb = 0;
      streams.forEach(s => {
        const hMatch = s.duration?.match(/(\d+)h/);
        const mMatch = s.duration?.match(/(\d+)m/);
        if (hMatch) hours += parseInt(hMatch[1]);
        if (mMatch) hours += parseInt(mMatch[1]) / 60;
        if (s.size?.includes('GB')) gb += parseFloat(s.size);
        if (s.size?.includes('MB')) gb += parseFloat(s.size) / 1024;
      });

      if (!cancelled) {
        setStats({
          total_streams: streams.length,
          total_hours: Math.round(hours),
          total_gb: Math.round(gb * 10) / 10
        });
      }
    }

    loadDashboardData().catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const statCards = [
    { label: 'Recordings', value: stats.total_streams, icon: <Film />, color: 'text-blue-500', bg: 'from-blue-500/10 to-blue-500/5' },
    { label: 'Hours Preserved', value: stats.total_hours, display: `${stats.total_hours}+`, icon: <Clock3 />, color: 'text-purple-500', bg: 'from-purple-500/10 to-purple-500/5' },
    { label: 'Archive Size', value: stats.total_gb, display: `${stats.total_gb.toFixed(1)} GB`, icon: <HardDrive />, color: 'text-brand-500', bg: 'from-brand-500/10 to-brand-500/5' },
    { label: 'Archive Access', value: 1, display: stats.total_streams > 0 ? 'Ready' : 'Soon', icon: <HeartHandshake />, color: 'text-teal-500', bg: 'from-teal-500/10 to-teal-500/5' },
  ];


  return (
    <div className="max-w-7xl mx-auto px-4 py-12 relative overflow-hidden">
      {/* Background Particles */}
      <ParticleField count={20} />

      {/* ═══ HERO SECTION ═══════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start mb-16 lg:mb-20 relative z-10 pt-10 lg:pt-14">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="text-center lg:text-left"
        >
          {/* Badge */}
          <motion.div
            variants={itemVariants}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-400 text-sm font-medium mb-6 border border-brand-500/20 backdrop-blur-sm"
          >
            <motion.div animate={{ rotate: [0, 360] }} transition={{ duration: 3, repeat: Infinity, ease: "linear" }}>
              <BookOpenText size={14} />
            </motion.div>
            Curated Dawah Archive
          </motion.div>

          {/* Title */}
          <motion.div variants={itemVariants}>
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold font-display tracking-tight mb-6 leading-[1.15]">
              Preserving the Legacy of <span className="text-gradient-animated">The Muslim Lantern</span>
            </h1>
          </motion.div>

          {/* Subtitle */}
          <motion.p
            variants={itemVariants}
            className="text-lg md:text-xl text-dark-500 dark:text-dark-400 max-w-2xl lg:max-w-[90%] mx-auto lg:mx-0 mb-8 leading-relaxed font-light"
          >
            A refined archive of Muslim Lantern live sessions, debates, and lectures — preserved for easy viewing, reflection, and long-term benefit.
          </motion.p>

          {/* CTAs */}
          <motion.div variants={itemVariants} className="flex flex-wrap gap-4 justify-center lg:justify-start">
            <Link to="/gallery" className="btn-primary text-base px-8 py-3 shadow-lg shadow-brand-500/25 hover:shadow-xl hover:shadow-brand-500/30">
              <Play size={18} fill="currentColor" /> Browse Archive
            </Link>
            <a
              href="https://youtube.com/@TheMuslimLantern"
              target="_blank"
              rel="noreferrer"
              className="btn-secondary text-base px-8 py-3"
            >
              <ExternalLink size={18} /> YouTube Channel
            </a>
          </motion.div>
        </motion.div>

        {/* Premium Hanging Lantern */}
        <PremiumHangingLantern />
      </div>

      {/* ═══ STATS GRID ═════════════════════════════════════════════ */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-50px" }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-12 lg:mb-16 relative z-10"
      >
        {statCards.map((metric, i) => (
          <StatCard key={metric.label} metric={metric} index={i} />
        ))}
      </motion.div>

      {/* ═══ FEATURED LATEST RECORDING ════════════════════════════ */}
      {recentStreams[0] && (
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ type: "spring", stiffness: 190, damping: 24 }}
          className="relative z-10 mb-16"
        >
          <Link
            to={`/watch/${recentStreams[0].videoId}`}
            state={{ stream: recentStreams[0] }}
            className="group block overflow-hidden rounded-[2rem] border border-white/70 dark:border-white/10 bg-white/80 dark:bg-dark-900/60 shadow-2xl shadow-dark-900/5 dark:shadow-black/30 backdrop-blur-xl"
          >
            <div className="grid grid-cols-1 lg:grid-cols-5">
              <div className="relative lg:col-span-2 aspect-video lg:aspect-auto min-h-[260px] overflow-hidden bg-dark-900">
                <img
                  src={recentStreams[0].thumbnail}
                  alt={recentStreams[0].title}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  loading="lazy"
                  onError={(e) => { (e.target as HTMLImageElement).src = `${import.meta.env.BASE_URL}thumbnail.jpg`; }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <div className="absolute bottom-4 left-4 rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white backdrop-blur-md border border-white/20">
                  Latest preserved recording
                </div>
              </div>
              <div className="relative lg:col-span-3 p-7 md:p-9 flex flex-col justify-center">
                <div className="absolute right-8 top-8 hidden md:flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-500 border border-brand-500/20">
                  <Sparkles size={24} />
                </div>
                <p className="text-xs font-black uppercase tracking-[0.28em] text-brand-500 mb-3">Watch latest</p>
                <h2 className="text-2xl md:text-4xl font-black font-display leading-tight max-w-2xl group-hover:text-brand-500 transition-colors">
                  {recentStreams[0].title}
                </h2>
                <div className="mt-4 flex flex-wrap gap-3 text-sm text-dark-500 dark:text-dark-400 font-medium">
                  <span>{recentStreams[0].date}</span>
                  {recentStreams[0].duration && <span>• {recentStreams[0].duration}</span>}
                  {recentStreams[0].size && <span>• {recentStreams[0].size}</span>}
                </div>
                <div className="mt-7 inline-flex w-fit items-center gap-2 rounded-full bg-brand-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-brand-500/25 group-hover:bg-brand-500 transition-colors">
                  <Play size={17} fill="currentColor" /> Watch Now
                </div>
              </div>
            </div>
          </Link>
        </motion.div>
      )}

      {/* ═══ PREMIUM PUBLIC ARCHIVE EXPERIENCE ════════════════════ */}
      <ArchiveExperience
        streams={stats.total_streams}
        hours={stats.total_hours}
        storageGb={stats.total_gb}
      />

      {/* ═══ YOUTUBE STATS + RECENT STREAMS ════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-16 relative z-10">
        {/* YouTube Stats Card */}
        <motion.div
          initial={{ opacity: 0, x: -40 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ type: "spring", stiffness: 200, damping: 24 }}
        >
          <YouTubeStats />
        </motion.div>

        {/* Recent Streams */}
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ type: "spring", stiffness: 200, damping: 24, delay: 0.1 }}
          className="glass-panel rounded-3xl p-6 border border-white/20 dark:border-white/5"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold font-display">Recent Recordings</h3>
            <Link to="/gallery" className="text-sm text-brand-500 hover:text-brand-400 font-medium flex items-center gap-1 transition-colors">
              View All <ChevronRight size={16} />
            </Link>
          </div>
          <div className="space-y-3">
            {recentStreams.length === 0 ? (
              [...Array(4)].map((_, i) => (
                <div key={i} className="flex gap-3 animate-pulse">
                  <div className="w-24 h-14 bg-dark-200 dark:bg-dark-800 rounded-lg shimmer" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-dark-200 dark:bg-dark-800 rounded w-3/4" />
                    <div className="h-2 bg-dark-200 dark:bg-dark-800 rounded w-1/2" />
                  </div>
                </div>
              ))
            ) : (
              recentStreams.map((stream, i) => (
                <motion.div
                  key={stream.videoId}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 * i }}
                >
                  <Link
                    to={`/watch/${stream.videoId}`}
                    state={{ stream }}
                    className="flex gap-3 p-2 rounded-xl hover:bg-dark-100 dark:hover:bg-dark-800/50 transition-colors group"
                  >
                    <div className="w-24 h-14 flex-shrink-0 rounded-lg overflow-hidden bg-dark-200 dark:bg-dark-800 border border-dark-200 dark:border-dark-700 group-hover:border-brand-500/30 transition-colors">
                      <img
                        src={stream.thumbnail}
                        alt={stream.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          if (stream.archiveId && !target.src.includes('archive.org')) {
                            target.src = `https://archive.org/services/img/${stream.archiveId}`;
                          } else {
                            target.src = `${import.meta.env.BASE_URL}thumbnail.jpg`;
                          }
                        }}
                        onLoad={(e) => {
                          const target = e.target as HTMLImageElement;
                          if (target.src.includes('ytimg.com') && target.naturalWidth <= 120) {
                            if (stream.archiveId) {
                              target.src = `https://archive.org/services/img/${stream.archiveId}`;
                            } else {
                              target.src = `${import.meta.env.BASE_URL}thumbnail.jpg`;
                            }
                          }
                        }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold truncate group-hover:text-brand-500 transition-colors">{stream.title}</h4>
                      <div className="flex items-center gap-3 mt-1 text-xs text-dark-400">
                        <span>{stream.date}</span>
                        {stream.duration && <span>{stream.duration}</span>}
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))
            )}
          </div>
        </motion.div>
      </div>

      {/* ═══ SYSTEM HEALTH ════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="relative z-10"
      >
        <SystemHealth />
      </motion.div>
    </div>
  );
}
