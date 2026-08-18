// Theme — dark cinema by default, white gallery on demand.
// Persists to localStorage (mla_theme_v1) and paints <html data-theme>
// before first paint via the boot script in index.html.

import { useCallback, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

const KEY = 'mla_theme_v1';

export function getTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    if (t === 'light' || t === 'dark') return t;
  } catch { /* private mode */ }
  return 'dark';
}

export function setTheme(t: Theme) {
  try { localStorage.setItem(KEY, t); } catch { /* private mode */ }
  document.documentElement.dataset.theme = t;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t === 'dark' ? '#0b0607' : '#ffffff');
}

/** React hook — tracks the live theme and toggles it. */
export function useTheme(): [Theme, () => void] {
  const [theme, setThemeState] = useState<Theme>(getTheme);

  useEffect(() => {
    setTheme(theme); // sync in case the attribute was changed elsewhere
  }, [theme]);

  const toggle = useCallback(() => {
    setThemeState(t => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  return [theme, toggle];
}
