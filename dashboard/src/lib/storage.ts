// Per-recording playback position memory, recently-watched list, My List,
// and small prefs. All localStorage — nothing leaves the browser.
// Keys are shared with the previous UI version so existing viewers keep data.

const POS_KEY = 'mla_pos_v1';        // { [videoId]: { t, d, at } }
const HIST_KEY = 'mla_hist_v1';      // [{ id, at }] most recent first
const LIST_KEY = 'mla_list_v1';      // string[] videoIds
const NICK_KEY = 'mla_nick_v1';      // comment nickname
const THEATRE_KEY = 'mla_theatre_v1'; // '1' | '0'
const RATE_KEY = 'mla_pb_rate_v1';   // '1' | '1.25' | …

interface PosMap { [id: string]: { t: number; d: number; at: number } }
interface HistItem { id: string; at: number }

function read<T>(k: string, dflt: T): T {
  try { return JSON.parse(localStorage.getItem(k) || '') as T; } catch { return dflt; }
}
function write(k: string, v: unknown) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota */ }
}

/* ── Continue-watching positions ─────────────────────────────────────── */

export function savePosition(id: string, t: number, d: number) {
  if (!id || !d || t < 5) return;
  const map = read<PosMap>(POS_KEY, {});
  if (d - t < 30) delete map[id];  // finished — drop it
  else map[id] = { t: Math.floor(t), d: Math.floor(d), at: Date.now() };
  write(POS_KEY, map);
}

export function loadPosition(id: string): { t: number; d: number } | null {
  const e = read<PosMap>(POS_KEY, {})[id];
  return e ? { t: e.t, d: e.d } : null;
}

export function positionOf(id: string): { t: number; d: number } | null {
  return loadPosition(id);
}

export function clearPosition(id: string) {
  const map = read<PosMap>(POS_KEY, {});
  delete map[id];
  write(POS_KEY, map);
}

/* ── Recently watched ────────────────────────────────────────────────── */

export function pushHistory(id: string) {
  if (!id) return;
  let list = read<HistItem[]>(HIST_KEY, []).filter(x => x.id !== id);
  list.unshift({ id, at: Date.now() });
  write(HIST_KEY, list.slice(0, 20));
}

export function removeFromHistory(id: string) {
  write(HIST_KEY, read<HistItem[]>(HIST_KEY, []).filter(x => x.id !== id));
}

export function getHistory(): string[] {
  return read<HistItem[]>(HIST_KEY, []).map(x => x.id);
}

/* ── My List ─────────────────────────────────────────────────────────── */

export function getList(): string[] {
  const v = read<string[]>(LIST_KEY, []);
  return Array.isArray(v) ? v.filter(x => typeof x === 'string') : [];
}

export function inList(id: string): boolean {
  return getList().includes(id);
}

/** Toggle membership; returns the NEW state (true = now in list). */
export function toggleList(id: string): boolean {
  const list = getList();
  const has = list.includes(id);
  const next = has ? list.filter(x => x !== id) : [id, ...list];
  write(LIST_KEY, next.slice(0, 200));
  return !has;
}

/* ── Prefs ───────────────────────────────────────────────────────────── */

export function getNick(): string { return localStorage.getItem(NICK_KEY) || ''; }
export function setNick(n: string) {
  try { localStorage.setItem(NICK_KEY, n); } catch { /* ignore */ }
}

export function getTheatre(): boolean { return localStorage.getItem(THEATRE_KEY) === '1'; }
export function setTheatre(on: boolean) {
  try { localStorage.setItem(THEATRE_KEY, on ? '1' : '0'); } catch { /* ignore */ }
}

export function getRate(): number {
  const r = parseFloat(localStorage.getItem(RATE_KEY) || '');
  return Number.isFinite(r) && r >= 0.25 && r <= 4 ? r : 1;
}
export function setRate(r: number) {
  try { localStorage.setItem(RATE_KEY, String(r)); } catch { /* ignore */ }
}
