export function Footer() {
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

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-10 py-10">
        <div className="flex flex-col sm:flex-row items-center sm:items-end justify-between gap-6">
          <div className="flex items-center gap-3.5">
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

          <a
            href="https://youtube.com/@TheMuslimLantern"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-youtube !py-2.5 !px-5 ring-focus"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M23.5 6.2a3 3 0 00-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 00.5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 002.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 002.1-2.1c.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z" />
            </svg>
            Visit YouTube channel
          </a>
        </div>

        <div className="mt-8 pt-5 flex flex-col sm:flex-row items-center justify-between gap-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <p className="text-[11.5px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
            © {new Date().getFullYear()} <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>Muneeb Ahmad</span> · All rights reserved.
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
