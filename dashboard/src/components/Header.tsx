import { useEffect, useRef } from 'react';

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

  return (
    <header
      className="sticky top-0 z-50 glass border-b no-select"
      style={{ borderColor: 'var(--bd)' }}
    >
      <div className="max-w-[1400px] mx-auto flex items-center gap-3 sm:gap-5 px-4 sm:px-6 lg:px-10 h-[88px] sm:h-[104px]">
        {/* Logo */}
        <a
          href="#"
          onClick={() => { window.location.hash = ''; }}
          className="shrink-0 flex items-center gap-2.5 -ml-1"
          aria-label="Home"
        >
          <img src="/logo.png" alt="" className="h-[68px] sm:h-[84px] object-contain" />
        </a>

        {/* Spacer / count */}
        <div className="hidden md:flex items-center gap-1.5 text-[11px] font-medium" style={{ color: 'var(--tx3)' }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--emerald)' }} />
          {recordingsCount} {recordingsCount === 1 ? 'recording' : 'recordings'}
        </div>

        <div className="flex-1" />

        {/* Search */}
        <div className="relative w-full max-w-[260px] sm:max-w-[320px]">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
            style={{ color: 'var(--tx3)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search recordings, guests, dates…"
            className="w-full rounded-lg py-2 pl-9 pr-12 text-[13px] focus:outline-none ring-focus transition-all"
            style={{ background: 'var(--bg3)', border: '1px solid var(--bd2)', color: 'var(--tx)' }}
          />
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 kbd hidden sm:inline-flex">/</span>
        </div>

        {/* Command palette */}
        <button
          onClick={onOpenCmd}
          className="btn-ghost btn !px-2.5 !py-2 hidden md:inline-flex"
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

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="btn-ghost btn !px-2.5 !py-2"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? (
            <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="4" />
              <path strokeLinecap="round" d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
          ) : (
            <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>

        {/* YouTube */}
        <a
          href="https://youtube.com/@TheMuslimLantern"
          target="_blank"
          rel="noopener noreferrer"
          className="btn !py-1.5 !px-3 hidden sm:inline-flex"
          style={{ background: 'var(--red)', borderColor: 'var(--red)', color: '#fff' }}
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
