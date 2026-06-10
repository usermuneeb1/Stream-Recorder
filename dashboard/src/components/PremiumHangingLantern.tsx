import React from 'react';
import { motion, MotionValue } from 'framer-motion';

interface PremiumHangingLanternProps {
  rotateX?: MotionValue<number>;
  rotateY?: MotionValue<number>;
}

export const PremiumHangingLantern: React.FC<PremiumHangingLanternProps> = ({ rotateX, rotateY }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.9, filter: 'blur(18px)' }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
      transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.25 }}
      className="hidden lg:flex justify-center relative items-start min-h-[560px] overflow-visible"
      style={{ perspective: 1200 }}
      aria-hidden="true"
    >
      {/* Ceiling mount */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-3 rounded-full bg-gradient-to-r from-transparent via-amber-300/60 to-transparent blur-[1px]" />
      <div className="absolute top-1 left-1/2 -translate-x-1/2 w-20 h-1 rounded-full bg-gradient-to-r from-transparent via-yellow-100/80 to-transparent" />

      {/* Animated hanging string */}
      <motion.div
        className="absolute top-0 left-1/2 -translate-x-1/2 h-32 w-px origin-top"
        animate={{ rotate: [-1.2, 1.4, -0.8, 1.1, -1.2] }}
        transition={{ duration: 7.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-yellow-100 via-amber-400 to-amber-700 shadow-[0_0_12px_rgba(251,191,36,0.55)]" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-yellow-200 shadow-[0_0_18px_rgba(253,224,71,0.7)]" />
      </motion.div>

      {/* Ambient halos */}
      <motion.div
        animate={{ scale: [1, 1.16, 1], opacity: [0.18, 0.34, 0.18] }}
        transition={{ duration: 5.6, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute top-36 w-[360px] h-[360px] rounded-full bg-amber-500/20 blur-[95px]"
      />
      <motion.div
        animate={{ scale: [1.12, 1, 1.12], opacity: [0.06, 0.16, 0.06] }}
        transition={{ duration: 8.5, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute top-28 w-[460px] h-[460px] rounded-full bg-brand-500/14 blur-[120px]"
      />

      {/* Lantern swing group */}
      <motion.div
        className="relative mt-24 origin-top preserve-3d"
        animate={{ rotate: [-2.2, 2.4, -1.5, 1.8, -2.2], y: [0, -4, 2, -2, 0] }}
        transition={{ duration: 7.5, repeat: Infinity, ease: 'easeInOut' }}
        style={{ rotateX, rotateY }}
      >
        {/* chain connector glow */}
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-9 h-9 rounded-full border border-amber-300/50 shadow-[0_0_28px_rgba(251,191,36,0.45)]" />

        <div className="relative w-[330px] xl:w-[380px] premium-lantern-wrap">
          {/* Light beams behind glass */}
          <div className="absolute left-1/2 top-[48%] -translate-x-1/2 w-48 h-64 rounded-full bg-amber-300/25 blur-[55px] animate-lantern-breathe" />
          <div className="absolute left-1/2 top-[58%] -translate-x-1/2 w-28 h-40 rounded-full bg-orange-500/25 blur-[38px] animate-lantern-breathe-delayed" />

          <img
            src={`${import.meta.env.BASE_URL}lantern-premium.webp`}
            alt="Decorative Islamic lantern"
            className="relative z-10 w-full h-auto object-contain drop-shadow-[0_35px_70px_rgba(0,0,0,0.45)]"
            draggable={false}
          />

          {/* Animated flame overlay */}
          <div className="absolute z-20 left-1/2 top-[58.5%] -translate-x-1/2 -translate-y-1/2 w-20 h-28 pointer-events-none mix-blend-screen">
            <div className="premium-flame premium-flame-outer" />
            <div className="premium-flame premium-flame-mid" />
            <div className="premium-flame premium-flame-core" />
            <div className="premium-flame-spark spark-a" />
            <div className="premium-flame-spark spark-b" />
            <div className="premium-flame-spark spark-c" />
          </div>

          {/* Floor reflection */}
          <div className="absolute left-1/2 bottom-2 -translate-x-1/2 w-56 h-9 bg-amber-400/20 rounded-full blur-2xl" />
        </div>
      </motion.div>
    </motion.div>
  );
};
