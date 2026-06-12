import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const TITLES: Record<string, string> = {
  '/': 'The Muslim Lantern Archive',
  '/gallery': 'Recordings Gallery — The Muslim Lantern Archive',
  '/admin': 'Admin Access — The Muslim Lantern Archive',
  '/command-center': 'Command Center — The Muslim Lantern Archive',
};

export function RouteEffects() {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });

    const path = location.pathname;
    if (path.startsWith('/watch/')) {
      document.title = 'Watch Recording — The Muslim Lantern Archive';
    } else {
      document.title = TITLES[path] || 'The Muslim Lantern Archive';
    }
  }, [location.pathname]);

  return null;
}
