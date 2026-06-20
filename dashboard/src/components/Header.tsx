interface Props { search: string; onSearch: (v: string) => void; theme: 'dark' | 'light'; onTheme: () => void; }

export function Header({ search, onSearch, theme, onTheme }: Props) {
  return (
    <header className="sticky top-0 z-50 backdrop-blur-2xl border-b transition-colors" style={{ background: `color-mix(in srgb, var(--bg) 90%, transparent)`, borderColor: 'var(--border)' }}>
      <div className="max-w-[1600px] mx-auto flex items-center gap-4 px-4 sm:px-8 lg:px-12 h-16">
        <a href="#" onClick={() => { window.location.hash = ''; }} className="shrink-0">
          <img src="/logo.png" alt="Muslim Lantern Archive" className="h-7 sm:h-8 object-contain" />
        </a>
        <div className="flex-1" />
        <div className="w-full max-w-sm">
          <input value={search} onChange={e => onSearch(e.target.value)} placeholder="Search..."
            className="w-full rounded-lg py-2 px-4 text-sm focus:outline-none focus:ring-2 transition-all"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text)', '--tw-ring-color': 'var(--red)' } as any} />
        </div>
        <button onClick={onTheme} className="p-2 rounded-lg transition-all hover:scale-110" style={{ color: 'var(--text-muted)' }}>
          {theme === 'dark'
            ? <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><circle cx="12" cy="12" r="5" strokeWidth={2}/><path strokeLinecap="round" strokeWidth={2} d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
            : <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>}
        </button>
      </div>
    </header>
  );
}
