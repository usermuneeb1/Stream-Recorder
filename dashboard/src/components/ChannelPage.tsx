// The Channel — EVERY upload from The Muslim Lantern, not just the
// preserved live streams. Live-scraped by /api/ytall on Vercel (full
// innertube walk, ~6h cache) with a CI-refreshed snapshot fallback, so the
// list keeps itself up to date without anyone touching anything.

import { useMemo, useState } from 'react';
import type { Ep } from '../types';
import PosterCard from './PosterCard';

interface Props {
  videos: Ep[];
  listedIds: Set<string>;
  onOpen: (ep: Ep) => void;
  onDetails: (ep: Ep) => void;
  onToggleList: (id: string) => void;
}

type Sort = 'newest' | 'oldest' | 'views';

export default function ChannelPage({ videos, listedIds, onOpen, onDetails, onToggleList }: Props) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('newest');

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = needle
      ? videos.filter(v => v.title.toLowerCase().includes(needle))
      : [...videos];
    if (sort === 'newest') out.sort((a, b) => b.date.localeCompare(a.date));
    else if (sort === 'oldest') out.sort((a, b) => a.date.localeCompare(b.date));
    else out.sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));
    return out;
  }, [videos, q, sort]);

  return (
    <div className="page-enter max-w-[1500px] mx-auto px-4 md:px-6 pt-28 md:pt-36 pb-12">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <span className="shelf-tick" />
            <span className="eyebrow">The Channel</span>
            <span className="mono text-[9.5px] px-1.5 py-0.5 rounded"
              style={{ color: '#57f2ad', background: 'rgba(87,242,173,.08)', border: '1px solid rgba(87,242,173,.18)' }}>
              auto-synced
            </span>
          </div>
          <h1 className="display text-[clamp(26px,3.6vw,42px)] leading-none">
            Every upload, always current
          </h1>
          <p className="text-[13px] mt-2" style={{ color: 'var(--mist)' }}>
            {videos.length} video{videos.length === 1 ? '' : 's'} scraped straight from YouTube —
            {' '}live streams land in the Archive too, preserved in 1080p forever.
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--shade)" strokeWidth="2.2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
            </svg>
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Filter titles…"
              type="search"
              aria-label="Filter videos by title"
              name="channel-filter"
              autoComplete="off"
              className="rounded-lg pl-8 pr-3 h-9 text-[12.5px] outline-none w-[190px]"
              style={{ background: 'var(--ink-1)', border: '1px solid var(--line)', color: 'var(--ivory)' }}
            />
          </div>
          <select
            value={sort}
            onChange={e => setSort(e.target.value as Sort)}
            className="rounded-lg px-3 h-9 text-[12px] outline-none cursor-pointer"
            style={{ background: 'var(--ink-1)', border: '1px solid var(--line)', color: 'var(--mist)' }}
            aria-label="Sort order"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="views">Most viewed</option>
          </select>
        </div>
      </div>

      {/* Grid */}
      {shown.length === 0 ? (
        <div className="py-24 text-center">
          <p className="display text-lg mb-2">Nothing matches “{q}”</p>
          <p className="text-[12.5px]" style={{ color: 'var(--shade)' }}>Try a shorter fragment of the title.</p>
        </div>
      ) : (
        <div className="cv-grid grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-7">
          {shown.map((v, i) => (
            <PosterCard
              key={v.videoId}
              ep={v}
              listed={listedIds.has(v.videoId)}
              onOpen={onOpen}
              onDetails={onDetails}
              onToggleList={onToggleList}
              index={i % 10}
            />
          ))}
        </div>
      )}
    </div>
  );
}
