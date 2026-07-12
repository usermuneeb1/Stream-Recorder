import { useEffect, useState } from 'react';

interface LiveStatus {
  isLive: boolean;
  title?: string;
  viewers?: number;
  thumbnail?: string;
}

/**
 * LiveStatusBadge — Premium live indicator that checks if The Muslim Lantern is currently streaming.
 * Shows pulsing red dot when live with viewer count.
 * Uses YouTube Data API v3 (requires API key) or falls back to RSS/iframe check.
 */
export function LiveStatusBadge({ className = '' }: { className?: string }) {
  const [status, setStatus] = useState<LiveStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkLive = async () => {
      try {
        // Method 1: Check YouTube RSS feed for live broadcast
        // This is a free, no-API-key method
        const response = await fetch('/api/live-status');
        if (response.ok) {
          const data = await response.json();
          setStatus(data);
        }
      } catch (error) {
        console.log('Live status check failed:', error);
      } finally {
        setLoading(false);
      }
    };

    checkLive();
    // Check every 60 seconds
    const interval = setInterval(checkLive, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading || !status) return null;

  if (!status.isLive) {
    return (
      <div
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all ${className}`}
        style={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid var(--border-subtle)',
          color: 'var(--text-muted)',
        }}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--text-muted)' }} />
        Offline
      </div>
    );
  }

  return (
    <a
      href="https://youtube.com/@TheMuslimLantern/live"
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-2.5 px-4 py-2 rounded-full text-[12px] font-bold transition-all hover:scale-105 group ${className}`}
      style={{
        background: 'linear-gradient(135deg, rgba(198, 40, 40, 0.95) 0%, rgba(142, 24, 24, 0.95) 100%)',
        border: '1px solid rgba(255, 61, 61, 0.5)',
        color: '#fff',
        boxShadow: '0 0 20px rgba(255, 61, 61, 0.3), 0 4px 12px rgba(0, 0, 0, 0.3)',
      }}
    >
      {/* Pulsing live dot */}
      <span className="relative flex h-2 w-2">
        <span
          className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
          style={{ background: '#fff' }}
        />
        <span
          className="relative inline-flex rounded-full h-2 w-2"
          style={{ background: '#fff' }}
        />
      </span>
      <span className="tracking-[.1em] uppercase">Live Now</span>
      {status.viewers && status.viewers > 0 && (
        <>
          <span style={{ color: 'rgba(255,255,255,0.4)' }}>•</span>
          <span className="tabular-nums">{status.viewers.toLocaleString()} watching</span>
        </>
      )}
    </a>
  );
}
