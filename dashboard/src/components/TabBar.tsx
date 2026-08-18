// Mobile tab bar — thumb-reach navigation with safe-area padding.

import { nav } from './Nav';

interface Props {
  route: string;
  onSearch: () => void;
}

export default function TabBar({ route, onSearch }: Props) {
  const tabs = [
    {
      key: 'home', label: 'Home', href: '#/',
      icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>,
    },
    {
      key: 'browse', label: 'Archive', href: '#/browse',
      icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M3 9h18M9 9v11" /></svg>,
    },
    {
      key: 'shorts', label: 'Shorts', href: '#/shorts',
      icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="7" y="3" width="10" height="18" rx="3" /><path d="m10.5 9.5 3.5 2-3.5 2z" fill="currentColor" stroke="none" /></svg>,
    },
    {
      key: 'search', label: 'Search', href: '', action: true,
      icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>,
    },
    {
      key: 'mylist', label: 'My List', href: '#/my-list',
      icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21C7 16.5 3 13.2 3 9.1 3 6.3 5.2 4 8 4c1.6 0 3.1.8 4 2 0.9-1.2 2.4-2 4-2 2.8 0 5 2.3 5 5.1 0 4.1-4 7.4-9 11.9z" /></svg>,
    },
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 safe-bottom"
      aria-label="Mobile navigation"
      style={{
        background: 'var(--glass-strong)',
        backdropFilter: 'blur(24px) saturate(160%)',
        WebkitBackdropFilter: 'blur(24px) saturate(160%)',
        borderTop: '1px solid var(--line)',
      }}
    >
      <div className="grid grid-cols-5">
        {tabs.map(t => {
          const active = !t.action && route === t.key;
          return (
            <button
              key={t.key}
              onClick={() => (t.action ? onSearch() : nav(t.href))}
              className="flex flex-col items-center gap-1 py-2.5 transition-transform active:scale-90"
              style={{ color: active ? 'var(--flame-1)' : 'var(--shade)' }}
              aria-label={t.label}
              aria-current={active ? 'page' : undefined}
            >
              {t.icon}
              <span className="text-[9.5px] font-bold tracking-wide">{t.label}</span>
              <span className="w-4 h-0.5 rounded-full transition-opacity"
                style={{ background: 'var(--flame-1)', opacity: active ? 1 : 0 }} />
            </button>
          );
        })}
      </div>
    </nav>
  );
}
