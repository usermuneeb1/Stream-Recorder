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

  // Hide-on-scroll-down, reveal-on-scroll-up (iOS Safari / Substack style)
  const [hidden, setHidden] = useState(false);
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

  // "/" focuses search (when not already in an input)
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

  const [searchFocused, setSearchFocused] = useState(false);

  return (
    <header
      className="sticky top-0 z-50 glass-premium no-select transition-transform duration-300"
      style={{
        borderBottom: '1px solid var(--border-subtle)',
        transform: hidden ? 'translateY(-100%)' : 'translateY(0)',
        boxShadow: '0 4px 30px rgba(0, 0, 0, 0.15)',
      }}
    >
      <div className="max-w-[1400px] mx-auto flex items-center gap-3 sm:gap-5 px-4 sm:px-6 lg:px-10 h-[72px] sm:h-[80px]">
        {/* Logo (slow ambient glow) */}
        <a
          href="#"
          onClick={() => { window.location.hash = ''; }}
          className="shrink-0 flex items-center gap-2.5 -ml-1 group"
          aria-label="Muslim Lantern Archive home"
        >
          <img src="/logo.png" alt="" className="h-10 sm:h-12 object-contain logo-glow transition-transform duration-300 group-hover:scale-105" />
        </a>

        {/* Recordings pill (dot + count) — premium glass */}
        <div className="hidden md:flex items-center gap-2 px-3.5 py-2 rounded-full transition-all duration-300 hover:scale-[1.02]" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)', backdropFilter: 'blur(8px)' }}>
          <span className="relative inline-block w-1.5 h-1.5">
            <span className="absolute inset-0 rounded-full" style={{ background: 'var(--accent-glow)' }} />
            <span className="absolute inset-0 rounded-full animate-ping" style={{ background: 'var(--accent-glow)', opacity: 0.55 }} />
          </span>
          <span className="text-[11.5px] font-semibold tabular-nums" style={{ color: 'var(--text-secondary)' }}>
            {recordingsCount} <span style={{ color: 'var(--text-muted)' }}>{recordingsCount === 1 ? 'recording' : 'recordings'}</span>
          </span>
        </div>

        <div className="flex-1" />

        {/* Premium search — glass input, focus glow, kbd hint */}
        <div
          className="relative w-full max-w-[280px] sm:max-w-[360px] transition-all duration-300"
          style={{
            boxShadow: searchFocused ? '0 0 28px rgba(255, 61, 61, 0.18)' : 'none',
            borderRadius: 'var(--r-lg)',
          }}
        >
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none transition-colors"
            style={{ color: searchFocused ? 'var(--accent-glow)' : 'var(--text-muted)' }}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="Search recordings…"
            className="w-full py-2.5 pl-10 pr-12 text-[13.5px] focus:outline-none transition-all"
            style={{
              background: 'var(--bg-elevated)',
              border: `1px solid ${searchFocused ? 'var(--accent-glow)' : 'var(--border-subtle)'}`,
              color: 'var(--text-primary)',
              borderRadius: 'var(--r-lg)',
            }}
          />
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 kbd hidden sm:inline-flex">/</span>
        </div>

        {/* Command palette */}
        <button
          onClick={onOpenCmd}
          className="btn-ghost btn !px-2.5 !py-2 hidden md:inline-flex ring-focus"
          title="Command palette (⌘K)"
          aria-label="Open command palette"
        >
          <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
          </svg>
        </button>

        {/* Theme toggle (animated icon) */}
        <button
          onClick={toggleTheme}
          className="btn-ghost btn !px-2.5 !py-2 ring-focus"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? (
            <svg className="w-[18px] h-[18px] transition-transform duration-500 hover:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="4" />
              <path strokeLinecap="round" d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
          ) : (
            <svg className="w-[18px] h-[18px] transition-transform duration-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>

        {/* YouTube CTA (gradient + scale hover) */}
        <a
          href="https://youtube.com/@TheMuslimLantern"
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-youtube !py-2 !px-3 hidden sm:inline-flex ring-focus"
        >
          <svg className="w-[14px] h-[14px]" viewBox="0 0 24 24" fill="currentColor">
            <path d="M23.5 6.2a3 3 0 00-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 00.5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 002.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 002.1-2.1c.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z" />
          </svg>
          <span className="text-[12px] font-semibold">YouTube</span>
        </a>
      </div>
    </header>
  );
}
