// LIVE indicator — polls the serverless RSS watcher every 60 s.
// Ember red is reserved for exactly one thing in this UI: the channel is live.

import { useEffect, useState } from 'react';

interface Props { onKnown?: (live: boolean) => void }

export default function LivePill({ onKnown }: Props) {
  const [live, setLive] = useState(false);
  const [title, setTitle] = useState('');

  useEffect(() => {
    let alive = true;

    const check = async () => {
      try {
        const r = await fetch('/api/live-status', { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json();
        if (!alive) return;
        setLive(!!j.isLive);
        setTitle(j.title || '');
        onKnown?.(!!j.isLive);
      } catch { /* the lantern rests — stay dark */ }
    };

    check();
    const iv = setInterval(check, 60_000);
    return () => { alive = false; clearInterval(iv); };
  }, [onKnown]);

  if (!live) return null;

  return (
    <a
      className="pill-live"
      href="https://youtube.com/@TheMuslimLantern/live"
      target="_blank"
      rel="noopener noreferrer"
      title={title || 'The Muslim Lantern is live — watch on YouTube'}
    >
      <span className="dot" />
      LIVE
    </a>
  );
}
