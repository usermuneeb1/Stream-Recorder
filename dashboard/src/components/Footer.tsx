export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer
      className="mt-20 py-12"
      style={{
        borderTop: '1px solid var(--border-subtle)',
        background: 'var(--bg-secondary)',
      }}
    >
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-10">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          {/* Brand */}
          <div className="flex flex-col items-center md:items-start gap-3">
            <div className="flex items-center gap-3">
              <img
                src="/logo-vertical.pn.jpg"
                alt=""
                className="w-12 h-12 rounded-lg object-cover"
                style={{ border: '1px solid var(--border-gold)' }}
              />
              <div>
                <p className="font-display text-lg font-bold" style={{ color: 'var(--gold-primary)' }}>
                  The Muslim Lantern
                </p>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  Stream Archive
                </p>
              </div>
            </div>
            <p className="text-sm text-center md:text-left" style={{ color: 'var(--text-secondary)' }}>
              Preserving daʿwah, one stream at a time.
            </p>
          </div>

          {/* Links */}
          <div className="flex gap-8">
            <div>
              <p className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
                Archive
              </p>
              <ul className="space-y-2">
                <li>
                  <a href="#" className="text-sm hover:underline" style={{ color: 'var(--text-secondary)' }}>
                    All Recordings
                  </a>
                </li>
                <li>
                  <a href="#" className="text-sm hover:underline" style={{ color: 'var(--text-secondary)' }}>
                    HD Only
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
                Features
              </p>
              <ul className="space-y-2">
                <li className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Search & Filter
                </li>
                <li className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Multi-Quality
                </li>
              </ul>
            </div>
          </div>

          {/* YouTube */}
          <a
            href="https://youtube.com/@TheMuslimLantern"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-premium"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M23.5 6.2a3 3 0 00-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 00.5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 002.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 002.1-2.1c.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z" />
            </svg>
            Visit Channel
          </a>
        </div>

        {/* Bottom bar */}
        <div
          className="mt-8 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4"
          style={{ borderTop: '1px solid var(--border-subtle)' }}
        >
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            © {year} Muneeb Ahmad. All rights reserved.
          </p>
          <p className="text-xs flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
            Made with
            <svg className="w-3 h-3" style={{ color: 'var(--accent-red)' }} viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
            for the Ummah
          </p>
        </div>
      </div>
    </footer>
  );
}
