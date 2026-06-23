import { useEffect, useRef, useState } from 'react';
import { fmtTime } from '../utils/format';

interface Cue { start: number; end?: number; text: string }
interface P { url: string; currentTime: number; onSeek: (s: number) => void }

// Best-effort parser that accepts:
//   • Array<{start,end,text}> (Whisper JSON)
//   • Array<{time_in_seconds,text}>
//   • { segments: [...] } (whisper.cpp / faster-whisper)
//   • SRT (text/plain fallback)
function parseTranscript(raw: string): Cue[] {
  try {
    const j = JSON.parse(raw);
    const arr = Array.isArray(j) ? j : (j.segments || j.cues || []);
    return arr.map((c: any) => ({
      start: Number(c.start ?? c.time_in_seconds ?? c.t ?? 0),
      end:   c.end !== undefined ? Number(c.end) : undefined,
      text:  String(c.text ?? c.content ?? '').trim(),
    })).filter((c: Cue) => c.text);
  } catch {
    // SRT
    const out: Cue[] = [];
    const blocks = raw.split(/\r?\n\r?\n/);
    for (const b of blocks) {
      const lines = b.split(/\r?\n/);
      const t = lines.find(l => l.includes('-->'));
      if (!t) continue;
      const [a, z] = t.split('-->').map(s => s.trim());
      const parse = (s: string) => {
        const m = s.match(/(\d+):(\d+):(\d+)[.,](\d+)/);
        if (!m) return 0;
        return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000;
      };
      const text = lines.slice(lines.indexOf(t) + 1).join(' ').trim();
      if (text) out.push({ start: parse(a), end: parse(z), text });
    }
    return out;
  }
}

export function TranscriptViewer({ url, currentTime, onSeek }: P) {
  const [cues, setCues] = useState<Cue[]>([]);
  const [q, setQ] = useState('');
  const [auto, setAuto] = useState(true);
  const [err, setErr] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!url) { setCues([]); setErr('No transcript available'); return; }
    setErr('');
    fetch(url)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
      .then(t => { const parsed = parseTranscript(t); setCues(parsed); if (!parsed.length) setErr('Transcript file was empty or unrecognized'); })
      .catch(e => setErr(`Failed to load: ${e.message}`));
  }, [url]);

  // Active cue
  const activeIdx = (() => {
    for (let i = cues.length - 1; i >= 0; i--) if (currentTime >= cues[i].start) return i;
    return -1;
  })();

  // Auto-scroll
  useEffect(() => {
    if (!auto || activeIdx < 0 || !ref.current) return;
    const el = ref.current.children[activeIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeIdx, auto]);

  const filtered = q.trim()
    ? cues.map((c, i) => ({ c, i })).filter(({ c }) => c.text.toLowerCase().includes(q.toLowerCase()))
    : cues.map((c, i) => ({ c, i }));

  return (
    <div className="rounded-xl border p-3" style={{ borderColor: 'var(--bd)', background: 'var(--bg2)' }}>
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-[10px] font-bold uppercase tracking-[.2em]" style={{ color: 'var(--tx3)' }}>
          Transcript {cues.length > 0 && <span className="font-mono ml-1.5" style={{ color: 'var(--tx4)' }}>{cues.length}</span>}
        </p>
        <button
          onClick={() => setAuto(a => !a)}
          className="text-[10px] font-bold uppercase tracking-wider hover:text-[var(--red)] transition-colors"
          style={{ color: auto ? 'var(--red)' : 'var(--tx3)' }}
        >
          {auto ? '● Auto-scroll' : 'Auto-scroll off'}
        </button>
      </div>

      {err && <p className="text-[12px] py-3 text-center" style={{ color: 'var(--tx3)' }}>{err}</p>}

      {!err && (
        <>
          <div className="relative mb-2">
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search transcript…"
              className="w-full rounded-md px-2.5 py-1.5 text-[12px] focus:outline-none ring-focus"
              style={{ background: 'var(--bg3)', border: '1px solid var(--bd2)', color: 'var(--tx)' }}
            />
          </div>
          <div ref={ref} className="max-h-80 overflow-y-auto space-y-0.5 pr-1">
            {filtered.length === 0 && (
              <p className="text-[11.5px] text-center py-4" style={{ color: 'var(--tx3)' }}>No matches</p>
            )}
            {filtered.map(({ c, i }) => {
              const active = i === activeIdx;
              return (
                <button
                  key={i}
                  onClick={() => onSeek(c.start)}
                  className="w-full flex gap-2.5 text-left rounded-md px-2 py-1.5 transition-colors ring-focus"
                  style={{ background: active ? 'var(--bg4)' : 'transparent' }}
                >
                  <span
                    className="font-mono w-12 shrink-0 text-[10.5px] tabular-nums font-bold mt-0.5"
                    style={{ color: active ? 'var(--red)' : 'var(--tx3)' }}
                  >
                    {fmtTime(c.start)}
                  </span>
                  <span
                    className="text-[12px] leading-snug flex-1"
                    style={{ color: active ? 'var(--tx)' : 'var(--tx2)' }}
                  >
                    {c.text}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
