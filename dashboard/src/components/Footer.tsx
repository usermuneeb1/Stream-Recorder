// Footer — the colophon: brand, live archive stats, where else the light
// shines (YouTube / RSS / Podcast / GitHub), and the machine that keeps it.

import type { Ep, SystemStatus } from '../types';

interface Props {
  recs: Ep[];
  status: SystemStatus | null;
}

export default function Footer({ recs, status }: Props) {
  const hours = status?.totalHours || recs.reduce((a, r) => a + (r.durationSec || 0) / 3600, 0);
  const sizeGb = status?.totalSizeGb || recs.reduce((a, r) => a + (r.sizeGb || 0), 0);

  const explore = [
    { label: 'YouTube channel', href: 'https://youtube.com/@TheMuslimLantern', ext: true },
    { label: 'Watch live', href: 'https://youtube.com/@TheMuslimLantern/live', ext: true },
    { label: 'RSS feed', href: '/feed.xml', ext: false },
    { label: 'Podcast', href: '/podcast.xml', ext: false },
    { label: 'Recording engine', href: 'https://github.com/usermuneeb1/Stream-Recorder', ext: true },
  ];

  return (
    <footer className="relative z-[1] pt-16 pb-24 md:pb-12 mt-10" style={{ borderTop: '1px solid var(--line)' }}>
      <div className="px-[4vw] md:px-8">
        <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1.2fr]">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <img src="/logo.png" alt="The Muslim Lantern" className="h-9 w-auto" draggable={false} />
            </div>
            <p className="text-[13px] leading-relaxed max-w-sm" style={{ color: 'var(--mist)' }}>
              Every live broadcast of The Muslim Lantern, recorded in 1080p the moment
              it airs and mirrored across independent archives. Free to watch, forever.
            </p>
            <div className="flex gap-8 mt-6">
              <div><div className="stat-num">{recs.length}</div><div className="stat-label">Recordings</div></div>
              <div><div className="stat-num">{hours >= 100 ? Math.round(hours) : Math.round(hours * 10) / 10}h</div><div className="stat-label">Preserved</div></div>
              <div><div className="stat-num">{sizeGb >= 1000 ? `${(sizeGb / 1024).toFixed(1)}TB` : `${Math.round(sizeGb * 10) / 10}GB`}</div><div className="stat-label">Archived</div></div>
              {status?.ytSubscribers && (
                <div><div className="stat-num">{status.ytSubscribers}</div><div className="stat-label">Subscribers</div></div>
              )}
            </div>
          </div>

          {/* Explore */}
          <nav aria-label="Explore">
            <div className="eyebrow mb-4">Explore</div>
            <ul className="space-y-2.5">
              {explore.map(l => (
                <li key={l.label}>
                  <a
                    href={l.href}
                    {...(l.ext ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    className="text-[13px] font-medium transition-colors hover:text-flame"
                    style={{ color: 'var(--mist)' }}
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {/* The machine */}
          <div>
            <div className="eyebrow mb-4">The machine</div>
            <p className="text-[13px] leading-relaxed" style={{ color: 'var(--mist)' }}>
              An autonomous recorder watches the channel around the clock. When a stream
              goes live it captures 1080p through a ten-method cascade and fans the file
              out to five clouds — no server, no bill.
            </p>
            <div className="inline-flex items-center gap-2 mt-4 px-3 py-1.5 rounded-full"
              style={{ background: 'var(--jade-dim)', border: '1px solid rgba(59,169,124,.3)' }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--jade)', boxShadow: '0 0 8px rgba(59,169,124,.8)' }} />
              <span className="mono text-[10px] tracking-[0.14em] uppercase" style={{ color: 'var(--jade)' }}>
                Autonomous · Zero-cost infra
              </span>
            </div>
          </div>
        </div>

        <div className="divider !mx-0" />

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <span className="mono text-[10.5px]" style={{ color: 'var(--shade)' }}>
            © {new Date().getFullYear()} The Muslim Lantern · preserved by Muneeb Ahmad
          </span>
          <span className="mono text-[10.5px] flex items-center gap-1.5" style={{ color: 'var(--shade)' }}>
            Crafted with <span style={{ color: 'var(--flame-1)' }}>♥</span> by Muneeb Ahmad
          </span>
        </div>
      </div>
    </footer>
  );
}
