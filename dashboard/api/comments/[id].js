/**
 * 💬 Comments API — FIXED VERSION
 *
 * Fixes:
 *   #7  unescape() is removed (deprecated, throws in modern Vercel Edge).
 *       Replaced with TextEncoder + Uint8Array → base64.
 *   #8  ghPutFile() now retries up to 5 times when GitHub returns 409
 *       Conflict (another POST stole our SHA). Each retry refetches the
 *       latest SHA + list and re-appends.
 *
 * Drop-in replacement for dashboard/api/comments/[id].js
 */

export const config = { runtime: 'edge' };

const REPO     = process.env.GH_REPO   || 'usermuneeb1/Stream-Recorder';
const BRANCH   = process.env.GH_BRANCH || 'main';
const GH_TOKEN = process.env.GH_TOKEN  || '';

const ID_RE   = /^[\w-]{8,40}$/;
const MAX_BODY = 2000;
const MAX_AUTHOR = 40;

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

// ── #7 FIX ── UTF-8 safe base64 without unescape/escape ────────────────────
function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function b64decode(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

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
  const decoded = b64decode((j.content || '').replace(/\n/g, ''));
  let list;
  try { list = JSON.parse(decoded); } catch { list = []; }
  if (!Array.isArray(list)) list = [];
  return { sha: j.sha, list };
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
      content: b64encode(JSON.stringify(list, null, 0) + '\n'),
      sha: sha || undefined,
      branch: BRANCH,
    }),
  });
  return r;
}

// ── #8 FIX ── CAS retry: append + PUT, retry up to 5x on 409 ────────────────
async function appendWithRetry(path, catboxUrl, message, maxAttempts = 5) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { sha, list } = await ghGetFile(path);
    list.push(catboxUrl);
    // FIX #18 — warn (in Vercel logs) when the rolling 5000-comment cap
    // starts dropping old comments. Once you see this, set up archival.
    if (list.length > 5000) {
      console.warn(`[comments] index ${path} hit 5000-cap; dropping ${list.length - 5000} oldest`);
    }
    const trimmed = list.slice(-5000);
    const r = await ghPutFile(path, sha, trimmed, message);
    if (r.ok) return;
    if (r.status !== 409 && r.status !== 422) {
      const txt = await r.text();
      throw new Error(`github put ${r.status}: ${txt.slice(0, 200)}`);
    }
    // 409 = SHA mismatch; 422 = also a CAS conflict in practice. Backoff + retry.
    await new Promise(res => setTimeout(res, 150 * attempt));
  }
  throw new Error('CAS retry exhausted after 5 attempts');
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors() });
  }

  const url = new URL(request.url);
  const videoId = (url.pathname.split('/').filter(Boolean).pop() || '').replace(/[^\w-]/g, '');
  if (!ID_RE.test(videoId)) return json(400, { error: 'Invalid videoId' });

  const indexPath = `data/comments/${videoId}.json`;

  if (request.method === 'GET') {
    if (!GH_TOKEN) {
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
    } catch {
      return json(200, { urls: [] });
    }
  }

  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' });
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

  let catboxUrl;
  try { catboxUrl = await uploadToCatbox(JSON.stringify(comment)); }
  catch (e) { return json(502, { error: `catbox: ${e.message}` }); }

  try {
    await appendWithRetry(indexPath, catboxUrl, `💬 Comment on ${videoId}`);
  } catch (e) {
    return json(502, { error: `github: ${e.message}` });
  }

  return json(200, { ok: true, id: comment.id, url: catboxUrl });
}
