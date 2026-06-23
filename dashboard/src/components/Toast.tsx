import { useEffect } from 'react';

// FEATURE: smarter toast — auto-detects message kind (success/info/error)
// from the first character, longer display for tips/errors, dismissible
// with a click. Stays a single component the rest of the app already uses.
export function Toast({ msg, onDone }: { msg: string; onDone: () => void }) {
  // Heuristic kind detection so callers stay strings.
  const kind: 'ok' | 'info' | 'err' =
    /^(error|❌|failed|fail|failed)/i.test(msg) ? 'err'
    : /^(💡|tip)/i.test(msg) ? 'info'
    : 'ok';

  const ttl = kind === 'info' ? 4200 : kind === 'err' ? 3200 : 1800;

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(onDone, ttl);
    return () => clearTimeout(t);
  }, [msg, onDone, ttl]);

  if (!msg) return null;

  const color =
    kind === 'err'  ? 'var(--red)'
    : kind === 'info' ? 'var(--gold)'
    : 'var(--emerald)';

  return (
    <div
      className="toast cursor-pointer select-none"
      role="status"
      aria-live="polite"
      onClick={onDone}
      title="Click to dismiss"
    >
      <span className="inline-flex items-center gap-2">
        {kind === 'err' ? (
          <svg className="w-4 h-4" style={{ color }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
          </svg>
        ) : kind === 'info' ? (
          <svg className="w-4 h-4" style={{ color }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8h.01M11 12h1v4h1" strokeLinecap="round" />
          </svg>
        ) : (
          <svg className="w-4 h-4" style={{ color }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {msg}
      </span>
    </div>
  );
}
