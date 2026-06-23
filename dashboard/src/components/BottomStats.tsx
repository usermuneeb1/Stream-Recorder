import { useMemo } from 'react';
import type { Recording } from '../utils/dataFetcher';
import { fmtDate } from '../utils/format';

// FEATURE: compact bottom-of-page stats strip — gives the page a
// professional "footer of facts" right before the actual Footer.
// Different style + content from the hero StatsBar so it doesn't repeat.
export function BottomStats({ recs }: { recs: Recording[] }) {
  const stats = useMemo(() => {
    if (!recs.length) return null;
    const totalSec = recs.reduce((a, r) => a + (r.durationSec || 0), 0);
    const totalGb  = recs.reduce((a, r) => a + (r.sizeGb || 0), 0);
    const hdCount  = recs.filter(r => /1080|1440|2160|4k/i.test(r.resolution)).length;
    const ghostCount = recs.filter(r => r.youtubeId).length;
    // newest = first item (App.tsx default sort is newest)
    const sorted = [...recs].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const newest = sorted[0];
    const oldest = sorted[sorted.length - 1];
    const longest = [...recs].sort((a, b) => (b.durationSec || 0) - (a.durationSec || 0))[0];
    const avgDur = Math.round(totalSec / recs.length / 60);
    return { totalSec, totalGb, hdCount, ghostCount, newest, oldest, longest, avgDur };
  }, [recs]);

  if (!stats) return null;
  const { totalGb, hdCount, ghostCount, newest, oldest, longest, avgDur } = stats;
  const total = recs.length;

  return (
    <section className="max-w-[1400px] w-full mx-auto px-4 sm:px-6 lg:px-10 pb-10 -mt-2">
      {/* Top divider with eyebrow label */}
      <div className="flex items-center gap-4 mb-5">
        <span className="text-[10px] uppercase tracking-[.25em] font-bold whitespace-nowrap" style={{ color: 'var(--tx3)' }}>
          Archive overview
        </span>
        <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, var(--bd2), transparent)' }} />
      </div>

      {/* Big stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-5">
        <BigStat
          label="Total library"
          value={totalGb >= 100 ? `${(totalGb / 1024).toFixed(2)} TB` : `${totalGb.toFixed(1)} GB`}
          accent="gold"
        />
        <BigStat
          label="HD quality"
          value={`${hdCount}/${total}`}
          sub={`${Math.round(hdCount * 100 / total)}% in 1080p+`}
          accent="red"
        />
        <BigStat
          label="YouTube mirrors"
          value={`${ghostCount}/${total}`}
          sub={ghostCount === total ? 'Fully mirrored' : `${total - ghostCount} pending`}
          accent="emerald"
        />
        <BigStat
          label="Avg duration"
          value={`${avgDur}m`}
          sub={`Longest: ${Math.round((longest?.durationSec || 0) / 60)}m`}
          accent="violet"
        />
      </div>

      {/* Detail row */}
      <div className="rounded-xl border px-4 sm:px-5 py-3.5 sm:py-4 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-5" style={{ borderColor: 'var(--bd)', background: 'var(--bg2)' }}>
        <Fact label="Newest recording" value={newest?.title || '—'} sub={newest?.date ? fmtDate(newest.date) : ''} />
        <Fact label="Oldest recording" value={oldest?.title || '—'} sub={oldest?.date ? fmtDate(oldest.date) : ''} />
        <Fact label="Longest recording" value={longest?.title || '—'} sub={`${Math.round((longest?.durationSec || 0) / 60)} min`} />
      </div>
    </section>
  );
}

const ACCENT: Record<string, string> = {
  red:     'var(--red)',
  gold:    'var(--gold)',
  emerald: 'var(--emerald)',
  violet:  'var(--violet)',
};

function BigStat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent: string }) {
  return (
    <div className="rounded-xl border p-3.5 sm:p-4 transition-colors hover:border-[var(--bd3)] relative overflow-hidden group" style={{ borderColor: 'var(--bd)', background: 'var(--bg2)' }}>
      {/* Accent left-bar */}
      <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r" style={{ background: ACCENT[accent] }} />
      <div className="pl-2.5">
        <div className="text-[9.5px] uppercase tracking-[.18em] font-semibold mb-1" style={{ color: 'var(--tx3)' }}>
          {label}
        </div>
        <div className="font-display text-[20px] sm:text-[22px] font-bold tabular-nums leading-none" style={{ color: 'var(--tx)' }}>
          {value}
        </div>
        {sub && (
          <div className="text-[10.5px] mt-1.5" style={{ color: 'var(--tx3)' }}>{sub}</div>
        )}
      </div>
    </div>
  );
}

function Fact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[9.5px] uppercase tracking-[.18em] font-semibold mb-1" style={{ color: 'var(--tx3)' }}>
        {label}
      </div>
      <div className="text-[13px] font-semibold line-clamp-1" style={{ color: 'var(--tx) ' }}>{value}</div>
      {sub && (
        <div className="text-[10.5px] mt-0.5" style={{ color: 'var(--tx3)' }}>{sub}</div>
      )}
    </div>
  );
}
