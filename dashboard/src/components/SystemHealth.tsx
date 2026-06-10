import React, { useEffect, useState } from 'react';
import { motion, Variants } from 'framer-motion';

// ─── Types ──────────────────────────────────────────────────────────
type StatusColor = 'green' | 'amber' | 'red';

interface StatusItem {
  label: string;
  value: string;
  color: StatusColor;
}

interface ArchiveStats {
  total_streams?: number;
  total_hours?: number;
  total_gb?: number;
  last_stream?: {
    date?: string;
  };
}

const RAW_URL = 'https://raw.githubusercontent.com/usermuneeb1/Stream-Recorder/main';

const DEFAULT_STATUS_ITEMS: StatusItem[] = [
  { label: 'Archive Status', value: 'Available', color: 'green' },
  { label: 'Collection', value: 'Loading…', color: 'amber' },
  { label: 'Watch Experience', value: 'Optimized', color: 'green' },
  { label: 'Preserved Hours', value: 'Loading…', color: 'amber' },
  { label: 'Latest Addition', value: 'Loading…', color: 'amber' },
];

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

function compactDate(value?: string) {
  if (!value) return 'Coming soon';
  const iso = value.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  if (iso) return iso;
  return value.split(' PKT')[0] || value;
}

function formatHours(hours?: number) {
  if (!Number.isFinite(hours)) return 'Loading…';
  return `${Math.round(hours ?? 0).toLocaleString()}h`;
}

/**
 * SystemHealth — public-facing archive status strip.
 * Intentionally avoids exposing operational internals such as cookies, cron,
 * provider refresh details, secrets, or backend implementation mechanics.
 */
export const SystemHealth: React.FC = () => {
  const [items, setItems] = useState<StatusItem[]>(DEFAULT_STATUS_ITEMS);

  useEffect(() => {
    let cancelled = false;

    async function loadHealth() {
      try {
        const stats = await fetch(`${RAW_URL}/stats.json?t=${Date.now()}`).then(res => res.json() as Promise<ArchiveStats>);
        if (cancelled) return;

        setItems([
          { label: 'Archive Status', value: 'Available', color: 'green' },
          { label: 'Collection', value: `${stats.total_streams ?? 0} recordings`, color: 'green' },
          { label: 'Watch Experience', value: 'Optimized', color: 'green' },
          { label: 'Preserved Hours', value: formatHours(stats.total_hours), color: 'green' },
          { label: 'Latest Addition', value: compactDate(stats.last_stream?.date), color: stats.last_stream?.date ? 'green' : 'amber' },
        ]);
      } catch {
        if (!cancelled) setItems(DEFAULT_STATUS_ITEMS);
      }
    }

    loadHealth();
    return () => { cancelled = true; };
  }, []);

  return (
    <motion.div
      className="flex flex-wrap gap-3"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      aria-label="Archive status"
    >
      {items.map((item) => (
        <motion.div
          key={item.label}
          className="glass-panel rounded-xl px-4 py-3 flex items-center gap-3 flex-1 min-w-[160px]"
          variants={itemVariants}
          whileHover={{ y: -2, transition: { duration: 0.2 } }}
        >
          <span
            className={`flex-shrink-0 w-2.5 h-2.5 rounded-full ${DOT_COLORS[item.color]} ${DOT_GLOW[item.color]}`}
          />

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
