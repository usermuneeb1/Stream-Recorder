import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/**
 * PremiumHangingLantern
 * Clean 2D premium hero ornament using the supplied lantern artwork.
 * No cheap fake-3D model: just a polished hanging lantern, realistic chain,
 * subtle swing, warm internal glow, and tasteful cinematic lighting.
 */
export const PremiumHangingLantern: React.FC = () => {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={{ opacity: 0, y: 26, scale: 0.96, filter: 'blur(14px)' }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
      transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.25 }}
      className="hidden lg:flex justify-center relative items-start min-h-[610px] overflow-visible select-none"
      aria-hidden="true"
    >
      {/* top ceiling glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-3 rounded-full bg-gradient-to-r from-transparent via-yellow-200/70 to-transparent blur-[1px]" />
      <div className="absolute top-1 left-1/2 -translate-x-1/2 w-24 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent" />

      {/* warm atmosphere behind lantern */}
      <motion.div
        animate={reduceMotion ? undefined : { scale: [1, 1.12, 1], opacity: [0.14, 0.28, 0.14] }}
        transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute top-44 h-[380px] w-[380px] rounded-full bg-amber-500/20 blur-[105px]"
      />
      <motion.div
        animate={reduceMotion ? undefined : { scale: [1.08, 1, 1.08], opacity: [0.05, 0.13, 0.05] }}
        transition={{ duration: 8.2, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute top-36 h-[500px] w-[500px] rounded-full bg-brand-500/10 blur-[130px]"
      />

      <motion.div
        className="relative origin-top flex justify-center w-[390px]"
        animate={reduceMotion ? undefined : { rotate: [-1.4, 1.35, -0.85, 1.05, -1.4], y: [0, -3, 1, -2, 0] }}
        transition={{ duration: 7.8, repeat: Infinity, ease: 'easeInOut' }}
      >
        {/* chain from provided reference image */}
        <img
          src={`${import.meta.env.BASE_URL}lantern-chain.webp`}
          alt=""
          className="absolute top-0 left-1/2 z-20 h-[238px] w-auto -translate-x-1/2 object-contain drop-shadow-[0_0_13px_rgba(251,191,36,0.48)]"
          draggable={false}
        />

        {/* connector glow */}
        <div className="absolute top-[214px] left-1/2 z-10 h-14 w-14 -translate-x-1/2 rounded-full bg-amber-400/16 blur-xl" />

        {/* lantern image */}
        <div className="relative mt-[205px] w-[320px] xl:w-[370px]">
          {/* internal glow carefully clipped by image area */}
          <motion.div
            animate={reduceMotion ? undefined : { opacity: [0.28, 0.55, 0.36, 0.5, 0.28], scale: [0.96, 1.08, 1.01, 1.06, 0.96] }}
            transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute left-1/2 top-[58%] z-[1] h-44 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-300/22 blur-[34px]"
          />

          <img
            src={`${import.meta.env.BASE_URL}lantern-premium.webp`}
            alt="Decorative Islamic lantern"
            className="relative z-10 w-full h-auto object-contain drop-shadow-[0_38px_80px_rgba(0,0,0,0.50)]"
            draggable={false}
          />

          {/* small contained flame glow — subtle, not cartoon */}
          <div className="absolute left-1/2 top-[58.5%] z-20 h-16 w-12 -translate-x-1/2 -translate-y-1/2 pointer-events-none mix-blend-screen opacity-65">
            <motion.div
              animate={reduceMotion ? undefined : { scaleY: [1, 1.12, 0.94, 1.08, 1], scaleX: [0.95, 0.86, 1.04, 0.9, 0.95], x: [-1, 1.2, -0.8, 0.7, -1] }}
              transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute left-1/2 bottom-2 h-12 w-7 -translate-x-1/2 rounded-[60%_40%_55%_45%/74%_70%_30%_26%] bg-[radial-gradient(circle_at_50%_78%,#fff7ad_0_12%,#facc15_24%,#fb923c_52%,rgba(239,68,68,0)_78%)] blur-[0.2px] drop-shadow-[0_0_14px_rgba(251,191,36,0.75)]"
            />
            <motion.div
              animate={reduceMotion ? undefined : { opacity: [0.8, 1, 0.72, 0.95, 0.8], y: [0, -2, 1, -1, 0] }}
              transition={{ duration: 0.65, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute left-1/2 bottom-4 h-7 w-4 -translate-x-1/2 rounded-[60%_40%_55%_45%/74%_70%_30%_26%] bg-[radial-gradient(circle_at_50%_80%,#fff_0_20%,#fde68a_42%,rgba(245,158,11,0)_76%)]"
            />
          </div>

          {/* soft table/floor reflection */}
          <div className="absolute left-1/2 bottom-2 z-0 h-8 w-56 -translate-x-1/2 rounded-full bg-amber-400/18 blur-2xl" />
        </div>
      </motion.div>
    </motion.div>
  );
};
