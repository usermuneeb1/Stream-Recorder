import React, { useEffect, useState } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';

export const AnimatedCounter: React.FC<{ value: number; suffix?: string; delay?: number }> = ({ value, suffix = '', delay = 0 }) => {
  const [hasAnimated, setHasAnimated] = useState(false);
  
  const spring = useSpring(0, {
    stiffness: 50,
    damping: 20,
    mass: 1,
  });

  const display = useTransform(spring, (current) => 
    Math.round(current).toLocaleString() + suffix
  );

  useEffect(() => {
    const timeout = setTimeout(() => {
      spring.set(value);
      setHasAnimated(true);
    }, delay * 1000);
    return () => clearTimeout(timeout);
  }, [value, delay, spring]);

  return <motion.span>{display}</motion.span>;
};
