import { useState, useRef, useEffect } from 'react';

export type SortKey = 'newest' | 'oldest' | 'longest' | 'shortest' | 'largest';
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
  { id: 'newest', label: 'Newest', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path strokeLinecap="round" d="M12 5v14M5 12l7-7 7 7"/></svg> },
  { id: 'oldest', label: 'Oldest', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path strokeLinecap="round" d="M12 19V5M5 12l7 7 7-7"/></svg> },
  { id: 'longest', label: 'Longest', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><circle cx="12" cy="12" r="9"/><path strokeLinecap="round" d="M12 7v5l3 3"/></svg> },
  { id: 'shortest', label: 'Shortest', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><circle cx="12" cy="12" r="9"/><path strokeLinecap="round" d="M12 8v4M12 16h.01"/></svg> },
  { id: 'largest', label: 'Largest', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path strokeLinecap="round" d="M3 6h18M3 12h12M3 18h6"/></svg> },
];

const FILTERS: { id: FilterKey; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'hd', label: 'HD' },
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
    <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
      {/* Filters */}
      <div className="flex items-center gap-2">
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className="px-4 py-2 rounded-lg text-sm font-semibold transition-all"
            style={{
              background: filter === f.id ? 'linear-gradient(135deg, rgba(139, 0, 0, 0.3) 0%, rgba(139, 0, 0, 0.2) 100%)' : 'var(--bg-elevated)',
              border: `1px solid ${filter === f.id ? 'var(--border-gold)' : 'var(--border-subtle)'}`,
              color: filter === f.id ? 'var(--gold-light)' : 'var(--text-secondary)',
              boxShadow: filter === f.id ? 'var(--shadow-gold)' : 'none',
            }}
          >
            {f.label}
          </button>
        ))}
        <span className="text-sm ml-2" style={{ color: 'var(--text-muted)' }}>
          <span style={{ color: 'var(--gold-primary)' }}>{shown}</span>
          <span> / {total}</span>
        </span>
      </div>

      {/* Sort & View */}
      <div className="flex items-center gap-3">
        {/* Sort dropdown */}
        <div className="relative" ref={sortRef}>
          <button
            onClick={() => setSortOpen(!sortOpen)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            <span style={{ color: 'var(--gold-primary)' }}>{activeSort.icon}</span>
            <span>{activeSort.label}</span>
            <svg className="w-3 h-3 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path strokeLinecap="round" d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {sortOpen && (
            <div
              className="absolute right-0 top-full mt-2 min-w-[160px] rounded-lg overflow-hidden z-30"
              style={{
                background: 'var(--glass-strong)',
                border: '1px solid var(--border-gold)',
                backdropFilter: 'blur(24px)',
                boxShadow: 'var(--shadow-elevated)',
              }}
            >
              {SORTS.map(s => (
                <button
                  key={s.id}
                  onClick={() => { setSort(s.id); setSortOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-all"
                  style={{
                    background: sort === s.id ? 'rgba(212, 175, 55, 0.1)' : 'transparent',
                    color: sort === s.id ? 'var(--gold-light)' : 'var(--text-secondary)',
                  }}
                >
                  <span style={{ color: sort === s.id ? 'var(--gold-primary)' : 'var(--text-muted)' }}>{s.icon}</span>
                  <span className="flex-1">{s.label}</span>
                  {sort === s.id && (
                    <svg className="w-4 h-4" style={{ color: 'var(--gold-primary)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* View toggle */}
        <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
          <button
            onClick={() => setView('grid')}
            className="p-2 rounded transition-all"
            style={{
              background: view === 'grid' ? 'var(--bg-secondary)' : 'transparent',
              color: view === 'grid' ? 'var(--gold-primary)' : 'var(--text-muted)',
              border: view === 'grid' ? '1px solid var(--border-gold)' : 'none',
            }}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          </button>
          <button
            onClick={() => setView('list')}
            className="p-2 rounded transition-all"
            style={{
              background: view === 'list' ? 'var(--bg-secondary)' : 'transparent',
              color: view === 'list' ? 'var(--gold-primary)' : 'var(--text-muted)',
              border: view === 'list' ? '1px solid var(--border-gold)' : 'none',
            }}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <circle cx="4" cy="6" r="1" />
              <circle cx="4" cy="12" r="1" />
              <circle cx="4" cy="18" r="1" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
