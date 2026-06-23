import { useEffect, useMemo, useState } from 'react';
import type { Recording } from '../utils/dataFetcher';

interface Stat { label: string; value: string; icon: React.ReactNode }

// Pretty-print a number with thin-space thousand separators.
function pretty(n: number, decimals = 0): string {
  return n.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F');
}

// Eased number-counter — animates from 0 → target over `dur` ms.
function useCounter(target: number, dur = 1200): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let raf: number;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, dur]);
  return val;
}

function StatCard({ label, value, icon, sub }: { label: string; value: string; icon: React.ReactNode; sub?: string }) {
  return (
    <div
      className="relative rounded-xl border px-4 sm:px-5 py-4 sm:py-5 overflow-hidden group transition-all hover:border-[var(--bd3)]"
      style={{ borderColor: 'var(--bd)', background: 'var(--bg2)' }}
    >
      {/* Soft red glow on hover (premium) */}
      <div
        className="absolute -top-12 -right-12 w-24 h-24 rounded-full opacity-0 group-hover:opacity-100 transition-opacity blur-2xl pointer-events-none"
        style={{ background: 'var(--red-soft)' }}
      />
      <div className="flex items-center justify-between mb-2 relative">
        <div className="text-[10px] sm:text-[11px] uppercase tracking-[.18em] font-semibold" style={{ color: 'var(--tx3)' }}>
          {label}
        </div>
        <div className="opacity-30 group-hover:opacity-60 transition-opacity" style={{ color: 'var(--red)' }}>
          {icon}
        </div>
      </div>
      <div className="font-display text-2xl sm:text-[34px] font-bold tabular-nums leading-none relative" style={{ color: 'var(--tx)' }}>
        {value}
      </div>
      {sub && (
        <div className="text-[10.5px] mt-1.5 font-medium" style={{ color: 'var(--tx3)' }}>{sub}</div>
      )}
    </div>
  );
}

export function StatsBar({ recs }: { recs: Recording[] }) {
  const stats = useMemo(() => {
    const totalSec = recs.reduce((a, r) => a + (r.durationSec || 0), 0);
    const totalGb  = recs.reduce((a, r) => a + (r.sizeGb || 0), 0);
    return { count: recs.length, hours: totalSec / 3600, gb: totalGb };
  }, [recs]);

  // Animated counters
  const c = Math.floor(useCounter(stats.count));
  const h = useCounter(stats.hours);
  const g = useCounter(stats.gb);

  return (
    <section className="mesh rounded-2xl border px-5 sm:px-8 py-7 sm:py-10 mb-8 relative overflow-hidden" style={{ borderColor: 'var(--bd)' }}>
      {/* Subtle ambient gradient orbs */}
      <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full opacity-30 blur-3xl pointer-events-none" style={{ background: 'radial-gradient(circle, var(--red) 0%, transparent 70%)' }} />
      <div className="absolute -bottom-32 -left-20 w-72 h-72 rounded-full opacity-20 blur-3xl pointer-events-none" style={{ background: 'radial-gradient(circle, var(--gold) 0%, transparent 70%)' }} />

      <div className="flex flex-col gap-5 mb-7 relative">
        <div>
          {/* Premium eyebrow: glass pill + animated live dot + lantern icon */}
          <div className="inline-flex items-center gap-2 mb-4 px-3 py-1.5 rounded-full border" style={{ borderColor: 'var(--bd2)', background: 'rgba(239,68,68,.06)' }}>
            <span className="relative inline-block w-2 h-2">
              <span className="absolute inset-0 rounded-full" style={{ background: 'var(--red)' }} />
              <span className="absolute inset-0 rounded-full animate-ping" style={{ background: 'var(--red)', opacity: 0.6 }} />
            </span>
            <svg className="w-3.5 h-3.5" style={{ color: 'var(--gold)' }} viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C9 2 8 4 8 6c0 1.5 1 2.5 1 4v1H7v2c0 4 1 8 5 8s5-4 5-8v-2h-2v-1c0-1.5 1-2.5 1-4 0-2-1-4-4-4z" opacity=".9"/>
              <circle cx="12" cy="13" r="2" fill="#fff7d6"/>
            </svg>
            <p className="text-[10.5px] font-bold uppercase tracking-[.22em]" style={{ color: 'var(--red)' }}>
              The Muslim Lantern Archive
            </p>
          </div>
          <h1 className="font-display text-[34px] sm:text-[56px] xl:text-[64px] font-extrabold leading-[1.02] tracking-[-0.025em]">
            <span className="block">Preserving <span className="text-gradient-red">daʿwah</span>,</span>
            <span className="block opacity-95" style={{ color: 'var(--tx)' }}>one stream at a time.</span>
          </h1>
          <p className="text-[14px] sm:text-[16px] mt-4 max-w-xl leading-relaxed font-medium" style={{ color: 'var(--tx2)' }}>
            Every live broadcast, kept forever — searchable, free to watch, always available across <span style={{ color: 'var(--tx)' }}>six redundant clouds</span>.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:gap-5 relative">
        <StatCard
          label="Recordings"
          value={pretty(c)}
          sub="Live streams archived"
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          }
        />
        <StatCard
          label="Total Hours"
          value={pretty(h, h >= 100 ? 0 : 1)}
          sub="Of content preserved"
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" />
              <path strokeLinecap="round" d="M12 7v5l3 3" />
            </svg>
          }
        />
        <StatCard
          label="Library"
          value={g >= 100 ? `${(g/1024).toFixed(2)} TB` : `${g.toFixed(1)} GB`}
          sub="Multi-cloud mirrored"
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <ellipse cx="12" cy="6" rx="9" ry="3" />
              <path d="M3 6v6c0 1.66 4 3 9 3s9-1.34 9-3V6" />
              <path d="M3 12v6c0 1.66 4 3 9 3s9-1.34 9-3v-6" />
            </svg>
          }
        />
      </div>
    </section>
  );
}
