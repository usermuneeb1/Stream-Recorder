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
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
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
    <section className="mesh-hero noise-overlay rounded-[20px] border px-5 sm:px-9 py-7 sm:py-9 mb-8 relative fade-up" style={{ borderColor: 'var(--border-subtle)' }}>
      {/* Decorative gold lines flanking the eyebrow label */}
      <div className="flex items-center gap-3 mb-4 relative">
        <div className="hidden sm:block h-px w-8" style={{ background: 'linear-gradient(to right, transparent, var(--accent-gold))' }} />
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: 'var(--gold-soft)', border: '1px solid rgba(212, 168, 83, 0.20)' }}>
          <svg className="w-3.5 h-3.5" style={{ color: 'var(--accent-gold)', filter: 'drop-shadow(0 0 6px rgba(212, 168, 83, 0.45))' }} viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C9 2 8 4 8 6c0 1.5 1 2.5 1 4v1H7v2c0 4 1 8 5 8s5-4 5-8v-2h-2v-1c0-1.5 1-2.5 1-4 0-2-1-4-4-4z" opacity=".95"/>
            <circle cx="12" cy="13" r="2" fill="#fff7d6"/>
          </svg>
          <p className="text-[10.5px] font-bold uppercase tracking-[.18em]" style={{ color: 'var(--accent-gold)' }}>
            The Muslim Lantern Archive
          </p>
        </div>
        <div className="hidden sm:block flex-1 h-px" style={{ background: 'linear-gradient(to right, var(--accent-gold), transparent)' }} />
      </div>

      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-6 relative">
        {/* Left — tagline */}
        <div className="max-w-2xl">
          <p className="text-[11.5px] font-semibold uppercase tracking-[.18em] mb-2" style={{ color: 'var(--text-muted)' }}>
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

        {/* Right — glass stat tiles with animated counters */}
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3 shrink-0">
          <HeroStat value={pretty(c)} label="streams" />
          <HeroStat value={pretty(h, h >= 100 ? 0 : 1)} label="hours" />
          <HeroStat value={g >= 100 ? `${(g / 1024).toFixed(1)} TB` : `${g.toFixed(1)} GB`} label="library" small />
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
