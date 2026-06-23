// Privacy-friendly analytics. Loads Plausible only if VITE_PLAUSIBLE_DOMAIN
// is set at build time. Zero cookies, no IP storage — no banner required.

declare global { interface Window { plausible?: (event: string, opts?: any) => void } }

const DOMAIN = import.meta.env.VITE_PLAUSIBLE_DOMAIN as string | undefined;

let injected = false;

export function initAnalytics() {
  if (injected || !DOMAIN || typeof document === 'undefined') return;
  injected = true;
  const s = document.createElement('script');
  s.defer = true;
  s.dataset.domain = DOMAIN;
  s.src = 'https://plausible.io/js/script.hash.outbound-links.js';
  document.head.appendChild(s);
  // Provide a no-op so callers always work even when not loaded
  window.plausible = window.plausible || function () {
    (window.plausible as any).q = (window.plausible as any).q || [];
    (window.plausible as any).q.push(arguments);
  };
}

export function track(event: string, props?: Record<string, string | number>) {
  if (typeof window === 'undefined') return;
  try { window.plausible?.(event, props ? { props } : undefined); } catch { /* noop */ }
}
