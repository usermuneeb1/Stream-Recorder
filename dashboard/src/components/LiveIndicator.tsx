import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Types ──────────────────────────────────────────────────────────
interface LiveIndicatorProps {
  /** Whether the stream is currently live */
  isLive?: boolean;
  /** Compact mode — shows only the dot, no text label */
  compact?: boolean;
}

// ─── Ring Animation Variants ────────────────────────────────────────
/** Creates a single expanding + fading ring animation */
const ringVariant = (delay: number) => ({
  initial: { scale: 1, opacity: 0.6 },
  animate: {
    scale: [1, 2.4],
    opacity: [0.6, 0],
    transition: {
      duration: 1.8,
      repeat: Infinity,
      ease: 'easeOut' as const,
      delay,
    },
  },
});

/**
 * LiveIndicator — A compact live/offline status badge.
 *
 * When live: red pulsing center dot with two concentric rings that
 * expand outward and fade (radar pulse effect) + "LIVE" label.
 *
 * When offline: static gray dot + "Offline" label.
 *
 * Compact mode removes the text label entirely.
 */
export const LiveIndicator: React.FC<LiveIndicatorProps> = ({
  isLive = false,
  compact = false,
}) => {
  return (
    <div className="inline-flex items-center gap-2">
      {/* Dot + ring container */}
      <div className="relative flex items-center justify-center w-4 h-4">
        {/* Expanding pulse rings (only when live) */}
        <AnimatePresence>
          {isLive && (
            <>
              {/* Ring 1 */}
              <motion.span
                key="ring-1"
                className="absolute inset-0 rounded-full border border-brand-500"
                variants={ringVariant(0)}
                initial="initial"
                animate="animate"
                exit={{ opacity: 0, scale: 1 }}
              />
              {/* Ring 2 — staggered */}
              <motion.span
                key="ring-2"
                className="absolute inset-0 rounded-full border border-brand-500"
                variants={ringVariant(0.9)}
                initial="initial"
                animate="animate"
                exit={{ opacity: 0, scale: 1 }}
              />
            </>
          )}
        </AnimatePresence>

        {/* Center dot */}
        <motion.span
          className={`relative z-10 block rounded-full ${
            isLive ? 'w-2.5 h-2.5 bg-brand-500' : 'w-2 h-2 bg-dark-400'
          }`}
          animate={
            isLive
              ? { scale: [1, 1.2, 1], opacity: [1, 0.8, 1] }
              : { scale: 1, opacity: 0.7 }
          }
          transition={
            isLive
              ? { duration: 2, repeat: Infinity, ease: 'easeInOut' as const }
              : { duration: 0.3 }
          }
        />
      </div>

      {/* Text label (hidden in compact mode) */}
      {!compact && (
        <AnimatePresence mode="wait">
          {isLive ? (
            <motion.span
              key="live"
              className="text-xs font-bold uppercase tracking-wider text-brand-500"
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 4 }}
              transition={{ duration: 0.2 }}
            >
              LIVE
            </motion.span>
          ) : (
            <motion.span
              key="offline"
              className="text-xs font-medium text-dark-400"
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 4 }}
              transition={{ duration: 0.2 }}
            >
              Offline
            </motion.span>
          )}
        </AnimatePresence>
      )}
    </div>
  );
};
