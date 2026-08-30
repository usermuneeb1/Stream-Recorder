/**
 * 🔗 SHARE PAGE — /v/<videoId>
 *
 * Server-rendered per-video page so links UNFURL (Discord/Twitter crawlers
 * don't run JS — hash routes alone would share as blank cards). One small
 * edge function; still 100% free tier.
 *
 * Design (settled): public but obscure — player-first, title/date/duration,
 * downloads behind a click-to-reveal <details>, meta robots noindex so it
 * stays invisible to search engines. Comments render read-only; posting
 * happens in the full archive app.
 *
 * Data: data/recordings.json straight from the CDN (same mirrors the app
 * uses). Playback source order = permanent-first, exactly like the app:
 * Archive node → Archive direct → GitHub → Pixeldrain → YouTube embed.
 */

export const config = { runtime: 'edge' };

const REPO   = process.env.GH_REPO   || 'usermuneeb1/Stream-Recorder';
const BRANCH = process.env.GH_BRANCH || 'main';
const ORIGIN = process.env.DASHBOARD_ORIGIN || '';

const ID_RE = /^[\w-]{11}$/;

async function getRecordings() {
  const bases = [
    `https://cdn.jsdelivr.net/gh/${REPO}@${BRANCH}`,
    `https://raw.githubusercontent.com/${REPO}/${BRANCH}`,
  ];
  for (const base of bases) {
    try {
      const r = await fetch(`${base}/data/recordings.json?_=${Date.now()}`);
      if (!r.ok) continue;
      const txt = await r.text();
      if (!txt || txt.trimStart().startsWith('<')) continue;
      const j = JSON.parse(txt);
      if (Array.isArray(j)) return j;
    } catch { /* next mirror */ }
  }
  return [];
}

function findRec(recs, id) {
  return recs.find(r =>
    r.video_id === id ||
    r.youtube_id === id ||
    String(r.video_url || '').includes(`v=${id}`)) || null;
}

function safeFilename(title) {
  let s = String(title || '');
  s = [...s].filter(c => c.isprintable !== false && c >= ' ').join('');
  s = s.replace(/[^a-zA-Z0-9._\-]/g, '_').replace(/_{2,}/g, '_').slice(0, 200);
  return s || 'recording.mp4';
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtDuration(fmt) {
  const p = String(fmt || '').split(':');
  if (p.length === 3) {
    const h = parseInt(p[0]), m = parseInt(p[1]);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }
  return String(fmt || '');
}

export default async function handler(request) {
  const url = new URL(request.url);
  const id = (url.pathname.split('/').filter(Boolean).pop() || '').replace(/[^\w-]/g, '');

  if (!ID_RE.test(id)) {
    return new Response('Not found', { status: 404 });
  }

  const recs = await getRecordings();
  const rec = findRec(recs, id);

  const origin = ORIGIN || url.origin;
  const watchUrl = `${origin}/#/watch/${id}`;

  // ── Unknown / not-yet-indexed video: minimal unfurl card ─────────────────
  if (!rec) {
    const html = `<!doctype html><html><head>
<meta charset="utf-8">
<meta name="robots" content="noindex, nofollow">
<meta property="og:title" content="The Lantern Archive">
<meta property="og:description" content="A preserved live-stream recording.">
<meta property="og:image" content="https://i.ytimg.com/vi/${id}/maxresdefault.jpg">
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="3;url=${esc(watchUrl)}">
</head><body style="background:#0b0708;color:#e8e2d6;font-family:systemics,sans-serif;display:grid;place-items:center;height:100vh;margin:0">
<p>Opening the archive… <a href="${esc(watchUrl)}" style="color:#ff7a45">continue</a></p>
</body></html>`;
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, s-maxage=60' } });
  }

  const title     = String(rec.title || 'Recording').replace(/\s+\d{4}-\d{2}-\d{2}.*$/, '').trim();
  const date      = String(rec.date || '');
  const dur       = fmtDuration(rec.duration_fmt);
  const size      = String(rec.size_human || '');
  const thumb     = /^https?:\/\//.test(String(rec.thumbnail || '')) ? rec.thumbnail : `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
  const desc      = `${title} — recorded ${date}${dur ? ` · ${dur}` : ''}. Preserved permanently in The Lantern Archive.`;

  // Playback sources, permanent-first (same policy as the app's Auto mode).
  const sources = [
    rec.archive_node,
    rec.archive_direct,
    rec.github_direct || rec.github_release,
    (String(rec.pixeldrain_link || '').match(/pixeldrain\.com\/(?:u|api\/file)\/([\w-]+)/) || [])[1]
      ? `https://pixeldrain.com/api/file/${String(rec.pixeldrain_link).match(/pixeldrain\.com\/(?:u|api\/file)\/([\w-]+)/)[1]}` : '',
    rec.st0807_link,
  ].filter(Boolean);

  const dlName = safeFilename(title);
  const downloads = [
    ['Archive.org', rec.archive_direct || rec.archive_link],
    ['GitHub', rec.github_direct || rec.github_release],
    ['MEGA', rec.mega_link],
    ['Pixeldrain', rec.pixeldrain_link],
    ['Gofile', rec.gofile_link],
  ].filter(([, href]) => href);

  const srcTags = sources.map(s => `<source src="${esc(s)}" type="video/mp4">`).join('\n    ');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · The Lantern Archive</title>
<meta name="robots" content="noindex, nofollow">
<meta property="og:type" content="video.other">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(thumb)}">
<meta property="og:video" content="${esc(sources[0] || watchUrl)}">
<meta property="og:url" content="${esc(url.origin + url.pathname)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(thumb)}">
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; background:#0b0708; color:#e8e2d6;
         font-family:-apple-system,'Segoe UI',Roboto,sans-serif;
         min-height:100vh; display:flex; flex-direction:column; align-items:center; }
  .wrap { width:min(920px, 94vw); padding:28px 0 48px; }
  video { width:100%; aspect-ratio:16/9; background:#000; border-radius:12px;
          border:1px solid #2a1c14; box-shadow:0 18px 50px rgba(0,0,0,.55); outline:none; }
  .chips { display:flex; gap:8px; flex-wrap:wrap; margin:14px 0 6px; }
  .chip { font-size:11px; letter-spacing:.08em; text-transform:uppercase;
          color:#a89f92; border:1px solid #2a1c14; border-radius:999px; padding:4px 10px; }
  h1 { font-size:clamp(19px,3vw,27px); line-height:1.15; margin:8px 0 4px; font-weight:650; }
  .sub { color:#8d857a; font-size:12.5px; margin-bottom:18px; }
  .row { display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
  a.btn, button.btn { display:inline-flex; align-items:center; gap:7px; cursor:pointer;
      border-radius:9px; padding:9px 16px; font-size:13px; font-weight:600;
      text-decoration:none; border:1px solid #3d2417; color:#ffb38a; background:#160d09; }
  a.btn.hot { background:#ff7a45; border-color:#ff7a45; color:#1a0d05; }
  details { margin-top:16px; border:1px solid #241812; border-radius:10px; background:#100a07; }
  summary { cursor:pointer; padding:12px 16px; font-size:13px; font-weight:600; color:#c9bfb2; list-style:none; }
  summary::before { content:'▸ '; color:#ff7a45; }
  details[open] summary::before { content:'▾ '; }
  .dl { display:flex; flex-direction:column; gap:6px; padding:4px 16px 14px; }
  .dl a { display:flex; justify-content:space-between; align-items:center; gap:10px;
          padding:9px 12px; border-radius:8px; background:#160d09; color:#e8e2d6;
          text-decoration:none; font-size:12.5px; border:1px solid #241812; }
  .dl a span.tag { font-size:9.5px; letter-spacing:.1em; text-transform:uppercase; color:#8d857a; }
  .comments { margin-top:26px; border-top:1px solid #241812; padding-top:18px; }
  .comments h2 { font-size:13px; letter-spacing:.14em; text-transform:uppercase; color:#a89f92; margin:0 0 12px; }
  .cm { padding:10px 0; border-bottom:1px solid #1b120d; font-size:13.5px; }
  .cm b { color:#ffb38a; font-weight:600; margin-right:8px; }
  .cm time { color:#6d665c; font-size:11px; margin-left:8px; }
  .empty { color:#6d665c; font-size:12.5px; }
  footer { margin-top:auto; padding:22px; color:#57504a; font-size:10.5px; letter-spacing:.06em; }
</style>
</head>
<body>
<div class="wrap">
  <video controls playsinline preload="metadata" poster="${esc(thumb)}" id="v">
    ${srcTags}
  </video>
  <div class="chips">
    <span class="chip">${esc(date)}</span>
    ${dur ? `<span class="chip">${esc(dur)}</span>` : ''}
    ${size ? `<span class="chip">${esc(size)}</span>` : ''}
    <span class="chip">1080p HD</span>
  </div>
  <h1>${esc(title)}</h1>
  <div class="sub">Preserved live broadcast · The Lantern Archive</div>
  <div class="row">
    <a class="btn hot" href="${esc(watchUrl)}">Open the full archive ↗</a>
    <details style="margin-top:0; border:none; background:none;">
      <summary class="btn" style="display:inline-flex;">Downloads ▾</summary>
      <div class="dl" style="margin-top:10px;">
        ${downloads.map(([label, href]) => `
        <a href="${esc(href)}" target="_blank" rel="noopener noreferrer">
          <span>Download · ${esc(label)}</span><span class="tag">${esc(dlName)}</span>
        </a>`).join('')}
      </div>
    </details>
  </div>

  <div class="comments" id="cmts">
    <h2>Comments</h2>
    <div class="empty" id="cmt-empty">Loading…</div>
  </div>
</div>
<footer>The Lantern Archive · recorded autonomously · unlisted by design</footer>
<script>
  // Source failover: on error, try the next <source>.
  var v = document.getElementById('v'), idx = 0;
  var srcs = Array.prototype.slice.call(v.querySelectorAll('source'));
  v.addEventListener('error', function () {
    idx += 1;
    if (idx < srcs.length) {
      v.src = srcs[idx].src; v.load(); v.play().catch(function(){});
    } else {
      v.outerHTML = '<p style="color:#a89f92;font-size:13px">Playback unavailable right now — the archive copy is one click away above.</p>';
    }
  });
  // Read-only comments (posting lives in the full app).
  fetch('/api/comments/${id}').then(function(r){ return r.json(); }).then(function(j){
    var box = document.getElementById('cmts');
    var list = (j && j.comments) || [];
    var html = '<h2>Comments</h2>';
    if (!list.length) {
      html += '<div class="empty">No comments yet — open the full archive to leave one.</div>';
    } else {
      html += list.map(function(c){
        var d = ''; try { d = new Date(c.at).toLocaleDateString(); } catch(e){}
        return '<div class="cm"><b>' + String(c.n||'Guest').replace(/[<>&]/g,'') + '</b>'
             + String(c.t||'').replace(/[<>&]/g,'') + '<time>' + d + '</time></div>';
      }).join('');
    }
    box.innerHTML = html;
  }).catch(function(){ document.getElementById('cmt-empty').textContent = 'Comments unavailable.'; });
</script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  });
}
