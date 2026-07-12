import { useEffect, useMemo, useState } from 'react';
import type { Recording } from '../utils/dataFetcher';

function pretty(n: number, decimals = 0): string {
  return n.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F');
}

function useCounter(target: number, dur = 1100): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf: number;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, dur]);
  return v;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5)  return 'Good evening';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * MiniSparkline — Premium inline activity chart showing recording frequency.
 */
function MiniSparkline({ recs }: { recs: Recording[] }) {
  const bars = useMemo(() => {
    // Group recordings by month for the last 6 months
    const now = new Date();
    const months: { label: string; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('default', { month: 'short' });
      const count = recs.filter(r => (r.recordedAt || r.date || '').startsWith(key)).length;
      months.push({ label, count });
    }
    return months;
  }, [recs]);

  const max = Math.max(1, ...bars.map(b => b.count));

  return (
    <div className="flex items-end gap-1.5 h-10">
      {bars.map((bar, i) => (
        <div key={i} className="flex flex-col items-center gap-1">
          <div
            className="w-3 sm:w-4 rounded-t-sm transition-all duration-500"
            style={{
              height: `${Math.max(2, (bar.count / max) * 32)}px`,
              background: bar.count > 0
                ? 'linear-gradient(180deg, var(--accent-glow) 0%, var(--accent-primary) 100%)'
                : 'var(--bg-elevated)',
              opacity: bar.count > 0 ? 0.8 : 0.3,
              boxShadow: bar.count > 0 ? '0 0 8px rgba(255, 61, 61, 0.3)' : 'none',
            }}
            title={`${bar.label}: ${bar.count} recordings`}
          />
          <span className="text-[8px] font-mono" style={{ color: 'var(--text-muted)' }}>{bar.label}</span>
        </div>
      ))}
    </div>
  );
}

export function SlimHero({ recs }: { recs: Recording[] }) {
  const stats = useMemo(() => {
    const totalSec = recs.reduce((a, r) => a + (r.durationSec || 0), 0);
    const totalGb  = recs.reduce((a, r) => a + (r.sizeGb || 0), 0);
    return { count: recs.length, hours: totalSec / 3600, gb: totalGb };
  }, [recs]);
  const c = Math.floor(useCounter(stats.count));
  const h = useCounter(stats.hours);
  const g = useCounter(stats.gb);

  return (
    <section className="mesh-hero noise-overlay rounded-[20px] border px-5 sm:px-9 py-7 sm:py-9 mb-8 fade-up relative" style={{ borderColor: 'var(--border-subtle)' }}>
      {/* Elegant gold overline */}
      <div className="flex items-center gap-3 mb-5 relative">
        <span className="hidden sm:block h-px w-7" style={{ background: 'linear-gradient(to right, transparent, var(--accent-gold))' }} />
        <svg className="w-3.5 h-3.5" style={{ color: 'var(--accent-gold)', filter: 'drop-shadow(0 0 6px rgba(212, 168, 83, 0.50))' }} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C9 2 8 4 8 6c0 1.5 1 2.5 1 4v1H7v2c0 4 1 8 5 8s5-4 5-8v-2h-2v-1c0-1.5 1-2.5 1-4 0-2-1-4-4-4z" opacity=".95"/>
          <circle cx="12" cy="13" r="2" fill="#fff7d6"/>
        </svg>
        <p className="text-[10.5px] font-semibold uppercase tracking-[.18em]" style={{ color: 'var(--accent-gold)' }}>
          The Muslim Lantern Archive
        </p>
        <span className="flex-1 h-px max-w-[180px] sm:max-w-none" style={{ background: 'linear-gradient(to right, var(--accent-gold), transparent)' }} />
      </div>

      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-6 relative">
        {/* Left — tagline */}
        <div className="max-w-2xl">
          <p className="text-[13.5px] font-medium mb-2" style={{ color: 'var(--text-secondary)', letterSpacing: '0.02em' }}>
            {greeting()}
          </p>
          <h1 className="font-display text-[28px] sm:text-[38px] xl:text-[44px] font-extrabold leading-[1.04] tracking-[-0.02em]" style={{ color: 'var(--text-primary)' }}>
            Preserving <span className="text-gradient-red">daʿwah</span>,<br className="hidden sm:block" /> one stream at a time
            <span style={{ color: 'var(--accent-glow)', textShadow: '0 0 12px rgba(255, 61, 61, 0.6)' }}>.</span>
          </h1>
          <p className="text-[13.5px] sm:text-[14.5px] mt-4 leading-relaxed max-w-xl" style={{ color: 'var(--text-secondary)' }}>
            Every live broadcast from <span style={{ color: 'var(--text-primary)' }}>The Muslim Lantern</span>, kept forever — searchable, free to watch, mirrored across <span style={{ color: 'var(--text-primary)' }}>six redundant clouds</span>.
          </p>
        </div>

        {/* Right — glass stat tiles + sparkline */}
        <div className="flex flex-col gap-3 shrink-0">
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
            <HeroStat value={pretty(c)} label="streams" />
            <HeroStat value={pretty(h, h >= 100 ? 0 : 1)} label="hours" />
            <HeroStat value={g >= 100 ? `${(g / 1024).toFixed(1)} TB` : `${g.toFixed(1)} GB`} label="library" small />
          </div>
          {/* Activity sparkline */}
          <div className="glass rounded-[14px] px-4 py-3 flex items-center gap-3" style={{ border: '1px solid var(--border-subtle)' }}>
            <div className="flex-1">
              <p className="text-[9.5px] uppercase tracking-[.15em] font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>
                Activity (6mo)
              </p>
              <MiniSparkline recs={recs} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function HeroStat({ value, label, small }: { value: string; label: string; small?: boolean }) {
  return (
    <div
      className="glass rounded-[14px] px-3 sm:px-4 py-3 sm:py-3.5 transition-all duration-300 hover:translate-y-[-2px]"
      style={{
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid var(--border-subtle)',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-accent)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 0 24px rgba(198, 40, 40, 0.10)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-subtle)'; (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}
    >
      <div className={`font-mono ${small ? 'text-[17px] sm:text-[20px]' : 'text-[20px] sm:text-[24px]'} font-bold tabular-nums leading-none`} style={{ color: 'var(--text-primary)' }}>
        {value}
      </div>
      <div className="text-[9.5px] sm:text-[10px] uppercase tracking-[.16em] font-semibold mt-1.5" style={{ color: 'var(--text-muted)' }}>
        {label}
      </div>
    </div>
  );
}
