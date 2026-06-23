import { useEffect, useState } from 'react';
import { fetchStatus, type SystemStatus } from '../utils/dataFetcher';
import { fmtRelative } from '../utils/format';

export function Footer() {
  const [s, setS] = useState<SystemStatus | null>(null);
  useEffect(() => { fetchStatus().then(setS); }, []);

  return (
    <footer className="border-t mt-16 no-select" style={{ borderColor: 'var(--bd)', background: 'var(--bg2)' }}>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-10 py-8">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-8">
          <div className="flex-1 max-w-md">
            <div className="flex items-center gap-3 mb-3">
              <img src="/logo-vertical.pn.jpg" alt="" className="w-10 h-10 rounded-lg object-cover" />
              <div>
                <p className="font-display text-[15px] font-bold leading-tight" style={{ color: 'var(--tx)' }}>
                  Muslim Lantern Archive
                </p>
                <p className="text-[11px]" style={{ color: 'var(--tx3)' }}>Permanent stream archive</p>
              </div>
            </div>
            <p className="text-[12px] leading-relaxed" style={{ color: 'var(--tx2)' }}>
              An automated, multi-cloud archive of every live broadcast.
              Mirrored to 6+ providers, transcribed and chaptered by AI, and made freely available for the Ummah.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 md:gap-12">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.2em] mb-3" style={{ color: 'var(--tx3)' }}>Channel</p>
              <ul className="space-y-1.5 text-[12px]">
                <li><a href="https://youtube.com/@TheMuslimLantern" target="_blank" rel="noopener noreferrer" className="hover:text-[var(--red)] transition-colors" style={{ color: 'var(--tx2)' }}>YouTube</a></li>
                <li><a href="https://github.com/usermuneeb1/Stream-Recorder" target="_blank" rel="noopener noreferrer" className="hover:text-[var(--red)] transition-colors" style={{ color: 'var(--tx2)' }}>Source code</a></li>
              </ul>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.2em] mb-3" style={{ color: 'var(--tx3)' }}>System</p>
              <ul className="space-y-1.5 text-[12px]">
                {s ? (
                  <>
                    <li className="flex items-center gap-2" style={{ color: 'var(--tx2)' }}>
                      <span className="relative w-2 h-2 rounded-full" style={{ background: s.ok ? 'var(--emerald)' : 'var(--gold)' }} />
                      {s.ok ? 'All systems operational' : 'Status stale'}
                    </li>
                    <li style={{ color: 'var(--tx3)' }}>Updated {fmtRelative(s.updatedAt)}</li>
                  </>
                ) : (
                  <li style={{ color: 'var(--tx3)' }}>—</li>
                )}
              </ul>
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 mt-8 pt-6 border-t" style={{ borderColor: 'var(--bd)' }}>
          <p className="text-[11px]" style={{ color: 'var(--tx3)' }}>
            © {new Date().getFullYear()} Muneeb Ahmad · MIT License · Open source
          </p>
          <p className="text-[10px] font-mono" style={{ color: 'var(--tx4)' }}>
            v6.1 · {s?.recordingsTotal ?? '—'} streams · {s?.totalHours?.toFixed(0) ?? '—'}h
          </p>
        </div>
      </div>
    </footer>
  );
}
