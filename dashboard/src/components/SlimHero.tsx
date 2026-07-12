import { useEffect, useState, useMemo } from 'react';
import type { Recording } from '../utils/dataFetcher';

interface P {
  recs: Recording[];
}

export function SlimHero({ recs }: P) {
  const [counts, setCounts] = useState({ streams: 0, hours: 0, gb: 0 });

  const stats = useMemo(() => {
    const totalSec = recs.reduce((sum, r) => sum + (r.durationSec || 0), 0);
    const totalGb = recs.reduce((sum, r) => sum + (r.sizeGb || 0), 0);
    return {
      streams: recs.length,
      hours: Math.floor(totalSec / 3600),
      gb: Math.round(totalGb * 10) / 10,
    };
  }, [recs]);

  useEffect(() => {
    const duration = 1500;
    const steps = 60;
    const interval = duration / steps;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      const progress = step / steps;
      const eased = 1 - Math.pow(1 - progress, 3);

      setCounts({
        streams: Math.floor(stats.streams * eased),
        hours: Math.floor(stats.hours * eased),
        gb: Math.round(stats.gb * eased * 10) / 10,
      });

      if (step >= steps) clearInterval(timer);
    }, interval);

    return () => clearInterval(timer);
  }, [stats]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  return (
    <section className="mb-12 slide-up">
      {/* Greeting */}
      <p className="font-display text-lg mb-2" style={{ color: 'var(--text-secondary)' }}>
        {greeting}
      </p>

      {/* Main headline */}
      <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight mb-6">
        <span style={{ color: 'var(--text-primary)' }}>Preserving </span>
        <span className="text-gold">daʿwah</span>
        <span style={{ color: 'var(--text-primary)' }}>, one stream at a time.</span>
      </h1>

      {/* Description */}
      <p className="text-base sm:text-lg mb-8 max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
        Every live broadcast from The Muslim Lantern, preserved forever. Searchable, free to watch.
      </p>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 sm:gap-6">
        <div
          className="card-premium p-4 sm:p-6 text-center"
          style={{ background: 'var(--bg-secondary)' }}
        >
          <div className="font-display text-3xl sm:text-4xl font-bold mb-2 text-gold">
            {counts.streams}
          </div>
          <div className="text-xs sm:text-sm uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Streams
          </div>
        </div>
        <div
          className="card-premium p-4 sm:p-6 text-center"
          style={{ background: 'var(--bg-secondary)' }}
        >
          <div className="font-display text-3xl sm:text-4xl font-bold mb-2 text-gold">
            {counts.hours}
          </div>
          <div className="text-xs sm:text-sm uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Hours
          </div>
        </div>
        <div
          className="card-premium p-4 sm:p-6 text-center"
          style={{ background: 'var(--bg-secondary)' }}
        >
          <div className="font-display text-3xl sm:text-4xl font-bold mb-2 text-gold">
            {counts.gb >= 1000 ? `${(counts.gb / 1000).toFixed(1)} TB` : `${counts.gb} GB`}
          </div>
          <div className="text-xs sm:text-sm uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Library
          </div>
        </div>
      </div>
    </section>
  );
}
