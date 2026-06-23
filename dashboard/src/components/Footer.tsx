export function Footer() {
  return (
    <footer className="border-t mt-16 no-select" style={{ borderColor: 'var(--bd)', background: 'var(--bg2)' }}>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-10 py-10">
        <div className="flex flex-col sm:flex-row items-center sm:items-end justify-between gap-6">
          <div className="flex items-center gap-3.5">
            <img src="/logo-vertical.pn.jpg" alt="" className="w-11 h-11 rounded-lg object-cover" />
            <div>
              <p className="font-display text-[16px] font-bold leading-tight" style={{ color: 'var(--tx)' }}>
                Muslim Lantern Archive
              </p>
              <p className="text-[11.5px]" style={{ color: 'var(--tx3)' }}>
                Preserving daʿwah, one stream at a time
              </p>
            </div>
          </div>

          <div className="flex items-center gap-5 text-[12.5px] font-medium" style={{ color: 'var(--tx2)' }}>
            <a
              href="https://youtube.com/@TheMuslimLantern"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 hover:text-[var(--red)] transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.5 6.2a3 3 0 00-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 00.5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 002.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 002.1-2.1c.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z" />
              </svg>
              YouTube
            </a>
            <a href="/feed.xml" className="hover:text-[var(--red)] transition-colors">RSS</a>
            <a href="/podcast.xml" className="hover:text-[var(--red)] transition-colors">Podcast</a>
          </div>
        </div>

        <div className="mt-8 pt-5 border-t flex items-center justify-center" style={{ borderColor: 'var(--bd)' }}>
          <p className="text-[11px]" style={{ color: 'var(--tx3)' }}>
            © {new Date().getFullYear()} The Muslim Lantern Archive
          </p>
        </div>
      </div>
    </footer>
  );
}
