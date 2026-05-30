import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion, Variants, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { AnimatedCounter } from '../components/AnimatedCounter';
import { fetchStreams, StreamData } from '../utils/dataFetcher';
import { Database, Film, HardDrive, Shield, Globe, Zap, Cloud, Bell, Bot, ExternalLink, Play, ChevronRight } from 'lucide-react';
import { SnakeGame } from '../components/SnakeGame';
import { YouTubeStats } from '../components/YouTubeStats';
import { SystemHealth } from '../components/SystemHealth';
import { ParticleField } from '../components/ParticleField';
import { AnimatedText } from '../components/AnimatedText';
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

export default function Home() {
  const [stats, setStats] = useState({ total_streams: 0, total_hours: 0, total_gb: 0 });
  const [sources, setSources] = useState({ mega: 0, archive: 0, pixel: 0, gofile: 0 });
  const [recentStreams, setRecentStreams] = useState<StreamData[]>([]);

  // Parallax logo
  const logoX = useMotionValue(0);
  const logoY = useMotionValue(0);
  const logoRotateX = useSpring(useTransform(logoY, [-200, 200], [10, -10]), { stiffness: 100, damping: 30 });
  const logoRotateY = useSpring(useTransform(logoX, [-200, 200], [-10, 10]), { stiffness: 100, damping: 30 });

  const handleHeroMouse = useCallback((e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    logoX.set(e.clientX - rect.left - rect.width / 2);
    logoY.set(e.clientY - rect.top - rect.height / 2);
  }, [logoX, logoY]);

  useEffect(() => {
    fetchStreams().then(streams => {
      let hours = 0;
      let gb = 0;
      let m = 0, a = 0, p = 0, g = 0;

      streams.forEach(s => {
        const hMatch = s.duration?.match(/(\d+)h/);
        if (hMatch) hours += parseInt(hMatch[1]);
        if (s.size?.includes('GB')) gb += parseFloat(s.size);
        if (s.size?.includes('MB')) gb += parseFloat(s.size) / 1024;
        if (s.sources.mega) m++;
        if (s.sources.archive) a++;
        if (s.sources.pixel) p++;
        if (s.sources.gofile) g++;
      });

      setStats({
        total_streams: streams.length,
        total_hours: Math.round(hours),
        total_gb: Math.round(gb * 10) / 10
      });
      setSources({ mega: m, archive: a, pixel: p, gofile: g });
      setRecentStreams(streams.slice(0, 4));
    });
  }, []);

  const statCards = [
    { label: 'Total Streams', value: stats.total_streams, icon: <Film />, color: 'text-blue-500', bg: 'from-blue-500/10 to-blue-500/5' },
    { label: 'Hours Archived', value: stats.total_hours, suffix: '+', icon: <Database />, color: 'text-purple-500', bg: 'from-purple-500/10 to-purple-500/5' },
    { label: 'Storage Used', value: stats.total_gb, suffix: ' GB', icon: <HardDrive />, color: 'text-brand-500', bg: 'from-brand-500/10 to-brand-500/5' },
    { label: 'Cloud Providers', value: 4, suffix: ' Active', icon: <Cloud />, color: 'text-teal-500', bg: 'from-teal-500/10 to-teal-500/5' },
  ];

  const features = [
    {
      icon: <Shield className="w-10 h-10" />,
      color: 'text-green-500',
      bg: 'bg-green-500/10',
      title: 'Immutable Preservation',
      desc: 'Recordings are permanently written to Archive.org, immune to takedowns or platform censorship. Once archived, they exist forever.'
    },
    {
      icon: <Globe className="w-10 h-10" />,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
      title: 'Decentralized Delivery',
      desc: 'Multi-cloud redundancy across 4 independent providers ensures content survives even if one service goes down.'
    },
    {
      icon: <Bot className="w-10 h-10" />,
      color: 'text-violet-500',
      bg: 'bg-violet-500/10',
      title: 'Autonomous Recording',
      desc: 'Fully automated pipeline: detect live → record in 1080p → process → upload to all clouds → notify. Zero human intervention.'
    },
    {
      icon: <Bell className="w-10 h-10" />,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10',
      title: 'Instant Alerts',
      desc: 'Discord notifications with rich embeds are sent within seconds of recording completion, including thumbnails and download links.'
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-12 relative overflow-hidden">
      {/* Background Particles */}
      <ParticleField count={20} />

      {/* ═══ HERO SECTION ═══════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center mb-24 relative z-10" onMouseMove={handleHeroMouse}>
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
              <Zap size={14} />
            </motion.div>
            Ultra-Premium Infrastructure
          </motion.div>

          {/* Title */}
          <motion.div variants={itemVariants}>
            <h1 className="text-5xl md:text-6xl lg:text-[4.5rem] font-bold font-display tracking-tight mb-6 leading-[1.1]">
              Preserving the Legacy of <br />
              <span className="text-gradient-animated">
                The Muslim Lantern
              </span>
            </h1>
          </motion.div>

          {/* Subtitle */}
          <motion.p
            variants={itemVariants}
            className="text-lg md:text-xl text-dark-500 dark:text-dark-400 max-w-2xl lg:max-w-[90%] mx-auto lg:mx-0 mb-8 leading-relaxed font-light"
          >
            A state-of-the-art cinematic archive. Every live session, debate, and lecture is permanently preserved and distributed across a decentralized multi-cloud architecture.
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

        {/* Floating 3D Logo */}
        <motion.div
          initial={{ opacity: 0, filter: 'blur(30px)', scale: 0.8 }}
          animate={{ opacity: 1, filter: 'blur(0px)', scale: 1 }}
          transition={{ duration: 1.5, ease: "easeOut", delay: 0.3 }}
          className="hidden lg:flex justify-center relative items-center"
          style={{ perspective: 1000 }}
        >
          {/* Glow rings */}
          <motion.div
            animate={{ scale: [1, 1.15, 1], opacity: [0.1, 0.25, 0.1] }}
            transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
            className="absolute w-[280px] h-[280px] bg-brand-500/20 blur-[80px] rounded-full"
          />
          <motion.div
            animate={{ scale: [1.1, 1, 1.1], opacity: [0.05, 0.15, 0.05] }}
            transition={{ repeat: Infinity, duration: 8, ease: "easeInOut" }}
            className="absolute w-[350px] h-[350px] bg-indigo-500/10 blur-[100px] rounded-full"
          />

          {/* Logo with 3D parallax */}
          <motion.div
            style={{ rotateX: logoRotateX, rotateY: logoRotateY }}
            className="relative z-10"
          >
            <motion.div
              animate={{ y: [-8, 8, -8] }}
              transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
            >
              <img
                src="/Stream-Recorder/logo-vertical.pn.jpg"
                alt="The Muslim Lantern"
                className="w-full max-w-[220px] object-contain rounded-full shadow-[0_0_80px_rgba(239,68,68,0.2)] bg-white/5 border border-white/10 backdrop-blur-md"
              />
              {/* Orbiting dot */}
              <motion.div
                className="absolute w-3 h-3 bg-brand-500 rounded-full shadow-glow-sm"
                style={{ top: '50%', left: '50%' }}
                animate={{ rotate: 360 }}
                transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
              >
                <div className="absolute w-3 h-3 bg-brand-500 rounded-full" style={{ transform: 'translateX(130px)' }} />
              </motion.div>
            </motion.div>
          </motion.div>
        </motion.div>
      </div>

      {/* ═══ STATS GRID ═════════════════════════════════════════════ */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-50px" }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-24 relative z-10"
      >
        {statCards.map((metric, i) => {
          const tilt = useTilt();
          return (
            <motion.div
              key={metric.label}
              variants={itemVariants}
              ref={tilt.ref}
              onMouseMove={tilt.handleMouse}
              onMouseLeave={tilt.handleLeave}
              style={{ rotateX: tilt.rotateX, rotateY: tilt.rotateY, transformPerspective: 1000 }}
              className={`glass-panel p-6 md:p-8 rounded-3xl relative overflow-hidden group cursor-default card-hover-glow border border-white/20 dark:border-white/5 transition-shadow duration-500 hover:shadow-xl hover:shadow-brand-500/5`}
            >
              {/* Gradient background */}
              <div className={`absolute inset-0 bg-gradient-to-br ${metric.bg} opacity-0 group-hover:opacity-100 transition-opacity duration-700`} />

              <div className="relative z-10">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-dark-500 dark:text-dark-400 font-medium text-sm md:text-base">{metric.label}</h3>
                  <div className={`p-2.5 bg-dark-100 dark:bg-dark-800 rounded-xl ${metric.color} relative`}>
                    {React.cloneElement(metric.icon, { size: 20 })}
                    {/* Orbiting particle */}
                    <div className="absolute inset-0 animate-orbit opacity-50">
                      <div className={`w-1.5 h-1.5 rounded-full ${metric.color.replace('text-', 'bg-')}`} style={{ transform: 'translateX(14px)' }} />
                    </div>
                  </div>
                </div>
                <div className="text-3xl md:text-4xl lg:text-5xl font-display font-bold text-dark-900 dark:text-white tracking-tight">
                  <AnimatedCounter value={metric.value} suffix={metric.suffix} delay={0.3 + (i * 0.1)} />
                </div>
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      {/* ═══ YOUTUBE STATS + RECENT STREAMS ════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-24 relative z-10">
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
                    <img
                      src={stream.thumbnail}
                      alt={stream.title}
                      className="w-24 h-14 object-cover rounded-lg border border-dark-200 dark:border-dark-700 group-hover:border-brand-500/30 transition-colors"
                    />
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

      {/* ═══ FEATURES SHOWCASE ═══════════════════════════════════════ */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-100px" }}
        className="mb-24 relative z-10"
      >
        <motion.div variants={itemVariants} className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold font-display mb-4">
            Built for <span className="text-gradient-animated">Permanence</span>
          </h2>
          <p className="text-dark-500 dark:text-dark-400 max-w-2xl mx-auto text-lg">
            A fully autonomous preservation system designed to ensure no dawah content is ever lost.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              variants={itemVariants}
              whileHover={{ y: -5 }}
              className="glass-panel p-8 rounded-3xl border border-dark-200 dark:border-dark-800 card-hover-glow group transition-all duration-500 hover:shadow-xl hover:shadow-brand-500/5"
            >
              <motion.div
                whileHover={{ scale: 1.1, rotate: 5 }}
                className={`w-14 h-14 ${feature.bg} rounded-2xl flex items-center justify-center ${feature.color} mb-5`}
              >
                {feature.icon}
              </motion.div>
              <h3 className="text-xl font-bold font-display mb-3 group-hover:text-brand-500 transition-colors">{feature.title}</h3>
              <p className="text-dark-500 dark:text-dark-400 leading-relaxed">{feature.desc}</p>
            </motion.div>
          ))}
        </div>

        {/* Cloud Provider Badges */}
        <motion.div
          variants={itemVariants}
          className="mt-8 flex flex-wrap items-center justify-center gap-4"
        >
          {[
            { name: 'Archive.org', count: sources.archive, color: 'blue' },
            { name: 'MEGA.nz', count: sources.mega, color: 'red' },
            { name: 'Pixeldrain', count: sources.pixel, color: 'purple' },
            { name: 'Gofile', count: sources.gofile, color: 'green' },
          ].filter(p => p.count > 0).map(provider => (
            <motion.div
              key={provider.name}
              whileHover={{ scale: 1.05 }}
              className={`px-4 py-2 rounded-full bg-${provider.color}-500/10 text-${provider.color}-600 dark:text-${provider.color}-400 text-sm font-medium border border-${provider.color}-500/20 backdrop-blur-sm`}
            >
              {provider.name} • {provider.count} recordings
            </motion.div>
          ))}
        </motion.div>
      </motion.div>

      {/* ═══ ARCADE SECTION ═══════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="mb-24 relative z-10"
      >
        <SnakeGame />
      </motion.div>

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
