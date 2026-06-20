interface Props {
  search: string;
  onSearch: (v: string) => void;
}

export function Header({ search, onSearch }: Props) {
  return (
    <header className="sticky top-0 z-40 bg-[#0f0f0f]/95 backdrop-blur-md border-b border-white/5">
      <div className="max-w-[1400px] mx-auto flex items-center gap-4 px-4 sm:px-6 h-14">
        {/* Logo + Title */}
        <a href="#" className="flex items-center gap-2.5 shrink-0" onClick={() => { window.location.hash = ''; }}>
          <img
            src="/logo-vertical.pn.jpg"
            alt="The Muslim Lantern"
            className="w-8 h-8 rounded-full object-cover"
          />
          <span className="text-[15px] font-semibold text-white hidden sm:block">
            The Muslim Lantern
          </span>
        </a>

        {/* Search */}
        <div className="flex-1 max-w-md mx-auto">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#717171]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => onSearch(e.target.value)}
              placeholder="Search streams..."
              className="w-full bg-[#121212] border border-[#303030] rounded-full py-2 pl-9 pr-4 text-sm text-white placeholder-[#717171] focus:outline-none focus:border-[#555] transition-colors"
            />
            {search && (
              <button
                onClick={() => onSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#717171] hover:text-white"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* YouTube link */}
        <a
          href="https://youtube.com/@TheMuslimLantern"
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 flex items-center gap-1.5 text-xs text-[#aaa] hover:text-white transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
          </svg>
          <span className="hidden sm:inline">YouTube</span>
        </a>
      </div>
    </header>
  );
}
