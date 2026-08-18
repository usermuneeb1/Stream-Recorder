// Converts a yt-dlp `.live_chat.json` (JSON lines) dump into the compact
// replay format the dashboard serves: {demo?, messages:[{t,a,m,p?,k?}]}
//   t = seconds into the stream · a = author · m = message
//   p = purchase amount (superchat) · k = 'super' | 'member'
import fs from 'node:fs';

const [src, dst] = process.argv.slice(2);
if (!src || !dst) {
  console.error('usage: node convert-chat.mjs <in.live_chat.json> <out.json>');
  process.exit(1);
}

const runs = (obj) => (obj?.runs || []).map(r => r.text || '').join('') || obj?.simpleText || '';

const messages = [];
for (const line of fs.readFileSync(src, 'utf8').split('\n')) {
  const l = line.trim();
  if (!l) continue;
  let e;
  try { e = JSON.parse(l); } catch { continue; }

  const t = Math.round((parseInt(e.videoOffsetTimeMsec, 10) || 0) / 100) / 10;
  if (!Number.isFinite(t) || t < 0) continue;

  const r = e.liveChatPaidMessageRenderer
    ? { kind: 'super', a: e.liveChatPaidMessageRenderer.authorName?.simpleText || '', m: runs(e.liveChatPaidMessageRenderer.message), p: e.liveChatPaidMessageRenderer.purchaseAmountText?.simpleText || '' }
    : e.liveChatMembershipItemRenderer
      ? { kind: 'member', a: e.liveChatMembershipItemRenderer.authorName?.simpleText || '', m: runs(e.liveChatMembershipItemRenderer.message) || 'joined the members' }
      : e.liveChatTextMessageRenderer
        ? { kind: 'msg', a: e.liveChatTextMessageRenderer.authorName?.simpleText || '', m: runs(e.liveChatTextMessageRenderer.message) }
        : null;
  if (!r || !r.m) continue;

  messages.push(r.kind === 'super' ? { t, a: r.a, m: r.m, p: r.p, k: 'super' }
    : r.kind === 'member' ? { t, a: r.a, m: r.m, k: 'member' }
    : { t, a: r.a, m: r.m });
}

messages.sort((a, b) => a.t - b.t);
fs.writeFileSync(dst, JSON.stringify({ messages }));
console.log(`converted ${messages.length} messages (${messages.filter(m => m.k === 'super').length} superchats) → ${dst}`);
