import React, { useState, useEffect, useMemo } from 'react';
import { motion, Variants } from 'framer-motion';

// ─── Types ──────────────────────────────────────────────────────────
type HeadingTag = 'h1' | 'h2' | 'h3' | 'p' | 'span';
type AnimationVariant = 'reveal' | 'typewriter' | 'gradient';

interface AnimatedTextProps {
  text: string;
  variant: AnimationVariant;
  className?: string;
  /** HTML element to render as */
  as?: HeadingTag;
  /** Delay in seconds before animation starts */
  delay?: number;
}

// ─── Framer Motion Variants (reveal) ────────────────────────────────
const containerVariants: Variants = {
  hidden: {},
  visible: (delay: number) => ({
    transition: {
      staggerChildren: 0.08,
      delayChildren: delay,
    },
  }),
};

const wordVariants: Variants = {
  hidden: { y: 40, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      type: 'spring',
      damping: 20,
      stiffness: 100,
    },
  },
};

// ─── Inline styles (kept out of render for perf) ────────────────────
const cursorStyle: React.CSSProperties = {
  display: 'inline-block',
  width: '2px',
  height: '1em',
  backgroundColor: 'currentColor',
  marginLeft: '2px',
  verticalAlign: 'text-bottom',
  animation: 'blink-cursor 0.75s step-end infinite',
};

const gradientStyle: React.CSSProperties = {
  backgroundImage: 'linear-gradient(90deg, #ef4444, #f97316, #ef4444, #f97316)',
  backgroundSize: '300% 100%',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
  animation: 'gradient-flow 4s linear infinite',
};

// ─── Keyframes injected once ────────────────────────────────────────
const KEYFRAMES_ID = 'animated-text-keyframes';
function injectKeyframes() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(KEYFRAMES_ID)) return;

  const style = document.createElement('style');
  style.id = KEYFRAMES_ID;
  style.textContent = `
    @keyframes blink-cursor {
      0%, 100% { opacity: 1; }
      50% { opacity: 0; }
    }
    @keyframes gradient-flow {
      0% { background-position: 0% 50%; }
      100% { background-position: 300% 50%; }
    }
  `;
  document.head.appendChild(style);
}

// ─── Sub-components ─────────────────────────────────────────────────

/** Reveal: words slide up with stagger */
const RevealText: React.FC<{ text: string; className?: string; delay: number; Tag: HeadingTag }> = ({
  text,
  className,
  delay,
  Tag,
}) => {
  const words = useMemo(() => text.split(' '), [text]);
  const MotionTag = motion[Tag] as any;

  return (
    <MotionTag
      className={`${className ?? ''}`}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      custom={delay}
      aria-label={text}
    >
      {words.map((word, i) => (
        <motion.span
          key={`${word}-${i}`}
          variants={wordVariants}
          className="inline-block mr-[0.3em]"
        >
          {word}
        </motion.span>
      ))}
    </MotionTag>
  );
};

/** Typewriter: characters appear one-by-one with blinking cursor */
const TypewriterText: React.FC<{ text: string; className?: string; delay: number; Tag: HeadingTag }> = ({
  text,
  className,
  delay,
  Tag,
}) => {
  const [displayedChars, setDisplayedChars] = useState(0);
  const [showCursor, setShowCursor] = useState(true);

  useEffect(() => {
    injectKeyframes();

    // Initial delay
    const delayTimeout = setTimeout(() => {
      let i = 0;
      const interval = setInterval(() => {
        i++;
        setDisplayedChars(i);
        if (i >= text.length) {
          clearInterval(interval);
          // Keep cursor blinking for 2s then hide
          setTimeout(() => setShowCursor(false), 2000);
        }
      }, 45); // Speed per character

      return () => clearInterval(interval);
    }, delay * 1000);

    return () => clearTimeout(delayTimeout);
  }, [text, delay]);

  return (
    <Tag className={className}>
      {text.slice(0, displayedChars)}
      {showCursor && <span style={cursorStyle} aria-hidden="true" />}
    </Tag>
  );
};

/** Gradient: animated flowing gradient text */
const GradientText: React.FC<{ text: string; className?: string; Tag: HeadingTag }> = ({
  text,
  className,
  Tag,
}) => {
  useEffect(() => {
    injectKeyframes();
  }, []);

  return (
    <Tag className={`text-gradient-animated ${className ?? ''}`} style={gradientStyle}>
      {text}
    </Tag>
  );
};

// ─── Main Component ─────────────────────────────────────────────────

/**
 * AnimatedText — Text component with 3 animation variants.
 *
 * - **reveal**: Each word slides up from 40px below with stagger.
 * - **typewriter**: Characters appear one-by-one with a blinking cursor.
 * - **gradient**: Animated flowing gradient (red→orange→red).
 */
export const AnimatedText: React.FC<AnimatedTextProps> = ({
  text,
  variant,
  className,
  as = 'span',
  delay = 0,
}) => {
  switch (variant) {
    case 'reveal':
      return <RevealText text={text} className={className} delay={delay} Tag={as} />;
    case 'typewriter':
      return <TypewriterText text={text} className={className} delay={delay} Tag={as} />;
    case 'gradient':
      return <GradientText text={text} className={className} Tag={as} />;
    default:
      return <span className={className}>{text}</span>;
  }
};
