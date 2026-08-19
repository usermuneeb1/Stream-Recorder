// Live-chat replay — the audience side of the stream, preserved.
// Messages surface in sync with the player's clock (same timestamps the
// video was watched with), superchats carry their amounts, and manual
// scrolling pauses the follow so you can read history freely.

import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchChat, type ChatMessage } from '../lib/fetcher';
import { fmtTime } from '../lib/format';

interface Props {
  videoId: string;
  time: number;        // player clock, seconds
  playing: boolean;
  onSeek?: (t: number) => void;
}

export default function ChatReplay({ videoId, time, playing, onSeek }: Props) {
  const [chat, setChat] = useState<{ demo?: boolean; messages: ChatMessage[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(true);
  const [follow, setFollow] = useState(true);
  const [q, setQ] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setChat(null); setFollow(true);
    fetchChat(videoId)
      .then(c => { if (alive) setChat(c); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [videoId]);

  const visible = useMemo(
    () => (chat ? chat.messages.filter(m => m.t <= time) : []),
    [chat, time],
  );
  const supers = useMemo(() => chat?.messages.filter(m => m.k === 'super') ?? [], [chat]);

  /* Search results — match author or message, across the whole chat. */
  const needle = q.trim().toLowerCase();
  const results = useMemo(() => {
    if (!chat || !needle) return [];
    return chat.messages
      .filter(m => m.a?.toLowerCase().includes(needle) || m.m?.toLowerCase().includes(needle))
      .slice(0, 200);
  }, [chat, needle]);

  /* Follow the newest message unless the reader scrolled up. */
  useEffect(() => {
    const el = boxRef.current;
    if (!el || !follow) return;
    el.scrollTop = el.scrollHeight;
  }, [visible.length, follow]);

  const onScroll = () => {
    const el = boxRef.current;
    if (!el) return;
    setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 48);
  };

  if (loading || !chat || !chat.messages.length) return null;

  const shown = visible.slice(-80);

  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-3">
        <span className="shelf-tick" />
        <button className="eyebrow" onClick={() => setOpen(v => !v)}
          aria-expanded={open} aria-label="Toggle live chat replay">
          Live chat replay
        </button>
        <span className="mono text-[10px] flex items-center gap-1.5" style={{ color: 'var(--shade)' }}>
          <span className={`dot-health ${playing ? 'fast' : 'ok'}`} />
          {chat.messages.length.toLocaleString()} messages
          {supers.length > 0 && ` · ${supers.length} superchats`}
          synced
        </span>
        {chat.demo && (
          <span className="mono text-[9px] px-1.5 py-0.5 rounded"
            style={{ color: 'var(--flame-1)', border: '1px solid var(--line-flame)' }}>
            DEMO
          </span>
        )}
        <button className="btn-icon ml-auto !w-8 !h-8" onClick={() => setOpen(v => !v)}
          aria-label={open ? 'Collapse chat' : 'Expand chat'}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
            strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform 0.2s var(--ease)' }}>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>

      {open && (
        <div className="relative rounded-xl overflow-hidden" style={{ border: '1px solid var(--line)', background: 'var(--ink-1)' }}>
          {/* Search inside the chat */}
          <div className="relative border-b" style={{ borderColor: 'var(--line)' }}>
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--shade)" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search what was said…"
              className="w-full h-10 pl-9 pr-9 text-[12.5px] outline-none"
              style={{ background: 'transparent', color: 'var(--ivory)' }}
            />
            {q && (
              <button className="absolute right-3 top-1/2 -translate-y-1/2 mono text-[10px]" style={{ color: 'var(--shade)' }} onClick={() => setQ('')} aria-label="Clear search">✕</button>
            )}
          </div>

          {needle ? (
            <div className="overflow-y-auto no-scrollbar h-[320px] px-3 py-3 flex flex-col gap-1">
              {results.length === 0 && (
                <span className="mono text-[10.5px] text-center py-8" style={{ color: 'var(--shade)' }}>
                  no messages match “{q}”
                </span>
              )}
              {results.map((m, i) => (
                <button
                  key={i}
                  onClick={() => onSeek?.(m.t)}
                  className="text-left rounded-lg px-3 py-2 transition-colors hover:bg-[var(--flame-04)]"
                  style={{ border: '1px solid transparent' }}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="mono text-[9.5px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--flame-12)', color: 'var(--flame-1)' }}>{fmtTime(m.t)}</span>
                    <span className="text-[11.5px] font-semibold" style={{ color: 'var(--mist)' }}>{m.a}</span>
                  </div>
                  <div className="text-[12px] leading-snug line-clamp-2" style={{ color: 'var(--ivory)' }}>{m.m}</div>
                </button>
              ))}
            </div>
          ) : (
          <div
            ref={boxRef}
            onScroll={onScroll}
            className="flex flex-col gap-1 overflow-y-auto no-scrollbar px-4 py-4 h-[320px]"
            aria-label="Live chat replay"
          >
            {shown.length === 0 && (
              <span className="mono text-[10.5px] text-center py-8" style={{ color: 'var(--shade)' }}>
                the chat wakes when the stream does — press play
              </span>
            )}
            {shown.map((m, i) => m.k === 'super' ? (
              <div key={i} className="rounded-lg px-3 py-2.5 my-1"
                style={{ background: 'var(--flame-08)', border: '1px solid var(--line-flame)' }}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="mono text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--flame-2)', color: '#fff' }}>
                    {m.p || 'SUPER CHAT'}
                  </span>
                  <span className="text-[12px] font-bold" style={{ color: 'var(--flame-1)' }}>{m.a}</span>
                </div>
                <div className="text-[12.5px] leading-snug" style={{ color: 'var(--ivory)' }}>{m.m}</div>
              </div>
            ) : m.k === 'member' ? (
              <div key={i} className="flex items-baseline gap-2 text-[12px]">
                <span className="mono text-[9px] font-bold px-1.5 py-0.5 rounded flex-none" style={{ background: 'var(--jade-dim)', color: 'var(--jade)' }}>MEMBER</span>
                <span className="font-semibold" style={{ color: 'var(--mist)' }}>{m.a}</span>
                <span style={{ color: 'var(--shade)' }}>{m.m}</span>
              </div>
            ) : (
              <div key={i} className="text-[12.5px] leading-snug">
                <span className="font-semibold" style={{ color: 'var(--mist)' }}>{m.a}</span>
                <span className="mx-1.5" style={{ color: 'var(--shade)' }}>·</span>
                <span style={{ color: 'var(--ivory)' }}>{m.m}</span>
              </div>
            ))}
          </div>
          )}

          {!follow && (
            <button
              className="absolute bottom-3 left-1/2 -translate-x-1/2 mono text-[10px] font-bold px-3 py-1.5 rounded-full transition-transform hover:scale-105"
              style={{ background: 'var(--flame-2)', color: '#fff', boxShadow: 'var(--shadow-flame)' }}
              onClick={() => { setFollow(true); const el = boxRef.current; if (el) el.scrollTop = el.scrollHeight; }}
            >
              ↓ jump to live
            </button>
          )}
        </div>
      )}
    </div>
  );
}
