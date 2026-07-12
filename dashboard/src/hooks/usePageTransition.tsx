import { useEffect, useState, type ReactNode } from 'react';

/**
 * usePageTransition — Premium page transition hook.
 * Adds fade-out/fade-in animation when navigating between hash routes.
 */
export function usePageTransition(duration = 250) {
  const [transitioning, setTransitioning] = useState(false);
  const [prevHash, setPrevHash] = useState('');

  useEffect(() => {
    const handleHashChange = () => {
      const newHash = window.location.hash;
      if (newHash !== prevHash) {
        setTransitioning(true);
        setTimeout(() => {
          setPrevHash(newHash);
          setTransitioning(false);
        }, duration);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [prevHash, duration]);

  return { transitioning, prevHash };
}

/**
 * PageTransition — Wrapper component for page transition animations.
 * Wraps content and applies fade/slide transition when hash route changes.
 */
export function PageTransition({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  const { transitioning } = usePageTransition(250);

  return (
    <div
      className={`transition-all duration-250 ease-out ${className}`}
      style={{
        opacity: transitioning ? 0 : 1,
        transform: transitioning ? 'translateY(8px)' : 'translateY(0)',
      }}
    >
      {children}
    </div>
  );
}
