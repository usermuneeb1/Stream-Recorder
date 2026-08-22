// Shelf — a horizontal reel of cards with snap scrolling, edge fades,
// glass arrows, and optional Top-Ten numerals.

import { useEffect, useRef, useState } from 'react';
import type { Ep } from '../types';
import PosterCard from './PosterCard';

interface Props {
  label: string;
  hint?: string;
  recs: Ep[];
  numbered?: boolean;      // Top-ten variant
  listedIds: Set<string>;
  onOpen: (ep: Ep) => void;
  onDetails: (ep: Ep) => void;
  onToggleList: (id: string) => void;
}

export default function Shelf({ label, hint, recs, numbered, listedIds, onOpen, onDetails, onToggleList }: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  // Threshold booleans, not raw pixels: setState with an unchanged value
  // bails out, so scrolling only re-renders the shelf when an arrow or fade
  // actually flips — not on every scroll tick.
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(true);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const measure = () => {
      const max = el.scrollWidth - el.clientWidth;
      setCanLeft(el.scrollLeft > 8);
      setCanRight(el.scrollLeft < max - 8);
    };
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      el.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [recs.length]);

  if (!recs.length) return null;

  const nudge = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' });
  };

  return (
    <section className="shelf reveal-on-scroll">
      <div className="shelf-head">
        <span className="shelf-tick" />
        <span className="eyebrow">{label}</span>
        {hint && <span className="mono text-[10px]" style={{ color: 'var(--shade)' }}>{hint}</span>}
      </div>

      <div className="relative">
        <div className="shelf-fade left" style={{ opacity: canLeft ? 1 : 0 }} />
        <div className="shelf-fade right" style={{ opacity: canRight ? 1 : 0 }} />

        <button
          className={`shelf-arrow left-2 ${canLeft ? 'show' : 'hidden'}`}
          onClick={() => nudge(-1)}
          aria-label="Scroll left"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m15 5-7 7 7 7" /></svg>
        </button>
        <button
          className={`shelf-arrow right-2 ${canRight ? 'show' : 'hidden'}`}
          onClick={() => nudge(1)}
          aria-label="Scroll right"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m9 5 7 7-7 7" /></svg>
        </button>

        <div className="shelf-track" ref={trackRef}>
          {recs.map((ep, i) => (
            <div key={ep.videoId} className="flex items-end gap-3 flex-none">
              {numbered && <span className="top-num select-none" aria-hidden="true">{i + 1}</span>}
              <PosterCard
                ep={ep}
                index={i}
                listed={listedIds.has(ep.videoId)}
                onOpen={onOpen}
                onDetails={onDetails}
                onToggleList={onToggleList}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
