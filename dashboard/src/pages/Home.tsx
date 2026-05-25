import React, { useEffect, useState } from 'react';
import { motion, Variants } from 'framer-motion';
import { AnimatedCounter } from '../components/AnimatedCounter';
import { fetchStreams, StreamData } from '../utils/dataFetcher';
import { Database, Film, HardDrive, Shield, Globe, Zap } from 'lucide-react';
import { SnakeGame } from '../components/SnakeGame';

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
};

export default function Home() {
  const [stats, setStats] = useState({ total_streams: 0, total_hours: 0, total_gb: 0 });
  const [sources, setSources] = useState({ mega: 0, archive: 0, pixel: 0, gofile: 0 });
  
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
    });
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 py-12 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Hero Section */}
      <motion.div 
        className="mb-20 text-center md:text-left relative z-10"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        <motion.div variants={itemVariants} className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-400 text-sm font-medium mb-6 border border-brand-500/20">
          <Zap size={14} /> Ultra-Premium Infrastructure
        </motion.div>
        
        <motion.h1 
          variants={itemVariants}
          className="text-5xl md:text-7xl font-bold font-display tracking-tight mb-6 leading-tight"
        >
          Preserving the Legacy of <br className="hidden md:block"/>
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-brand-500 via-indigo-400 to-purple-500">
            The Muslim Lantern
          </span>
        </motion.h1>
        
        <motion.p 
          variants={itemVariants}
          className="text-lg md:text-2xl text-dark-500 max-w-3xl mb-8 leading-relaxed font-light"
        >
          A state-of-the-art cinematic archive. Every live session, debate, and lecture is permanently preserved and distributed across a decentralized multi-cloud architecture.
        </motion.p>
      </motion.div>

      {/* Metrics Grid */}
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-20 relative z-10"
      >
        {[
          { label: 'Total Streams', value: stats.total_streams, icon: <Film className="text-blue-500" /> },
          { label: 'Hours Archived', value: stats.total_hours, suffix: '+', icon: <Database className="text-purple-500" /> },
          { label: 'Storage Used', value: stats.total_gb, suffix: ' GB', icon: <HardDrive className="text-brand-500" /> },
        ].map((metric, i) => (
          <motion.div 
            key={metric.label}
            variants={itemVariants}
            whileHover={{ y: -5, scale: 1.02 }}
            className="glass-panel p-8 rounded-3xl relative overflow-hidden group cursor-default shadow-xl shadow-black/5 dark:shadow-none border border-white/20 dark:border-white/5"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent dark:from-white/5 dark:to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-dark-500 dark:text-dark-400 font-medium text-lg">{metric.label}</h3>
              <div className="p-3 bg-dark-100 dark:bg-dark-800 rounded-xl">
                {metric.icon}
              </div>
            </div>
            <div className="text-5xl font-display font-bold text-dark-900 dark:text-white tracking-tight">
              <AnimatedCounter value={metric.value} suffix={metric.suffix} delay={0.2 + (i * 0.1)} />
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Features Showcase */}
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-100px" }}
        className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10"
      >
        <motion.div variants={itemVariants} className="glass-panel p-10 rounded-3xl bg-gradient-to-br from-dark-50 to-white dark:from-[#0f0f13] dark:to-[#09090b] border border-dark-200 dark:border-dark-800">
          <Shield className="w-12 h-12 text-green-500 mb-6" />
          <h3 className="text-2xl font-bold font-display mb-4">Immutable Preservation</h3>
          <p className="text-dark-500 leading-relaxed">
            Recordings are instantly mirrored to Archive.org, ensuring they are permanently written to the historical record, immune to takedowns or platform restrictions.
          </p>
        </motion.div>
        
        <motion.div variants={itemVariants} className="glass-panel p-10 rounded-3xl bg-gradient-to-bl from-dark-50 to-white dark:from-[#0f0f13] dark:to-[#09090b] border border-dark-200 dark:border-dark-800">
          <Globe className="w-12 h-12 text-blue-500 mb-6" />
          <h3 className="text-2xl font-bold font-display mb-4">Decentralized Delivery</h3>
          <p className="text-dark-500 leading-relaxed mb-6">
            Leveraging a multi-provider edge network for lightning-fast playback across the globe.
          </p>
          <div className="flex flex-wrap gap-3">
            {sources.archive > 0 && <span className="px-3 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-sm font-medium">Archive.org ({sources.archive})</span>}
            {sources.mega > 0 && <span className="px-3 py-1 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 text-sm font-medium">MEGA ({sources.mega})</span>}
            {sources.pixel > 0 && <span className="px-3 py-1 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 text-sm font-medium">Pixeldrain ({sources.pixel})</span>}
            {sources.gofile > 0 && <span className="px-3 py-1 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 text-sm font-medium">Gofile ({sources.gofile})</span>}
          </div>
        </motion.div>
      </motion.div>

      {/* Mini Game Section */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="mt-20 relative z-10"
      >
        <SnakeGame />
      </motion.div>
    </div>
  );
}
