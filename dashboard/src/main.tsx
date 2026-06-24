import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// SCROLL-REVEAL — any element with .reveal-on-scroll fades+slides into place
// when it enters the viewport. Single observer for the whole document, runs
// continuously so React-rendered cards added later are also caught.
if (typeof window !== 'undefined' && 'IntersectionObserver' in window) {
  const obs = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add('is-visible');
        obs.unobserve(e.target);
      }
    }
  }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

  // Re-scan periodically (cheap — just querySelector) so newly mounted
  // cards from React get observed too without each component having to wire
  // up its own observer.
  const scan = () => {
    document.querySelectorAll<HTMLElement>('.reveal-on-scroll:not(.is-visible):not([data-observed])').forEach(el => {
      el.dataset.observed = '1';
      obs.observe(el);
    });
  };
  // Initial after first paint, then every 800ms (lightweight DOM walk).
  requestAnimationFrame(scan);
  setInterval(scan, 800);
}

// Service-worker management.
// Production only — in dev, vite serves modules and SW gets in the way.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', async () => {
    try {
      // STEP 1 — purge any old SW versions that were caching stale JS bundles.
      // The v4/v5 SW would serve cached asset hashes even after a new deploy,
      // pinning users to the old recordings.json view. Force-unregister any
      // SW whose script URL doesn't match the current /sw.js exactly.
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        const url = reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL || '';
        if (!url.endsWith('/sw.js')) {
          await reg.unregister();
        }
      }

      // STEP 2 — register the new SW.
      const reg = await navigator.serviceWorker.register('/sw.js');

      // STEP 3 — if an UPDATE is found, force the new worker to activate
      // immediately (rather than waiting for all tabs to close).
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            // A new SW is waiting. Tell it to take over now.
            nw.postMessage({ skipWaiting: true });
          }
        });
      });

      // STEP 4 — when the SW takes over, reload once so React re-mounts
      // with the freshest assets. Guarded by sessionStorage so we only
      // ever reload ONCE per session (prevents reload loops).
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded) return;
        reloaded = true;
        if (!sessionStorage.getItem('mla_sw_reloaded')) {
          sessionStorage.setItem('mla_sw_reloaded', '1');
          window.location.reload();
        }
      });
    } catch {
      /* offline-only feature, ignore */
    }
  });
}
