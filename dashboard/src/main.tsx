// Entry — mount the app, run the document-wide scroll-reveal observer,
// and manage the service worker (production only).

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);

// SCROLL-REVEAL — any .reveal-on-scroll element fades+slides in when it
// enters the viewport. One observer for the whole document; a light
// periodic re-scan catches React-rendered cards added later.
if (typeof window !== 'undefined') {
  if ('IntersectionObserver' in window) {
    const obs = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          obs.unobserve(e.target);
        }
      }
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

    const scan = () => {
      document.querySelectorAll<HTMLElement>('.reveal-on-scroll:not(.is-visible):not([data-observed])').forEach(el => {
        el.dataset.observed = '1';
        obs.observe(el);
      });
    };
    requestAnimationFrame(scan);
    setInterval(scan, 800);
  } else {
    // Safety net: without IO, never leave content invisible — show it all.
    document.querySelectorAll<HTMLElement>('.reveal-on-scroll').forEach(el => el.classList.add('is-visible'));
  }
}

// Service worker — production only.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', async () => {
    try {
      // Purge foreign SW versions that would serve stale bundles.
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        const url = reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL || '';
        if (!url.endsWith('/sw.js')) await reg.unregister();
      }

      const reg = await navigator.serviceWorker.register('/sw.js');

      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            nw.postMessage({ skipWaiting: true });
          }
        });
      });

      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded) return;
        reloaded = true;
        if (!sessionStorage.getItem('mla_sw_reloaded')) {
          sessionStorage.setItem('mla_sw_reloaded', '1');
          window.location.reload();
        }
      });
    } catch { /* offline-only feature */ }
  });
}
