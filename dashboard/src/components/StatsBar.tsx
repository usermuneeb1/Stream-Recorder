import { useMemo } from 'react';
import type { Recording } from '../utils/dataFetcher';

interface Stats { label: string; value: string }

function calc(recs: Recording[]): Stats[] {
  const totalSec = recs.reduce((a, r) => a + (r.durationSec || 0), 0);
  const totalGb  = recs.reduce((a, r) => a + (r.sizeGb || 0), 0);
  const guests = new Set<string>();
  for (const r of recs) for (const c of r.aiChapters || []) {
    if (c.label?.toLowerCase().includes('joins')) {
      guests.add(c.label.replace(/\s*joins.*/i, '').trim());
    }
  }
  const hours = totalSec / 3600;
  return [
    { label: 'Recordings',      value: String(recs.length) },
    { label: 'Total Hours',     value: hours >= 100 ? hours.toFixed(0) : hours.toFixed(1) },
    { label: 'Library',         value: totalGb >= 100 ? `${(totalGb / 1024).toFixed(2)} TB` : `${totalGb.toFixed(1)} GB` },
    { label: 'Guests Featured', value: String(guests.size) },
  ];
}

export function StatsBar({ recs }: { recs: Recording[] }) {
  const stats = useMemo(() => calc(recs), [recs]);
  return (
    <section className="mesh rounded-2xl border px-5 sm:px-8 py-6 sm:py-8 mb-8" style={{ borderColor: 'var(--bd)' }}>
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[.22em] mb-1.5" style={{ color: 'var(--red)' }}>
            ☪️ The Muslim Lantern · Stream Archive
          </p>
          <h1 className="font-display text-3xl sm:text-4xl font-bold leading-tight">
            Preserving daʿwah, one stream at a time.
          </h1>
          <p className="text-sm mt-2 max-w-xl" style={{ color: 'var(--tx2)' }}>
            Every live broadcast, kept forever — searchable, chaptered, free to watch.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {stats.map(s => (
          <div
            key={s.label}
            className="rounded-xl border px-4 py-3.5 transition-colors hover:border-[var(--bd3)]"
            style={{ borderColor: 'var(--bd)', background: 'var(--bg2)' }}
          >
            <div className="text-[10px] uppercase tracking-[.18em] font-semibold mb-1.5" style={{ color: 'var(--tx3)' }}>
              {s.label}
            </div>
            <div className="font-display text-2xl sm:text-[28px] font-bold tabular-nums leading-none" style={{ color: 'var(--tx)' }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
