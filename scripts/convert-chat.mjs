// Converts a live-chat dump into the compact replay format the dashboard
// serves: {messages:[{t,a,m,p?,k?}]}
//   t = seconds into the stream · a = author · m = message
//   p = purchase amount (superchat) · k = 'super' | 'member'
//
// It accepts EVERY dump this repo can produce, because the recorder and the
// chat-archiver workflow capture with two different tools:
//
//   1. yt-dlp  --write-subs --sub-langs live_chat
//        → JSON Lines, one renderer envelope per line
//          {"replayChatItemAction":{...}} / {"liveChatTextMessageRenderer":{...}}
//
//   2. chat-downloader  --output chat.json
//        → a JSON ARRAY of already-flattened items
//          [{time_in_seconds, time_text, author:{name}, message, message_type, money}]
//
//   3. an already-compact replay file ({messages:[{t,a,m}]}) — passed through
//      so re-running the converter is idempotent.
//
// History: this file only understood (1). The recorder captures with (2), so
// every recording that DID capture chat produced a file this converter (and
// therefore the dashboard) could not read — the chat existed but was
// invisible. (2026-10-30)
import fs from 'node:fs';

const [src, dst] = process.argv.slice(2);
if (!src || !dst) {
  console.error('usage: node convert-chat.mjs <in.(json|jsonl)> <out.json>');
  process.exit(1);
}

/* ── text helpers ─────────────────────────────────────────────────────────── */

// yt-dlp / YouTube: {runs:[{text}], simpleText} — also tolerate a plain string.
const runs = (obj) => {
  if (obj == null) return '';
  if (typeof obj === 'string') return obj;
  if (Array.isArray(obj)) return obj.map(r => (r && (r.text ?? r.simpleText)) || '').join('');
  if (Array.isArray(obj.runs)) return obj.runs.map(r => r?.text ?? '').join('');
  return obj.simpleText ?? '';
};

const money = (v) => {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return v.text || v.amount || '';
  return String(v);
};

// chat-downloader writes time_text as "1:02" / "1:02:03"; convert to seconds.
const timeTextToSec = (txt) => {
  if (typeof txt !== 'string' || !/^\d+(:\d{1,2}){1,2}$/.test(txt.trim())) return null;
  const parts = txt.trim().split(':').map(Number);
  return parts.reduce((acc, p) => acc * 60 + p, 0);
};

/* ── per-format item → {t,a,m,p?,k?} ──────────────────────────────────────── */

// chat-downloader item. Field names come from chat_downloader.sites.youtube
// (_REMAPPING): author_name → author.name, timestampText → time_text,
// timestampUsec → timestamp (epoch µs — NOT a stream offset, never used here),
// message_type ∈ text_message | paid_message | membership_item | ...
let cursor = 0; // last known stream offset, for items with no timestamp at all
const fromChatDownloader = (it) => {
  if (!it || typeof it !== 'object') return null;

  let t = it.time_in_seconds;
  if (typeof t !== 'number' || !Number.isFinite(t)) t = timeTextToSec(it.time_text);
  if (typeof t === 'number' && Number.isFinite(t) && t >= 0) cursor = t;
  else t = cursor; // keep monotonic instead of dropping the message
  t = Math.round(t * 10) / 10;

  const author = (it.author && (it.author.name ?? it.author)) || it.author_name || it.authorName || '';
  const kind = String(it.message_type || it.messageType || 'text_message');

  let m = runs(it.message) || runs(it.message_text) || runs(it.header_primary_text) || '';
  let k;
  let p;
  if (kind.includes('paid') || kind.includes('superchat') || it.money) {
    k = 'super';
    p = money(it.money);
  } else if (kind.includes('membership') || kind.includes('sponsor') || kind.includes('gift')) {
    k = 'member';
    if (!m) m = 'joined the members';
  }
  if (!m) return null;

  const out = { t, a: String(author), m };
  if (k === 'super') { out.p = p || ''; out.k = 'super'; }
  else if (k === 'member') out.k = 'member';
  return out;
};

// yt-dlp / YouTube renderer envelope (one JSON line of the .live_chat.json).
// A line is either the renderer directly, or {replayChatItemAction:{...actions:[…]}}.
const pickRenderer = (o, depth = 0) => {
  if (!o || typeof o !== 'object' || depth > 4) return null;
  if (o.liveChatPaidMessageRenderer) return ['paid', o.liveChatPaidMessageRenderer];
  if (o.liveChatPaidStickerRenderer) return ['paid', o.liveChatPaidStickerRenderer];
  if (o.liveChatMembershipItemRenderer) return ['member', o.liveChatMembershipItemRenderer];
  if (o.liveChatTextMessageRenderer) return ['text', o.liveChatTextMessageRenderer];
  // yt-dlp wraps: action → addChatItemAction → item → <renderer>
  if (o.addChatItemAction) return pickRenderer(o.addChatItemAction.item, depth + 1);
  if (o.item) return pickRenderer(o.item, depth + 1);
  return null;
};

const fromYtDlp = (e) => {
  if (!e || typeof e !== 'object') return null;
  const offset = (o) => {
    const ms = parseInt(o?.videoOffsetTimeMsec, 10);
    return Number.isFinite(ms) ? Math.round(ms / 100) / 10 : null;
  };

  // The replay wrapper carries the offset next to the renderer it wraps.
  let t = offset(e);
  const replay = e.replayChatItemAction;
  if (t == null && replay) t = offset(replay);

  let picked = pickRenderer(e);
  if (!picked && replay) {
    for (const action of replay.actions || []) {
      picked = pickRenderer(action);
      if (picked) break;
    }
  }
  if (!picked) return null;
  const [kind, rend] = picked;

  if (t == null) t = offset(rend);
  if (t == null || !Number.isFinite(t) || t < 0) t = cursor;
  else cursor = t;

  const a = rend.authorName?.simpleText
    || (Array.isArray(rend.authorName?.runs) ? rend.authorName.runs.map(r => r?.text ?? '').join('') : '')
    || '';

  if (kind === 'paid') {
    const m = runs(rend.message) || rend.purchaseAmountText?.simpleText || 'sent a Super Chat';
    return { t, a, m, p: rend.purchaseAmountText?.simpleText || '', k: 'super' };
  }
  if (kind === 'member') {
    const m = runs(rend.message) || rend.headerSubtext?.simpleText || 'joined the members';
    return { t, a, m, k: 'member' };
  }
  const m = runs(rend.message);
  if (!m) return null;
  return { t, a, m };
};

/* ── parse: whole-file JSON first, then JSON Lines ────────────────────────── */

let text;
try {
  text = fs.readFileSync(src, 'utf8');
} catch (err) {
  console.error(`cannot read ${src}: ${err.message}`);
  process.exit(1);
}

let messages = [];
const trimmed = text.trim();

const alreadyCompact = (obj) =>
  obj && Array.isArray(obj.messages) &&
  obj.messages.every(m => m && typeof m === 'object' && typeof m.t === 'number' && typeof m.m === 'string');

let parsedWhole = null;
if (trimmed) {
  try { parsedWhole = JSON.parse(trimmed); } catch { parsedWhole = null; }
}

if (alreadyCompact(parsedWhole)) {
  // Idempotent: feed a compact replay back in, get the same thing out.
  messages = parsedWhole.messages
    .filter(m => Number.isFinite(m.t) && m.t >= 0 && m.m)
    .map(m => {
      const o = { t: m.t, a: String(m.a ?? ''), m: String(m.m) };
      if (m.k === 'super') { o.p = m.p ?? ''; o.k = 'super'; }
      else if (m.k === 'member') o.k = 'member';
      return o;
    });
} else if (Array.isArray(parsedWhole)) {
  // chat-downloader JSON array
  for (const it of parsedWhole) {
    const r = fromChatDownloader(it);
    if (r) messages.push(r);
  }
} else if (parsedWhole && Array.isArray(parsedWhole.messages)) {
  // Some chat-downloader versions wrap the array: {messages:[...]}
  for (const it of parsedWhole.messages) {
    const r = fromChatDownloader(it);
    if (r) messages.push(r);
  }
} else {
  // JSON Lines (yt-dlp .live_chat.json)
  cursor = 0;
  for (const line of text.split('\n')) {
    const l = line.trim();
    if (!l) continue;
    let e;
    try { e = JSON.parse(l); } catch { continue; }
    const r = fromYtDlp(e);
    if (r) messages.push(r);
  }
}

messages.sort((a, b) => a.t - b.t);

const supers = messages.filter(m => m.k === 'super').length;
const members = messages.filter(m => m.k === 'member').length;

fs.writeFileSync(dst, JSON.stringify({ messages }));
console.log(`converted ${messages.length} messages (${supers} superchats, ${members} memberships) → ${dst}`);
