import { useCallback, useRef, type MouseEvent } from 'react';

/**
 * useTilt — Premium 3D tilt effect for cards.
 * Tracks mouse position relative to element center and applies
 * CSS transform with perspective for a premium "lifted" feel.
 */
export function useTilt(maxTilt = 6) {
  const ref = useRef<HTMLDivElement>(null);

  const onMouseMove = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = ((y - centerY) / centerY) * -maxTilt;
    const rotateY = ((x - centerX) / centerX) * maxTilt;
    el.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(8px)`;
  }, [maxTilt]);

  const onMouseLeave = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg) translateZ(0px)';
  }, []);

  return { ref, onMouseMove, onMouseLeave };
}

/**
 * useMagnetic — Magnetic pull effect for buttons.
 * Element subtly follows cursor when nearby.
 */
export function useMagnetic(strength = 0.3) {
  const ref = useRef<HTMLButtonElement>(null);

  const onMouseMove = useCallback((e: MouseEvent<HTMLButtonElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    el.style.transform = `translate(${x * strength}px, ${y * strength}px)`;
  }, [strength]);

  const onMouseLeave = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = 'translate(0px, 0px)';
    el.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
    setTimeout(() => { if (el) el.style.transition = ''; }, 400);
  }, []);

  return { ref, onMouseMove, onMouseLeave };
}
