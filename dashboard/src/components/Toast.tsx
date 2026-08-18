// Single global toast. Kind is inferred from the message prefix.

import { useEffect } from 'react';

interface Props { msg: string; onDone: () => void }

const ERR = /(error|failed|❌|✗)/i;
const INFO = /(💡|tip|switching|source:)/i;

export default function Toast({ msg, onDone }: Props) {
  useEffect(() => {
    const kind = ERR.test(msg) ? 'err' : INFO.test(msg) ? 'info' : 'ok';
    const ms = kind === 'err' ? 3400 : kind === 'info' ? 4200 : 2000;
    const t = setTimeout(onDone, ms);
    return () => clearTimeout(t);
  }, [msg, onDone]);

  const kind = ERR.test(msg) ? 'err' : INFO.test(msg) ? 'info' : 'ok';

  return (
    <div
      className={`toast ${kind} fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 z-[120] flex items-center gap-2.5 cursor-pointer select-none`}
      role="status"
      aria-live="polite"
      onClick={onDone}
    >
      <span className={kind === 'err' ? 'text-[#e50914]' : 'text-flame'}>
        {kind === 'err' ? '✕' : kind === 'info' ? 'ⓘ' : '✓'}
      </span>
      {msg}
    </div>
  );
}
