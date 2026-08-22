// Full-screen search — the archive at your fingertips. `/` opens it.

import { useMemo, useRef, useState } from 'react';
import type { Ep } from '../types';
import PosterCard from './PosterCard';
import { useDialogA11y } from '../hooks/useDialogA11y';

interface Props {
  recs: Ep[];
  listedIds: Set<string>;
  onOpen: (ep: Ep) => void;
  onDetails: (ep: Ep) => void;
  onToggleList: (id: string) => void;
  onClose: () => void;
}

export default function SearchOverlay({ recs, listedIds, onOpen, onDetails, onToggleList, onClose }: Props) {
  const [q, setQ] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Scroll lock · Escape · focus trap · restore focus to the trigger.
  useDialogA11y(containerRef, onClose, inputRef);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return recs.slice(0, 8);
    return recs.filter(r =>
      r.title.toLowerCase().includes(s) ||
      r.date.includes(s) ||
      r.season.toLowerCase().includes(s) ||
      String(r.ep) === s
    );
  }, [recs, q]);

  const pick = (ep: Ep) => { onClose(); setTimeout(() => onOpen(ep), 60); };

  return (
    <div ref={containerRef} className="fixed inset-0 z-[85] flex flex-col" role="dialog" aria-modal="true" aria-label="Search the archive">
      <div className="absolute inset-0" style={{ background: 'var(--overlay)', backdropFilter: 'blur(24px) saturate(140%)', WebkitBackdropFilter: 'blur(24px) saturate(140%)' }} onClick={onClose} />

      <div className="relative z-[1] px-[4vw] md:px-8 pt-24 md:pt-28 pb-6">
        <input
          ref={inputRef}
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search the archive…"
          aria-label="Search the archive"
          className="display w-full bg-transparent outline-none text-[clamp(26px,4.5vw,44px)] font-medium pb-4"
          style={{ color: 'var(--ivory)', borderBottom: '1px solid var(--line-flame)' }}
        />
        <div className="mono text-[10.5px] mt-3 flex justify-between" style={{ color: 'var(--shade)' }}>
          <span>{q.trim() ? `${shown.length} result${shown.length === 1 ? '' : 's'} for “${q.trim()}”` : 'Trending: latest episode · 2026-08'}</span>
          <span className="flex items-center gap-2">esc to close <span className="kbd">esc</span></span>
        </div>
      </div>

      <div className="relative z-[1] flex-1 overflow-y-auto px-[4vw] md:px-8 pb-16">
        {shown.length === 0 ? (
          <div className="py-20 text-center">
            <p className="display text-xl mb-2">No reels found</p>
            <p className="text-[13px]" style={{ color: 'var(--mist)' }}>Search by title, date (2026-08), or episode number (E12).</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-7 pt-2">
            {shown.map((ep, i) => (
              <PosterCard
                key={ep.videoId}
                ep={ep}
                compact
                index={i}
                listed={listedIds.has(ep.videoId)}
                onOpen={pick}
                onDetails={e => { onClose(); setTimeout(() => onDetails(e), 60); }}
                onToggleList={onToggleList}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
