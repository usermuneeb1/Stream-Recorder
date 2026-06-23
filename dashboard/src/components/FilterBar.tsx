export type SortKey   = 'newest' | 'oldest' | 'longest' | 'shortest' | 'largest';
export type FilterKey = 'all' | 'chapters' | 'guests' | 'hd';

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

const SORTS: { id: SortKey; label: string }[] = [
  { id: 'newest',   label: 'Newest' },
  { id: 'oldest',   label: 'Oldest' },
  { id: 'longest',  label: 'Longest' },
  { id: 'shortest', label: 'Shortest' },
  { id: 'largest',  label: 'Largest' },
];
const FILTERS: { id: FilterKey; label: string }[] = [
  { id: 'all',      label: 'All' },
  { id: 'chapters', label: 'With chapters' },
  { id: 'guests',   label: 'With guests' },
  { id: 'hd',       label: 'HD only' },
];

export function FilterBar({ sort, setSort, filter, setFilter, view, setView, total, shown }: P) {
  return (
    <div className="flex flex-col gap-3 mb-6">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`chip ${filter === f.id ? 'active' : ''}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px]" style={{ color: 'var(--tx3)' }}>
          Showing <span className="font-semibold tabular-nums" style={{ color: 'var(--tx2)' }}>{shown}</span>
          {' '}of <span className="tabular-nums">{total}</span>
        </p>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-[.2em] font-semibold mr-2 hidden sm:inline" style={{ color: 'var(--tx3)' }}>Sort</span>
          <div className="flex items-center gap-1 rounded-lg p-0.5" style={{ background: 'var(--bg3)', border: '1px solid var(--bd2)' }}>
            {SORTS.map(s => (
              <button
                key={s.id}
                onClick={() => setSort(s.id)}
                className={`px-2.5 py-1.5 text-[11.5px] font-semibold rounded-md transition-colors ${
                  sort === s.id ? 'text-white' : 'hover:text-white'
                }`}
                style={{
                  background: sort === s.id ? 'var(--red)' : 'transparent',
                  color:      sort === s.id ? '#fff' : 'var(--tx2)',
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-0.5 rounded-lg p-0.5 ml-1.5" style={{ background: 'var(--bg3)', border: '1px solid var(--bd2)' }}>
            <button
              onClick={() => setView('grid')}
              className="p-1.5 rounded-md"
              style={{ background: view === 'grid' ? 'var(--bg4)' : 'transparent', color: view === 'grid' ? 'var(--tx)' : 'var(--tx3)' }}
              title="Grid view"
              aria-label="Grid view"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
              </svg>
            </button>
            <button
              onClick={() => setView('list')}
              className="p-1.5 rounded-md"
              style={{ background: view === 'list' ? 'var(--bg4)' : 'transparent', color: view === 'list' ? 'var(--tx)' : 'var(--tx3)' }}
              title="List view"
              aria-label="List view"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <circle cx="4" cy="6" r="1.5" />
                <circle cx="4" cy="12" r="1.5" />
                <circle cx="4" cy="18" r="1.5" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
