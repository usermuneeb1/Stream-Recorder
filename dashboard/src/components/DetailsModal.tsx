// Details modal — the program notes for one recording: art, metadata,
// chapters, the mirror vault, and neighbours in the archive.

import { useRef, useState } from 'react';
import type { Ep } from '../types';
import { fmtDate, fmtTime, isHD, resShort } from '../lib/format';
import { useDialogA11y } from '../hooks/useDialogA11y';

interface Props {
  ep: Ep;
  recs: Ep[];
  listed: boolean;
  onOpen: (ep: Ep) => void;
  onToggleList: (id: string) => void;
  onClose: () => void;
}

export default function DetailsModal({ ep, recs, listed, onOpen, onToggleList, onClose }: Props) {
  const [broken, setBroken] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // Scroll lock · Escape · focus trap · initial focus on Close · restore.
  useDialogA11y(containerRef, onClose, closeRef);

  const sorted = [...recs].sort((a, b) => b.date.localeCompare(a.date));
  const idx = sorted.findIndex(r => r.videoId === ep.videoId);
  const neighbours = sorted.filter((_r, i) => Math.abs(i - idx) === 1).slice(0, 2);
  const more = sorted.filter(r => r.videoId !== ep.videoId).slice(0, 4);

  const vault = [
    { label: 'MEGA', href: ep.megaLink, color: '#d92753' },
    { label: 'Pixeldrain', href: ep.pixeldrainLink, color: '#4f9ee8' },
    { label: 'Gofile', href: ep.gofileLink, color: '#3ba97c' },
    { label: 'Archive.org', href: ep.archiveLink, color: '#e50914' },
  ].filter(v => v.href);

  return (
    <div ref={containerRef} className="fixed inset-0 z-[95] overflow-y-auto" role="dialog" aria-modal="true" aria-label={ep.title}>
      <div className="overlay-backdrop" onClick={onClose} />
      <div className="relative min-h-full flex items-start justify-center p-4 md:p-8">
        <div data-overlay-panel className="modal-card w-[min(940px,96vw)] my-8 overflow-hidden">
          {/* Art */}
          <div className="relative aspect-[16/7.5]">
            <img
              src={broken ? '/thumbnail.jpg' : ep.thumbnail}
              alt=""
              onError={() => setBroken(true)}
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, var(--ink-1) 2%, transparent 60%)' }} />
            <button
              ref={closeRef}
              className="orb-sm absolute top-4 right-4 z-[2]"
              style={{ background: 'var(--glass-strong)' }}
              onClick={onClose}
              title="Close"
              aria-label="Close details"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>

            <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8">
              <div className="flex items-center gap-3 mb-3">
                <span className="eyebrow">{fmtDate(ep.date)}</span>
                {ep.isNew && <span className="badge-new">NEW</span>}
              </div>
              <h2 className="display text-2xl md:text-[34px] font-medium leading-tight line-clamp-2" style={{ textShadow: '0 2px 24px rgba(0,0,0,.6)' }}>
                {ep.title}
              </h2>
              <div className="flex gap-2.5 mt-5">
                <button className="btn btn-flame" onClick={() => { onClose(); setTimeout(() => onOpen(ep), 80); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
                  Play
                </button>
                <button
                  className={`btn btn-ghost ${listed ? '!border-[var(--line-flame)]' : ''}`}
                  onClick={() => onToggleList(ep.videoId)}
                >
                  {listed
                    ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--flame-1)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12.5 9.5 18 20 6.5" /></svg>
                    : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>}
                  {listed ? 'In My List' : 'My List'}
                </button>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="grid md:grid-cols-[1.5fr_1fr] gap-8 p-6 md:p-8">
            <div>
              <div className="mono text-[11px] flex flex-wrap gap-x-4 gap-y-2 mb-5" style={{ color: 'var(--mist)' }}>
                <span style={{ color: 'var(--jade)' }}>{ep.matchPct}% match</span>
                <span>{fmtDate(ep.date)}</span>
                {ep.durationFmt && <span>{ep.durationFmt}</span>}
                {isHD(ep.resolution) && <span className="chip chip-hd">{resShort(ep.resolution)}</span>}
                {ep.sizeHuman && <span>{ep.sizeHuman}</span>}
                {ep.viewCount ? <span>{ep.viewCount.toLocaleString()} views</span> : null}
              </div>

              <p className="text-[13.5px] leading-relaxed" style={{ color: 'var(--mist)' }}>
                {ep.fromYouTube
                  ? `Straight from The Muslim Lantern's YouTube channel — played through the original stream.`
                  : `Recorded live on ${fmtDate(ep.date)} and preserved across ${vault.length + 1} independent archives. Playback runs through an auto-failing mirror cascade — if one source gutters, the next lights up.`}
              </p>

              {ep.chapters && ep.chapters.length > 0 && (
                <div className="mt-6">
                  <div className="eyebrow mb-3">Chapters</div>
                  <div className="flex flex-col gap-1">
                    {ep.chapters.slice(0, 6).map((c, i) => (
                      <div key={i} className="flex items-baseline gap-3 text-[12.5px]">
                        <span className="mono text-[10.5px] flex-none w-14" style={{ color: 'var(--flame-2)' }}>{fmtTime(c.time)}</span>
                        <span style={{ color: 'var(--mist)' }}>{c.label}</span>
                      </div>
                    ))}
                    {ep.chapters.length > 6 && (
                      <span className="mono text-[10px] mt-1" style={{ color: 'var(--shade)' }}>
                        +{ep.chapters.length - 6} more on the watch page
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div className="mono text-[10px] mt-6 leading-relaxed" style={{ color: 'var(--shade)' }}>
                ID {ep.videoId} · recorded {ep.recordedAt ? new Date(ep.recordedAt).toLocaleString() : ep.date}
              </div>
            </div>

            <div>
              <div className="eyebrow mb-3">The vault</div>
              <div className="flex flex-col gap-2">
                {vault.map(v => (
                  <a
                    key={v.label}
                    href={v.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-3.5 h-11 rounded-lg text-[12.5px] font-semibold transition hover:translate-x-1"
                    style={{ background: 'var(--ink-2)', border: '1px solid var(--line)', color: 'var(--ivory)' }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full flex-none" style={{ background: v.color, boxShadow: `0 0 8px ${v.color}` }} />
                    {v.label}
                    <svg className="ml-auto" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--shade)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M9 7h8v8" /></svg>
                  </a>
                ))}
              </div>

              {neighbours.length > 0 && (
                <div className="mt-6">
                  <div className="eyebrow mb-3">Adjacent recordings</div>
                  <div className="flex flex-col gap-2">
                    {[...neighbours, ...more].slice(0, 3).map(r => (
                      <button
                        key={r.videoId}
                        onClick={() => onOpen(r)}
                        className="flex items-center gap-3 p-2 -mx-2 rounded-lg text-left transition-colors hover:bg-[var(--flame-04)]"
                      >
                        <img src={r.thumbnail} alt="" loading="lazy" className="w-24 aspect-video object-cover rounded flex-none"
                          onError={e => { (e.target as HTMLImageElement).src = '/thumbnail.jpg'; }} />
                        <span className="min-w-0">
                          <span className="block text-[12.5px] font-semibold line-clamp-1" style={{ color: 'var(--ivory)' }}>{r.title}</span>
                          <span className="mono block text-[10px]" style={{ color: 'var(--shade)' }}>{fmtDate(r.date)}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
