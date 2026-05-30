import React from 'react';
import { motion, useScroll, useSpring } from 'framer-motion';

/**
 * ScrollProgress — A thin progress bar fixed at the very top of the viewport.
 *
 * Shows the user's scroll position as a percentage of total page height.
 * Uses framer-motion's `useScroll` to reactively track `scrollYProgress`
 * and applies a smooth spring to the `scaleX` transform.
 *
 * Height: 3px. Gradient: brand-500 → orange-500. z-index: 9999.
 */
export const ScrollProgress: React.FC = () => {
  const { scrollYProgress } = useScroll();

  // Apply a spring for smooth, slightly bouncy feel
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  });

  return (
    <motion.div
      className="fixed top-0 left-0 right-0 h-[3px] origin-left"
      style={{
        scaleX,
        transformOrigin: 'left',
        background: 'linear-gradient(90deg, #ef4444, #f97316)',
        zIndex: 9999,
      }}
      aria-hidden="true"
    />
  );
};
