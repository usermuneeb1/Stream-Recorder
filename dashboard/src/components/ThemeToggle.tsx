// Sun / moon switch — flips the cinema to the gallery and back.

import { useTheme } from '../lib/theme';

export default function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, toggle] = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      className={`btn-icon theme-toggle ${className}`}
      onClick={toggle}
      title={isDark ? 'Switch to white mode' : 'Switch to dark mode'}
      aria-label={isDark ? 'Switch to white mode' : 'Switch to dark mode'}
    >
      <span className="theme-toggle-icon inline-flex" aria-hidden="true">
        {isDark ? (
          // Sun — you are in the dark; this promises light
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="4.4" />
            <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M19.1 4.9l-1.6 1.6M6.5 17.5l-1.6 1.6" />
          </svg>
        ) : (
          // Moon — you are in the light; this promises the cinema
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.6 14.2A8.6 8.6 0 0 1 9.8 3.4a8.6 8.6 0 1 0 10.8 10.8Z" />
          </svg>
        )}
      </span>
    </button>
  );
}
