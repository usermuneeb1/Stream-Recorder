import { useMemo } from 'react';
import type { Recording } from '../utils/dataFetcher';
import { fmtDate } from '../utils/format';

const ICONS = {
  library: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><ellipse cx="12" cy="6" rx="9" ry="3" /><path d="M3 6v6c0 1.66 4 3 9 3s9-1.34 9-3V6" /><path d="M3 12v6c0 1.66 4 3 9 3s9-1.34 9-3v-6" /></svg>,
  hd:      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2"/><path strokeLinecap="round" d="M7 9v6M7 12h4M11 9v6M15 9h2.5a1.5 1.5 0 010 3H15zm0 0v6"/></svg>,
  ghost:   <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 19l6-6-6-6"/><circle cx="12" cy="12" r="9"/></svg>,
  time:    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path strokeLinecap="round" d="M12 7v5l3 3"/></svg>,
};

export function BottomStats({ recs }: { recs: Recording[] }) {
  const stats = useMemo(() => {
    if (!recs.length) return null;
    const totalSec = recs.reduce((a, r) => a + (r.durationSec || 0), 0);
    const totalGb  = recs.reduce((a, r) => a + (r.sizeGb || 0), 0);
    const hd       = recs.filter(r => /1080|1440|2160|4k/i.test(r.resolution)).length;
    const ghost    = recs.filter(r => r.youtubeId).length;
    const sorted   = [...recs].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const newest   = sorted[0];
    const oldest   = sorted[sorted.length - 1];
    const longest  = [...recs].sort((a, b) => (b.durationSec || 0) - (a.durationSec || 0))[0];
    const avgMin   = Math.round(totalSec / recs.length / 60);
    return { totalGb, hd, ghost, newest, oldest, longest, avgMin };
  }, [recs]);
  if (!stats) return null;
  const { totalGb, hd, ghost, newest, oldest, longest, avgMin } = stats;
  const total = recs.length;

  return (
    <section className="mt-14 mb-4 fade-up">
      {/* Section heading — gold accent with decorative lines */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, transparent, var(--accent-gold) 50%, transparent)' }} />
        <p className="text-[11px] uppercase tracking-[.22em] font-bold whitespace-nowrap" style={{ color: 'var(--accent-gold)' }}>
          Archive Overview
        </p>
        <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, transparent, var(--accent-gold) 50%, transparent)' }} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5">
        <BigStat label="Total library" value={totalGb >= 100 ? `${(totalGb / 1024).toFixed(2)} TB` : `${totalGb.toFixed(1)} GB`} sub="Across all mirrors" accent="primary" icon={ICONS.library} />
        <BigStat label="HD quality" value={`${hd}/${total}`} sub={`${Math.round(hd * 100 / total)}% in 1080p+`} accent="warm" icon={ICONS.hd} />
        <BigStat label="YouTube mirrors" value={`${ghost}/${total}`} sub={ghost === total ? 'Fully mirrored' : `${total - ghost} pending`} accent="gold" icon={ICONS.ghost} />
        <BigStat label="Avg duration" value={`${avgMin}m`} sub={`Longest: ${Math.round((longest?.durationSec || 0) / 60)}m`} accent="primary" icon={ICONS.time} />
      </div>

      <div
        className="rounded-[18px] border p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-3 gap-5"
        style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-surface)' }}
      >
        <Fact label="Newest recording" value={newest?.title || '—'} sub={newest?.date ? fmtDate(newest.date) : ''} />
        <Fact label="Oldest recording" value={oldest?.title || '—'} sub={oldest?.date ? fmtDate(oldest.date) : ''} />
        <Fact label="Longest recording" value={longest?.title || '—'} sub={`${Math.round((longest?.durationSec || 0) / 60)} minutes`} />
      </div>
    </section>
  );
}

const ACCENT_COLOR: Record<string, string> = {
  primary: 'var(--accent-primary)',
  warm:    'var(--accent-warm)',
  gold:    'var(--accent-gold)',
};

function BigStat({ label, value, sub, accent, icon }: { label: string; value: string; sub?: string; accent: string; icon: React.ReactNode }) {
  return (
    <div
      className="relative rounded-[16px] p-4 sm:p-5 overflow-hidden group transition-all duration-300 hover:translate-y-[-3px]"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderTop: `2px solid ${ACCENT_COLOR[accent]}`,
      }}
    >
      <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full opacity-0 group-hover:opacity-100 transition-opacity blur-3xl pointer-events-none" style={{ background: ACCENT_COLOR[accent], opacity: 0 }} />
      <div className="flex items-start justify-between mb-3">
        <div className="text-[10px] uppercase tracking-[.18em] font-semibold" style={{ color: 'var(--text-muted)' }}>
          {label}
        </div>
        <div style={{ color: ACCENT_COLOR[accent], opacity: 0.5 }}>{icon}</div>
      </div>
      <div className="font-mono text-[24px] sm:text-[30px] font-bold tabular-nums leading-none" style={{ color: 'var(--text-primary)' }}>
        {value}
      </div>
      {sub && (
        <div className="text-[11px] mt-2" style={{ color: 'var(--text-secondary)' }}>{sub}</div>
      )}
    </div>
  );
}

function Fact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0" style={{ borderLeft: '3px solid var(--accent-primary)', paddingLeft: '14px' }}>
      <div className="text-[10px] uppercase tracking-[.18em] font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
        {label}
      </div>
      <div className="text-[13.5px] font-semibold line-clamp-2 leading-snug" style={{ color: 'var(--text-primary)' }}>{value}</div>
      {sub && (
        <div className="text-[11px] mt-1.5 font-medium" style={{ color: 'var(--text-secondary)' }}>{sub}</div>
      )}
    </div>
  );
}
