// The Archive browser — filter, sort, and scan every recording.
// Used for both "Archive" (all) and "My List" (saved only).

import { useMemo, useState } from 'react';
import type { Ep } from '../types';
import { fmtDate, isHD, resShort } from '../lib/format';
import { positionOf } from '../lib/storage';
import PosterCard from './PosterCard';

interface Props {
  title: string;
  subtitle?: string;
  recs: Ep[];                 // full list or pre-filtered My List
  listedIds: Set<string>;
  onOpen: (ep: Ep) => void;
  onDetails: (ep: Ep) => void;
  onToggleList: (id: string) => void;
}

type SortKey = 'newest' | 'oldest' | 'longest' | 'shortest' | 'largest';
type FilterKey = 'all' | 'hd' | 'new';

export default function BrowsePage({ title, subtitle, recs, listedIds, onOpen, onDetails, onToggleList }: Props) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [season, setSeason] = useState<string>('all');
  const [topic, setTopic] = useState<string>('all');
  const [sort, setSort] = useState<SortKey>('newest');
  const [view, setView] = useState<'grid' | 'list'>('grid');

  const seasonList = useMemo(() => {
    const s = [...new Set(recs.map(r => r.season))];
    return s;
  }, [recs]);

  const topicList = useMemo(() => {
    const t = new Set<string>();
    recs.forEach(r => (r.topics || []).forEach(x => t.add(x)));
    return [...t].sort();
  }, [recs]);

  const shown = useMemo(() => {
    let list = [...recs];

    const needle = q.trim().toLowerCase();
    if (needle) {
      list = list.filter(r =>
        r.title.toLowerCase().includes(needle) ||
        r.date.includes(needle) ||
        r.season.toLowerCase().includes(needle) ||
        (r.topics || []).some(t => t.toLowerCase().includes(needle))
      );
    }
    if (filter === 'hd') list = list.filter(r => isHD(r.resolution));
    if (filter === 'new') list = list.filter(r => r.isNew);
    if (season !== 'all') list = list.filter(r => r.season === season);
    if (topic !== 'all') list = list.filter(r => (r.topics || []).includes(topic));

    switch (sort) {
      case 'oldest':  list.sort((a, b) => a.date.localeCompare(b.date)); break;
      case 'longest': list.sort((a, b) => (b.durationSec || 0) - (a.durationSec || 0)); break;
      case 'shortest':list.sort((a, b) => (a.durationSec || 0) - (b.durationSec || 0)); break;
      case 'largest': list.sort((a, b) => (b.sizeGb || 0) - (a.sizeGb || 0)); break;
      default:        list.sort((a, b) => b.date.localeCompare(a.date));
    }
    return list;
  }, [recs, q, filter, season, topic, sort]);

  const filters: { key: FilterKey; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'hd', label: 'HD' },
    { key: 'new', label: 'New' },
  ];

  return (
    <div className="pt-28 md:pt-36 px-[4vw] md:px-8 pb-16 min-h-dvh">
      {/* Heading */}
      <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
        <div>
          <div className="eyebrow mb-2">The Archive</div>
          <h1 className="display text-3xl md:text-4xl font-medium text-balance">{title}</h1>
          {subtitle && <p className="text-[13px] mt-2" style={{ color: 'var(--mist)' }}>{subtitle}</p>}
        </div>
        <span className="mono text-[11px]" style={{ color: 'var(--shade)' }}>
          {shown.length} / {recs.length} recordings
        </span>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--shade)" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search title or date…"
            className="w-full h-10 pl-10 pr-4 rounded-full text-[13px] outline-none transition-colors"
            style={{ background: 'var(--ink-1)', border: '1px solid var(--line)', color: 'var(--ivory)' }}
          />
        </div>

        <div className="flex items-center rounded-full overflow-hidden" style={{ border: '1px solid var(--line)' }}>
          {filters.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className="px-4 h-9 text-[12px] font-semibold transition-colors"
              style={{
                background: filter === f.key ? 'var(--flame-12)' : 'transparent',
                color: filter === f.key ? 'var(--flame-1)' : 'var(--mist)',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {seasonList.length > 1 && (
          <select
            value={season}
            onChange={e => setSeason(e.target.value)}
            className="h-9 px-3 rounded-full text-[12px] font-semibold outline-none cursor-pointer"
            style={{ background: 'var(--ink-1)', border: '1px solid var(--line)', color: 'var(--mist)' }}
            aria-label="Filter by month"
          >
            <option value="all">All months</option>
            {seasonList.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}

        {topicList.length > 0 && (
          <select
            value={topic}
            onChange={e => setTopic(e.target.value)}
            className="h-9 px-3 rounded-full text-[12px] font-semibold outline-none cursor-pointer"
            style={{ background: 'var(--ink-1)', border: '1px solid var(--line)', color: 'var(--mist)' }}
            aria-label="Filter by topic"
          >
            <option value="all">All topics</option>
            {topicList.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}

        <select
          value={sort}
          onChange={e => setSort(e.target.value as SortKey)}
          className="h-9 px-3 rounded-full text-[12px] font-semibold outline-none cursor-pointer"
          style={{ background: 'var(--ink-1)', border: '1px solid var(--line)', color: 'var(--mist)' }}
          aria-label="Sort"
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="longest">Longest</option>
          <option value="shortest">Shortest</option>
          <option value="largest">Largest file</option>
        </select>

        <div className="flex items-center rounded-full overflow-hidden ml-auto" style={{ border: '1px solid var(--line)' }}>
          <button
            onClick={() => setView('grid')}
            title="Grid view"
            aria-label="Grid view"
            className="w-9 h-9 flex items-center justify-center transition-colors"
            style={{ color: view === 'grid' ? 'var(--flame-1)' : 'var(--mist)', background: view === 'grid' ? 'var(--flame-08)' : 'transparent' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" /></svg>
          </button>
          <button
            onClick={() => setView('list')}
            title="List view"
            aria-label="List view"
            className="w-9 h-9 flex items-center justify-center transition-colors"
            style={{ color: view === 'list' ? 'var(--flame-1)' : 'var(--mist)', background: view === 'list' ? 'var(--flame-08)' : 'transparent' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
        </div>
      </div>

      {/* Results */}
      {shown.length === 0 ? (
        <div className="py-24 text-center">
          <div className="w-2 h-2 rounded-full mx-auto mb-5" style={{ background: 'var(--flame-3)' }} />
          <p className="display text-xl mb-2">Nothing lit here</p>
          <p className="text-[13px]" style={{ color: 'var(--mist)' }}>
            Try a different search, or clear the filters.
          </p>
        </div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-7">
          {shown.map((ep, i) => (
            <PosterCard
              key={ep.videoId}
              ep={ep}
              compact
              index={i}
              listed={listedIds.has(ep.videoId)}
              onOpen={onOpen}
              onDetails={onDetails}
              onToggleList={onToggleList}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {shown.map((ep) => {
            const pos = positionOf(ep.videoId);
            const pct = pos && pos.d ? Math.min(100, (pos.t / pos.d) * 100) : 0;
            return (
              <div
                key={ep.videoId}
                role="button"
                tabIndex={0}
                aria-label={`Play ${ep.title}`}
                onClick={() => onOpen(ep)}
                onKeyDown={e => { if (e.key === 'Enter') onOpen(ep); }}
                className="group flex gap-4 p-3 rounded-xl cursor-pointer transition-all duration-300 hover:translate-x-1"
                style={{ background: 'var(--ink-1)', border: '1px solid var(--line)' }}
              >
                <div className="relative w-40 sm:w-52 aspect-video rounded-lg overflow-hidden flex-none">
                  <img src={ep.thumbnail} alt="" loading="lazy" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    onError={e => { (e.target as HTMLImageElement).src = '/thumbnail.jpg'; }} />
                  <span className="mono absolute bottom-1.5 right-1.5 text-[10px] px-1.5 py-0.5 rounded"
                    style={{ background: 'var(--glass-strong)', color: 'var(--ivory)' }}>
                    {ep.durationFmt}
                  </span>
                  {pct > 1 && <div className="card-progress"><div className="fill" style={{ width: `${pct}%` }} /></div>}
                </div>
                <div className="flex-1 min-w-0 py-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="mono text-[10px] font-semibold px-1.5 py-0.5 rounded"
                      style={{ background: 'var(--flame-12)', color: 'var(--flame-1)' }}>
                      {fmtDate(ep.date)}
                    </span>
                    {ep.isNew && <span className="badge-new">NEW</span>}
                  </div>
                  <div className="text-[14px] font-bold line-clamp-1 mb-1.5" style={{ color: 'var(--ivory)' }}>{ep.title}</div>
                  {ep.topics && ep.topics.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {ep.topics.slice(0, 3).map(t => <span key={t} className="topic-chip">{t}</span>)}
                    </div>
                  )}
                  <div className="mono text-[10.5px] flex flex-wrap gap-x-3" style={{ color: 'var(--shade)' }}>
                    <span>{fmtDate(ep.date)}</span>
                    <span>{ep.sizeHuman}</span>
                    {isHD(ep.resolution) && <span className="text-flame">{resShort(ep.resolution)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 pr-1 self-center">
                  <button
                    className={`orb-sm ${listedIds.has(ep.videoId) ? 'on' : ''}`}
                    title={listedIds.has(ep.videoId) ? 'Remove from My List' : 'Add to My List'}
                    aria-label={listedIds.has(ep.videoId) ? 'Remove from My List' : 'Add to My List'}
                    onClick={e => { e.stopPropagation(); onToggleList(ep.videoId); }}
                  >
                    {listedIds.has(ep.videoId)
                      ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12.5 9.5 18 20 6.5" /></svg>
                      : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>}
                  </button>
                  <span className="orb-sm solid" title="Play" aria-label={`Play ${ep.title}`}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
