// Pure-function tests for lib/ (automation grill Q2 — minimal scope).
import { describe, it, expect } from 'vitest';
import { fmtTime, fmtRemaining, fmtCount, isHD, resShort } from './format';
import { previewSourceFor, previewStartFor } from './preview';
import { resolveActiveIdx, srcIdxForMirror } from './mirrors';
import type { Ep } from '../types';

describe('fmtTime', () => {
  it('formats seconds under an hour', () => {
    expect(fmtTime(65)).toBe('1:05');
    expect(fmtTime(0)).toBe('0:00');
  });
  it('formats hours with padded minutes/seconds', () => {
    expect(fmtTime(3661)).toBe('1:01:01');
  });
  it('handles garbage input', () => {
    expect(fmtTime(-5)).toBe('0:00');
    expect(fmtTime(NaN)).toBe('0:00');
  });
});

describe('fmtRemaining', () => {
  it('minutes under an hour', () => {
    expect(fmtRemaining(300)).toBe('5m left');
  });
  it('hours+minutes above', () => {
    expect(fmtRemaining(7200)).toBe('2h left');
    expect(fmtRemaining(8100)).toBe('2h 15m left');
  });
});

describe('fmtCount', () => {
  it('abbreviates thousands and millions', () => {
    expect(fmtCount(950)).toBe('950');
    expect(fmtCount(633_000)).toBe('633K');
    expect(fmtCount(183_400_000)).toBe('183M');
  });
});

describe('isHD / resShort', () => {
  it('flags 1080p as HD, rejects 720p', () => {
    expect(isHD('1920x1080')).toBe(true);
    expect(isHD('1280x720')).toBe(false);
  });
  it('shortens resolutions', () => {
    expect(resShort('1920x1080')).toBe('1080p');
    expect(resShort('3840x2160')).toBe('4K');
  });
});

const ep = (over: Partial<Ep>): Ep =>
  ({ videoId: 'abc123', pixeldrainLink: '', githubDirect: '', githubRelease: '', archiveNode: '', archiveDirect: '', ...over }) as Ep;

describe('previewSourceFor', () => {
  it('prefers pixeldrain CDN first', () => {
    const src = previewSourceFor(ep({ pixeldrainLink: 'https://pixeldrain.com/u/74QKr2Kn', archiveNode: 'https://archive.org/x' }));
    expect(src).toBe('https://pixeldrain.com/api/file/74QKr2Kn');
  });
  it('falls back github -> archive node -> direct', () => {
    expect(previewSourceFor(ep({ githubRelease: 'https://github.com/r/releases/f.mp4' }))).toBe('https://github.com/r/releases/f.mp4');
    expect(previewSourceFor(ep({ archiveNode: 'https://n', archiveDirect: 'https://d' }))).toBe('https://n');
    expect(previewSourceFor(ep({ archiveDirect: 'https://d' }))).toBe('https://d');
  });
  it('returns empty when no mirrors', () => {
    expect(previewSourceFor(ep({}))).toBe('');
  });
});

describe('previewStartFor', () => {
  it('long streams start at 90s', () => {
    expect(previewStartFor(ep({ durationSec: 7000 }))).toBe(90);
  });
  it('mid streams start 12% in', () => {
    expect(previewStartFor(ep({ durationSec: 600 }))).toBe(72);
  });
  it('short clips start near zero', () => {
    expect(previewStartFor(ep({ durationSec: 120 }))).toBe(5);
  });
});

// ── Watch-page srcIdx mapping ──────────────────────────────────────────
// Sidebar + keyboard use 1-based srcIdx (0 = Auto, 1 = first mirror).
// The 2026-09-01 bug returned srcIdx itself when srcIdx !== 0, so:
//   click GHOST (selectMirror(1)) played mirrors[1] (R3AL)
//   click last mirror (selectMirror(n)) played mirrors[n] (undefined)
//   key 1 toasted "GHOST" while R3AL started
function oldResolveActiveIdx(srcIdx: number, failed: Set<number>, n: number): number {
  if (srcIdx !== 0) return srcIdx;
  for (let i = 0; i < n; i++) if (!failed.has(i)) return i;
  return 0;
}

describe('resolveActiveIdx', () => {
  const none = new Set<number>();

  it('Auto plays the first healthy mirror', () => {
    expect(resolveActiveIdx(0, none, 4)).toBe(0);
    expect(resolveActiveIdx(0, new Set([0]), 4)).toBe(1);
    expect(resolveActiveIdx(0, new Set([0, 1]), 4)).toBe(2);
  });

  it('manual 1 plays the FIRST mirror (not the second — the incident)', () => {
    // Old code returned 1 here → played R3AL when the user picked GHOST.
    expect(oldResolveActiveIdx(1, none, 4)).toBe(1);
    expect(resolveActiveIdx(1, none, 4)).toBe(0);
  });

  it('manual last plays the last mirror (not undefined)', () => {
    expect(oldResolveActiveIdx(4, none, 4)).toBe(4); // OOB
    expect(resolveActiveIdx(4, none, 4)).toBe(3);
  });

  it('keyboard/sidebar mapping: srcIdxForMirror(i) selects mirrors[i]', () => {
    expect(srcIdxForMirror(0)).toBe(1);
    expect(resolveActiveIdx(srcIdxForMirror(0), none, 4)).toBe(0);
    expect(resolveActiveIdx(srcIdxForMirror(3), none, 4)).toBe(3);
  });

  it('out-of-range manual selection falls back to 0, not undefined', () => {
    expect(resolveActiveIdx(99, none, 4)).toBe(0);
    expect(resolveActiveIdx(-1, none, 4)).toBe(0);
  });
});
