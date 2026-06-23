export function Footer() {
  return (
    <footer className="border-t mt-20 no-select" style={{ borderColor: 'var(--bd)', background: 'var(--bg2)' }}>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-10 py-10">
        {/* Top row — brand + CTA */}
        <div className="flex flex-col sm:flex-row items-center sm:items-end justify-between gap-6">
          <div className="flex items-center gap-3.5">
            <img src="/logo-vertical.pn.jpg" alt="" className="w-12 h-12 rounded-lg object-cover" />
            <div>
              <p className="font-display text-[17px] font-bold leading-tight" style={{ color: 'var(--tx)' }}>
                Muslim Lantern Archive
              </p>
              <p className="text-[11.5px] mt-0.5" style={{ color: 'var(--tx3)' }}>
                Preserving daʿwah, one stream at a time
              </p>
            </div>
          </div>

          <a
            href="https://youtube.com/@TheMuslimLantern"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold text-white transition-transform hover:scale-105"
            style={{ background: 'var(--red)' }}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M23.5 6.2a3 3 0 00-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 00.5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 002.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 002.1-2.1c.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z" />
            </svg>
            Visit YouTube channel
          </a>
        </div>

        {/* Bottom — copyright + author credit */}
        <div className="mt-8 pt-5 border-t flex flex-col sm:flex-row items-center justify-between gap-3" style={{ borderColor: 'var(--bd)' }}>
          <p className="text-[11.5px] tabular-nums" style={{ color: 'var(--tx3)' }}>
            © {new Date().getFullYear()} <span className="font-semibold" style={{ color: 'var(--tx2)' }}>Muneeb Ahmad</span> · All rights reserved.
          </p>
          <p className="text-[11.5px] flex items-center gap-1.5" style={{ color: 'var(--tx3)' }}>
            Made with
            <span className="inline-block" style={{ color: 'var(--red)' }} aria-label="love">
              {/* Animated heart */}
              <svg className="w-3.5 h-3.5 inline animate-pulse" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 21s-7-4.5-9.5-9C.5 8 3 4 7 4c2 0 3.5 1 5 3 1.5-2 3-3 5-3 4 0 6.5 4 4.5 8C19 16.5 12 21 12 21z" />
              </svg>
            </span>
            by <span className="font-semibold" style={{ color: 'var(--tx2)' }}>Muneeb Ahmad</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
