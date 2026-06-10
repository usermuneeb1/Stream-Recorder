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
  sources?: Record<string, number>;
}

const RAW_URL = 'https://raw.githubusercontent.com/usermuneeb1/Stream-Recorder/main';

// ─── Fallback Data ──────────────────────────────────────────────────
const DEFAULT_STATUS_ITEMS: StatusItem[] = [
  { label: 'Recorder', value: 'Standing by', color: 'green' },
  { label: 'Cookie Health', value: 'Checking…', color: 'amber' },
  { label: 'Cloud Mirrors', value: 'Archive + MEGA', color: 'green' },
  { label: 'Archive Size', value: 'Loading…', color: 'amber' },
  { label: 'Last Recording', value: 'Loading…', color: 'amber' },
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
  if (!value) return 'No recordings yet';
  const iso = value.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  if (iso) return iso;
  return value.split(' PKT')[0] || value;
}

function formatHours(hours?: number) {
  if (!Number.isFinite(hours)) return 'Loading…';
  return `${Math.round(hours ?? 0).toLocaleString()}h preserved`;
}

function formatStorage(gb?: number) {
  if (!Number.isFinite(gb)) return 'Loading…';
  const value = gb ?? 0;
  return value >= 1024 ? `${(value / 1024).toFixed(1)} TB` : `${value.toFixed(1)} GB`;
}

function cookieStatusFromEpoch(epochText: string): StatusItem {
  const epoch = Number.parseInt(epochText.trim(), 10);
  if (!Number.isFinite(epoch) || epoch <= 0) {
    return { label: 'Cookie Health', value: 'Unknown', color: 'amber' };
  }

  const ageDays = Math.max(0, Math.floor((Date.now() / 1000 - epoch) / 86400));
  if (ageDays >= 21) return { label: 'Cookie Health', value: `${ageDays}d old`, color: 'red' };
  if (ageDays >= 14) return { label: 'Cookie Health', value: `${ageDays}d old`, color: 'amber' };
  return { label: 'Cookie Health', value: `${ageDays}d old`, color: 'green' };
}

/**
 * SystemHealth — live operational status strip.
 * Pulls the static repo's generated stats files directly from raw GitHub so the
 * dashboard reflects the real archive state without a backend server.
 */
export const SystemHealth: React.FC = () => {
  const [items, setItems] = useState<StatusItem[]>(DEFAULT_STATUS_ITEMS);

  useEffect(() => {
    let cancelled = false;

    async function loadHealth() {
      try {
        const [statsRes, cookieRes] = await Promise.allSettled([
          fetch(`${RAW_URL}/stats.json?t=${Date.now()}`).then(res => res.json() as Promise<ArchiveStats>),
          fetch(`${RAW_URL}/cookie_timestamp.txt?t=${Date.now()}`).then(res => res.text()),
        ]);

        if (cancelled) return;

        const stats = statsRes.status === 'fulfilled' ? statsRes.value : {};
        const sources = stats.sources || {};
        const activeSources = Object.values(sources).filter(count => count > 0).length;
        const cookieItem = cookieRes.status === 'fulfilled'
          ? cookieStatusFromEpoch(cookieRes.value)
          : { label: 'Cookie Health', value: 'Unknown', color: 'amber' as const };

        setItems([
          {
            label: 'Recorder',
            value: `${stats.total_streams ?? 0} streams`,
            color: 'green',
          },
          cookieItem,
          {
            label: 'Cloud Mirrors',
            value: `${activeSources || 0}/4 active`,
            color: activeSources >= 3 ? 'green' : activeSources >= 2 ? 'amber' : 'red',
          },
          {
            label: 'Archive Size',
            value: `${formatStorage(stats.total_gb)} / ${formatHours(stats.total_hours)}`,
            color: 'green',
          },
          {
            label: 'Last Recording',
            value: compactDate(stats.last_stream?.date),
            color: stats.last_stream?.date ? 'green' : 'amber',
          },
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
      aria-label="Archive system health"
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
