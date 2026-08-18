// Mission Control — the machine behind the archive, made visible.
// Pipeline stages, live mirror fan-out coverage, enrichment stats,
// prediction window, and the platform ledger. Every number on this
// page is computed live from the actual archive data.

import { useMemo } from 'react';
import type { Ep, StreamPrediction, SystemStatus } from '../types';
import { fmtDate } from '../lib/format';

interface Props {
  recs: Ep[];
  status: SystemStatus | null;
  prediction: StreamPrediction | null;
  ytCount: number;
}

interface Stage {
  num: string;
  name: string;
  tag: string;
  body: string;
  facts: string[];
}

export default function SystemPage({ recs, status, prediction, ytCount }: Props) {
  const total = recs.length;

  /* ── Live mirror coverage, straight from the data ─────────────────── */
  const mirrors = useMemo(() => {
    const count = (fn: (r: Ep) => boolean) => recs.filter(fn).length;
    return [
      { name: 'Archive.org', color: '#e50914', n: count(r => !!(r.archiveLink || r.archiveNode || r.archiveDirect)), note: 'forever-library node + direct files' },
      { name: 'GitHub Releases', color: '#9aa0a6', n: count(r => !!(r.githubRelease || r.githubDirect)), note: 'versioned cold storage' },
      { name: 'MEGA', color: '#d92753', n: count(r => !!r.megaLink), note: 'encrypted cloud vault' },
      { name: 'Pixeldrain', color: '#4f9ee8', n: count(r => !!r.pixeldrainLink), note: 'edge streaming cache' },
      { name: 'Gofile', color: '#3ba97c', n: count(r => !!r.gofileLink), note: 'anonymous overflow' },
      { name: 'Telegram', color: '#4f9ee8', n: count(r => !!(r.telegramLink || r.cfStream)), note: 'bot-delivered stream' },
    ];
  }, [recs]);

  const enriched = useMemo(() => ({
    chapters: recs.filter(r => r.chapters?.length).length,
    transcripts: recs.filter(r => !!r.transcriptUrl).length,
    storyboards: recs.filter(r => !!r.storyboard).length,
    chat: recs.filter(r => !!r.chatUrl).length,
    hd: recs.filter(r => /1080/.test(r.resolution)).length,
  }), [recs]);

  const stages: Stage[] = [
    {
      num: '01', name: 'Detect', tag: 'stream-sniper',
      body: 'A GitHub Actions sentinel polls the channel around the clock. The moment a live stream appears, the pipeline wakes — no human at the switch.',
      facts: [
        prediction ? `peak windows: ${prediction.peakDays.slice(0, 2).join(' / ')}` : 'peak windows: learning',
        prediction ? `avg gap: ${prediction.avgGapDays} days` : 'avg gap: learning',
        'trigger → record in under a minute',
      ],
    },
    {
      num: '02', name: 'Capture', tag: 'yt-dlp cascade',
      body: 'Ten fallback methods deep: cookies rotate, formats cascade from 1080p down, and a watchdog restarts the grab if the stream hiccups. Nothing records half a stream.',
      facts: [
        `${enriched.hd}/${total || '—'} recordings in 1080p`,
        'auto-retry + resume on drop',
        'forced-record trigger for manual catches',
      ],
    },
    {
      num: '03', name: 'Mirror', tag: 'fan-out storage',
      body: 'The finished file fans out to independent storages across the internet. Any single host can disappear and the archive stays whole — that is the entire point.',
      facts: mirrors.slice(0, 3).map(m => `${m.name}: ${m.n}/${total}`),
    },
    {
      num: '04', name: 'Enrich', tag: 'ai + metadata',
      body: 'Each recording grows chapters, a thumbnail, storyboard sprites for scrub previews, and where possible the live chat — the stream, annotated.',
      facts: [
        `${enriched.chapters} AI-chaptered`,
        `${enriched.transcripts} transcripts`,
        `${enriched.chat} live-chat archives`,
      ],
    },
    {
      num: '05', name: 'Serve', tag: 'this website',
      body: 'The index publishes to the repo, the dashboard reads it through the jsDelivr CDN with failover, and playback cascades YouTube-first then mirrors. Autonomous end to end.',
      facts: [
        `${ytCount}+ channel videos indexed`,
        `${status?.totalHours ?? '—'} hours preserved`,
        'CDN-first, offline-tolerant',
      ],
    },
  ];

  const chatSample = recs.filter(r => r.chatUrl).slice(0, 4);

  return (
    <div className="pt-28 md:pt-36 px-[4vw] md:px-8 pb-16 min-h-dvh">
      {/* Heading */}
      <div className="flex items-end justify-between flex-wrap gap-4 mb-10">
        <div>
          <div className="eyebrow mb-2">Mission control</div>
          <h1 className="display text-3xl md:text-5xl text-balance">The machine behind the archive</h1>
          <p className="text-[13.5px] mt-3 max-w-2xl leading-relaxed" style={{ color: 'var(--mist)' }}>
            Every stream is detected, captured in 1080p, fanned out to independent storages,
            enriched, and served here — with no one at the keyboard. This page shows the
            pipeline as it actually stands, computed live from the archive itself.
          </p>
        </div>
        <span className="flex items-center gap-2 mono text-[10.5px] px-3 py-1.5 rounded-full"
          style={{
            color: status?.ok ? 'var(--jade)' : 'var(--ember)',
            border: `1px solid ${status?.ok ? 'var(--jade-dim)' : 'rgba(230,9,20,.3)'}`,
            background: status?.ok ? 'var(--jade-dim)' : 'var(--flame-04)',
          }}>
          <span className="dot-health fast" />
          {status?.ok ? 'systems nominal' : 'status stale'} · updated {status?.updatedAt ? fmtDate(status.updatedAt.slice(0, 10)) : '—'}
        </span>
      </div>

      {/* Stats band */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-14">
        {[
          { n: String(status?.recordingsTotal ?? total), l: 'recordings preserved' },
          { n: `${status?.totalSizeGb?.toFixed?.(1) ?? '—'} GB`, l: 'in the vault' },
          { n: `${Math.round(status?.totalHours ?? 0)}h`, l: 'of footage' },
          { n: status?.ytSubscribers || '—', l: 'channel subscribers' },
        ].map(s => (
          <div key={s.l} className="rounded-xl p-5" style={{ background: 'var(--ink-1)', border: '1px solid var(--line)' }}>
            <div className="stat-num tabular-nums">{s.n}</div>
            <div className="stat-label">{s.l}</div>
          </div>
        ))}
      </div>

      {/* Pipeline */}
      <div className="mb-14">
        <div className="flex items-center gap-3 mb-5">
          <span className="shelf-tick" />
          <span className="eyebrow">The pipeline</span>
          <span className="mono text-[10px]" style={{ color: 'var(--shade)' }}>detect → capture → mirror → enrich → serve</span>
        </div>
        <div className="grid md:grid-cols-2 xl:grid-cols-5 gap-3">
          {stages.map((s, i) => (
            <div key={s.num} className="relative rounded-xl p-5 flex flex-col gap-3 stage-card"
              style={{ background: 'var(--ink-1)', border: '1px solid var(--line)' }}>
              <div className="flex items-center justify-between">
                <span className="display text-2xl" style={{ color: 'var(--flame-1)' }}>{s.num}</span>
                <span className="mono text-[9px] px-2 py-1 rounded" style={{ color: 'var(--flame-2)', background: 'var(--flame-04)', border: '1px solid var(--line-flame)' }}>
                  {s.tag}
                </span>
              </div>
              <h2 className="display text-lg leading-none">{s.name}</h2>
              <p className="text-[12px] leading-relaxed" style={{ color: 'var(--mist)' }}>{s.body}</p>
              <div className="mt-auto flex flex-col gap-1.5 pt-2">
                {s.facts.map(f => (
                  <span key={f} className="mono text-[10px] flex items-center gap-2" style={{ color: 'var(--shade)' }}>
                    <span className="w-1 h-1 rounded-full flex-none" style={{ background: 'var(--flame-2)' }} />
                    {f}
                  </span>
                ))}
              </div>
              {i < stages.length - 1 && (
                <span className="hidden xl:block absolute -right-[13px] top-1/2 -translate-y-1/2 z-[2] text-flame" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m9 5 7 7-7 7" /></svg>
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Mirror fan-out */}
      <div className="mb-14">
        <div className="flex items-center gap-3 mb-5">
          <span className="shelf-tick" />
          <span className="eyebrow">Storage fan-out</span>
          <span className="mono text-[10px]" style={{ color: 'var(--shade)' }}>live coverage across {mirrors.length} independent hosts</span>
        </div>
        <div className="rounded-xl p-5 md:p-6" style={{ background: 'var(--ink-1)', border: '1px solid var(--line)' }}>
          <div className="flex flex-col gap-4">
            {mirrors.map(m => {
              const pct = total ? Math.round((m.n / total) * 100) : 0;
              return (
                <div key={m.name} className="flex items-center gap-4">
                  <span className="w-1.5 h-8 rounded-full flex-none" style={{ background: m.color, boxShadow: `0 0 10px ${m.color}55` }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-3 mb-1.5">
                      <span className="text-[13px] font-bold" style={{ color: 'var(--ivory)' }}>
                        {m.name}
                        <span className="mono text-[10px] font-normal ml-2" style={{ color: 'var(--shade)' }}>{m.note}</span>
                      </span>
                      <span className="mono text-[10.5px] tabular-nums flex-none" style={{ color: pct === total && total > 0 ? 'var(--jade)' : 'var(--mist)' }}>
                        {m.n}/{total} · {pct}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--ink-3)' }}>
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, background: m.color, boxShadow: `0 0 8px ${m.color}66` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mono text-[9.5px] mt-5 leading-relaxed" style={{ color: 'var(--shade)' }}>
            Redundancy is the product: any host can vanish and every recording survives elsewhere.
            Coverage bars update the moment the pipeline writes new mirrors.
          </p>
        </div>
      </div>

      {/* Live chat archive + prediction */}
      <div className="grid md:grid-cols-2 gap-3 mb-14">
        <div className="rounded-xl p-6" style={{ background: 'var(--ink-1)', border: '1px solid var(--line)' }}>
          <div className="eyebrow mb-3">Live chat archive</div>
          <p className="text-[13px] leading-relaxed mb-4" style={{ color: 'var(--mist)' }}>
            The audience is part of the record — chat is captured alongside the stream and
            preserved side by side with the video.
          </p>
          {chatSample.length ? (
            <div className="flex flex-col gap-2">
              {chatSample.map(r => (
                <a key={r.videoId} href={r.chatUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2.5 px-3 h-10 rounded-lg text-[12px] font-semibold transition-all hover:translate-x-1"
                  style={{ background: 'var(--ink-2)', color: 'var(--ivory)' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--flame-2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                  <span className="line-clamp-1">{fmtDate(r.date)} — {r.title}</span>
                </a>
              ))}
            </div>
          ) : (
            <span className="mono text-[10.5px]" style={{ color: 'var(--shade)' }}>
              Chat capture enabled — links appear as new streams are archived.
            </span>
          )}
        </div>

        <div className="rounded-xl p-6" style={{ background: 'var(--ink-1)', border: '1px solid var(--line)' }}>
          <div className="eyebrow mb-3">Next likely stream</div>
          <p className="text-[13px] leading-relaxed mb-4" style={{ color: 'var(--mist)' }}>
            The schedule model watches historical patterns to predict when the lantern
            lights next — and has the recorder waiting.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg p-4" style={{ background: 'var(--ink-2)' }}>
              <div className="display text-xl leading-none" style={{ color: 'var(--flame-1)' }}>
                {prediction?.peakDays?.slice(0, 2).join(' / ') || '—'}
              </div>
              <div className="stat-label">peak days</div>
            </div>
            <div className="rounded-lg p-4" style={{ background: 'var(--ink-2)' }}>
              <div className="display text-xl leading-none tabular-nums" style={{ color: 'var(--flame-1)' }}>
                {prediction?.peakHoursPkt?.length
                  ? `${prediction.peakHoursPkt.slice(0, 3).map(h => `${h}:00`).join('–')} PKT`
                  : '—'}
              </div>
              <div className="stat-label">peak hours</div>
            </div>
          </div>
          <p className="mono text-[9.5px] mt-4" style={{ color: 'var(--shade)' }}>
            avg gap between streams: {prediction?.avgGapDays || '—'} days · {status?.ytVideos ?? '—'} videos on the channel
          </p>
        </div>
      </div>

      {/* Ledger */}
      <div className="rounded-xl p-6 flex flex-wrap items-center gap-4" style={{ background: 'var(--flame-04)', border: '1px solid var(--line-flame)' }}>
        <span className="w-2.5 h-2.5 rounded-full flex-none" style={{ background: 'var(--flame-1)', boxShadow: '0 0 14px 3px var(--flame-glow)' }} />
        <p className="text-[12.5px] leading-relaxed flex-1 min-w-[240px]" style={{ color: 'var(--mist)' }}>
          <span style={{ color: 'var(--ivory)' }}>Autonomous by design.</span> Forty-one GitHub workflows
          run the detection, capture, mirroring and publishing without anyone watching. This website is
          the glass wall in front of the machine — every number above is read live from its output.
        </p>
        <a href="https://github.com/usermuneeb1/Stream-Recorder" target="_blank" rel="noopener noreferrer"
          className="btn btn-ghost !py-2.5 !px-5 !text-[12px]">
          View the machinery
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M9 7h8v8" /></svg>
        </a>
        <a href="#/stats" className="btn btn-ghost !py-2.5 !px-5 !text-[12px]">
          See the numbers
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m9 5 7 7-7 7" /></svg>
        </a>
      </div>
    </div>
  );
}
