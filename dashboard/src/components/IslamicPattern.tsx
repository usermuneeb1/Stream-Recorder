import React, { useEffect } from 'react';

// ─── Types ──────────────────────────────────────────────────────────
interface IslamicPatternProps {
  className?: string;
  /** Height of the pattern strip (any valid CSS value) */
  height?: string;
}

// ─── Keyframes ──────────────────────────────────────────────────────
const KEYFRAMES_ID = 'islamic-pattern-keyframes';
function injectKeyframes() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(KEYFRAMES_ID)) return;

  const style = document.createElement('style');
  style.id = KEYFRAMES_ID;
  style.textContent = `
    @keyframes islamic-scroll {
      0% { background-position: 0 0, 0 0, 0 0, 0 0; }
      100% { background-position: 60px 0, 60px 0, 60px 0, 60px 0; }
    }
  `;
  document.head.appendChild(style);
}

/**
 * IslamicPattern — A decorative CSS-only Islamic geometric pattern strip.
 *
 * Uses multiple layered `repeating-linear-gradient`s to create a
 * star/diamond tessellation pattern. The pattern scrolls horizontally
 * at a slow 30-second cycle, adding subtle movement without distraction.
 *
 * Colors use brand-500 at very low opacity (5–8%) to stay subtle.
 */
export const IslamicPattern: React.FC<IslamicPatternProps> = ({
  className = '',
  height = '40px',
}) => {
  useEffect(() => {
    injectKeyframes();
  }, []);

  // Brand-500 (#ef4444) at 6% opacity → rgba(239,68,68,0.06)
  const c1 = 'rgba(239,68,68,0.06)';
  const c2 = 'rgba(239,68,68,0.04)';
  const tr = 'transparent';

  return (
    <div
      className={`w-full overflow-hidden pointer-events-none select-none ${className}`}
      style={{
        height,
        background: [
          // Layer 1: 45° diagonal lines
          `repeating-linear-gradient(45deg, ${c1} 0px, ${c1} 1px, ${tr} 1px, ${tr} 15px)`,
          // Layer 2: -45° diagonal lines → creates diamond grid
          `repeating-linear-gradient(-45deg, ${c1} 0px, ${c1} 1px, ${tr} 1px, ${tr} 15px)`,
          // Layer 3: subtle horizontal lines
          `repeating-linear-gradient(0deg, ${c2} 0px, ${c2} 1px, ${tr} 1px, ${tr} 15px)`,
          // Layer 4: subtle vertical lines
          `repeating-linear-gradient(90deg, ${c2} 0px, ${c2} 1px, ${tr} 1px, ${tr} 15px)`,
        ].join(', '),
        backgroundSize: '30px 30px',
        animation: 'islamic-scroll 30s linear infinite',
      }}
      aria-hidden="true"
    />
  );
};
