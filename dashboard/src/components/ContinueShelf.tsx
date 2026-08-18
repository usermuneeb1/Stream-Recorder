// Continue watching — unfinished recordings with resume position,
// remaining time, and dismiss. Sets a runtime signal so the screening room
// auto-seeks without a prompt.

import { useEffect, useState } from 'react';
import type { Ep } from '../types';
import { fmtDate, fmtRemaining } from '../lib/format';
import { clearPosition, getHistory, positionOf, removeFromHistory } from '../lib/storage';

declare global { interface Window { __mlaContinueResume?: string } }

interface Props {
  recs: Ep[];
  onOpen: (ep: Ep) => void;
}

function Thumb({ src }: { src: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <img
      src={broken ? '/thumbnail.jpg' : src}
      alt=""
      loading="lazy"
      draggable={false}
      onError={() => setBroken(true)}
      className="w-full h-full object-cover"
    />
  );
}

export default function ContinueShelf({ recs, onOpen }: Props) {
  const [tick, setTick] = useState(0);

  // Re-read storage when it changes elsewhere in the app.
  useEffect(() => { void tick; }, [tick]);

  const byId = new Map(recs.map(r => [r.videoId, r]));
  const items = getHistory()
    .map(id => byId.get(id))
    .filter((r): r is Ep => !!r && !!positionOf(r.videoId))
    .slice(0, 12);

  if (!items.length) return null;

  const open = (ep: Ep) => {
    window.__mlaContinueResume = ep.videoId;
    onOpen(ep);
  };

  const dismiss = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    clearPosition(id);
    removeFromHistory(id);
    setTick(t => t + 1);
  };

  return (
    <section className="shelf reveal-on-scroll">
      <div className="shelf-head">
        <span className="shelf-tick" />
        <span className="eyebrow">Continue watching</span>
        <span className="mono text-[10px]" style={{ color: 'var(--shade)' }}>{items.length} unfinished</span>
      </div>

      <div className="relative">
        <div className="shelf-track !gap-4">
          {items.map((ep, i) => {
            const pos = positionOf(ep.videoId)!;
            const pct = Math.min(100, (pos.t / pos.d) * 100);
            return (
              <div
                key={ep.videoId}
                className="card group"
                style={{ animationDelay: `${i * 55}ms` }}
                role="button"
                tabIndex={0}
                aria-label={`Resume ${ep.title}`}
                onClick={() => open(ep)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(ep); } }}
              >
                <div className="card-art">
                  <Thumb src={ep.thumbnail} />
                  <div className="card-shade" />
                  <span className="badge-new absolute top-2 left-2 z-[1]">RESUME</span>
                  <span className="mono absolute bottom-2 right-2.5 z-[1] text-[10.5px] font-medium"
                    style={{ color: 'rgba(255,255,255,.88)', textShadow: '0 1px 6px rgba(0,0,0,.8)' }}>
                    {fmtRemaining(pos.d - pos.t)}
                  </span>
                  <div className="card-play"><span className="orb">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
                  </span></div>
                  <div className="card-progress"><div className="fill" style={{ width: `${pct}%` }} /></div>
                </div>
                <div className="pt-2.5 px-0.5">
                  <div className="text-[13px] font-semibold line-clamp-1" style={{ color: 'var(--ivory)' }}>{ep.title}</div>
                  <div className="mono text-[10px] mt-1" style={{ color: 'var(--shade)' }}>{fmtDate(ep.date)}</div>
                </div>
                <button
                  className="orb-sm absolute top-2 right-2 z-[3] opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                  style={{ background: 'var(--glass-strong)' }}
                  title="Dismiss"
                  aria-label={`Dismiss ${ep.title}`}
                  onClick={e => dismiss(e, ep.videoId)}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
