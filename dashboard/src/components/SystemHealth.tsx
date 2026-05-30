import React from 'react';
import { motion, Variants } from 'framer-motion';

// ─── Types ──────────────────────────────────────────────────────────
type StatusColor = 'green' | 'amber' | 'red';

interface StatusItem {
  label: string;
  value: string;
  color: StatusColor;
}

// ─── Static Data ────────────────────────────────────────────────────
const STATUS_ITEMS: StatusItem[] = [
  { label: 'Last Recording', value: 'May 29, 2026', color: 'green' },
  { label: 'Cookie Status', value: 'Fresh', color: 'green' },
  { label: 'System Uptime', value: '47 days', color: 'green' },
  { label: 'Next Stream', value: 'Thursday', color: 'amber' },
  { label: 'Cloud Status', value: '4/4 Active', color: 'green' },
];

// ─── Color Map ──────────────────────────────────────────────────────
const DOT_COLORS: Record<StatusColor, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-brand-500',
};

const DOT_GLOW: Record<StatusColor, string> = {
  green: 'shadow-[0_0_6px_rgba(16,185,129,0.4)]',
  amber: 'shadow-[0_0_6px_rgba(245,158,11,0.4)]',
  red: 'shadow-[0_0_6px_rgba(239,68,68,0.4)]',
};

// ─── Framer Motion Variants ─────────────────────────────────────────
const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring',
      damping: 20,
      stiffness: 100,
    },
  },
};

/**
 * SystemHealth — Horizontal status strip showing key system metrics.
 *
 * Displays 5 items in a responsive row: each card has a colored dot
 * indicator, a label, and a value. Cards use glass-panel styling and
 * stagger into view on mount.
 */
export const SystemHealth: React.FC = () => {
  return (
    <motion.div
      className="flex flex-wrap gap-3"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {STATUS_ITEMS.map((item) => (
        <motion.div
          key={item.label}
          className="glass-panel rounded-xl px-4 py-3 flex items-center gap-3 flex-1 min-w-[160px]"
          variants={itemVariants}
          whileHover={{ y: -2, transition: { duration: 0.2 } }}
        >
          {/* Status dot */}
          <span
            className={`flex-shrink-0 w-2.5 h-2.5 rounded-full ${DOT_COLORS[item.color]} ${DOT_GLOW[item.color]}`}
          />

          {/* Label + Value */}
          <div className="min-w-0">
            <p className="text-[11px] text-dark-400 dark:text-dark-500 uppercase tracking-wider leading-tight truncate">
              {item.label}
            </p>
            <p className="text-sm font-semibold text-dark-900 dark:text-white truncate">
              {item.value}
            </p>
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
};
