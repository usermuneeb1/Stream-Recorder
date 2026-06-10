import React from 'react';
import { motion, Variants } from 'framer-motion';
import { Activity, Archive, Bell, CheckCircle2, Cloud, Database, DownloadCloud, Film, Gauge, Globe2, HardDrive, LockKeyhole, Radio, RefreshCcw, ShieldCheck, Sparkles, UploadCloud, Wifi } from 'lucide-react';

interface PremiumShowcaseProps {
  streams: number;
  hours: number;
  storageGb: number;
  sources: {
    archive: number;
    mega: number;
    pixel: number;
    gofile: number;
  };
}

const container: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.05 },
  },
};

const item: Variants = {
  hidden: { opacity: 0, y: 28, filter: 'blur(10px)' },
  show: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { type: 'spring', stiffness: 180, damping: 22 },
  },
};

const pipeline = [
  { icon: <Radio />, title: 'Live Detection', desc: 'Cron probes channel state every few minutes with layered YouTube detection.', tone: 'from-red-500 to-orange-500' },
  { icon: <Film />, title: 'Resilient Capture', desc: 'yt-dlp, Streamlink, and fallback clients compete to secure the stream.', tone: 'from-orange-500 to-amber-500' },
  { icon: <Gauge />, title: 'Post Process', desc: 'ffprobe validation, metadata extraction, thumbnail fallback, and quality checks.', tone: 'from-amber-500 to-yellow-500' },
  { icon: <UploadCloud />, title: 'Multi-Cloud Fanout', desc: 'Archive.org, MEGA, Pixeldrain, and Gofile mirrors are published automatically.', tone: 'from-emerald-500 to-cyan-500' },
  { icon: <Bell />, title: 'Notify + Index', desc: 'Discord embeds, links.txt, stats.json, and dashboard feed update in one run.', tone: 'from-blue-500 to-indigo-500' },
];

const providers = [
  { key: 'archive', name: 'Archive.org', icon: <Archive />, color: 'text-blue-500', glow: 'bg-blue-500', desc: 'Permanent primary storage' },
  { key: 'mega', name: 'MEGA.nz', icon: <LockKeyhole />, color: 'text-red-500', glow: 'bg-red-500', desc: 'Encrypted mirror' },
  { key: 'pixel', name: 'Pixeldrain', icon: <DownloadCloud />, color: 'text-purple-500', glow: 'bg-purple-500', desc: 'High-speed CDN' },
  { key: 'gofile', name: 'Gofile', icon: <Cloud />, color: 'text-emerald-500', glow: 'bg-emerald-500', desc: 'Redundant mirror' },
] as const;

function formatStorage(gb: number) {
  return gb >= 1024 ? `${(gb / 1024).toFixed(1)} TB` : `${gb.toFixed(1)} GB`;
}

export const PremiumShowcase: React.FC<PremiumShowcaseProps> = ({ streams, hours, storageGb, sources }) => {
  const totalMirrors = Object.values(sources).reduce((sum, value) => sum + value, 0);
  const activeProviders = Object.values(sources).filter(Boolean).length || 4;

  return (
    <motion.section
      variants={container}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-120px' }}
      className="relative mb-24"
    >
      <div className="absolute inset-0 premium-grid-mask pointer-events-none" />
      <div className="absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-brand-500/10 blur-[90px] pointer-events-none" />

      <motion.div variants={item} className="text-center mb-10 relative z-10">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/70 dark:bg-dark-900/70 border border-brand-500/20 shadow-lg shadow-brand-500/5 mb-4 backdrop-blur-xl">
          <Sparkles size={15} className="text-brand-500" />
          <span className="text-xs font-black uppercase tracking-[0.28em] text-brand-500">Autonomous Preservation Engine</span>
        </div>
        <h2 className="text-3xl md:text-5xl font-black font-display tracking-tight">
          Built like a <span className="text-gradient-animated">mission-control archive</span>
        </h2>
        <p className="mt-4 text-dark-500 dark:text-dark-400 max-w-3xl mx-auto text-base md:text-lg leading-relaxed">
          A cinematic front-end over a serverless recording pipeline: detect, capture, verify, mirror, index, and notify — without a traditional backend server.
        </p>
      </motion.div>

      {/* Executive telemetry */}
      <motion.div variants={item} className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-8 relative z-10">
        {[
          { label: 'Streams secured', value: streams.toLocaleString(), icon: <Film size={18} />, accent: 'from-blue-500 to-cyan-500' },
          { label: 'Hours preserved', value: `${hours.toLocaleString()}+`, icon: <Activity size={18} />, accent: 'from-purple-500 to-pink-500' },
          { label: 'Storage indexed', value: formatStorage(storageGb), icon: <HardDrive size={18} />, accent: 'from-red-500 to-orange-500' },
          { label: 'Cloud mirrors', value: `${activeProviders}/4`, icon: <Globe2 size={18} />, accent: 'from-emerald-500 to-teal-500' },
        ].map((metric) => (
          <motion.div
            key={metric.label}
            whileHover={{ y: -6, rotateX: 4, rotateY: -4 }}
            className="holographic-card rounded-3xl p-5 relative overflow-hidden"
          >
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${metric.accent}`} />
            <div className="flex items-center justify-between mb-5">
              <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${metric.accent} text-white flex items-center justify-center shadow-lg`}>
                {metric.icon}
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-dark-400">Live</span>
            </div>
            <div className="text-2xl md:text-3xl font-black font-display text-dark-900 dark:text-white">{metric.value}</div>
            <div className="text-xs uppercase tracking-wider text-dark-400 mt-1">{metric.label}</div>
          </motion.div>
        ))}
      </motion.div>

      {/* Pipeline + constellation */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 relative z-10">
        <motion.div variants={item} className="xl:col-span-3 holographic-card rounded-[2rem] p-5 md:p-7 overflow-hidden relative">
          <div className="scanline-overlay" />
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <h3 className="text-2xl font-black font-display">Preservation Pipeline</h3>
              <p className="text-sm text-dark-500 dark:text-dark-400 mt-1">Every run follows a verified capture-to-cloud lifecycle.</p>
            </div>
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-xs font-bold">
              <Wifi size={13} /> Serverless
            </div>
          </div>

          <div className="space-y-3">
            {pipeline.map((step, index) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.08, type: 'spring', stiffness: 220, damping: 22 }}
                className="group relative flex gap-4 p-4 rounded-2xl bg-white/65 dark:bg-dark-900/45 border border-dark-200/70 dark:border-white/5 hover:border-brand-500/30 transition-all overflow-hidden"
              >
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-r from-brand-500/5 via-transparent to-indigo-500/5" />
                <div className="relative">
                  <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${step.tone} text-white flex items-center justify-center shadow-lg shadow-black/10`}>
                    {React.cloneElement(step.icon, { size: 20 })}
                  </div>
                  {index < pipeline.length - 1 && <div className="absolute left-1/2 top-14 h-6 w-px bg-gradient-to-b from-brand-500/50 to-transparent" />}
                </div>
                <div className="relative min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-brand-500 tracking-widest">0{index + 1}</span>
                    <h4 className="font-bold text-dark-900 dark:text-white">{step.title}</h4>
                  </div>
                  <p className="text-sm text-dark-500 dark:text-dark-400 mt-1 leading-relaxed">{step.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.div variants={item} className="xl:col-span-2 holographic-card rounded-[2rem] p-5 md:p-7 overflow-hidden relative min-h-[520px]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(239,68,68,0.10),transparent_45%)]" />
          <div className="relative z-10 flex items-center justify-between mb-6">
            <div>
              <h3 className="text-2xl font-black font-display">Mirror Constellation</h3>
              <p className="text-sm text-dark-500 dark:text-dark-400 mt-1">{totalMirrors.toLocaleString()} total provider links indexed.</p>
            </div>
            <ShieldCheck className="text-emerald-500" size={24} />
          </div>

          <div className="relative h-[360px] flex items-center justify-center">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 34, repeat: Infinity, ease: 'linear' }}
              className="absolute w-72 h-72 rounded-full border border-dashed border-brand-500/25"
            />
            <motion.div
              animate={{ rotate: -360 }}
              transition={{ duration: 46, repeat: Infinity, ease: 'linear' }}
              className="absolute w-48 h-48 rounded-full border border-dashed border-indigo-500/20"
            />
            <div className="absolute w-28 h-28 rounded-full bg-gradient-to-br from-brand-500 to-orange-500 text-white flex flex-col items-center justify-center shadow-[0_0_60px_rgba(239,68,68,0.35)]">
              <Database size={24} />
              <span className="text-[10px] font-black mt-1 tracking-widest">ARCHIVE</span>
            </div>

            {providers.map((provider, index) => {
              const angle = (index / providers.length) * Math.PI * 2 - Math.PI / 2;
              const radius = 142;
              const x = Math.cos(angle) * radius;
              const y = Math.sin(angle) * radius;
              const count = sources[provider.key] ?? 0;
              return (
                <motion.div
                  key={provider.key}
                  className="absolute"
                  style={{ x, y }}
                  animate={{ y: [y, y - 8, y], scale: [1, 1.04, 1] }}
                  transition={{ duration: 4 + index, repeat: Infinity, ease: 'easeInOut', delay: index * 0.25 }}
                >
                  <div className="relative group">
                    <div className={`absolute inset-0 ${provider.glow}/25 rounded-3xl blur-xl group-hover:blur-2xl transition-all`} />
                    <div className="relative w-28 rounded-3xl bg-white/85 dark:bg-dark-900/85 backdrop-blur-xl border border-white/40 dark:border-white/10 p-3 text-center shadow-xl">
                      <div className={`mx-auto w-10 h-10 rounded-2xl bg-dark-100 dark:bg-dark-800 ${provider.color} flex items-center justify-center mb-2`}>
                        {React.cloneElement(provider.icon, { size: 18 })}
                      </div>
                      <div className="text-xs font-black truncate">{provider.name}</div>
                      <div className="text-[10px] text-dark-400 mt-0.5">{count || 'ready'} links</div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          <div className="relative z-10 grid grid-cols-2 gap-3">
            {[
              { icon: <CheckCircle2 />, label: 'Integrity checked' },
              { icon: <RefreshCcw />, label: 'Refresh protected' },
              { icon: <ShieldCheck />, label: 'Permanent-first' },
              { icon: <Globe2 />, label: 'Static delivery' },
            ].map((point) => (
              <div key={point.label} className="flex items-center gap-2 rounded-2xl bg-dark-50/80 dark:bg-dark-900/60 border border-dark-200/70 dark:border-white/5 px-3 py-2 text-xs font-semibold text-dark-600 dark:text-dark-300">
                {React.cloneElement(point.icon, { size: 14, className: 'text-brand-500 flex-shrink-0' })}
                {point.label}
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </motion.section>
  );
};
