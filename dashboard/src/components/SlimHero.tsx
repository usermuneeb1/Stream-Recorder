import { useMemo } from 'react';
import type { Recording } from '../utils/dataFetcher';

// Slim hero — a tight 2-line headline + inline stats strip. Replaces
// the old huge StatsBar that was eating half the viewport. The full
// dashboard / stats panel lives at the BOTTOM of the home page now.
export function SlimHero({ recs }: { recs: Recording[] }) {
  const stats = useMemo(() => {
    const totalSec = recs.reduce((a, r) => a + (r.durationSec || 0), 0);
    const totalGb  = recs.reduce((a, r) => a + (r.sizeGb || 0), 0);
    return {
      count: recs.length,
      hours: totalSec / 3600,
      gb: totalGb,
    };
  }, [recs]);

  return (
    <section className="mb-6 sm:mb-8">
      {/* Eyebrow pill */}
      <div className="inline-flex items-center gap-2 mb-3 px-2.5 py-1 rounded-full border" style={{ borderColor: 'var(--bd2)', background: 'rgba(239,68,68,.06)' }}>
        <span className="relative inline-block w-1.5 h-1.5">
          <span className="absolute inset-0 rounded-full" style={{ background: 'var(--red)' }} />
          <span className="absolute inset-0 rounded-full animate-ping" style={{ background: 'var(--red)', opacity: 0.6 }} />
        </span>
        <svg className="w-3 h-3" style={{ color: 'var(--gold)' }} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C9 2 8 4 8 6c0 1.5 1 2.5 1 4v1H7v2c0 4 1 8 5 8s5-4 5-8v-2h-2v-1c0-1.5 1-2.5 1-4 0-2-1-4-4-4z" opacity=".9"/>
          <circle cx="12" cy="13" r="2" fill="#fff7d6"/>
        </svg>
        <p className="text-[9.5px] font-bold uppercase tracking-[.22em]" style={{ color: 'var(--red)' }}>
          The Muslim Lantern Archive
        </p>
      </div>

      {/* Title + inline stats on same row at desktop, stacked on mobile */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <h1 className="font-display text-[24px] sm:text-[32px] xl:text-[38px] font-extrabold leading-[1.05] tracking-[-0.02em]">
          Preserving <span className="text-gradient-red">daʿwah</span>, one stream at a time.
        </h1>
        <div className="flex items-baseline gap-5 sm:gap-7 shrink-0 text-[12px] tabular-nums" style={{ color: 'var(--tx3)' }}>
          <Inline value={String(stats.count)} label="streams" />
          <Inline value={stats.hours >= 100 ? stats.hours.toFixed(0) : stats.hours.toFixed(1)} label="hours" />
          <Inline value={stats.gb >= 100 ? `${(stats.gb/1024).toFixed(1)} TB` : `${stats.gb.toFixed(1)} GB`} label="library" />
        </div>
      </div>
    </section>
  );
}

function Inline({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="font-display text-[18px] sm:text-[20px] font-bold" style={{ color: 'var(--tx)' }}>{value}</span>
      <span className="text-[10.5px] uppercase tracking-[.16em] font-semibold" style={{ color: 'var(--tx3)' }}>{label}</span>
    </div>
  );
}
