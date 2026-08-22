// One-time-per-session boot: the logo alone, lit by a soft flame glow,
// then it yields to the page. No wordmark, no ornament — the brand speaks.

import { useEffect, useState } from 'react';

export default function Splash() {
  const [show, setShow] = useState(() => {
    try { return !sessionStorage.getItem('mla_intro_v1'); } catch { return true; }
  });
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (!show) return;
    try { sessionStorage.setItem('mla_intro_v1', '1'); } catch { /* ignore */ }
    // Shorter now that it's logo-only: in at 0.7s, hold, fade from 1.5s, gone by 2s.
    const t1 = setTimeout(() => setClosing(true), 1500);
    const t2 = setTimeout(() => setShow(false), 2000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [show]);

  if (!show) return null;

  return (
    <div className={`splash ${closing ? 'splash-closing' : ''}`} aria-hidden="true">
      <img src="/logo.png" alt="" className="splash-logo" draggable={false} />
    </div>
  );
}
