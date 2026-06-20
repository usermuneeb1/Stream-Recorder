interface Props {
  search: string;
  onSearch: (v: string) => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export function Header({ search, onSearch, theme, onToggleTheme }: Props) {
  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl border-b" style={{ background: `color-mix(in srgb, var(--bg-primary) 85%, transparent)`, borderColor: 'var(--border)' }}>
      <div className="max-w-[1800px] mx-auto flex items-center gap-3 sm:gap-5 px-3 sm:px-6 lg:px-10 h-14">
        {/* Logo + Title */}
        <a href="#" className="flex items-center gap-2.5 shrink-0" onClick={() => { window.location.hash = ''; }}>
          <img src="/logo-vertical.pn.jpg" alt="" className="w-8 h-8 rounded-full object-cover" />
          <div className="hidden sm:block">
            <span className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>The Muslim Lantern</span>
            <span className="text-[11px] ml-2 px-1.5 py-0.5 rounded font-medium" style={{ background: 'var(--accent)', color: '#fff' }}>ARCHIVE</span>
          </div>
        </a>

        {/* Search */}
        <div className="flex-1 max-w-xl mx-auto">
          <div className="relative flex">
            <input
              type="text"
              value={search}
              onChange={e => onSearch(e.target.value)}
              placeholder="Search streams, guests..."
              className="w-full rounded-l-full py-2.5 pl-5 pr-4 text-sm focus:outline-none transition-all"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRight: 'none', color: 'var(--text-primary)' }}
            />
            <button className="px-5 rounded-r-full flex items-center justify-center" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderLeft: 'none' }}>
              <svg className="w-4 h-4" style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Theme Toggle */}
        <button
          onClick={onToggleTheme}
          className="p-2 rounded-full transition-colors"
          style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
          title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
        >
          {theme === 'dark' ? (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
          )}
        </button>

        {/* YouTube link */}
        <a href="https://youtube.com/@TheMuslimLantern" target="_blank" rel="noopener noreferrer" className="shrink-0 p-2 rounded-full transition-colors" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
        </a>
      </div>
    </header>
  );
}
