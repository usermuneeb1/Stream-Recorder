import React, { useCallback } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';

/**
 * Real CSS-3D lantern — not a flat image.
 * Built from 3D-transformed panels, rings, caps, chain links, glass and flame.
 */
export const PremiumHangingLantern: React.FC = () => {
  const reduceMotion = useReducedMotion();
  const mx = useMotionValue(0);
  const my = useMotionValue(0);

  const sx = useSpring(mx, { stiffness: 110, damping: 20, mass: 0.35 });
  const sy = useSpring(my, { stiffness: 110, damping: 20, mass: 0.35 });
  const rotateY = useTransform(sx, [-0.5, 0.5], [-32, 32]);
  const rotateX = useTransform(sy, [-0.5, 0.5], [18, -18]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (reduceMotion) return;
    const rect = event.currentTarget.getBoundingClientRect();
    mx.set((event.clientX - rect.left) / rect.width - 0.5);
    my.set((event.clientY - rect.top) / rect.height - 0.5);
  }, [mx, my, reduceMotion]);

  const handlePointerLeave = useCallback(() => {
    mx.set(0);
    my.set(0);
  }, [mx, my]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.92, filter: 'blur(16px)' }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
      transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
      className="hidden lg:flex relative min-h-[650px] items-start justify-center overflow-visible select-none"
      style={{ perspective: 1400 }}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      aria-hidden="true"
    >
      <div className="absolute top-4 right-6 z-30 rounded-full border border-amber-300/20 bg-black/20 px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-amber-200/80 backdrop-blur-xl">
        Interactive 3D
      </div>

      {/* premium light atmosphere */}
      <motion.div
        animate={reduceMotion ? undefined : { opacity: [0.18, 0.35, 0.18], scale: [0.96, 1.12, 0.96] }}
        transition={{ duration: 4.8, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute top-48 h-[420px] w-[420px] rounded-full bg-amber-500/20 blur-[105px]"
      />
      <div className="absolute top-0 left-1/2 h-2 w-44 -translate-x-1/2 rounded-full bg-gradient-to-r from-transparent via-yellow-200/70 to-transparent blur-[1px]" />

      {/* hanging chain */}
      <motion.div
        className="absolute left-1/2 top-2 z-20 flex -translate-x-1/2 flex-col items-center css-chain-3d"
        animate={reduceMotion ? undefined : { rotateZ: [-1.8, 1.8, -1.2, 1.2, -1.8] }}
        transition={{ duration: 7.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        {Array.from({ length: 14 }).map((_, i) => (
          <span key={i} className="chain-link" style={{ transform: `rotate(${i % 2 ? 90 : 0}deg)` }} />
        ))}
        <span className="chain-hook" />
      </motion.div>

      {/* full 3D object */}
      <motion.div
        className="relative mt-[205px] h-[360px] w-[310px] preserve-3d cursor-grab active:cursor-grabbing"
        style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
        animate={reduceMotion ? undefined : { y: [0, -4, 2, -2, 0] }}
        transition={{ duration: 7.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div className="lantern-shadow" />

        <div className="lantern-hook-3d" />
        <div className="lantern-roof-3d">
          {Array.from({ length: 8 }).map((_, i) => <span key={i} style={{ transform: `rotateY(${i * 45}deg) translateZ(44px) rotateX(28deg)` }} />)}
        </div>
        <div className="lantern-top-ring-3d" />
        <div className="lantern-bottom-ring-3d" />
        <div className="lantern-base-tip-3d" />

        <div className="lantern-body-3d">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="lantern-panel-3d"
              style={{ transform: `rotateY(${i * 45}deg) translateZ(86px)` }}
            >
              <div className="panel-arch" />
              <div className="panel-glass" />
              <div className="panel-shine" />
            </div>
          ))}
        </div>

        <div className="lantern-inner-glow-3d" />
        <div className="lantern-flame-3d">
          <span className="flame-layer flame-outer" />
          <span className="flame-layer flame-mid" />
          <span className="flame-layer flame-core" />
          <span className="flame-particle p1" />
          <span className="flame-particle p2" />
          <span className="flame-particle p3" />
        </div>
      </motion.div>
    </motion.div>
  );
};
