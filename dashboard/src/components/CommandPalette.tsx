// Command palette — Ctrl/Cmd+K. Episodes + actions, fully keyboard-driven.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Ep } from '../types';
import { fmtDate } from '../lib/format';
import { nav } from './Nav';

interface Props {
  recs: Ep[];
  onOpen: (ep: Ep) => void;
  onSearch: () => void;
  onSurprise: () => void;
  onClose: () => void;
}

interface Action {
  id: string;
  label: string;
  hint: string;
  run: () => void;
}

export default function CommandPalette({ recs, onOpen, onSearch, onSurprise, onClose }: Props) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 40);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
    };
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const actions: Action[] = useMemo(() => [
    { id: 'search', label: 'Search everything', hint: 'open full search', run: () => { onClose(); setTimeout(onSearch, 80); } },
    { id: 'home',   label: 'Go home',           hint: '#/',             run: () => { onClose(); nav('#/'); } },
    { id: 'browse', label: 'Browse the archive',hint: '#/browse',       run: () => { onClose(); nav('#/browse'); } },
    { id: 'list',   label: 'Open My List',      hint: '#/my-list',      run: () => { onClose(); nav('#/my-list'); } },
    { id: 'random', label: 'Surprise me',       hint: 'random episode', run: () => { onClose(); setTimeout(onSurprise, 60); } },
    { id: 'yt',     label: 'Open YouTube channel', hint: '@TheMuslimLantern', run: () => { onClose(); window.open('https://youtube.com/@TheMuslimLantern', '_blank', 'noopener'); } },
  ], [onClose, onSearch, onSurprise]);

  const needle = q.trim().toLowerCase();

  const eps = useMemo(() => {
    if (!needle) return recs.slice(0, 6);
    return recs.filter(r =>
      r.title.toLowerCase().includes(needle) ||
      r.date.includes(needle) ||
      String(r.ep) === needle.replace(/^e/i, '')
    ).slice(0, 8);
  }, [recs, needle]);

  const acts = useMemo(() => {
    if (!needle) return actions;
    return actions.filter(a => a.label.toLowerCase().includes(needle));
  }, [actions, needle]);

  const items = [
    ...eps.map(ep => ({ kind: 'ep' as const, ep })),
    ...acts.map(action => ({ kind: 'act' as const, action })),
  ];

  useEffect(() => { setSel(0); }, [q]);

  useEffect(() => {
    listRef.current?.querySelectorAll('[data-row]')[sel]?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const run = (i: number) => {
    const it = items[i];
    if (!it) return;
    if (it.kind === 'ep') { onClose(); setTimeout(() => onOpen(it.ep), 60); }
    else it.action.run();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(items.length - 1, s + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(0, s - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); run(sel); }
  };

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="absolute inset-0" style={{ background: 'var(--overlay)' }} onClick={onClose} />
      <div
        className="palette-card absolute left-1/2 -translate-x-1/2 top-[14vh] w-[min(580px,92vw)] overflow-hidden"
        style={{ background: 'var(--glass-strong)', backdropFilter: 'blur(28px) saturate(160%)', WebkitBackdropFilter: 'blur(28px) saturate(160%)' }}
      >
        <div className="flex items-center gap-3 px-5 h-14" style={{ borderBottom: '1px solid var(--line)' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--flame-2)" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Jump to an episode or command…"
            className="flex-1 bg-transparent outline-none text-[14px]"
            style={{ color: 'var(--ivory)' }}
          />
          <span className="kbd">esc</span>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-2">
          {items.length === 0 && (
            <div className="px-5 py-8 text-center text-[13px]" style={{ color: 'var(--mist)' }}>Nothing matches “{q}”.</div>
          )}
          {items.map((it, i) => (
            <button
              key={it.kind === 'ep' ? it.ep.videoId : it.action.id}
              data-row
              onMouseEnter={() => setSel(i)}
              onClick={() => run(i)}
              className="w-full flex items-center gap-3.5 px-5 py-2.5 text-left transition-colors"
              style={{ background: sel === i ? 'var(--flame-08)' : 'transparent' }}
            >
              {it.kind === 'ep' ? (
                <>
                  <img src={it.ep.thumbnail} alt="" className="w-20 aspect-video object-cover rounded-md flex-none"
                    onError={e => { (e.target as HTMLImageElement).src = '/thumbnail.jpg'; }} loading="lazy" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-semibold line-clamp-1" style={{ color: 'var(--ivory)' }}>{it.ep.title}</span>
                    <span className="mono block text-[10px] mt-0.5" style={{ color: 'var(--shade)' }}>
                      {fmtDate(it.ep.date)}{it.ep.durationFmt ? ` · ${it.ep.durationFmt}` : ''}
                    </span>
                  </span>
                </>
              ) : (
                <>
                  <span className="orb-sm flex-none" style={{ width: 28, height: 28 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m13 2-9 12h7l-1 8 9-12h-7z" /></svg>
                  </span>
                  <span className="flex-1 text-[13px] font-semibold" style={{ color: 'var(--ivory)' }}>{it.action.label}</span>
                  <span className="mono text-[10px]" style={{ color: 'var(--shade)' }}>{it.action.hint}</span>
                </>
              )}
              {sel === i && <span className="kbd flex-none">↵</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
