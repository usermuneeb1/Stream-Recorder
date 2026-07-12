export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer
      className="no-select mt-20 noise-overlay relative"
      style={{
        background: 'var(--bg-surface)',
        borderTop: '1px solid var(--border-subtle)',
      }}
    >
      {/* Top decorative gradient line */}
      <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(to right, transparent, var(--accent-primary) 30%, var(--accent-gold) 50%, var(--accent-primary) 70%, transparent)' }} />

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-10 py-12">
        {/* Main footer content */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
          {/* Brand column */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-3.5 mb-4">
              <img src="/logo-vertical.pn.jpg" alt="" className="w-14 h-14 rounded-xl object-cover logo-glow" style={{ border: '1px solid var(--border-subtle)' }} />
              <div>
                <p className="font-display text-[18px] font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>
                  Muslim Lantern <span className="text-gradient-red">Archive</span>
                </p>
                <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  Preserving daʿwah, one stream at a time
                </p>
              </div>
            </div>
            <p className="text-[13px] leading-relaxed max-w-md mb-5" style={{ color: 'var(--text-secondary)' }}>
              Every live broadcast from The Muslim Lantern, archived forever. Searchable, free to watch, and mirrored across six redundant cloud providers for maximum durability.
            </p>
            <a
              href="https://youtube.com/@TheMuslimLantern"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-youtube !py-2.5 !px-5 ring-focus btn-magnetic"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.5 6.2a3 3 0 00-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 00.5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 002.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 002.1-2.1c.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z" />
              </svg>
              Visit YouTube Channel
            </a>
          </div>

          {/* Archive column */}
          <div>
            <h3 className="font-display text-[13px] font-bold uppercase tracking-[.15em] mb-4" style={{ color: 'var(--text-primary)' }}>
              Archive
            </h3>
            <ul className="space-y-2.5">
              {[
                { label: 'All Recordings', href: '#' },
                { label: 'HD Only', href: '#', onClick: () => localStorage.setItem('filter', 'hd') },
                { label: 'Longest Streams', href: '#', onClick: () => localStorage.setItem('sort', 'longest') },
                { label: 'Recently Added', href: '#', onClick: () => localStorage.setItem('sort', 'newest') },
              ].map((item) => (
                <li key={item.label}>
                  <a
                    href={item.href}
                    onClick={(e) => {
                      if (item.onClick) {
                        e.preventDefault();
                        item.onClick();
                        window.location.hash = '';
                        window.scrollTo(0, 0);
                      }
                    }}
                    className="text-[13px] transition-colors hover:text-[var(--accent-glow)]"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Features column */}
          <div>
            <h3 className="font-display text-[13px] font-bold uppercase tracking-[.15em] mb-4" style={{ color: 'var(--text-primary)' }}>
              Features
            </h3>
            <ul className="space-y-2.5">
              {[
                'Command Palette (⌘K)',
                'Keyboard Shortcuts',
                'Continue Watching',
                'Picture-in-Picture',
                'Multi-Source Playback',
                'Cloud Mirrors',
              ].map((feature) => (
                <li key={feature}>
                  <span className="text-[13px] flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                    <span className="w-1 h-1 rounded-full" style={{ background: 'var(--accent-gold)' }} />
                    {feature}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Cloud mirrors badge row */}
        <div className="py-6 mb-6" style={{ borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>
          <p className="text-[11px] font-semibold uppercase tracking-[.15em] text-center mb-4" style={{ color: 'var(--text-muted)' }}>
            Mirrored Across 6 Clouds
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
            {['Archive.org', 'MEGA', 'Pixeldrain', 'Gofile', 'GitHub', 'Cloudflare'].map((cloud) => (
              <span
                key={cloud}
                className="text-[12px] font-semibold px-3 py-1.5 rounded-md transition-all hover:scale-105"
                style={{
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                {cloud}
              </span>
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[11.5px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
            © {year} <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>Muneeb Ahmad</span> · All rights reserved.
          </p>
          <p className="text-[11.5px] flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
            Made with
            <svg className="w-3.5 h-3.5 inline animate-pulse" style={{ color: 'var(--accent-glow)', filter: 'drop-shadow(0 0 4px rgba(255, 61, 61, 0.5))' }} viewBox="0 0 24 24" fill="currentColor" aria-label="love">
              <path d="M12 21s-7-4.5-9.5-9C.5 8 3 4 7 4c2 0 3.5 1 5 3 1.5-2 3-3 5-3 4 0 6.5 4 4.5 8C19 16.5 12 21 12 21z" />
            </svg>
            by <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>Muneeb Ahmad</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
