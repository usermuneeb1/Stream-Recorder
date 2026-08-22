// Archive Insights — the archive, measured.
// Growth over time, stream cadence, peak windows, mirror redundancy and
// resolution breakdown. Every number is computed live from the archive data
// (recordings.json + system-status.json + predicted-schedule.json) — no
// backend, no hardcoded figures.

import { useMemo } from 'react';
import type { Ep, StreamPrediction, SystemStatus } from '../types';
import { fmtDate, resShort } from '../lib/format';
import { nav } from './Nav';

interface Props {
  recs: Ep[];
  status: SystemStatus | null;
  prediction: StreamPrediction | null;
}

interface Month {
  key: string;        // "YYYY-MM"
  label: string;      // "Aug 2026"
  count: number;
  hours: number;
  cumHours: number;
}

function dayDiff(a: string, b: string): number {
  const t = (d: string) => new Date(`${d}T00:00:00Z`).getTime();
  return Math.max(0, Math.round((t(b) - t(a)) / 864e5));
}

export default function InsightsPage({ recs, status, prediction }: Props) {
  const total = recs.length;
  const totalHours = status?.totalHours || recs.reduce((a, r) => a + (r.durationSec || 0) / 3600, 0);
  const totalSize = status?.totalSizeGb || recs.reduce((a, r) => a + (r.sizeGb || 0), 0);
  const avgDur = total ? totalHours / total : 0;

  /* ── Monthly growth (bars = recordings, line = cumulative hours) ──── */
  const months = useMemo<Month[]>(() => {
    const byKey = new Map<string, { count: number; hours: number }>();
    for (const r of recs) {
      const key = (r.date || '').slice(0, 7);
      if (!key) continue;
      const cur = byKey.get(key) || { count: 0, hours: 0 };
      cur.count += 1;
      cur.hours += (r.durationSec || 0) / 3600;
      byKey.set(key, cur);
    }
    let cum = 0;
    return [...byKey.entries()]
      .map(([key, v]) => {
        cum += v.hours;
        const [y, m] = key.split('-');
        const label = `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][parseInt(m, 10) - 1] || ''} ${y}`;
        return { key, label, count: v.count, hours: v.hours, cumHours: cum };
      })
      .sort((a, b) => a.key.localeCompare(b.key));
  }, [recs]);

  const chart = useMemo(() => {
    if (!months.length) return null;
    const W = 640;
    const H = 240;
    const PAD_L = 34;
    const PAD_R = 10;
    const PAD_T = 14;
    const PAD_B = 26;
    const plotW = W - PAD_L - PAD_R;
    const plotH = H - PAD_T - PAD_B;
    const maxCount = Math.max(...months.map(m => m.count));
    const maxCum = Math.max(...months.map(m => m.cumHours));
    const n = months.length;
    const slot = plotW / n;
    const barW = Math.min(22, slot * 0.52);

    const bars = months.map((m, i) => {
      const h = m.count === 0 ? 2 : Math.max(3, (m.count / maxCount) * plotH);
      const x = PAD_L + i * slot + (slot - barW) / 2;
      const y = PAD_T + plotH - h;
      return { ...m, x, y, h, barW, labelX: PAD_L + i * slot + slot / 2 };
    });

    const pts = months.map((m, i) => {
      const x = PAD_L + i * slot + slot / 2;
      const y = PAD_T + plotH - (m.cumHours / maxCum) * plotH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const area = `M ${pts[0]} L ${pts.join(' L ')} L ${PAD_L + (n - 1) * slot + slot / 2},${PAD_T + plotH} L ${PAD_L + slot / 2},${PAD_T + plotH} Z`;

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => {
      const v = maxCum * f;
      const y = PAD_T + plotH - f * plotH;
      return { v, y, label: `${v >= 10 ? Math.round(v) : v.toFixed(1)}h` };
    });

    return { W, H, PAD_L, PAD_T, plotH, maxCount, maxCum, bars, pts, area, yTicks };
  }, [months]);

  /* ── Cadence: gaps between consecutive streams ────────────────────── */
  const cadence = useMemo(() => {
    const dates = [...recs].map(r => r.date).filter(Boolean).sort();
    const gaps: number[] = [];
    for (let i = 1; i < dates.length; i++) gaps.push(dayDiff(dates[i - 1], dates[i]));
    if (!gaps.length) return null;
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    return {
      avg,
      longest: Math.max(...gaps),
      shortest: Math.min(...gaps),
      lastDate: dates[dates.length - 1],
      nextEst: new Date(`${dates[dates.length - 1]}T00:00:00Z`).getTime() + avg * 864e5,
      count: gaps.length,
    };
  }, [recs]);

  /* ── Mirror redundancy ────────────────────────────────────────────── */
  const mirrors = useMemo(() => {
    const count = (fn: (r: Ep) => boolean) => recs.filter(fn).length;
    const rows = [
      { name: 'Archive.org', color: '#e50914', n: count(r => !!(r.archiveLink || r.archiveNode || r.archiveDirect)) },
      { name: 'GitHub Releases', color: '#9aa0a6', n: count(r => !!(r.githubRelease || r.githubDirect)) },
      { name: 'MEGA', color: '#d92753', n: count(r => !!r.megaLink) },
      { name: 'Pixeldrain', color: '#4f9ee8', n: count(r => !!r.pixeldrainLink) },
      { name: 'Gofile', color: '#3ba97c', n: count(r => !!r.gofileLink) },
      { name: 'Telegram', color: '#4f9ee8', n: count(r => !!(r.telegramLink || r.cfStream)) },
    ];
    const perRec = recs.map(r =>
      [r.archiveLink || r.archiveNode || r.archiveDirect, r.githubRelease || r.githubDirect,
        r.megaLink, r.pixeldrainLink, r.gofileLink, r.telegramLink || r.cfStream]
        .filter(Boolean).length,
    );
    const avgCopies = perRec.length ? perRec.reduce((a, b) => a + b, 0) / perRec.length : 0;
    const maxCopies = Math.max(0, ...perRec);
    return { rows, avgCopies, maxCopies };
  }, [recs]);

  /* ── Resolution breakdown ─────────────────────────────────────────── */
  const resolutions = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of recs) {
      const k = resShort(r.resolution) || 'unknown';
      m.set(k, (m.get(k) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [recs]);

  const longest = useMemo(
    () => [...recs].sort((a, b) => (b.durationSec || 0) - (a.durationSec || 0)).slice(0, 5),
    [recs],
  );

  /* ── Peak window (from the schedule model) ────────────────────────── */
  const peakSet = useMemo(() => new Set(prediction?.peakHoursPkt || []), [prediction]);
  const peakDays = prediction?.peakDays || [];
  const est = cadence ? new Date(cadence.nextEst) : null;

  return (
    <div className="pt-28 md:pt-36 px-[4vw] md:px-8 pb-16 min-h-dvh">
      {/* Heading */}
      <div className="flex items-end justify-between flex-wrap gap-4 mb-10">
        <div>
          <div className="eyebrow mb-2">Archive insights</div>
          <h1 className="display text-3xl md:text-5xl text-balance">The archive, measured</h1>
          <p className="text-[13.5px] mt-3 max-w-2xl leading-relaxed" style={{ color: 'var(--mist)' }}>
            Every preserved stream, counted and charted — growth month by month, the rhythm of the
            channel, and how many independent copies each recording survives in. Computed live from
            the archive index; nothing here is hardcoded.
          </p>
        </div>
        <a href="#/system" className="btn btn-ghost !py-2.5 !px-5 !text-[12px]">
          Mission control
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m9 5 7 7-7 7" /></svg>
        </a>
      </div>

      {/* Stats band */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-14">
        {[
          { n: String(total), l: 'recordings preserved' },
          { n: `${totalHours >= 100 ? Math.round(totalHours) : Math.round(totalHours * 10) / 10}h`, l: 'total runtime' },
          { n: totalSize >= 1000 ? `${(totalSize / 1024).toFixed(1)}TB` : `${Math.round(totalSize * 10) / 10}GB`, l: 'in the vault' },
          { n: avgDur ? `${Math.round(avgDur * 10) / 10}h` : '—', l: 'average stream' },
          { n: status?.mirrorHealthy ? '✓ healthy' : (status?.mirrorDegraded ? 'repairing' : '—'), l: 'mirror health', hl: status?.mirrorHealthy === false },
        ].map(s => (
          <div key={s.l} className="rounded-xl p-5" style={{ background: 'var(--ink-1)', border: `1px solid ${s.hl ? 'var(--accent-warm, #FF6B35)' : 'var(--line)'}` }}>
            <div className="stat-num tabular-nums" style={s.hl ? { color: 'var(--accent-warm, #FF6B35)' } : undefined}>{s.n}</div>
            <div className="stat-label">{s.l}</div>
          </div>
        ))}
      </div>

      {/* Growth chart */}
      <div className="mb-14">
        <div className="flex items-center gap-3 mb-5">
          <span className="shelf-tick" />
          <span className="eyebrow">Growth</span>
          <span className="mono text-[10px]" style={{ color: 'var(--shade)' }}>
            bars: recordings per month · line: cumulative hours
          </span>
        </div>
        <div className="rounded-xl p-5 md:p-6" style={{ background: 'var(--ink-1)', border: '1px solid var(--line)' }}>
          {chart && months.length > 0 ? (
            <div className="overflow-x-auto">
              <svg viewBox={`0 0 ${chart.W} ${chart.H}`} className="w-full min-w-[560px] h-auto" role="img"
                aria-label="Recordings per month and cumulative preserved hours">
                <defs>
                  <linearGradient id="insights-cum" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--flame-2)" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="var(--flame-2)" stopOpacity="0.02" />
                  </linearGradient>
                </defs>
                {/* gridlines + y labels */}
                {chart.yTicks.map(t => (
                  <g key={t.label}>
                    <line x1={chart.PAD_L} x2={chart.W - 10} y1={t.y} y2={t.y} stroke="var(--line)" strokeWidth="1" strokeDasharray="3 5" />
                    <text x={chart.PAD_L - 8} y={t.y + 3} textAnchor="end" fontSize="9" fill="var(--shade)" fontFamily="var(--font-mono)">{t.label}</text>
                  </g>
                ))}
                {/* area + line */}
                <path d={chart.area} fill="url(#insights-cum)" />
                <polyline points={chart.pts.join(' ')} fill="none" stroke="var(--flame-1)" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
                {chart.pts.map((p, i) => {
                  const [x, y] = p.split(',').map(Number);
                  return <circle key={i} cx={x} cy={y} r="3" fill="var(--ink-0)" stroke="var(--flame-1)" strokeWidth="1.8" />;
                })}
                {/* bars */}
                {chart.bars.map(b => (
                  <rect key={b.key} x={b.x} y={b.y} width={b.barW} height={b.h} rx="2.5"
                    fill="var(--flame-45)" />
                ))}
                {/* x labels */}
                {chart.bars.map((b, i) => (
                  <text key={`x${b.key}`} x={b.labelX} y={chart.H - 8} textAnchor="middle" fontSize="8.5"
                    fill="var(--shade)" fontFamily="var(--font-mono)">
                    {months.length <= 8 ? b.label : i % 2 === 0 ? b.label : ''}
                  </text>
                ))}
              </svg>
            </div>
          ) : (
            <span className="mono text-[10.5px]" style={{ color: 'var(--shade)' }}>
              Not enough data to chart yet — the graph appears after the first month of recordings.
            </span>
          )}
          <p className="mono text-[9.5px] mt-4 leading-relaxed" style={{ color: 'var(--shade)' }}>
            {months.length
              ? `${months[0].label} → ${months[months.length - 1].label} · ${months.reduce((a, m) => a + m.count, 0)} recordings · ${Math.round(months[months.length - 1].cumHours * 10) / 10}h cumulative`
              : 'Archive index empty.'}
          </p>
        </div>
      </div>

      {/* Cadence + peak window */}
      <div className="grid md:grid-cols-2 gap-3 mb-14">
        <div className="rounded-xl p-6" style={{ background: 'var(--ink-1)', border: '1px solid var(--line)' }}>
          <div className="eyebrow mb-3">Cadence</div>
          <p className="text-[13px] leading-relaxed mb-5" style={{ color: 'var(--mist)' }}>
            The rhythm of the channel — how often the lantern lights, and when it is next expected.
          </p>
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="rounded-lg p-4" style={{ background: 'var(--ink-2)' }}>
              <div className="display text-xl leading-none tabular-nums" style={{ color: 'var(--flame-1)' }}>
                {cadence ? `${Math.round(cadence.avg * 10) / 10}` : '—'}
              </div>
              <div className="stat-label">avg gap · days</div>
            </div>
            <div className="rounded-lg p-4" style={{ background: 'var(--ink-2)' }}>
              <div className="display text-xl leading-none tabular-nums" style={{ color: 'var(--flame-1)' }}>
                {cadence ? cadence.longest : '—'}
              </div>
              <div className="stat-label">longest gap</div>
            </div>
            <div className="rounded-lg p-4" style={{ background: 'var(--ink-2)' }}>
              <div className="display text-xl leading-none tabular-nums" style={{ color: 'var(--flame-1)' }}>
                {cadence ? cadence.shortest : '—'}
              </div>
              <div className="stat-label">shortest gap</div>
            </div>
          </div>
          <div className="rounded-lg p-4" style={{ background: 'var(--flame-04)', border: '1px solid var(--line-flame)' }}>
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full flex-none" style={{ background: 'var(--flame-1)', boxShadow: '0 0 10px 2px var(--flame-glow)' }} />
              <div>
                <div className="text-[13px] font-bold" style={{ color: 'var(--ivory)' }}>
                  {est && cadence ? `≈ ${fmtDate(est.toISOString().slice(0, 10))}` : '—'}
                </div>
                <div className="stat-label">next stream estimate</div>
              </div>
            </div>
            <p className="mono text-[9.5px] mt-3" style={{ color: 'var(--shade)' }}>
              model-based · last stream {cadence ? fmtDate(cadence.lastDate) : '—'}
              {prediction ? ` · model avg ${prediction.avgGapDays} days` : ''}
            </p>
          </div>
        </div>

        <div className="rounded-xl p-6" style={{ background: 'var(--ink-1)', border: '1px solid var(--line)' }}>
          <div className="eyebrow mb-3">Peak window</div>
          <p className="text-[13px] leading-relaxed mb-5" style={{ color: 'var(--mist)' }}>
            Where the schedule model concentrates the watch — the hours the recorder polls hardest.
          </p>
          <div className="flex flex-wrap gap-2 mb-5">
            {(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const).map(d => {
              const on = peakDays.includes(d);
              return (
                <span key={d}
                  className="mono text-[10px] px-3 py-1.5 rounded-full font-semibold transition-colors"
                  style={{
                    color: on ? 'var(--flame-1)' : 'var(--shade)',
                    background: on ? 'var(--flame-12)' : 'var(--ink-2)',
                    border: `1px solid ${on ? 'var(--line-flame)' : 'var(--line)'}`,
                  }}>
                  {d.slice(0, 3)}
                </span>
              );
            })}
          </div>
          <div className="flex items-end gap-[3px] h-16" aria-label="Peak hours, Pakistan time">
            {Array.from({ length: 24 }, (_, h) => {
              const on = peakSet.has(h);
              return (
                <div key={h} className="flex-1 flex flex-col items-center gap-1 group" title={`${h}:00 PKT`}>
                  <div className="w-full rounded-sm transition duration-300"
                    style={{
                      height: on ? 40 : 14,
                      background: on ? 'var(--flame-1)' : 'var(--ink-3)',
                      boxShadow: on ? '0 0 10px var(--flame-glow)' : 'none',
                      opacity: on ? 1 : 0.6,
                    }} />
                  {h % 3 === 0 && (
                    <span className="mono text-[8px]" style={{ color: 'var(--shade)' }}>{h}</span>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mono text-[9.5px] mt-3" style={{ color: 'var(--shade)' }}>
            hours shown in Pakistan time · {peakSet.size} of 24 flagged as peak · full coverage never stops
          </p>
        </div>
      </div>

      {/* Mirror redundancy */}
      <div className="mb-14">
        <div className="flex items-center gap-3 mb-5">
          <span className="shelf-tick" />
          <span className="eyebrow">Redundancy</span>
          <span className="mono text-[10px]" style={{ color: 'var(--shade)' }}>
            avg {mirrors.avgCopies ? Math.round(mirrors.avgCopies * 10) / 10 : '—'} copies per recording · up to {mirrors.maxCopies}
          </span>
        </div>
        <div className="rounded-xl p-5 md:p-6" style={{ background: 'var(--ink-1)', border: '1px solid var(--line)' }}>
          <div className="flex flex-col gap-4">
            {mirrors.rows.map(m => {
              const pct = total ? Math.round((m.n / total) * 100) : 0;
              return (
                <div key={m.name} className="flex items-center gap-4">
                  <span className="w-1.5 h-8 rounded-full flex-none" style={{ background: m.color, boxShadow: `0 0 10px ${m.color}55` }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-3 mb-1.5">
                      <span className="text-[13px] font-bold" style={{ color: 'var(--ivory)' }}>{m.name}</span>
                      <span className="mono text-[10.5px] tabular-nums flex-none" style={{ color: pct === total && total > 0 ? 'var(--jade)' : 'var(--mist)' }}>
                        {m.n}/{total} · {pct}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--ink-3)' }}>
                      <div className="h-full rounded-full transition duration-700"
                        style={{ width: `${pct}%`, background: m.color, boxShadow: `0 0 8px ${m.color}66` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Resolutions + longest */}
      <div className="grid md:grid-cols-2 gap-3 mb-14">
        <div className="rounded-xl p-6" style={{ background: 'var(--ink-1)', border: '1px solid var(--line)' }}>
          <div className="eyebrow mb-3">Quality mix</div>
          <div className="flex flex-col gap-3">
            {resolutions.map(([label, n]) => {
              const pct = total ? Math.round((n / total) * 100) : 0;
              return (
                <div key={label} className="flex items-center gap-4">
                  <span className="mono text-[10.5px] w-14 flex-none" style={{ color: 'var(--ivory)' }}>{label}</span>
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--ink-3)' }}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--flame-2)' }} />
                  </div>
                  <span className="mono text-[10.5px] tabular-nums w-14 text-right flex-none" style={{ color: 'var(--mist)' }}>
                    {n} · {pct}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl p-6" style={{ background: 'var(--ink-1)', border: '1px solid var(--line)' }}>
          <div className="eyebrow mb-3">Longest sessions</div>
          <div className="flex flex-col gap-1.5">
            {longest.map((r, i) => (
              <button key={r.videoId} onClick={() => nav(`#/watch/${encodeURIComponent(r.videoId)}`)}
                className="flex items-center gap-3 px-3 h-11 rounded-lg text-left transition hover:translate-x-1"
                style={{ background: 'var(--ink-2)' }}
                aria-label={`Watch ${r.title}`}>
                <span className="mono text-[10px] w-5 flex-none" style={{ color: 'var(--flame-2)' }}>{String(i + 1).padStart(2, '0')}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[12.5px] font-semibold line-clamp-1" style={{ color: 'var(--ivory)' }}>{r.title}</span>
                  <span className="mono block text-[9.5px] mt-0.5" style={{ color: 'var(--shade)' }}>{fmtDate(r.date)} · {r.durationFmt}</span>
                </span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--shade)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="flex-none"><path d="m9 5 7 7-7 7" /></svg>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Month ledger */}
      <div className="rounded-xl p-6" style={{ background: 'var(--ink-1)', border: '1px solid var(--line)' }}>
        <div className="flex items-center gap-3 mb-5">
          <span className="eyebrow">Ledger</span>
          <span className="mono text-[10px]" style={{ color: 'var(--shade)' }}>preserved hours by month</span>
        </div>
        <div className="flex flex-col gap-2.5">
          {[...months].reverse().map(m => {
            const pct = totalHours ? Math.round((m.hours / totalHours) * 100) : 0;
            return (
              <div key={m.key} className="flex items-center gap-4">
                <span className="mono text-[10.5px] w-16 flex-none" style={{ color: 'var(--ivory)' }}>{m.label}</span>
                <div className="flex-1 h-6 rounded-md overflow-hidden flex"
                  style={{ background: 'var(--ink-2)' }}>
                  <div className="h-full flex items-center pl-2 transition duration-700"
                    style={{ width: `${Math.max(pct, 2)}%`, background: 'var(--flame-12)', borderRight: '1px solid var(--flame-45)' }}>
                    {pct >= 14 && (
                      <span className="mono text-[8.5px] tabular-nums" style={{ color: 'var(--flame-1)' }}>{m.count} rec</span>
                    )}
                  </div>
                </div>
                <span className="mono text-[10.5px] tabular-nums w-20 text-right flex-none" style={{ color: 'var(--mist)' }}>
                  {Math.round(m.hours * 10) / 10}h · {pct}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
