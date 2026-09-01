// Mirror-index mapping for the watch page.
//
// The sidebar, keyboard (0 = Auto, 1 = first mirror, …) and the highlight
// state all use a 1-based srcIdx: 0 is Auto, N is mirrors[N-1]. Playback
// resolution MUST subtract 1. The 2026-09-01 bug returned srcIdx itself
// when srcIdx !== 0, so clicking GHOST played R3AL, key 1 toasted "GHOST"
// while R3AL started, and clicking the last mirror played undefined.

/** Keyboard / sidebar: 0 = Auto, 1 = first mirror, 2 = second, … */
export function srcIdxForMirror(mirrorIndex: number): number {
  return mirrorIndex + 1;
}

/**
 * Resolve which mirrors[] slot should play.
 * @param srcIdx  0 = Auto (first not-in-failed); 1..N = mirrors[srcIdx-1]
 * @param failed  0-based mirror indices that have already errored
 * @param mirrorCount mirrors.length
 */
export function resolveActiveIdx(
  srcIdx: number,
  failed: ReadonlySet<number>,
  mirrorCount: number,
): number {
  if (mirrorCount <= 0) return 0;
  if (srcIdx === 0) {
    for (let i = 0; i < mirrorCount; i++) if (!failed.has(i)) return i;
    return 0;
  }
  const idx = srcIdx - 1;
  if (idx < 0 || idx >= mirrorCount) return 0;
  return idx;
}
