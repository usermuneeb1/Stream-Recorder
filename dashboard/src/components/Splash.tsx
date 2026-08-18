// One-time-per-session cinematic boot: a flame flickers to life, the word
// "LANTERN" tracks into place, a wick draws — then the page opens.

import { useEffect, useState } from 'react';

export default function Splash() {
  const [show, setShow] = useState(() => {
    try { return !sessionStorage.getItem('mla_intro_v1'); } catch { return true; }
  });

  useEffect(() => {
    if (!show) return;
    try { sessionStorage.setItem('mla_intro_v1', '1'); } catch { /* ignore */ }
    const t = setTimeout(() => setShow(false), 3200);
    return () => clearTimeout(t);
  }, [show]);

  if (!show) return null;

  return (
    <div className="splash" aria-hidden="true">
      <img src="/logo.png" alt="" className="splash-logo" draggable={false} />
      <div className="flex flex-col items-center gap-3">
        <div className="splash-word">Lantern</div>
        <div className="splash-sub">The Archive</div>
      </div>
      <div className="splash-wick" />
    </div>
  );
}
