import { useEffect, useRef, useState } from 'react';
import type { Recording } from '../utils/dataFetcher';

interface P {
  open: boolean;
  onClose: () => void;
  recs: Recording[];
  onOpenRec: (r: Recording) => void;
  toggleTheme: () => void;
}

export function CommandPalette({ open, onClose, recs, onOpenRec, toggleTheme }: P) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) { setQ(''); setIdx(0); setTimeout(() => inputRef.current?.focus(), 20); }
  }, [open]);

  const filtered = recs.filter(r => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return r.title.toLowerCase().includes(s)
      || r.date.includes(s)
      ;
  }).slice(0, 8);

  const actions = [
    { id: 'theme',  label: 'Toggle theme',         icon: '◐', run: () => { toggleTheme(); onClose(); } },
    { id: 'home',   label: 'Go home',              icon: '⌂', run: () => { window.location.hash = ''; onClose(); } },
    { id: 'yt',     label: 'Open YouTube channel', icon: '▶', run: () => { window.open('https://youtube.com/@TheMuslimLantern', '_blank'); onClose(); } },
  ].filter(a => !q.trim() || a.label.toLowerCase().includes(q.toLowerCase()));

  const items = [
    ...filtered.map(r => ({ kind: 'rec' as const, rec: r })),
    ...actions.map(a => ({ kind: 'act' as const, act: a })),
  ];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(items.length - 1, i + 1)); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setIdx(i => Math.max(0, i - 1)); }
      if (e.key === 'Enter') {
        e.preventDefault();
        const it = items[idx];
        if (!it) return;
        if (it.kind === 'rec') { onOpenRec(it.rec); onClose(); }
        else it.act.run();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, idx, items, onClose, onOpenRec]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4 fade-in" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)' }} />
      <div
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-xl rounded-2xl border overflow-hidden pop-in glass-strong"
        style={{ borderColor: 'var(--bd2)', boxShadow: 'var(--shadow-lg)' }}
      >
        <div className="flex items-center gap-3 px-4 py-3.5 border-b" style={{ borderColor: 'var(--bd)' }}>
          <svg className="w-4 h-4" style={{ color: 'var(--tx3)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={e => { setQ(e.target.value); setIdx(0); }}
            placeholder="Search recordings or run a command…"
            className="flex-1 bg-transparent outline-none text-[14px]"
            style={{ color: 'var(--tx)' }}
          />
          <span className="kbd">esc</span>
        </div>
        <div className="max-h-[60vh] overflow-y-auto py-1.5">
          {items.length === 0 && (
            <div className="px-4 py-8 text-center text-[13px]" style={{ color: 'var(--tx3)' }}>
              No matches
            </div>
          )}
          {items.map((it, i) => {
            const active = i === idx;
            const style = active
              ? { background: 'var(--bg4)', color: 'var(--tx)' }
              : { color: 'var(--tx2)' };
            if (it.kind === 'rec') {
              return (
                <button
                  key={`r-${it.rec.videoId}`}
                  onMouseEnter={() => setIdx(i)}
                  onClick={() => { onOpenRec(it.rec); onClose(); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                  style={style}
                >
                  <img src={it.rec.thumbnail} alt="" className="w-12 h-7 object-cover rounded shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold line-clamp-1">{it.rec.title}</div>
                    <div className="text-[11px]" style={{ color: 'var(--tx3)' }}>{it.rec.date} · {it.rec.durationFmt}</div>
                  </div>
                  {active && <span className="kbd">↵</span>}
                </button>
              );
            }
            return (
              <button
                key={`a-${it.act.id}`}
                onMouseEnter={() => setIdx(i)}
                onClick={it.act.run}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                style={style}
              >
                <span className="w-12 text-center text-base" style={{ color: 'var(--tx3)' }}>{it.act.icon}</span>
                <span className="text-[13px] font-semibold flex-1">{it.act.label}</span>
                {active && <span className="kbd">↵</span>}
              </button>
            );
          })}
        </div>
        <div className="px-4 py-2 border-t flex items-center justify-between text-[10.5px] font-medium" style={{ borderColor: 'var(--bd)', color: 'var(--tx3)' }}>
          <span className="flex items-center gap-1.5"><span className="kbd">↑</span><span className="kbd">↓</span> navigate</span>
          <span className="flex items-center gap-1.5"><span className="kbd">↵</span> select</span>
          <span className="flex items-center gap-1.5"><span className="kbd">esc</span> close</span>
        </div>
      </div>
    </div>
  );
}
