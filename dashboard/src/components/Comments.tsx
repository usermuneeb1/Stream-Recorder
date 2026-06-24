import { useEffect, useState, useCallback, useRef } from 'react';
import { fmtRelative } from '../utils/format';

interface Comment {
  id: string;
  author: string;
  body: string;
  parentId?: string | null;
  createdAt: string;
  url?: string; // catbox url it was loaded from (for keying)
}

interface P { videoId: string; onToast: (m: string) => void }

const NICK_KEY = 'mla_nick_v1';
const API = 'https://muslim-lantern-archive.vercel.app/api/comments';

function avatarColor(name: string): string {
  // Deterministic pleasing color from name
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${h}, 60%, 45%)`;
}

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase() || '').join('') || '·';
}

export function Comments({ videoId, onToast }: P) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [author, setAuthor] = useState(() => localStorage.getItem(NICK_KEY) || '');
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Load comment index, then fetch each comment from catbox in parallel
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/${videoId}?_=${Date.now()}`);
      if (!r.ok) throw new Error('index fetch failed');
      const { urls }: { urls: string[] } = await r.json();
      if (!urls?.length) { setComments([]); return; }

      const results = await Promise.allSettled(urls.map(async u => {
        const resp = await fetch(u);
        if (!resp.ok) throw new Error('catbox fetch');
        const c = await resp.json() as Comment;
        c.url = u;
        return c;
      }));
      const ok = results
        .filter((x): x is PromiseFulfilledResult<Comment> => x.status === 'fulfilled')
        .map(x => x.value)
        .filter(c => c && c.id && c.body)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      setComments(ok);
    } catch (e) {
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [videoId]);

  useEffect(() => { load(); }, [load]);

  const submit = useCallback(async () => {
    const typedNick = author.trim();
    const a = typedNick || 'Anonymous';
    const b = body.trim();
    if (b.length < 2) { onToast('Comment is too short'); return; }
    if (b.length > 2000) { onToast('Comment is too long (max 2000 chars)'); return; }
    setSubmitting(true);
    // FIX #6 — only persist a nickname the user actually typed, so the
    // input doesn't auto-fill with 'Anonymous' on every future visit.
    if (typedNick) localStorage.setItem(NICK_KEY, typedNick);
    try {
      const r = await fetch(`${API}/${videoId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author: a, body: b, parentId: replyTo?.id || null }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { onToast(j.error || `Error ${r.status}`); setSubmitting(false); return; }
      setBody('');
      setReplyTo(null);
      onToast(replyTo ? 'Reply posted' : 'Comment posted');
      // Wait a moment for jsDelivr to refresh, then reload
      setTimeout(() => { load(); }, 1500);
    } catch (e: any) {
      onToast(`Network error: ${e.message || 'unknown'}`);
    } finally {
      setSubmitting(false);
    }
  }, [author, body, replyTo, videoId, onToast, load]);

  // Roots + replies
  const roots = comments.filter(c => !c.parentId);
  const repliesOf = (id: string) => comments.filter(c => c.parentId === id);

  const startReply = (c: Comment) => {
    setReplyTo(c);
    setTimeout(() => taRef.current?.focus(), 60);
  };

  return (
    <section className="mt-8 px-4 sm:px-6 pb-12">
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-display text-lg sm:text-xl font-bold flex items-center gap-2.5">
          Comments
          <span className="text-[12px] font-mono px-2 py-0.5 rounded-full" style={{ background: 'var(--bg3)', color: 'var(--tx3)' }}>
            {loading ? '…' : comments.length}
          </span>
        </h2>
        <button
          onClick={load}
          className="btn-ghost btn !py-1.5 !px-2.5"
          title="Refresh comments"
          aria-label="Refresh"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" d="M3 12a9 9 0 0115.5-6.3L21 8M21 3v5h-5M21 12a9 9 0 01-15.5 6.3L3 16M3 21v-5h5" />
          </svg>
        </button>
      </div>

      {/* ── Compose box ────────────────────────────────────────────────── */}
      <div className="rounded-2xl border p-4 mb-6" style={{ borderColor: 'var(--bd)', background: 'var(--bg2)' }}>
        {replyTo && (
          <div className="flex items-center justify-between mb-3 pb-3 border-b text-[12px]" style={{ borderColor: 'var(--bd)', color: 'var(--tx3)' }}>
            <span>Replying to <strong style={{ color: 'var(--red)' }}>{replyTo.author}</strong></span>
            <button onClick={() => setReplyTo(null)} className="btn-ghost btn !p-1" aria-label="Cancel reply">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" d="M6 6l12 12M6 18L18 6" />
              </svg>
            </button>
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            value={author}
            onChange={e => setAuthor(e.target.value.slice(0, 40))}
            placeholder="Your name"
            className="w-full sm:w-44 rounded-md px-3 py-2 text-[13px] focus:outline-none ring-focus"
            style={{ background: 'var(--bg3)', border: '1px solid var(--bd2)', color: 'var(--tx)' }}
            maxLength={40}
          />
          <textarea
            ref={taRef}
            value={body}
            onChange={e => setBody(e.target.value.slice(0, 2000))}
            placeholder="Share your thoughts on this video…"
            rows={3}
            className="flex-1 rounded-md px-3 py-2 text-[13.5px] leading-relaxed focus:outline-none ring-focus resize-y min-h-[68px]"
            style={{ background: 'var(--bg3)', border: '1px solid var(--bd2)', color: 'var(--tx)' }}
            maxLength={2000}
            onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit(); }}
          />
        </div>
        <div className="flex items-center justify-between mt-3">
          <span className="text-[10.5px] font-mono tabular-nums" style={{ color: 'var(--tx3)' }}>
            {body.length}/2000 · ⌘+↵ to post
          </span>
          <button
            onClick={submit}
            disabled={submitting || body.trim().length < 2}
            className="btn btn-primary !py-1.5"
            style={{ opacity: submitting || body.trim().length < 2 ? .5 : 1 }}
          >
            {submitting
              ? <><div className="w-3 h-3 rounded-full border-2 border-transparent border-t-white animate-spin"/> Posting…</>
              : (replyTo ? 'Post reply' : 'Post comment')}
          </button>
        </div>
      </div>

      {/* ── Thread list ────────────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex gap-3">
              <div className="skel w-10 h-10 rounded-full shrink-0" />
              <div className="flex-1">
                <div className="skel h-3.5 w-32" />
                <div className="skel h-3 w-full mt-2" />
                <div className="skel h-3 w-4/5 mt-1.5" />
              </div>
            </div>
          ))}
        </div>
      ) : roots.length === 0 ? (
        <div className="text-center py-12 flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
            <svg className="w-6 h-6" style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <div>
            <p className="text-[14px] font-semibold" style={{ color: 'var(--text-secondary)' }}>No comments yet</p>
            <p className="text-[12px] mt-1" style={{ color: 'var(--text-muted)' }}>Be the first to share your thoughts.</p>
          </div>
        </div>
      ) : (
        <ul className="space-y-5">
          {roots.map(c => (
            <li key={c.id} className="fade-up">
              <CommentRow c={c} onReply={() => startReply(c)} />
              {repliesOf(c.id).length > 0 && (
                <ul className="mt-3 ml-12 space-y-3 pl-4 border-l" style={{ borderColor: 'var(--bd)' }}>
                  {repliesOf(c.id).map(r => (
                    <li key={r.id} className="fade-up">
                      <CommentRow c={r} compact onReply={() => startReply(c) /* reply to parent */} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CommentRow({ c, onReply, compact }: { c: Comment; onReply: () => void; compact?: boolean }) {
  const color = avatarColor(c.author);
  return (
    <div className="flex gap-3">
      <div
        className={`shrink-0 rounded-full flex items-center justify-center text-white font-bold ${compact ? 'w-8 h-8 text-[11px]' : 'w-10 h-10 text-[12px]'}`}
        style={{ background: color }}
        aria-hidden
      >
        {initials(c.author)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="font-semibold text-[13px]" style={{ color: 'var(--tx)' }}>{c.author}</span>
          <span className="text-[10.5px] tabular-nums" style={{ color: 'var(--tx3)' }}>{fmtRelative(c.createdAt)}</span>
        </div>
        <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap break-words" style={{ color: 'var(--tx2)' }}>{c.body}</p>
        <div className="flex items-center gap-1 mt-1.5">
          <button onClick={onReply} className="btn-ghost btn !py-0.5 !px-1.5 !text-[11px]">Reply</button>
        </div>
      </div>
    </div>
  );
}
