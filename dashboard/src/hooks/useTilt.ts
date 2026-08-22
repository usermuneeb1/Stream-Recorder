// Subtle 3D tilt for cards — desktop fine-pointer only, respects reduced motion.

import { useCallback, useEffect, useRef } from 'react';

export function useTilt(strength = 6) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    let raf = 0;
    let rect: DOMRect | null = null;   // cached per hover — no layout reads on every move
    const onEnter = () => { rect = el.getBoundingClientRect(); };
    const onMove = (e: MouseEvent) => {
      if (!rect) rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.transform = `perspective(800px) rotateX(${(-py * strength).toFixed(2)}deg) rotateY(${(px * strength).toFixed(2)}deg) translateZ(6px)`;
      });
    };
    const onLeave = () => {
      cancelAnimationFrame(raf);
      rect = null;
      el.style.transform = '';
    };

    el.addEventListener('mouseenter', onEnter);
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('mouseenter', onEnter);
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
    };
  }, [strength]);

  const setRef = useCallback((node: HTMLDivElement | null) => {
    ref.current = node;
  }, []);

  return setRef;
}
