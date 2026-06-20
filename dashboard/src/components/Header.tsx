interface Props {
  search: string;
  onSearch: (v: string) => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export function Header({ search, onSearch, theme, onToggleTheme }: Props) {
  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl border-b transition-colors" style={{ background: `color-mix(in srgb, var(--bg-primary) 88%, transparent)`, borderColor: 'var(--border)' }}>
      <div className="max-w-[1800px] mx-auto flex items-center gap-3 sm:gap-5 px-4 sm:px-6 lg:px-10 h-16">
        {/* Logo — horizontal on desktop, icon on mobile */}
        <a href="#" className="flex items-center gap-3 shrink-0 group" onClick={() => { window.location.hash = ''; }}>
          <img src="/logo.png" alt="The Muslim Lantern" className="h-9 hidden sm:block object-contain" />
          <img src="/logo-vertical.pn.jpg" alt="" className="w-9 h-9 rounded-full object-cover sm:hidden" />
        </a>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Search */}
        <div className="w-full max-w-md">
          <div className="relative flex">
            <input
              type="text"
              value={search}
              onChange={e => onSearch(e.target.value)}
              placeholder="Search streams, guests..."
              className="w-full rounded-l-full py-2 pl-4 pr-3 text-sm focus:outline-none transition-all"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRight: 'none', color: 'var(--text-primary)' }}
            />
            <button className="px-4 rounded-r-full flex items-center" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderLeft: 'none' }}>
              <svg className="w-4 h-4" style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </button>
          </div>
        </div>

        {/* Theme toggle */}
        <button onClick={onToggleTheme} className="p-2.5 rounded-full transition-all hover:scale-110 active:scale-95" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
          {theme === 'dark'
            ? <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><circle cx="12" cy="12" r="5" strokeWidth={2}/><path strokeLinecap="round" strokeWidth={2} d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
            : <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>
          }
        </button>
      </div>
    </header>
  );
}
