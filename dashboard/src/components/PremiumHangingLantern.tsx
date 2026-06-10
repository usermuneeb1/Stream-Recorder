import React from 'react';
import { motion, MotionValue } from 'framer-motion';

interface PremiumHangingLanternProps {
  rotateX?: MotionValue<number>;
  rotateY?: MotionValue<number>;
}

export const PremiumHangingLantern: React.FC<PremiumHangingLanternProps> = ({ rotateX, rotateY }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 26, scale: 0.92, filter: 'blur(18px)' }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
      transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.25 }}
      className="hidden lg:flex justify-center relative items-start min-h-[620px] overflow-visible"
      style={{ perspective: 1300 }}
      aria-hidden="true"
    >
      {/* polished ceiling glint */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-3 rounded-full bg-gradient-to-r from-transparent via-yellow-200/70 to-transparent blur-[1px]" />
      <div className="absolute top-1 left-1/2 -translate-x-1/2 w-24 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" />

      {/* ambient cinematic halos */}
      <motion.div
        animate={{ scale: [1, 1.16, 1], opacity: [0.18, 0.32, 0.18] }}
        transition={{ duration: 5.8, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute top-52 w-[370px] h-[370px] rounded-full bg-amber-500/20 blur-[95px]"
      />
      <motion.div
        animate={{ scale: [1.12, 1, 1.12], opacity: [0.06, 0.15, 0.06] }}
        transition={{ duration: 8.5, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute top-40 w-[500px] h-[500px] rounded-full bg-brand-500/12 blur-[125px]"
      />

      {/* chain + lantern swing as one physical object */}
      <motion.div
        className="relative origin-top preserve-3d w-[390px] flex justify-center"
        animate={{ rotate: [-1.6, 1.8, -1.1, 1.25, -1.6], y: [0, -3, 1, -2, 0] }}
        transition={{ duration: 8.2, repeat: Infinity, ease: 'easeInOut' }}
        style={{ rotateX, rotateY }}
      >
        {/* chain from provided reference image */}
        <motion.img
          src={`${import.meta.env.BASE_URL}lantern-chain.webp`}
          alt=""
          className="absolute top-0 left-1/2 -translate-x-1/2 h-[230px] w-auto object-contain z-20 drop-shadow-[0_0_12px_rgba(251,191,36,0.45)]"
          animate={{ filter: ['brightness(1)', 'brightness(1.16)', 'brightness(1)'] }}
          transition={{ duration: 4.4, repeat: Infinity, ease: 'easeInOut' }}
          draggable={false}
        />

        {/* top hook glow */}
        <div className="absolute top-[218px] left-1/2 -translate-x-1/2 w-12 h-12 rounded-full bg-amber-400/15 blur-xl z-10" />

        <div className="relative mt-[205px] w-[330px] xl:w-[380px] premium-lantern-wrap">
          {/* contained light behind lantern glass */}
          <div className="absolute left-1/2 top-[54%] -translate-x-1/2 -translate-y-1/2 w-44 h-56 rounded-full bg-amber-300/18 blur-[46px] animate-lantern-breathe" />
          <div className="absolute left-1/2 top-[58%] -translate-x-1/2 -translate-y-1/2 w-24 h-32 rounded-full bg-orange-500/16 blur-[30px] animate-lantern-breathe-delayed" />

          <img
            src={`${import.meta.env.BASE_URL}lantern-premium.webp`}
            alt="Decorative Islamic lantern"
            className="relative z-10 w-full h-auto object-contain drop-shadow-[0_35px_70px_rgba(0,0,0,0.46)]"
            draggable={false}
          />

          {/* refined flame: smaller, centered, and glass-contained */}
          <div className="absolute z-20 left-1/2 top-[58%] -translate-x-1/2 -translate-y-1/2 w-12 h-16 pointer-events-none mix-blend-screen opacity-80">
            <div className="premium-flame premium-flame-outer" />
            <div className="premium-flame premium-flame-mid" />
            <div className="premium-flame premium-flame-core" />
            <div className="premium-flame-spark spark-a" />
            <div className="premium-flame-spark spark-b" />
          </div>

          {/* warm reflection */}
          <div className="absolute left-1/2 bottom-3 -translate-x-1/2 w-52 h-8 bg-amber-400/18 rounded-full blur-2xl" />
        </div>
      </motion.div>
    </motion.div>
  );
};
