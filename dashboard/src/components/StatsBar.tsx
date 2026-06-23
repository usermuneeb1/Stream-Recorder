import { useMemo } from 'react';
import type { Recording } from '../utils/dataFetcher';

interface Stat { label: string; value: string }

function calc(recs: Recording[]): Stat[] {
  const totalSec = recs.reduce((a, r) => a + (r.durationSec || 0), 0);
  const totalGb  = recs.reduce((a, r) => a + (r.sizeGb || 0), 0);
  const hours = totalSec / 3600;
  return [
    { label: 'Recordings',  value: String(recs.length) },
    { label: 'Total Hours', value: hours >= 100 ? hours.toFixed(0) : hours.toFixed(1) },
    { label: 'Library',     value: totalGb >= 100 ? `${(totalGb / 1024).toFixed(2)} TB` : `${totalGb.toFixed(1)} GB` },
  ];
}

export function StatsBar({ recs }: { recs: Recording[] }) {
  const stats = useMemo(() => calc(recs), [recs]);
  return (
    <section className="mesh rounded-2xl border px-5 sm:px-8 py-7 sm:py-10 mb-8" style={{ borderColor: 'var(--bd)' }}>
      <div className="flex flex-col gap-5 mb-7">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[.22em] mb-2" style={{ color: 'var(--red)' }}>
            ☪️ The Muslim Lantern · Stream Archive
          </p>
          <h1 className="font-display text-3xl sm:text-[42px] font-bold leading-[1.05]">
            Preserving daʿwah,<br />one stream at a time.
          </h1>
          <p className="text-sm sm:text-[15px] mt-3 max-w-xl leading-relaxed" style={{ color: 'var(--tx2)' }}>
            Every live broadcast, kept forever — searchable, free to watch, always available.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 sm:gap-5">
        {stats.map(s => (
          <div
            key={s.label}
            className="rounded-xl border px-4 sm:px-5 py-4 sm:py-5 transition-colors hover:border-[var(--bd3)]"
            style={{ borderColor: 'var(--bd)', background: 'var(--bg2)' }}
          >
            <div className="text-[10px] sm:text-[11px] uppercase tracking-[.18em] font-semibold mb-2" style={{ color: 'var(--tx3)' }}>
              {s.label}
            </div>
            <div className="font-display text-2xl sm:text-[32px] font-bold tabular-nums leading-none" style={{ color: 'var(--tx)' }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
