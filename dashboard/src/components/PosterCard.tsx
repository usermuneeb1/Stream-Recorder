// Poster card — the atom of the archive. Shelf variant expands on hover with
// an info drawer; compact variant serves grids (browse / search / details).

import { useState } from 'react';
import type { Ep } from '../types';
import { fmtDate, fmtRemaining, isHD, resShort } from '../lib/format';
import { positionOf } from '../lib/storage';
import { nav } from './Nav';

interface Props {
  ep: Ep;
  listed: boolean;
  onOpen: (ep: Ep) => void;
  onDetails: (ep: Ep) => void;
  onToggleList: (id: string) => void;
  compact?: boolean;
  index?: number;          // stagger delay
}

function PlayIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>;
}

export default function PosterCard({ ep, listed, onOpen, onDetails, onToggleList, compact, index }: Props) {
  const [broken, setBroken] = useState(false);
  const pos = positionOf(ep.videoId);
  const pct = pos && pos.d ? Math.min(100, (pos.t / pos.d) * 100) : 0;
  const left = pos ? pos.d - pos.t : 0;

  const open = () => onOpen(ep);
  const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };

  return (
    <div
      className={`card ${compact ? 'card-compact' : ''}`}
      style={index != null ? { animationDelay: `${Math.min(index, 10) * 55}ms` } : undefined}
      role="button"
      tabIndex={0}
      aria-label={`Play ${ep.title}`}
      onClick={open}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}
    >
      <div className="card-art">
        <img
          src={broken ? '/thumbnail.jpg' : ep.thumbnail}
          alt=""
          loading="lazy"
          draggable={false}
          onError={() => setBroken(true)}
        />
        <div className="card-shade" />

        {/* top-left flags */}
        <div className="absolute top-2 left-2 flex gap-1.5 z-[1]">
          {ep.isNew && <span className="badge-new">NEW</span>}
        </div>
        <div className="absolute top-2 right-2 flex gap-1.5 z-[1]">
          {isHD(ep.resolution) && <span className="chip chip-hd">{resShort(ep.resolution)}</span>}
        </div>

        {/* bottom meta */}
        <div className="absolute bottom-2 left-2.5 right-2.5 flex items-end justify-between z-[1]">
          {ep.fromYouTube && (
            <span className="mono text-[10px] font-semibold px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(7,6,5,.68)', color: 'var(--flame-1)', border: '1px solid var(--line-flame)' }}>
              YT
            </span>
          )}
          <span className="mono text-[10.5px] font-medium ml-auto" style={{ color: 'rgba(255,255,255,.88)', textShadow: '0 1px 6px rgba(0,0,0,.8)' }}>
            {ep.durationFmt}
          </span>
        </div>

        {/* hover play */}
        <div className="card-play">
          <span className="orb"><PlayIcon /></span>
        </div>

        {/* continue progress */}
        {pct > 1 && (
          <div className="card-progress">
            <div className="fill" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>

      {/* static caption for compact cards */}
      {compact ? (
        <div className="pt-2.5 px-0.5">
          <div className="text-[13px] font-semibold line-clamp-1" style={{ color: 'var(--ivory)' }}>{ep.title}</div>
          <div className="mono text-[10px] mt-1" style={{ color: 'var(--shade)' }}>
            {fmtDate(ep.date)}{ep.sizeHuman ? ` · ${ep.sizeHuman}` : ''}
          </div>
        </div>
      ) : null}

      {/* hover drawer for shelf cards */}
      {!compact && (
        <div className="card-info" onClick={e => e.stopPropagation()}>
          <div className="text-[13.5px] font-bold line-clamp-2 mb-1.5" style={{ color: 'var(--ivory)' }}>{ep.title}</div>
          <div className="mono text-[10px] mb-3 flex flex-wrap items-center gap-x-2 gap-y-1" style={{ color: 'var(--shade)' }}>
            <span style={{ color: 'var(--jade)' }}>{ep.matchPct}% match</span>
            <span>{fmtDate(ep.date)}</span>
            {isHD(ep.resolution) && <span className="chip chip-hd">{resShort(ep.resolution)}</span>}
            {pct > 1 && <span style={{ color: 'var(--flame-2)' }}>{fmtRemaining(left)}</span>}
          </div>
          <div className="card-actions">
            <button className="orb-sm solid" title="Play" aria-label={`Play ${ep.title}`} onClick={stop(open)}>
              <PlayIcon />
            </button>
            <button
              className={`orb-sm ${listed ? 'on' : ''}`}
              title={listed ? 'Remove from My List' : 'Add to My List'}
              aria-label={listed ? 'Remove from My List' : 'Add to My List'}
              onClick={stop(() => onToggleList(ep.videoId))}
            >
              {listed
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12.5 9.5 18 20 6.5" /></svg>
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>}
            </button>
            <button className="orb-sm" title="More info" aria-label="More info" onClick={stop(() => onDetails(ep))}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function cardOpen(ep: Ep) {
  nav(`#/watch/${encodeURIComponent(ep.videoId)}`);
}
