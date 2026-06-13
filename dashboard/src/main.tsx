// build: 1781343257
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import '@vidstack/react/player/styles/default/theme.css'
import '@vidstack/react/player/styles/default/layouts/video.css'
import { ThemeProvider } from './contexts/ThemeContext.tsx'
import { GithubProvider } from './contexts/GithubContext.tsx'
import { AuthProvider } from './contexts/AuthContext.tsx'
import { HashRouter } from 'react-router-dom'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <ThemeProvider>
        <AuthProvider>
          <GithubProvider>
            <App />
          </GithubProvider>
        </AuthProvider>
      </ThemeProvider>
    </HashRouter>
  </React.StrictMode>,
)

// Register the Service Worker for instant repeat loads + cache-what-you-watch
// video caching. Only in production (HTTPS); harmless no-op if unsupported.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const base = import.meta.env.BASE_URL || '/';
    navigator.serviceWorker.register(`${base}sw.js`).catch(() => {
      /* SW is a progressive enhancement — ignore failures */
    });
  });
}

