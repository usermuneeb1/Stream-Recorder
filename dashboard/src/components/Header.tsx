import { useEffect, useRef, useState } from 'react';

interface P {
  q: string;
  setQ: (v: string) => void;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  onOpenCmd: () => void;
  recordingsCount: number;
}

export function Header({ q, setQ, theme, toggleTheme, onOpenCmd, recordingsCount }: P) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [hidden, setHidden] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const goingDown = y > lastY;
        if (y < 100) setHidden(false);
        else if (goingDown && y - lastY > 5) setHidden(true);
        else if (!goingDown && lastY - y > 5) setHidden(false);
        lastY = y;
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if ((e.key === '/') && tag !== 'input' && tag !== 'textarea') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <header
      className="sticky top-0 z-50 glass-premium transition-transform duration-300"
      style={{
        transform: hidden ? 'translateY(-100%)' : 'translateY(0)',
      }}
    >
      <div className="max-w-[1400px] mx-auto flex items-center gap-4 px-4 sm:px-6 lg:px-10 h-[72px] sm:h-[80px]">
        {/* Logo */}
        <a
          href="#"
          onClick={() => { window.location.hash = ''; }}
          className="shrink-0 flex items-center gap-3 group"
        >
          <img src="/logo.png" alt="" className="h-10 sm:h-12 object-contain transition-transform duration-300 group-hover:scale-105" />
          <span className="font-display text-lg sm:text-xl font-bold hidden sm:block" style={{ color: 'var(--gold-primary)' }}>
            Archive
          </span>
        </a>

        <div className="flex-1" />

        {/* Search */}
        <div
          className="relative w-full max-w-[280px] sm:max-w-[400px]"
          style={{
            boxShadow: searchFocused ? 'var(--shadow-gold)' : 'none',
          }}
        >
          <svg
            className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
            style={{ color: searchFocused ? 'var(--gold-primary)' : 'var(--text-muted)' }}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="Search recordings…"
            className="w-full py-2.5 pl-11 pr-12 text-sm rounded-lg focus:outline-none transition-all"
            style={{
              background: 'var(--bg-elevated)',
              border: `1px solid ${searchFocused ? 'var(--border-gold)' : 'var(--border-subtle)'}`,
              color: 'var(--text-primary)',
            }}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono px-1.5 py-0.5 rounded hidden sm:inline-block" style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>
            /
          </span>
        </div>

        {/* Command palette */}
        <button
          onClick={onOpenCmd}
          className="hidden md:flex items-center justify-center w-10 h-10 rounded-lg transition-all hover:scale-105"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
          title="Command palette (⌘K)"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="flex items-center justify-center w-10 h-10 rounded-lg transition-all hover:scale-105"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
          title="Toggle theme"
        >
          {theme === 'dark' ? (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="4" />
              <path strokeLinecap="round" d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>

        {/* YouTube link */}
        <a
          href="https://youtube.com/@TheMuslimLantern"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-premium hidden sm:inline-flex"
          style={{ padding: '10px 20px', fontSize: '13px' }}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M23.5 6.2a3 3 0 00-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 00.5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 002.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 002.1-2.1c.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z" />
          </svg>
          YouTube
        </a>
      </div>
    </header>
  );
}
