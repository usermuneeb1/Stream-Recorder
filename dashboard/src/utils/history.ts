// Per-recording playback position memory + recently-watched list.
// All data lives in localStorage; nothing leaves the browser.

const POS_KEY = 'mla_pos_v1';   // { [videoId]: { t, d, at } }
const HIST_KEY = 'mla_hist_v1'; // [{ id, at }] — most recent first

interface PosMap { [id: string]: { t: number; d: number; at: number } }
interface HistItem { id: string; at: number }

function read<T>(k: string, dflt: T): T {
  try { return JSON.parse(localStorage.getItem(k) || '') as T; } catch { return dflt; }
}
function write(k: string, v: unknown) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota */ }
}

export function savePosition(id: string, t: number, d: number) {
  if (!id || !d || t < 5) return;
  const map = read<PosMap>(POS_KEY, {});
  // Drop if user got within 30 s of the end
  if (d - t < 30) { delete map[id]; }
  else { map[id] = { t: Math.floor(t), d: Math.floor(d), at: Date.now() }; }
  write(POS_KEY, map);
}

export function loadPosition(id: string): { t: number; d: number } | null {
  const map = read<PosMap>(POS_KEY, {});
  const e = map[id];
  return e ? { t: e.t, d: e.d } : null;
}

export function clearPosition(id: string) {
  const map = read<PosMap>(POS_KEY, {});
  delete map[id]; write(POS_KEY, map);
}

export function pushHistory(id: string) {
  if (!id) return;
  let list = read<HistItem[]>(HIST_KEY, []).filter(x => x.id !== id);
  list.unshift({ id, at: Date.now() });
  list = list.slice(0, 20);
  write(HIST_KEY, list);
}

// Remove a single id from the recently-watched history. Used by the
// 'X' button on each Continue-Watching tile so dismissing actually hides it.
export function removeFromHistory(id: string) {
  if (!id) return;
  const list = read<HistItem[]>(HIST_KEY, []).filter(x => x.id !== id);
  write(HIST_KEY, list);
}

export function getHistory(): string[] {
  return read<HistItem[]>(HIST_KEY, []).map(x => x.id);
}
