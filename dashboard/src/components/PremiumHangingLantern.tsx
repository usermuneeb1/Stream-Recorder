import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/**
 * PremiumHangingLantern
 * Clean 2D premium hero ornament using the supplied artwork.
 * Design goals: short elegant chain, tasteful swing, cinematic glow, and a
 * realistic layered SVG flame contained inside the lantern glass.
 */
export const PremiumHangingLantern: React.FC = () => {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={{ opacity: 0, y: 22, scale: 0.97, filter: 'blur(12px)' }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
      transition={{ duration: 1.05, ease: [0.16, 1, 0.3, 1], delay: 0.22 }}
      className="hidden lg:flex justify-center relative items-start min-h-[500px] overflow-visible select-none"
      aria-hidden="true"
    >
      {/* premium ceiling glint */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-36 h-3 rounded-full bg-gradient-to-r from-transparent via-yellow-200/75 to-transparent blur-[1px]" />
      <div className="absolute top-1 left-1/2 -translate-x-1/2 w-20 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent" />

      {/* warm atmosphere behind lantern */}
      <motion.div
        animate={reduceMotion ? undefined : { scale: [1, 1.11, 1], opacity: [0.13, 0.26, 0.13] }}
        transition={{ duration: 5.4, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute top-28 h-[390px] w-[390px] rounded-full bg-amber-500/20 blur-[100px]"
      />
      <motion.div
        animate={reduceMotion ? undefined : { scale: [1.08, 1, 1.08], opacity: [0.045, 0.12, 0.045] }}
        transition={{ duration: 8.2, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute top-20 h-[500px] w-[500px] rounded-full bg-brand-500/10 blur-[130px]"
      />

      <motion.div
        className="relative origin-top flex justify-center w-[390px]"
        animate={reduceMotion ? undefined : { rotate: [-1.05, 1.1, -0.7, 0.85, -1.05], y: [0, -2, 1, -1, 0] }}
        transition={{ duration: 8.6, repeat: Infinity, ease: 'easeInOut' }}
      >
        {/* shortened chain from provided reference image */}
        <img
          src={`${import.meta.env.BASE_URL}lantern-chain.webp`}
          alt=""
          className="absolute top-0 left-1/2 z-20 h-[118px] w-auto -translate-x-1/2 object-contain object-top drop-shadow-[0_0_12px_rgba(251,191,36,0.42)]"
          draggable={false}
        />

        {/* connector glow */}
        <div className="absolute top-[104px] left-1/2 z-10 h-12 w-12 -translate-x-1/2 rounded-full bg-amber-400/16 blur-xl" />

        {/* lantern image */}
        <div className="relative mt-[98px] w-[350px] xl:w-[405px]">
          {/* warm light inside the glass */}
          <motion.div
            animate={reduceMotion ? undefined : { opacity: [0.24, 0.48, 0.32, 0.44, 0.24], scale: [0.96, 1.08, 1.0, 1.06, 0.96] }}
            transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute left-1/2 top-[58%] z-[1] h-40 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-300/24 blur-[32px]"
          />
          <motion.div
            animate={reduceMotion ? undefined : { opacity: [0.1, 0.22, 0.12, 0.2, 0.1] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute left-1/2 top-[58%] z-[2] h-24 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-400/24 blur-[18px]"
          />

          <img
            src={`${import.meta.env.BASE_URL}lantern-premium.webp`}
            alt="Decorative Islamic lantern"
            className="relative z-10 w-full h-auto object-contain drop-shadow-[0_36px_76px_rgba(0,0,0,0.48)]"
            draggable={false}
          />

          {/* refined premium flame: SVG gradients, contained and glassy */}
          <motion.div
            className="absolute left-1/2 top-[58.5%] z-20 h-[74px] w-[54px] -translate-x-1/2 -translate-y-1/2 pointer-events-none mix-blend-screen"
            animate={reduceMotion ? undefined : { opacity: [0.72, 0.92, 0.78, 0.88, 0.72] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
          >
            <svg viewBox="0 0 72 96" className="h-full w-full overflow-visible">
              <defs>
                <radialGradient id="lanternFlameOuter" cx="50%" cy="72%" r="62%">
                  <stop offset="0%" stopColor="#fff8c7" stopOpacity="1" />
                  <stop offset="18%" stopColor="#fde68a" stopOpacity="0.98" />
                  <stop offset="43%" stopColor="#fb923c" stopOpacity="0.86" />
                  <stop offset="69%" stopColor="#ef4444" stopOpacity="0.38" />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
                </radialGradient>
                <radialGradient id="lanternFlameCore" cx="50%" cy="75%" r="55%">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
                  <stop offset="36%" stopColor="#fff7ad" stopOpacity="0.96" />
                  <stop offset="78%" stopColor="#f59e0b" stopOpacity="0.08" />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
                </radialGradient>
                <filter id="flameSoftGlow" x="-80%" y="-80%" width="260%" height="260%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              <motion.ellipse
                cx="36"
                cy="67"
                rx="23"
                ry="25"
                fill="#f59e0b"
                opacity="0.14"
                filter="url(#flameSoftGlow)"
                animate={reduceMotion ? undefined : { rx: [21, 26, 22, 24, 21], opacity: [0.12, 0.22, 0.15, 0.2, 0.12] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
              />

              <motion.path
                d="M36 88 C18 72 19 53 30 39 C35 31 36 20 34 11 C50 25 58 43 53 58 C50 68 44 78 36 88Z"
                fill="url(#lanternFlameOuter)"
                filter="url(#flameSoftGlow)"
                animate={reduceMotion ? undefined : {
                  d: [
                    'M36 88 C18 72 19 53 30 39 C35 31 36 20 34 11 C50 25 58 43 53 58 C50 68 44 78 36 88Z',
                    'M36 88 C20 72 17 54 31 37 C39 28 37 18 35 10 C54 28 55 45 52 59 C49 70 43 78 36 88Z',
                    'M36 88 C17 73 20 55 29 40 C34 32 33 23 36 12 C48 26 60 44 52 61 C49 70 45 79 36 88Z',
                    'M36 88 C18 72 19 53 30 39 C35 31 36 20 34 11 C50 25 58 43 53 58 C50 68 44 78 36 88Z',
                  ],
                  rotate: [-1, 2, -2, -1],
                  scaleY: [1, 1.06, 0.98, 1],
                }}
                transition={{ duration: 1.05, repeat: Infinity, ease: 'easeInOut' }}
                style={{ transformOrigin: '36px 88px' }}
              />

              <motion.path
                d="M36 84 C25 70 27 56 34 47 C38 41 40 33 39 25 C49 39 49 54 45 65 C43 73 39 79 36 84Z"
                fill="url(#lanternFlameCore)"
                animate={reduceMotion ? undefined : {
                  d: [
                    'M36 84 C25 70 27 56 34 47 C38 41 40 33 39 25 C49 39 49 54 45 65 C43 73 39 79 36 84Z',
                    'M36 84 C27 70 26 57 35 45 C41 39 39 31 40 24 C50 40 48 55 44 66 C42 74 39 80 36 84Z',
                    'M36 84 C24 70 28 57 34 48 C37 42 38 35 38 27 C47 40 50 55 44 67 C42 75 40 80 36 84Z',
                    'M36 84 C25 70 27 56 34 47 C38 41 40 33 39 25 C49 39 49 54 45 65 C43 73 39 79 36 84Z',
                  ],
                  opacity: [0.9, 1, 0.82, 0.9],
                }}
                transition={{ duration: 0.72, repeat: Infinity, ease: 'easeInOut' }}
              />

              {[{ x: 26, d: 0 }, { x: 45, d: 0.35 }, { x: 36, d: 0.7 }].map((spark) => (
                <motion.circle
                  key={spark.d}
                  cx={spark.x}
                  cy="56"
                  r="1.5"
                  fill="#fde68a"
                  animate={reduceMotion ? undefined : { y: [0, -26], opacity: [0, 0.75, 0], scale: [0.6, 1, 0.2] }}
                  transition={{ duration: 1.5, repeat: Infinity, delay: spark.d, ease: 'easeOut' }}
                />
              ))}
            </svg>
          </motion.div>

          {/* subtle glass glint */}
          <motion.div
            animate={reduceMotion ? undefined : { opacity: [0.18, 0.34, 0.18], x: [-7, 7, -7] }}
            transition={{ duration: 4.6, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute left-[47%] top-[45%] z-30 h-32 w-8 rotate-12 rounded-full bg-gradient-to-b from-white/25 to-transparent blur-[1px] mix-blend-screen"
          />

          {/* soft table/floor reflection */}
          <div className="absolute left-1/2 bottom-2 z-0 h-8 w-56 -translate-x-1/2 rounded-full bg-amber-400/18 blur-2xl" />
        </div>
      </motion.div>
    </motion.div>
  );
};
