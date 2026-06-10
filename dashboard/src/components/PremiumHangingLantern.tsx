import React, { useCallback } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';

/**
 * PremiumHangingLantern
 *
 * A high-end pseudo-3D hero ornament built from the provided lantern artwork.
 * The source asset is 2D, so this component creates a premium 3D illusion with:
 * - pointer-reactive rotateX/rotateY
 * - layered depth copies
 * - side/rim highlights
 * - chain parallax
 * - glass sheen
 * - contained animated flame
 * - cinematic light/reflection blooms
 */
export const PremiumHangingLantern: React.FC = () => {
  const reduceMotion = useReducedMotion();
  const mx = useMotionValue(0);
  const my = useMotionValue(0);

  const springX = useSpring(mx, { stiffness: 120, damping: 18, mass: 0.35 });
  const springY = useSpring(my, { stiffness: 120, damping: 18, mass: 0.35 });

  const rotateY = useTransform(springX, [-0.5, 0.5], [-22, 22]);
  const rotateX = useTransform(springY, [-0.5, 0.5], [14, -14]);
  const chainRotate = useTransform(springX, [-0.5, 0.5], [-5, 5]);
  const shineX = useTransform(springX, [-0.5, 0.5], ['-18%', '18%']);

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
      initial={{ opacity: 0, y: 28, scale: 0.92, filter: 'blur(18px)' }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
      transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.25 }}
      className="hidden lg:flex justify-center relative items-start min-h-[650px] overflow-visible select-none"
      style={{ perspective: 1500 }}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      aria-hidden="true"
    >
      {/* Interaction hint */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 0.62, y: 0 }}
        transition={{ delay: 1.4 }}
        className="absolute right-4 top-7 z-30 rounded-full border border-amber-300/20 bg-black/20 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-amber-200/80 backdrop-blur-xl"
      >
        Move cursor
      </motion.div>

      {/* premium ceiling glint */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-44 h-3 rounded-full bg-gradient-to-r from-transparent via-yellow-200/80 to-transparent blur-[1px]" />
      <div className="absolute top-1 left-1/2 -translate-x-1/2 w-28 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent" />

      {/* cinematic halos */}
      <motion.div
        animate={reduceMotion ? undefined : { scale: [1, 1.16, 1], opacity: [0.16, 0.34, 0.16] }}
        transition={{ duration: 5.8, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute top-52 w-[390px] h-[390px] rounded-full bg-amber-500/20 blur-[100px]"
      />
      <motion.div
        animate={reduceMotion ? undefined : { scale: [1.12, 1, 1.12], opacity: [0.05, 0.16, 0.05] }}
        transition={{ duration: 8.5, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute top-40 w-[530px] h-[530px] rounded-full bg-brand-500/12 blur-[130px]"
      />

      <motion.div
        className="relative origin-top preserve-3d w-[430px] flex justify-center cursor-grab active:cursor-grabbing"
        animate={reduceMotion ? undefined : { y: [0, -4, 2, -2, 0] }}
        transition={{ duration: 8.2, repeat: Infinity, ease: 'easeInOut' }}
        style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
      >
        {/* 3D chain layer */}
        <motion.div
          className="absolute top-0 left-1/2 z-30 w-[96px] h-[238px] -translate-x-1/2 preserve-3d"
          style={{ rotateZ: chainRotate, transformStyle: 'preserve-3d' }}
        >
          <img
            src={`${import.meta.env.BASE_URL}lantern-chain.webp`}
            alt=""
            className="absolute inset-0 h-full w-auto object-contain drop-shadow-[0_0_14px_rgba(251,191,36,0.58)]"
            draggable={false}
          />
          <img
            src={`${import.meta.env.BASE_URL}lantern-chain.webp`}
            alt=""
            className="absolute inset-0 h-full w-auto object-contain opacity-35 blur-[1px] brightness-75"
            style={{ transform: 'translate3d(8px, 0, -28px)' }}
            draggable={false}
          />
        </motion.div>

        {/* joint */}
        <div className="absolute top-[219px] left-1/2 z-20 h-14 w-14 -translate-x-1/2 rounded-full bg-amber-400/15 blur-xl" />

        {/* 3D lantern object */}
        <div className="relative mt-[205px] w-[350px] xl:w-[405px] premium-lantern-wrap preserve-3d" style={{ transformStyle: 'preserve-3d' }}>
          {/* depth shadows behind the image */}
          <img
            src={`${import.meta.env.BASE_URL}lantern-premium.webp`}
            alt=""
            className="absolute inset-0 z-0 w-full h-auto object-contain opacity-20 blur-[2px] brightness-50"
            style={{ transform: 'translate3d(18px, 8px, -80px) scale(.985)' }}
            draggable={false}
          />
          <img
            src={`${import.meta.env.BASE_URL}lantern-premium.webp`}
            alt=""
            className="absolute inset-0 z-[1] w-full h-auto object-contain opacity-30 brightness-75 saturate-75"
            style={{ transform: 'translate3d(-10px, 2px, -42px) scale(.992)' }}
            draggable={false}
          />

          {/* side edge/rim fake geometry */}
          <div className="absolute left-[15%] top-[24%] z-[4] h-[60%] w-5 rounded-full bg-gradient-to-b from-yellow-200/10 via-amber-500/22 to-black/10 blur-[2px]" style={{ transform: 'translateZ(-18px) rotateY(62deg)' }} />
          <div className="absolute right-[15%] top-[24%] z-[4] h-[60%] w-5 rounded-full bg-gradient-to-b from-yellow-200/16 via-orange-500/20 to-black/10 blur-[2px]" style={{ transform: 'translateZ(-18px) rotateY(-62deg)' }} />

          {/* contained internal light */}
          <motion.div
            className="absolute left-1/2 top-[55%] z-[3] h-52 w-36 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-300/18 blur-[44px]"
            animate={reduceMotion ? undefined : { opacity: [0.34, 0.68, 0.42, 0.76, 0.34], scale: [0.96, 1.08, 1.01, 1.12, 0.96] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* main lantern */}
          <img
            src={`${import.meta.env.BASE_URL}lantern-premium.webp`}
            alt="Decorative Islamic lantern"
            className="relative z-10 w-full h-auto object-contain drop-shadow-[0_38px_80px_rgba(0,0,0,0.50)]"
            style={{ transform: 'translateZ(44px)' }}
            draggable={false}
          />

          {/* dynamic glass reflection that follows pointer */}
          <motion.div
            className="absolute z-[12] left-1/2 top-[50%] h-[52%] w-[42%] -translate-x-1/2 -translate-y-1/2 rounded-[44%] pointer-events-none opacity-55 mix-blend-screen"
            style={{ x: shineX, transform: 'translateZ(62px)' }}
          >
            <div className="h-full w-full bg-gradient-to-tr from-transparent via-white/18 to-transparent blur-[1px]" />
          </motion.div>

          {/* refined realistic flame: small, glass-contained */}
          <div className="absolute z-20 left-1/2 top-[58%] -translate-x-1/2 -translate-y-1/2 w-12 h-16 pointer-events-none mix-blend-screen opacity-70" style={{ transform: 'translate3d(-50%, -50%, 68px)' }}>
            <div className="premium-flame premium-flame-outer" />
            <div className="premium-flame premium-flame-mid" />
            <div className="premium-flame premium-flame-core" />
            <div className="premium-flame-spark spark-a" />
            <div className="premium-flame-spark spark-b" />
          </div>

          {/* base reflection */}
          <div className="absolute left-1/2 bottom-3 z-0 h-8 w-56 -translate-x-1/2 rounded-full bg-amber-400/18 blur-2xl" />
        </div>
      </motion.div>
    </motion.div>
  );
};
