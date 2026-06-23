/**
 * 💬 Comments API — Vercel Serverless Function
 *
 * GET  /api/comments/<videoId>
 *   → returns the comment index from data/comments/<videoId>.json
 *      (a list of catbox URLs that each hold one comment JSON body)
 *
 * POST /api/comments/<videoId>
 *   body: { author, body, parentId? }
 *   → uploads the comment JSON to catbox.moe (permanent URL)
 *   → appends the catbox URL to data/comments/<videoId>.json in the repo
 *      via the GitHub Contents API
 *
 * Env vars required (Vercel project settings):
 *   GH_TOKEN     — fine-grained PAT with Contents: read/write on the repo
 *   GH_REPO      — usermuneeb1/Stream-Recorder
 *   GH_BRANCH    — main
 *
 * Anti-abuse:
 *   • Per-IP rate limit (5 / minute) via in-memory map (best-effort on edge)
 *   • Body length cap (2000 chars)
 *   • Server-side regex for obvious slurs / spam patterns
 */

export const config = { runtime: 'edge' };

const REPO     = process.env.GH_REPO   || 'usermuneeb1/Stream-Recorder';
const BRANCH   = process.env.GH_BRANCH || 'main';
const GH_TOKEN = process.env.GH_TOKEN  || '';

const ID_RE   = /^[\w-]{8,40}$/;
const MAX_BODY = 2000;
const MAX_AUTHOR = 40;

// Very small in-memory rate-limit (per-edge instance; best-effort)
const rate = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const window = 60_000;
  const cap = 5;
  const arr = (rate.get(ip) || []).filter(t => now - t < window);
  if (arr.length >= cap) return true;
  arr.push(now);
  rate.set(ip, arr);
  return false;
}

const SLUR_RE = /\b(n[i1]gg[ae3]r|f[a4]gg?[o0]t|k[i1]ke|ch[i1]nk|sp[i1]c|tr[a4]nn[yi]|ret[a4]rd)\b/i;

function cors(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    ...extra,
  };
}

function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), { status, headers: cors(extraHeaders) });
}

function sanitize(str, max) {
  return String(str || '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

// ── catbox upload ──────────────────────────────────────────────────────────
async function uploadToCatbox(jsonStr) {
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('fileToUpload', new Blob([jsonStr], { type: 'application/json' }), 'comment.json');
  const r = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: form });
  if (!r.ok) throw new Error(`catbox upload failed: ${r.status}`);
  const txt = (await r.text()).trim();
  if (!txt.startsWith('https://')) throw new Error(`catbox returned: ${txt.slice(0, 80)}`);
  return txt;
}

// ── GitHub Contents API helpers ────────────────────────────────────────────
async function ghGetFile(path) {
  const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}?ref=${BRANCH}`, {
    headers: {
      Authorization: `token ${GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'comments-api',
    },
  });
  if (r.status === 404) return { sha: null, list: [] };
  if (!r.ok) throw new Error(`github get: ${r.status}`);
  const j = await r.json();
  const decoded = atob(j.content.replace(/\n/g, ''));
  return { sha: j.sha, list: JSON.parse(decoded) };
}

async function ghPutFile(path, sha, list, message) {
  const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `token ${GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'comments-api',
    },
    body: JSON.stringify({
      message,
      content: btoa(unescape(encodeURIComponent(JSON.stringify(list, null, 0) + '\n'))),
      sha: sha || undefined,
      branch: BRANCH,
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`github put: ${r.status} ${t.slice(0, 200)}`);
  }
}

// ── Handler ────────────────────────────────────────────────────────────────
export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors() });
  }

  const url = new URL(request.url);
  const videoId = (url.pathname.split('/').filter(Boolean).pop() || '').replace(/[^\w-]/g, '');
  if (!ID_RE.test(videoId)) return json(400, { error: 'Invalid videoId' });

  const indexPath = `data/comments/${videoId}.json`;

  // ── GET: return the index of catbox URLs ─────────────────────────────────
  if (request.method === 'GET') {
    if (!GH_TOKEN) {
      // Best-effort fallback: try reading from jsDelivr (no auth needed)
      try {
        const r = await fetch(`https://cdn.jsdelivr.net/gh/${REPO}@${BRANCH}/${indexPath}?_=${Date.now()}`);
        if (r.ok) {
          const list = await r.json();
          return json(200, { urls: list }, { 'Cache-Control': 'public, max-age=15, s-maxage=15' });
        }
      } catch { /* fall through */ }
      return json(200, { urls: [] });
    }
    try {
      const { list } = await ghGetFile(indexPath);
      return json(200, { urls: list }, { 'Cache-Control': 'public, max-age=15, s-maxage=15' });
    } catch (e) {
      return json(200, { urls: [] }); // empty if file missing
    }
  }

  // ── POST: add a comment ──────────────────────────────────────────────────
  if (request.method !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }
  if (!GH_TOKEN) return json(500, { error: 'Comments backend not configured' });

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (rateLimited(ip)) return json(429, { error: 'Rate limit. Wait a minute.' });

  let payload;
  try { payload = await request.json(); }
  catch { return json(400, { error: 'Invalid JSON' }); }

  const author = sanitize(payload.author, MAX_AUTHOR) || 'Anonymous';
  const body = sanitize(payload.body, MAX_BODY);
  const parentId = payload.parentId ? sanitize(String(payload.parentId), 40) : null;

  if (!body || body.length < 2) return json(400, { error: 'Comment too short' });
  if (SLUR_RE.test(body) || SLUR_RE.test(author)) return json(400, { error: 'Comment rejected by filter' });

  const comment = {
    id: crypto.randomUUID(),
    videoId,
    author,
    body,
    parentId,
    createdAt: new Date().toISOString(),
  };

  // 1. Upload to catbox
  let catboxUrl;
  try { catboxUrl = await uploadToCatbox(JSON.stringify(comment)); }
  catch (e) { return json(502, { error: `catbox: ${e.message}` }); }

  // 2. Append to GitHub index
  try {
    const { sha, list } = await ghGetFile(indexPath);
    list.push(catboxUrl);
    // Keep at most 5000 comments per video
    const trimmed = list.slice(-5000);
    await ghPutFile(indexPath, sha, trimmed, `💬 Comment on ${videoId}`);
  } catch (e) {
    return json(502, { error: `github: ${e.message}` });
  }

  return json(200, { ok: true, id: comment.id, url: catboxUrl });
}
