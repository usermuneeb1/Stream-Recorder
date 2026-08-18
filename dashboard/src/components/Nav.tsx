// Hash-routing primitives — tiny, dependency-free.

import type { MouseEvent, ReactNode } from 'react';

export function nav(hash: string) {
  if (window.location.hash === hash) return;
  window.location.hash = hash;
  window.scrollTo({ top: 0 });
}

interface LinkProps {
  href: string;               // e.g. "#/watch/abc"
  className?: string;
  children: ReactNode;
  title?: string;
  onClick?: () => void;
  ariaLabel?: string;
}

export function Link({ href, className, children, title, onClick, ariaLabel }: LinkProps) {
  const handle = (e: MouseEvent) => {
    if (onClick) { e.preventDefault(); onClick(); }
  };
  return (
    <a href={href} className={className} title={title} aria-label={ariaLabel} onClick={handle}>
      {children}
    </a>
  );
}
