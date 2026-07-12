import { useCallback, useState } from 'react';

interface P {
  recordingsCount: number;
  onOpenCmd: () => void;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
}

/**
 * MobileNav — Premium bottom navigation for mobile devices.
 * Fixed bottom bar with glass effect, showing key actions.
 * Only visible on mobile (< 768px).
 */
export function MobileNav({ recordingsCount, onOpenCmd, theme, toggleTheme }: P) {
  const [active, setActive] = useState<'home' | 'search' | 'live'>('home');

  const goHome = useCallback(() => {
    setActive('home');
    window.location.hash = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden glass-premium safe-area-inset-bottom"
      style={{
        borderTop: '1px solid var(--border-subtle)',
        paddingBottom: 'env(safe-area-inset-bottom, 8px)',
      }}
    >
      <div className="flex items-center justify-around px-2 py-2">
        {/* Home button */}
        <NavButton
          active={active === 'home'}
          onClick={goHome}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          }
          label="Home"
        />

        {/* Search / Command Palette */}
        <NavButton
          active={active === 'search'}
          onClick={() => { setActive('search'); onOpenCmd(); }}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          }
          label="Search"
        />

        {/* Theme toggle */}
        <NavButton
          active={false}
          onClick={toggleTheme}
          icon={
            theme === 'dark' ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="4" />
                <path strokeLinecap="round" d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )
          }
          label="Theme"
        />

        {/* YouTube */}
        <NavButton
          active={false}
          onClick={() => window.open('https://youtube.com/@TheMuslimLantern', '_blank')}
          icon={
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M23.5 6.2a3 3 0 00-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 00.5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 002.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 002.1-2.1c.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z" />
            </svg>
          }
          label="YouTube"
          highlight
        />
      </div>
    </nav>
  );
}

function NavButton({
  active,
  onClick,
  icon,
  label,
  highlight,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  highlight?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 px-4 py-1.5 rounded-lg transition-all active:scale-95"
      style={{
        color: active ? 'var(--accent-glow)' : highlight ? 'var(--accent-primary)' : 'var(--text-secondary)',
        background: active ? 'rgba(255, 61, 61, 0.08)' : 'transparent',
      }}
    >
      {icon}
      <span className="text-[10px] font-semibold">{label}</span>
    </button>
  );
}
