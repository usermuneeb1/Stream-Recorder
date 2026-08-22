// Fixed top chrome — transparent over the hero, glass once you scroll.

import { useEffect, useState } from 'react';
import LivePill from './LivePill';
import ThemeToggle from './ThemeToggle';
import { nav } from './Nav';

interface Props {
  route: string;                       // 'home' | 'browse' | 'mylist'
  listCount: number;
  onSearch: () => void;
  onCommand: () => void;
  onLive: (live: boolean) => void;
}

export default function TopBar({ route, listCount, onSearch, onCommand, onLive }: Props) {
  const [solid, setSolid] = useState(false);

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 30);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const links: { label: string; href: string; active: boolean }[] = [
    { label: 'Home', href: '#/', active: route === 'home' },
    { label: 'Archive', href: '#/browse', active: route === 'browse' },
    { label: 'Channel', href: '#/channel', active: route === 'channel' },
    { label: 'Shorts', href: '#/shorts', active: route === 'shorts' },
    { label: 'Insights', href: '#/stats', active: route === 'stats' },
    { label: 'My List', href: '#/my-list', active: route === 'mylist' },
  ];

  return (
    <header
      className="fixed top-0 inset-x-0 z-40 transition duration-500"
      style={{
        background: solid ? 'var(--glass-strong)' : 'linear-gradient(to bottom, var(--topbar-fade), transparent)',
        backdropFilter: solid ? 'blur(22px) saturate(150%)' : 'none',
        WebkitBackdropFilter: solid ? 'blur(22px) saturate(150%)' : 'none',
        borderBottom: solid ? '1px solid var(--line)' : '1px solid transparent',
    boxShadow: solid ? '0 16px 32px -22px rgba(0,0,0,0.55)' : 'none',
      }}
    >
      <div className="flex items-center gap-6 px-[4vw] md:px-8 h-16 md:h-[72px]">
        {/* Brand — the Muslim Lantern mark */}
        <a href="#/" className="flex items-center gap-3 group" aria-label="The Lantern Archive — home">
          <img
            src="/logo.png"
            alt="The Muslim Lantern"
            className="h-8 md:h-9 w-auto transition-transform duration-300 group-hover:scale-105"
            draggable={false}
          />
        </a>

        {/* Primary nav */}
        <nav className="hidden md:flex items-center gap-7 ml-4" aria-label="Primary">
          {links.map(l => (
            <a
              key={l.href}
              href={l.href}
              className="relative text-[13.5px] font-semibold tracking-wide transition-colors duration-300 py-1"
              style={{ color: l.active ? 'var(--flame-1)' : 'var(--mist)' }}
            >
              {l.label}
              {l.label === 'My List' && listCount > 0 && (
                <span className="mono ml-1.5 text-[9.5px] px-1.5 py-px rounded-full align-top"
                  style={{ background: 'var(--flame-12)', color: 'var(--flame-1)', border: '1px solid var(--line-flame)' }}>
                  {listCount}
                </span>
              )}
              <span className="absolute left-0 right-0 -bottom-0.5 h-px origin-left transition-transform duration-300"
                style={{ background: 'linear-gradient(90deg, var(--flame-1), transparent)', transform: l.active ? 'scaleX(1)' : 'scaleX(0)' }} />
            </a>
          ))}
        </nav>

        <div className="flex-1" />

        {/* Right cluster */}
        <div className="flex items-center gap-1.5 md:gap-2.5">
          <LivePill onKnown={onLive} />
          <ThemeToggle />
          <button className="btn-icon" title="Search ( / )" aria-label="Search" onClick={onSearch}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          </button>
          <button className="btn-icon hidden sm:inline-flex" title="Command palette (Ctrl+K)" aria-label="Command palette" onClick={onCommand}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><path d="M14 14h4v4h-4zM20 20h1" /></svg>
          </button>
          <a
            className="hidden sm:inline-flex w-[38px] h-[38px] rounded-full items-center justify-center transition-transform duration-300 hover:scale-110"
            href="https://youtube.com/@TheMuslimLantern"
            target="_blank" rel="noopener noreferrer"
            title="The Muslim Lantern on YouTube"
            style={{ border: '1px solid var(--line-flame)', color: 'var(--flame-1)', background: 'var(--flame-04)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.6 15.6V8.4L15.8 12z" /></svg>
          </a>
          <button className="btn-icon md:hidden" title="My List" aria-label="My List" onClick={() => nav('#/my-list')}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21C7 16.5 3 13.2 3 9.1 3 6.3 5.2 4 8 4c1.6 0 3.1.8 4 2 0.9-1.2 2.4-2 4-2 2.8 0 5 2.3 5 5.1 0 4.1-4 7.4-9 11.9z" /></svg>
          </button>
        </div>
      </div>
    </header>
  );
}
