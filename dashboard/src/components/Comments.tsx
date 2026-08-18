// Comments — "the intermission". Threads live as JSON files on Catbox, with
// the index of URLs in this repo (data/comments/<videoId>.json), managed by
// the serverless endpoint. Posts are rate-limited and sanitized server-side.

import { useCallback, useEffect, useState } from 'react';
import { fmtRelative, hueOf } from '../lib/format';
import { getNick, setNick } from '../lib/storage';

const API = 'https://muslim-lantern-archive.vercel.app/api/comments';

interface CommentT {
  id: string;
  author: string;
  body: string;
  parentId: string | null;
  createdAt: string;
}

interface Props {
  videoId: string;
  toast: (msg: string) => void;
}

function Avatar({ name }: { name: string }) {
  const hue = hueOf(name || '?');
  const initials = (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <span
      className="w-8 h-8 rounded-full flex items-center justify-center flex-none font-bold text-[11px]"
      style={{ background: `hsl(${hue} 32% 22%)`, color: `hsl(${hue} 70% 72%)`, border: `1px solid hsl(${hue} 40% 30%)` }}
    >
      {initials}
    </span>
  );
}

export default function Comments({ videoId, toast }: Props) {
  const [items, setItems] = useState<CommentT[] | null>(null);
  const [nick, setNickState] = useState(getNick());
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<CommentT | null>(null);
  const [posting, setPosting] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  const load = useCallback(async () => {
    setItems(null);
    try {
      const r = await fetch(`${API}/${encodeURIComponent(videoId)}?_=${Date.now()}`);
      const j = await r.json();
      const urls: string[] = Array.isArray(j.urls) ? j.urls : [];
      const fetched = await Promise.allSettled(urls.map(u => fetch(u).then(x => x.json()).catch(() => null)));
      const list = fetched
        .filter((f): f is PromiseFulfilledResult<any> => f.status === 'fulfilled' && f.value && f.value.id && f.value.body)
        .map(f => f.value as CommentT)
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
      setItems(list);
    } catch {
      setItems([]);
    }
  }, [videoId]);

  useEffect(() => { load(); }, [load, reloadTick]);

  const post = async () => {
    const text = body.trim();
    if (text.length < 2) { toast('Comment too short'); return; }
    if (text.length > 2000) { toast('Comment too long (max 2000)'); return; }
    setPosting(true);
    try {
      const author = nick.trim() || 'Anonymous';
      if (nick.trim()) setNick(nick.trim());
      const r = await fetch(`${API}/${encodeURIComponent(videoId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author, body: text, parentId: replyTo?.id || null }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setBody('');
      setReplyTo(null);
      toast('Posted — refreshing…');
      setTimeout(() => setReloadTick(t => t + 1), 1500);
    } catch (e) {
      toast(`Post failed: ${e instanceof Error ? e.message : 'network error'}`);
    } finally {
      setPosting(false);
    }
  };

  const roots = (items || []).filter(c => !c.parentId);
  const repliesOf = (id: string) => (items || []).filter(c => c.parentId === id);

  return (
    <section className="mt-10" aria-label="Comments">
      <div className="flex items-center gap-3 mb-6">
        <span className="shelf-tick" />
        <span className="eyebrow">Intermission talk</span>
        <span className="mono text-[10px]" style={{ color: 'var(--shade)' }}>{items ? `${roots.length} comment${roots.length === 1 ? '' : 's'}` : ''}</span>
        <button className="btn-icon ml-auto" title="Refresh" aria-label="Refresh comments" onClick={() => setReloadTick(t => t + 1)}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.3M21 3v6h-6" /></svg>
        </button>
      </div>

      {/* Composer */}
      <div className="rounded-xl p-4 mb-8 transition-colors focus-within:border-[var(--line-flame)]"
        style={{ background: 'var(--ink-1)', border: '1px solid var(--line)' }}>
        {replyTo && (
          <div className="flex items-center gap-2 mb-3 text-[12px]" style={{ color: 'var(--mist)' }}>
            Replying to <b style={{ color: 'var(--flame-1)' }}>{replyTo.author}</b>
            <button className="ml-auto text-[11px] underline" style={{ color: 'var(--shade)' }} onClick={() => setReplyTo(null)}>cancel</button>
          </div>
        )}
        <div className="flex gap-3">
          <Avatar name={nick || 'You'} />
          <div className="flex-1">
            <input
              value={nick}
              onChange={e => setNickState(e.target.value.slice(0, 40))}
              placeholder="Name (optional)"
              className="w-full bg-transparent outline-none text-[12px] font-semibold mb-2"
              style={{ color: 'var(--ivory)' }}
            />
            <textarea
              value={body}
              onChange={e => setBody(e.target.value.slice(0, 2000))}
              onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') post(); }}
              placeholder="Share a thought about this recording…"
              rows={3}
              className="w-full bg-transparent outline-none resize-y text-[13.5px] leading-relaxed"
              style={{ color: 'var(--ivory)' }}
            />
            <div className="flex items-center justify-between mt-2">
              <span className="mono text-[10px]" style={{ color: 'var(--shade)' }}>{body.length}/2000 · ⌘+↵ to post</span>
              <button className="btn btn-flame !py-2 !px-5 !text-[12px]" disabled={posting || body.trim().length < 2} onClick={post}>
                {posting ? 'Posting…' : 'Post'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Threads */}
      {items === null ? (
        <div className="flex flex-col gap-4">
          {[0, 1, 2].map(i => (
            <div key={i} className="flex gap-3">
              <div className="skel w-8 h-8 !rounded-full flex-none" />
              <div className="flex-1"><div className="skel h-3 w-32 mb-2" /><div className="skel h-3 w-full max-w-md" /></div>
            </div>
          ))}
        </div>
      ) : roots.length === 0 ? (
        <div className="py-10 text-center">
          <p className="display text-lg mb-1.5">The room is quiet</p>
          <p className="text-[12.5px]" style={{ color: 'var(--mist)' }}>Be the first to leave a thought.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {roots.map(c => (
            <article key={c.id}>
              <div className="flex gap-3">
                <Avatar name={c.author} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2.5 mb-1">
                    <span className="text-[13px] font-bold" style={{ color: 'var(--ivory)' }}>{c.author}</span>
                    <span className="mono text-[10px]" style={{ color: 'var(--shade)' }}>{fmtRelative(c.createdAt)}</span>
                  </div>
                  <p className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--mist)' }}>{c.body}</p>
                  <button className="mono text-[10px] mt-1.5 hover:text-flame transition-colors" style={{ color: 'var(--shade)' }} onClick={() => setReplyTo(c)}>
                    ↩ reply
                  </button>
                </div>
              </div>
              {repliesOf(c.id).length > 0 && (
                <div className="ml-11 mt-4 flex flex-col gap-4 pl-4" style={{ borderLeft: '2px solid var(--flame-12)' }}>
                  {repliesOf(c.id).map(rc => (
                    <div key={rc.id} className="flex gap-3">
                      <Avatar name={rc.author} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2.5 mb-1">
                          <span className="text-[12.5px] font-bold" style={{ color: 'var(--ivory)' }}>{rc.author}</span>
                          <span className="mono text-[10px]" style={{ color: 'var(--shade)' }}>{fmtRelative(rc.createdAt)}</span>
                        </div>
                        <p className="text-[12.5px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--mist)' }}>{rc.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
