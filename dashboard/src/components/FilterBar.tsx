import { useEffect, useRef, useState } from 'react';

export type SortKey   = 'newest' | 'oldest' | 'longest' | 'shortest' | 'largest';
export type FilterKey = 'all' | 'hd';

interface P {
  sort: SortKey;
  setSort: (s: SortKey) => void;
  filter: FilterKey;
  setFilter: (f: FilterKey) => void;
  view: 'grid' | 'list';
  setView: (v: 'grid' | 'list') => void;
  total: number;
  shown: number;
}

const SORTS: { id: SortKey; label: string; icon: React.ReactNode }[] = [
  { id: 'newest',   label: 'Newest',   icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-3.5 h-3.5"><path strokeLinecap="round" d="M12 5v14M5 12l7-7 7 7"/></svg> },
  { id: 'oldest',   label: 'Oldest',   icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-3.5 h-3.5"><path strokeLinecap="round" d="M12 19V5M5 12l7 7 7-7"/></svg> },
  { id: 'longest',  label: 'Longest',  icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-3.5 h-3.5"><circle cx="12" cy="12" r="9"/><path strokeLinecap="round" d="M12 7v5l3 3"/></svg> },
  { id: 'shortest', label: 'Shortest', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-3.5 h-3.5"><circle cx="12" cy="12" r="9"/><path strokeLinecap="round" d="M12 8v4M12 16h.01"/></svg> },
  { id: 'largest',  label: 'Largest',  icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-3.5 h-3.5"><path strokeLinecap="round" d="M3 6h18M3 12h12M3 18h6"/></svg> },
];

const FILTERS: { id: FilterKey; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'hd',  label: 'HD' },
];

export function FilterBar({ sort, setSort, filter, setFilter, view, setView, total, shown }: P) {
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sortOpen) return;
    const onDown = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setSortOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onEsc); };
  }, [sortOpen]);

  const activeSort = SORTS.find(s => s.id === sort) || SORTS[0];

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
      {/* Left: filter chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`chip ${filter === f.id ? 'active' : ''}`}
          >
            {f.label}
          </button>
        ))}
        <span className="text-[11.5px] ml-1.5 tabular-nums" style={{ color: 'var(--tx3)' }}>
          <span className="font-semibold" style={{ color: 'var(--tx2)' }}>{shown}</span>
          <span className="opacity-50"> / {total}</span>
        </span>
      </div>

      {/* Right: compact sort dropdown + view toggle */}
      <div className="flex items-center gap-1.5">
        <div className="relative" ref={sortRef}>
          <button
            onClick={() => setSortOpen(o => !o)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11.5px] font-semibold transition-colors"
            style={{ background: 'var(--bg3)', border: '1px solid var(--bd2)', color: 'var(--tx2)' }}
            aria-haspopup="listbox"
            aria-expanded={sortOpen}
            title="Sort recordings"
          >
            <span className="opacity-70" style={{ color: 'var(--red)' }}>{activeSort.icon}</span>
            <span style={{ color: 'var(--tx)' }}>{activeSort.label}</span>
            <svg className="w-3 h-3 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path strokeLinecap="round" d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {sortOpen && (
            <div
              role="listbox"
              className="absolute right-0 top-full mt-1.5 min-w-[150px] rounded-lg border pop-in glass-strong z-30 py-1"
              style={{ borderColor: 'var(--bd2)' }}
            >
              {SORTS.map(s => (
                <button
                  key={s.id}
                  role="option"
                  aria-selected={sort === s.id}
                  onClick={() => { setSort(s.id); setSortOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] font-medium text-left transition-colors"
                  style={{
                    background: sort === s.id ? 'var(--bg4)' : 'transparent',
                    color: sort === s.id ? 'var(--tx)' : 'var(--tx2)',
                  }}
                >
                  <span style={{ color: sort === s.id ? 'var(--red)' : 'var(--tx3)' }}>{s.icon}</span>
                  <span className="flex-1">{s.label}</span>
                  {sort === s.id && (
                    <svg className="w-3.5 h-3.5" style={{ color: 'var(--red)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-0.5 rounded-md p-0.5" style={{ background: 'var(--bg3)', border: '1px solid var(--bd2)' }}>
          <button
            onClick={() => setView('grid')}
            className="p-1.5 rounded"
            style={{ background: view === 'grid' ? 'var(--bg4)' : 'transparent', color: view === 'grid' ? 'var(--tx)' : 'var(--tx3)' }}
            title="Grid view"
            aria-label="Grid view"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
            </svg>
          </button>
          <button
            onClick={() => setView('list')}
            className="p-1.5 rounded"
            style={{ background: view === 'list' ? 'var(--bg4)' : 'transparent', color: view === 'list' ? 'var(--tx)' : 'var(--tx3)' }}
            title="List view"
            aria-label="List view"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
              <circle cx="4" cy="6" r="1.5" /><circle cx="4" cy="12" r="1.5" /><circle cx="4" cy="18" r="1.5" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
