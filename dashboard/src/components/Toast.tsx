import { useEffect } from 'react';

export function Toast({ msg, onDone }: { msg: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1800);
    return () => clearTimeout(t);
  }, [msg, onDone]);
  if (!msg) return null;
  return (
    <div className="toast" role="status" aria-live="polite">
      <span className="inline-flex items-center gap-2">
        <svg className="w-4 h-4" style={{ color: 'var(--emerald)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {msg}
      </span>
    </div>
  );
}
