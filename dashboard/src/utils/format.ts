// Small formatting + helper utilities shared across components.

export function fmtTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sc = Math.floor(s % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sc).padStart(2, '0')}`
    : `${m}:${String(sc).padStart(2, '0')}`;
}

export function fmtRelative(iso: string): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!t) return '';
  const diff = (Date.now() - t) / 1000;
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 2.6e6) return `${Math.floor(diff / 604800)}w ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtDate(d: string): string {
  if (!d) return '';
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch { return d; }
}

export function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(n);
}

export async function copyText(t: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch {
    // Legacy fallback
    try {
      const ta = document.createElement('textarea');
      ta.value = t; ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch { return false; }
  }
}

export function shareLinks(url: string, title: string) {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  return {
    x:        `https://twitter.com/intent/tweet?text=${t}&url=${u}`,
    whatsapp: `https://wa.me/?text=${t}%20${u}`,
    telegram: `https://t.me/share/url?url=${u}&text=${t}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
    email:    `mailto:?subject=${t}&body=${u}`,
  };
}
