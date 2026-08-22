// 💬 Comments — passphrase-gated writes, public reads.
//
// "Special people" share one secret word (COMMENTS_PASSPHRASE on the API
// side). They pick their own display name; the word + name persist in
// localStorage so they only type it once per device. Everyone can read.

import { useEffect, useState } from 'react';

interface Comment {
  n: string;   // display name
  t: string;   // text
  at: string;  // ISO timestamp
}

const IDENTITY_KEY = 'mla-comments-identity';

function loadIdentity(): { name: string; passphrase: string } {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    if (raw) {
      const j = JSON.parse(raw);
      if (typeof j?.name === 'string' && typeof j?.passphrase === 'string') return j;
    }
  } catch { /* fresh */ }
  return { name: '', passphrase: '' };
}

export default function Comments({ videoId }: { videoId: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState(loadIdentity().name);
  const [passphrase, setPassphrase] = useState('');
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoaded(false);
    setComments([]);
    fetch(`/api/comments/${encodeURIComponent(videoId)}`)
      .then(r => (r.ok ? r.json() : { comments: [] }))
      .then(j => { if (alive) { setComments(Array.isArray(j?.comments) ? j.comments : []); setLoaded(true); } })
      .catch(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [videoId]);

  const submit = async () => {
    if (text.trim().length < 2 || status === 'sending') return;
    setStatus('sending');
    setError('');
    try {
      const r = await fetch(`/api/comments/${encodeURIComponent(videoId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), text: text.trim(), passphrase }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        try { localStorage.setItem(IDENTITY_KEY, JSON.stringify({ name: name.trim(), passphrase })); } catch { /* private mode */ }
        setText('');
        setStatus('sent');
        // optimistic prepend
        setComments(c => [{ n: name.trim() || 'Guest', t: text.trim(), at: new Date().toISOString() }, ...c]);
        setTimeout(() => setStatus('idle'), 2500);
      } else {
        setStatus('error');
        setError(String(j?.error || `Failed (${r.status})`));
      }
    } catch {
      setStatus('error');
      setError('Network error — try again.');
    }
  };

  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-3">
        <span className="shelf-tick" />
        <span className="eyebrow">Comments</span>
        <span className="mono text-[10px]" style={{ color: 'var(--shade)' }}>
          {loaded ? `${comments.length} left` : '…'}
        </span>
      </div>

      {/* Composer */}
      <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--ink-1)', border: '1px solid var(--line)' }}>
        <div className="flex gap-2 mb-2 flex-wrap">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Your name"
            maxLength={32}
            aria-label="Your display name"
            name="comment-name"
            autoComplete="off"
            className="rounded-lg px-3 h-9 text-[12.5px] outline-none flex-1 min-w-[140px]"
            style={{ background: 'var(--ink-2)', border: '1px solid var(--line)', color: 'var(--ivory)' }}
          />
          <input
            value={passphrase}
            onChange={e => setPassphrase(e.target.value)}
            placeholder="Passphrase"
            type="password"
            aria-label="Shared passphrase"
            name="comment-passphrase"
            autoComplete="off"
            maxLength={64}
            className="rounded-lg px-3 h-9 text-[12.5px] outline-none w-[150px]"
            style={{ background: 'var(--ink-2)', border: '1px solid var(--line)', color: 'var(--ivory)' }}
          />
        </div>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Say something about this stream…"
          maxLength={600}
          rows={2}
          aria-label="Your comment"
          name="comment-text"
          className="w-full rounded-lg px-3 py-2 text-[12.5px] outline-none resize-none"
          style={{ background: 'var(--ink-2)', border: '1px solid var(--line)', color: 'var(--ivory)' }}
        />
        <div className="flex items-center gap-3 mt-2">
          <button
            className="btn btn-flame !py-2 !px-4 !text-[12px]"
            disabled={status === 'sending' || text.trim().length < 2}
            style={{ opacity: status === 'sending' || text.trim().length < 2 ? 0.5 : 1 }}
            onClick={submit}
          >
            {status === 'sending' ? 'Sending…' : status === 'sent' ? 'Posted ✓' : 'Post comment'}
          </button>
          {error && <span className="text-[11.5px]" style={{ color: '#e05a4e' }}>{error}</span>}
          {status === 'sent' && !error && <span className="text-[11.5px]" style={{ color: '#57f2ad' }}>Thank you.</span>}
        </div>
      </div>

      {/* List */}
      {!loaded ? (
        <div className="mono text-[10.5px]" style={{ color: 'var(--shade)' }}>Loading comments…</div>
      ) : comments.length === 0 ? (
        <div className="mono text-[10.5px]" style={{ color: 'var(--shade)' }}>
          No comments yet — the first word is yours.
        </div>
      ) : (
        <div className="flex flex-col">
          {comments.map((c, i) => (
            <div key={`${c.at}-${i}`} className="py-3 border-b last:border-b-0" style={{ borderColor: 'var(--line)' }}>
              <div className="flex items-baseline gap-2.5">
                <span className="text-[12.5px] font-bold" style={{ color: 'var(--flame-2)' }}>{c.n || 'Guest'}</span>
                <span className="mono text-[9.5px]" style={{ color: 'var(--shade)' }}>
                  {(() => { try { return new Date(c.at).toLocaleDateString(); } catch { return ''; } })()}
                </span>
              </div>
              <p className="text-[13px] mt-1 leading-relaxed" style={{ color: 'var(--mist)' }}>{c.t}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
