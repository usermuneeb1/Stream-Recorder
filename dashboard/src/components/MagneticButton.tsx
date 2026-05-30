import React, { useRef, useState, useCallback } from 'react';
import { motion, useSpring, useTransform, MotionValue } from 'framer-motion';

// ─── Types ──────────────────────────────────────────────────────────
interface MagneticButtonProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  /** If provided, renders an <a> tag instead of <button> */
  href?: string;
}

// ─── Spring Config ──────────────────────────────────────────────────
const SPRING_CONFIG = { stiffness: 150, damping: 15, mass: 0.1 };
const MAGNETIC_STRENGTH = 0.35; // Controls how far the button shifts (0–1)

/**
 * MagneticButton — A button wrapper that subtly shifts toward the
 * cursor when hovering. Uses framer-motion springs for a fluid
 * snap-back animation on mouse leave.
 *
 * Renders as `<a>` when `href` is provided, `<button>` otherwise.
 */
export const MagneticButton: React.FC<MagneticButtonProps> = ({
  children,
  className = '',
  onClick,
  href,
}) => {
  const ref = useRef<HTMLButtonElement | HTMLAnchorElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  // Spring-driven x/y offsets
  const x = useSpring(0, SPRING_CONFIG);
  const y = useSpring(0, SPRING_CONFIG);

  /** Calculate offset from element center and update springs */
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!ref.current) return;

      const rect = ref.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      // Offset capped by MAGNETIC_STRENGTH → approx 5–8px shift
      const dx = (e.clientX - centerX) * MAGNETIC_STRENGTH;
      const dy = (e.clientY - centerY) * MAGNETIC_STRENGTH;

      x.set(dx);
      y.set(dy);
    },
    [x, y]
  );

  /** Snap back to center on mouse leave */
  const handleMouseLeave = useCallback(() => {
    x.set(0);
    y.set(0);
    setIsHovered(false);
  }, [x, y]);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
  }, []);

  // Shared motion style
  const motionStyle = { x, y };

  // Shared props for both <a> and <button>
  const sharedProps = {
    ref: ref as React.Ref<any>,
    className: `inline-block cursor-pointer ${className}`,
    onMouseMove: handleMouseMove,
    onMouseLeave: handleMouseLeave,
    onMouseEnter: handleMouseEnter,
    style: motionStyle,
  };

  // Render as <a> if href is provided
  if (href) {
    return (
      <motion.a
        {...sharedProps}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </motion.a>
    );
  }

  return (
    <motion.button {...sharedProps} onClick={onClick} type="button">
      {children}
    </motion.button>
  );
};
