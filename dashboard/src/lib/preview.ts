// Hover-preview source resolution for cards.
//
// bundle-preload rule: NOTHING loads until the pointer actually dwells —
// the URL string is free, bytes start only when the <video> mounts.
// Source order = fastest CDN first: Pixeldrain → GitHub release → Archive.

import type { Ep } from '../types';

export function previewSourceFor(ep: Ep): string {
  const pd = ep.pixeldrainLink?.match(/pixeldrain\.com\/(?:u|api\/file)\/([\w-]+)/);
  if (pd) return `https://pixeldrain.com/api/file/${pd[1]}`;
  if (ep.st0807Link) return ep.st0807Link;
  const gh = ep.githubDirect || ep.githubRelease;
  if (gh) return gh;
  if (ep.archiveNode) return ep.archiveNode;
  if (ep.archiveDirect) return ep.archiveDirect;
  return '';
}

// Skip cold-open dead air: land where the content actually is.
export function previewStartFor(ep: Ep): number {
  const d = ep.durationSec || 0;
  if (d > 900) return 90;          // long stream → 1:30 in
  if (d > 240) return Math.floor(d * 0.12);
  return 5;
}
