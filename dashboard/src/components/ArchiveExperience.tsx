import React from 'react';
import { motion, Variants } from 'framer-motion';
import { BookOpenText, Film, HeartHandshake, PlayCircle, Search, ShieldCheck, Sparkles, Star, TimerReset } from 'lucide-react';

interface ArchiveExperienceProps {
  streams: number;
  hours: number;
  storageGb: number;
}

const container: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.12, delayChildren: 0.08 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 34, scale: 0.96 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 180, damping: 22 },
  },
};

function formatStorage(gb: number) {
  return gb >= 1024 ? `${(gb / 1024).toFixed(1)} TB` : `${gb.toFixed(1)} GB`;
}

const promiseCards = [
  {
    icon: <ShieldCheck />,
    title: 'Preserved with Care',
    desc: 'A clean, focused archive experience designed around long-term access to beneficial content.',
    accent: 'from-emerald-500 to-teal-500',
  },
  {
    icon: <Search />,
    title: 'Fast Discovery',
    desc: 'Search, sort, filter, and open recordings quickly without distracting clutter.',
    accent: 'from-blue-500 to-indigo-500',
  },
  {
    icon: <PlayCircle />,
    title: 'Watch Beautifully',
    desc: 'A polished viewing page with source switching, download access, and responsive layouts.',
    accent: 'from-red-500 to-orange-500',
  },
];

export const ArchiveExperience: React.FC<ArchiveExperienceProps> = ({ streams, hours, storageGb }) => {
  return (
    <motion.section
      variants={container}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-120px' }}
      className="relative mb-24"
    >
      <div className="absolute inset-0 premium-grid-mask pointer-events-none opacity-40" />
      <div className="absolute left-1/2 top-0 h-80 w-80 -translate-x-1/2 rounded-full bg-brand-500/10 blur-[100px] pointer-events-none" />

      <motion.div variants={item} className="relative z-10 text-center mb-10">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/75 dark:bg-dark-900/75 border border-brand-500/20 shadow-lg shadow-brand-500/5 mb-4 backdrop-blur-xl">
          <Sparkles size={15} className="text-brand-500" />
          <span className="text-xs font-black uppercase tracking-[0.28em] text-brand-500">Premium Archive Experience</span>
        </div>
        <h2 className="text-3xl md:text-5xl font-black font-display tracking-tight">
          A refined home for <span className="text-gradient-animated">timeless dawah content</span>
        </h2>
        <p className="mt-4 text-dark-500 dark:text-dark-400 max-w-3xl mx-auto text-base md:text-lg leading-relaxed">
          Built for viewers first: elegant browsing, clear playback, polished presentation, and a calm cinematic interface.
        </p>
      </motion.div>

      <div className="relative z-10 grid grid-cols-1 xl:grid-cols-5 gap-6">
        <motion.div variants={item} className="xl:col-span-3 holographic-card rounded-[2rem] p-6 md:p-8 overflow-hidden">
          <div className="scanline-overlay" />
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
            <div>
              <div className="flex items-center gap-2 text-brand-500 text-sm font-bold mb-3">
                <BookOpenText size={18} /> Collection Overview
              </div>
              <h3 className="text-2xl md:text-3xl font-black font-display">The Muslim Lantern Stream Archive</h3>
              <p className="text-dark-500 dark:text-dark-400 mt-2 max-w-2xl leading-relaxed">
                A dedicated viewing space for preserved sessions, debates, lectures, and live discussions — organized for easy access and long-form watching.
              </p>
            </div>
            <motion.div
              animate={{ rotate: [0, 2, -2, 0], y: [0, -4, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
              className="hidden md:flex h-24 w-24 rounded-[2rem] bg-gradient-to-br from-brand-500 to-orange-500 text-white items-center justify-center shadow-[0_0_60px_rgba(239,68,68,.28)]"
            >
              <Star size={38} fill="currentColor" />
            </motion.div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            {[
              { label: 'Recordings', value: streams.toLocaleString(), icon: <Film /> },
              { label: 'Hours', value: `${hours.toLocaleString()}+`, icon: <TimerReset /> },
              { label: 'Indexed Media', value: formatStorage(storageGb), icon: <BookOpenText /> },
            ].map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.08 }}
                className="rounded-3xl bg-white/70 dark:bg-dark-900/55 border border-dark-200/70 dark:border-white/5 p-5"
              >
                <div className="w-11 h-11 rounded-2xl bg-brand-500/10 text-brand-500 flex items-center justify-center mb-4">
                  {React.cloneElement(stat.icon, { size: 20 })}
                </div>
                <div className="text-2xl font-black font-display">{stat.value}</div>
                <div className="text-xs uppercase tracking-widest text-dark-400 mt-1">{stat.label}</div>
              </motion.div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {promiseCards.map((card) => (
              <motion.div
                key={card.title}
                whileHover={{ y: -6 }}
                className="rounded-3xl bg-dark-50/80 dark:bg-dark-900/50 border border-dark-200/70 dark:border-white/5 p-5 group"
              >
                <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${card.accent} text-white flex items-center justify-center shadow-lg mb-4 group-hover:scale-110 transition-transform`}>
                  {React.cloneElement(card.icon, { size: 20 })}
                </div>
                <h4 className="font-black font-display mb-2">{card.title}</h4>
                <p className="text-sm text-dark-500 dark:text-dark-400 leading-relaxed">{card.desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.div variants={item} className="xl:col-span-2 holographic-card rounded-[2rem] p-6 md:p-8 overflow-hidden relative">
          <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-brand-500/15 blur-3xl" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 text-brand-500 text-sm font-bold mb-3">
              <HeartHandshake size={18} /> Viewer Promise
            </div>
            <h3 className="text-2xl md:text-3xl font-black font-display mb-4">Simple, respectful, distraction-free.</h3>
            <p className="text-dark-500 dark:text-dark-400 leading-relaxed mb-6">
              A calm, respectful interface for watching long-form beneficial content with clarity, focus, and polish.
            </p>

            <div className="space-y-3">
              {[
                'Clean cards and readable metadata',
                'Responsive layout for mobile and desktop',
                'Elegant motion without overwhelming the content',
                'A polished experience focused on the content itself',
              ].map((line, index) => (
                <motion.div
                  key={line}
                  initial={{ opacity: 0, x: 16 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.08 }}
                  className="flex items-start gap-3 rounded-2xl bg-white/70 dark:bg-dark-900/50 border border-dark-200/70 dark:border-white/5 p-3"
                >
                  <div className="mt-0.5 w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center flex-shrink-0">
                    <ShieldCheck size={13} />
                  </div>
                  <span className="text-sm font-medium text-dark-700 dark:text-dark-200">{line}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </motion.section>
  );
};
