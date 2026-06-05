import React from 'react';
import { motion } from 'framer-motion';
import { Users, Eye, Video, ExternalLink } from 'lucide-react';
import { AnimatedCounter } from './AnimatedCounter';
import { MagneticButton } from './MagneticButton';

// ─── Stat item sub-component ────────────────────────────────────────
interface StatItemProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  suffix: string;
  delay: number;
}

const StatItem: React.FC<StatItemProps> = ({ icon, label, value, suffix, delay }) => (
  <motion.div
    className="flex flex-col items-center gap-1 px-4 py-3"
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
  >
    <div className="text-dark-400 dark:text-dark-500 mb-1">{icon}</div>
    <span className="text-2xl font-bold text-dark-900 dark:text-white font-display">
      <AnimatedCounter value={value} suffix={suffix} delay={delay} />
    </span>
    <span className="text-xs text-dark-400 dark:text-dark-500 uppercase tracking-wider">
      {label}
    </span>
  </motion.div>
);

// ─── Keyframes for the avatar glow ring ─────────────────────────────
const GLOW_KEYFRAMES_ID = 'youtube-stats-glow';
if (typeof document !== 'undefined' && !document.getElementById(GLOW_KEYFRAMES_ID)) {
  const style = document.createElement('style');
  style.id = GLOW_KEYFRAMES_ID;
  style.textContent = `
    @keyframes avatar-glow {
      0%, 100% {
        box-shadow: 0 0 12px rgba(239, 68, 68, 0.3), 0 0 24px rgba(239, 68, 68, 0.1);
      }
      50% {
        box-shadow: 0 0 20px rgba(239, 68, 68, 0.5), 0 0 40px rgba(239, 68, 68, 0.2);
      }
    }
  `;
  document.head.appendChild(style);
}

/**
 * YouTubeStats — Premium card showing YouTube channel statistics
 * for "The Muslim Lantern" with glass-panel styling, animated
 * avatar glow ring, and counters that spring into view.
 */
export const YouTubeStats: React.FC = () => {
  return (
    <motion.div
      className="glass-panel rounded-2xl overflow-hidden relative"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Gradient mesh background */}
      <div
        className="absolute inset-0 opacity-30 dark:opacity-20 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 20% 50%, rgba(239,68,68,0.15) 0%, transparent 60%), ' +
            'radial-gradient(ellipse at 80% 20%, rgba(249,115,22,0.1) 0%, transparent 50%), ' +
            'radial-gradient(ellipse at 60% 80%, rgba(239,68,68,0.08) 0%, transparent 50%)',
        }}
      />

      <div className="relative z-10 p-6">
        {/* Header: Avatar + Channel Name */}
        <div className="flex items-center gap-4 mb-6">
          {/* Animated glow ring avatar */}
          <div
            className="w-14 h-14 rounded-full overflow-hidden flex-shrink-0"
            style={{ animation: 'avatar-glow 3s ease-in-out infinite' }}
          >
            <img
              src="/Stream-Recorder/logo-vertical.pn.jpg"
              alt="The Muslim Lantern"
              className="w-full h-full object-cover rounded-full"
              loading="lazy"
            />
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-dark-900 dark:text-white font-display truncate">
              The Muslim Lantern
            </h3>
            <p className="text-sm text-dark-400 dark:text-dark-500">YouTube Channel • Joined Mar 3, 2021</p>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 divide-x divide-dark-200/50 dark:divide-dark-700/50 mb-5">
          <StatItem
            icon={<Users size={16} />}
            label="Subscribers"
            value={633}
            suffix="K"
            delay={0.2}
          />
          <StatItem
            icon={<Eye size={16} />}
            label="Total Views"
            value={183}
            suffix="M"
            delay={0.4}
          />
          <StatItem
            icon={<Video size={16} />}
            label="Videos"
            value={651}
            suffix=""
            delay={0.6}
          />
        </div>

        {/* Subscribe button */}
        <MagneticButton
          href="https://youtube.com/@TheMuslimLantern"
          className="w-full"
        >
          <span className="btn-primary w-full flex items-center justify-center gap-2 rounded-xl">
            <ExternalLink size={14} />
            Subscribe
          </span>
        </MagneticButton>
      </div>
    </motion.div>
  );
};
